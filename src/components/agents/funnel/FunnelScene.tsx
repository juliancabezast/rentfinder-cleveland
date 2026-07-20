import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Sparkles, AdaptiveDpr } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { cn } from "@/lib/utils";
import { STAGES, AGENT_NODES, logRadius, fmtCount } from "./funnelLayout";
import { makeGasGiantTexture, makeRockyTexture, makeCloudTexture, makeGalaxyTexture } from "./planetTextures";
import type { FunnelEventBus } from "./funnelEvents";
import type { FunnelSnapshot, Selection, StageKey } from "./types";

// ── Live theme colors (status semantics only — the cosmos itself is always
// dark; in-canvas labels are fixed light so they read on the space backdrop) ──

function cssHsl(token: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return raw ? `hsl(${raw})` : fallback;
}

function useStatusColors() {
  const read = () => ({
    primary: cssHsl("--primary", "#4F46E5"),
    accent: cssHsl("--accent", "#FFB22C"),
    destructive: cssHsl("--destructive", "#EF4444"),
    success: cssHsl("--success", "#10B981"),
    muted: "#94A3B8",
  });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

// Richer planet palette for the dark cosmos (funnelLayout colors are the 2D set)
const PLANET_COLORS: Record<StageKey, string> = {
  new: "#5B5BF6",
  nurturing: "#7C7CF8",
  showing_scheduled: "#A78BFA",
  showed: "#F59E0B",
  in_application: "#FFB22C",
  lost: "#64748B",
};

// ── Environment map (bundled RoomEnvironment — reflections sell the 3D) ──

function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    return () => {
      scene.environment = null;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// ── Fresnel atmosphere shell — the rim glow that makes a sphere a planet ──

function Atmosphere({ radius, color, strength = 0.9 }: { radius: number; color: string; strength?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uStrength: { value: strength },
        },
        vertexShader: `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uStrength;
          varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
            gl_FragColor = vec4(uColor, f * uStrength * 0.8);
          }`,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
      }),
    [color, strength]
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} raycast={() => null}>
      <sphereGeometry args={[radius * 1.22, 32, 32]} />
    </mesh>
  );
}

// ── Saturn-style tilted ring for agent planets ───────────────────────

function PlanetRing({ radius, color }: { radius: number; color: string }) {
  return (
    <group rotation={[Math.PI / 2.35, 0, 0.35]} raycast={() => null}>
      <mesh raycast={() => null}>
        <ringGeometry args={[radius * 1.45, radius * 1.95, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh raycast={() => null}>
        <ringGeometry args={[radius * 2.02, radius * 2.25, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Milky Way backdrop (inside-out sphere, procedural band texture) ──

function GalaxyBackdrop() {
  const tex = useMemo(() => makeGalaxyTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[0.45, 1.15, 0.3]} raycast={() => null}>
      <sphereGeometry args={[55, 48, 32]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

// ── Pulse registry ───────────────────────────────────────────────────

type PulseMap = Map<string, { t: number; failed: boolean; magnitude: number }>;

// ── Stage planet ─────────────────────────────────────────────────────

function StageNode({
  stageKey, label, position, count, selected, pulses, onSelect, cloudTex, seed,
}: {
  stageKey: StageKey;
  label: string;
  position: [number, number, number];
  count: number;
  selected: boolean;
  pulses: PulseMap;
  onSelect: (sel: Selection) => void;
  cloudTex: THREE.Texture;
  seed: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const radius = logRadius(count);
  const color = PLANET_COLORS[stageKey];
  const spinSpeed = useMemo(() => 0.05 + Math.random() * 0.08, []);
  const tilt = useMemo(() => 0.18 + Math.random() * 0.2, []);

  // Procedural surface: banded gas giant per stage; LOST is a cratered moon
  const surfaceTex = useMemo(
    () => (stageKey === "lost" ? makeRockyTexture("#8a93a5") : makeGasGiantTexture(color, seed)),
    [stageKey, color, seed]
  );
  useEffect(() => () => surfaceTex.dispose(), [surfaceTex]);

  useFrame((_, delta) => {
    const m = mesh.current;
    const g = group.current;
    if (!m || !g) return;
    m.rotation.y += spinSpeed * delta; // slow self-spin — planets live
    if (clouds.current) clouds.current.rotation.y += spinSpeed * 1.6 * delta;
    const pulse = pulses.get(`stage:${stageKey}`);
    let scale = 1;
    if (pulse) {
      const k = Math.min(1, pulse.t);
      scale = 1 + 0.13 * Math.sin(k * Math.PI) * Math.min(2, 1 + Math.log10(pulse.magnitude + 1));
      pulse.t += 0.035;
      if (pulse.t >= 1) pulses.delete(`stage:${stageKey}`);
    }
    g.scale.setScalar(scale * (hovered || selected ? 1.05 : 1));
  });

  return (
    <group position={position}>
      <group ref={group} rotation={[0, 0, tilt]}>
        <mesh
          ref={mesh}
          onClick={(e) => { e.stopPropagation(); onSelect({ type: "stage", key: stageKey }); }}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
        >
          <sphereGeometry args={[radius, 48, 48]} />
          <meshPhysicalMaterial
            map={surfaceTex}
            color="#ffffff"
            roughness={0.55}
            metalness={0.02}
            clearcoat={0.45}
            clearcoatRoughness={0.4}
            envMapIntensity={0.7}
            emissive={color}
            emissiveIntensity={selected ? 0.22 : 0.06}
          />
        </mesh>
        {stageKey !== "lost" && (
          <mesh ref={clouds} raycast={() => null}>
            <sphereGeometry args={[radius * 1.035, 40, 40]} />
            <meshStandardMaterial
              map={cloudTex}
              transparent
              opacity={0.5}
              depthWrite={false}
              roughness={1}
            />
          </mesh>
        )}
        <Atmosphere radius={radius} color={color} strength={selected || hovered ? 1.1 : 0.75} />
      </group>
      <Html center distanceFactor={11} zIndexRange={[10, 0]} position={[0, radius + 0.62, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center whitespace-nowrap select-none">
          <span className="text-[16px] font-bold tabular-nums text-slate-900 drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)]">
            {fmtCount(count)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
        </div>
      </Html>
    </group>
  );
}

// ── Agent planet (small, ringed) ─────────────────────────────────────

function AgentNode({
  agentKey, label, position, color, health, tasksToday, selected, pulses, onSelect, statusColors,
}: {
  agentKey: string;
  label: string;
  position: [number, number, number];
  color: string;
  health: string;
  tasksToday: number;
  selected: boolean;
  pulses: PulseMap;
  onSelect: (sel: Selection) => void;
  statusColors: { success: string; destructive: string; muted: string; accent: string };
}) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const R = 0.4;
  const surfaceTex = useMemo(() => makeGasGiantTexture(color, agentKey.length * 3.7), [color, agentKey]);
  useEffect(() => () => surfaceTex.dispose(), [surfaceTex]);

  const ringColor =
    health === "error" ? statusColors.destructive
    : health === "active" ? statusColors.success
    : health === "disabled" ? statusColors.muted
    : statusColors.accent;

  useFrame(({ clock }, delta) => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;
    g.position.y = position[1] + Math.sin(clock.elapsedTime * 1.2 + phase) * 0.09;
    m.rotation.y += 0.25 * delta;
    const pulse = pulses.get(`agent:${agentKey}`);
    let scale = 1;
    let emissive = selected || hovered ? 0.5 : 0.18;
    if (pulse) {
      const k = Math.min(1, pulse.t);
      scale = 1 + 0.18 * Math.sin(k * Math.PI) * Math.min(2, 1 + Math.log10(pulse.magnitude + 1));
      emissive = 0.25 + 0.85 * Math.sin(k * Math.PI);
      pulse.t += 0.04;
      if (pulse.t >= 1) pulses.delete(`agent:${agentKey}`);
    }
    g.scale.setScalar(scale);
    const mat = m.material as THREE.MeshPhysicalMaterial;
    mat.emissiveIntensity = emissive;
    mat.emissive.set(pulse?.failed ? statusColors.destructive : color);
  });

  return (
    <group ref={group} position={position}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect({ type: "agent", key: agentKey }); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[R, 40, 40]} />
        <meshPhysicalMaterial
          map={surfaceTex}
          color="#ffffff"
          roughness={0.5}
          metalness={0.05}
          clearcoat={0.5}
          clearcoatRoughness={0.35}
          envMapIntensity={0.8}
          emissive={color}
          emissiveIntensity={0.12}
        />
      </mesh>
      <Atmosphere radius={R} color={color} strength={0.8} />
      <PlanetRing radius={R} color={ringColor} />
      <Html center distanceFactor={11} zIndexRange={[10, 0]} position={[0, 1.05, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center whitespace-nowrap select-none">
          <span className="text-[12px] font-bold text-slate-900 drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)]">{label}</span>
          <span className="text-[10px] tabular-nums text-slate-500">
            {tasksToday > 0 ? `${fmtCount(tasksToday)} hoy` : health}
          </span>
        </div>
      </Html>
    </group>
  );
}

// ── Edges + particle system ──────────────────────────────────────────

interface RegisteredCurve {
  curve: THREE.CatmullRomCurve3;
  baseRate: number;
  agentKey?: string;
  stageKey?: StageKey;
}

const PARTICLE_BUDGET = 600;

function FlowSystem({
  curves, events, pulses, accent,
}: {
  curves: RegisteredCurve[];
  events: FunnelEventBus;
  pulses: PulseMap;
  accent: string;
}) {
  const inst = useRef<THREE.InstancedMesh>(null);
  const state = useMemo(() => ({
    curveIdx: new Int16Array(PARTICLE_BUDGET).fill(-1),
    t: new Float32Array(PARTICLE_BUDGET),
    speed: new Float32Array(PARTICLE_BUDGET),
    scale: new Float32Array(PARTICLE_BUDGET),
  }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const spawnAccumulator = useRef<number[]>([]);

  useEffect(() => {
    spawnAccumulator.current = curves.map(() => 0);
    state.curveIdx.fill(-1);
  }, [curves, state]);

  const spawn = (curveIdx: number, big = false) => {
    for (let i = 0; i < PARTICLE_BUDGET; i++) {
      if (state.curveIdx[i] === -1) {
        state.curveIdx[i] = curveIdx;
        state.t[i] = 0;
        state.speed[i] = 0.1 + Math.random() * 0.12;
        state.scale[i] = big ? 0.1 : 0.045 + Math.random() * 0.03;
        return;
      }
    }
  };

  useFrame((_, delta) => {
    const mesh = inst.current;
    if (!mesh) return;

    for (const ev of events.drain(2)) {
      if (ev.type === "lead_new") {
        pulses.set("agent:esther", { t: 0, failed: false, magnitude: ev.magnitude });
        pulses.set("stage:new", { t: 0, failed: false, magnitude: ev.magnitude });
        const idx = curves.findIndex((c) => c.agentKey === "esther");
        if (idx >= 0) for (let i = 0; i < Math.min(5, ev.magnitude); i++) spawn(idx, true);
      } else if (ev.type === "agent_activity") {
        pulses.set(`agent:${ev.agentKey}`, { t: 0, failed: ev.failed, magnitude: ev.magnitude });
      } else if (ev.type === "task_completed") {
        pulses.set(`agent:${ev.agentKey}`, { t: 0, failed: false, magnitude: ev.magnitude });
        const idx = curves.findIndex((c) => c.agentKey === ev.agentKey);
        if (idx >= 0) for (let i = 0; i < Math.min(4, ev.magnitude); i++) spawn(idx, true);
      }
    }

    curves.forEach((c, idx) => {
      spawnAccumulator.current[idx] = (spawnAccumulator.current[idx] || 0) + c.baseRate * delta;
      while (spawnAccumulator.current[idx] >= 1) {
        spawnAccumulator.current[idx] -= 1;
        spawn(idx);
      }
    });

    let rendered = 0;
    for (let i = 0; i < PARTICLE_BUDGET; i++) {
      const ci = state.curveIdx[i];
      if (ci === -1) continue;
      state.t[i] += state.speed[i] * delta;
      if (state.t[i] >= 1 || ci >= curves.length) {
        state.curveIdx[i] = -1;
        continue;
      }
      const p = curves[ci].curve.getPointAt(state.t[i]);
      dummy.position.copy(p);
      dummy.scale.setScalar(state.scale[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(rendered, dummy.matrix);
      rendered++;
    }
    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = rendered; i < PARTICLE_BUDGET; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, PARTICLE_BUDGET]} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[1, 8, 8]} />
      {/* emissive-bright so Bloom picks the particles up as light streaks */}
      <meshBasicMaterial color="#E8940F" transparent opacity={0.95} />
    </instancedMesh>
  );
}

function Edge({ curve, weight, color }: { curve: THREE.CatmullRomCurve3; weight: number; color: string }) {
  const geometry = useMemo(
    () => new THREE.TubeGeometry(curve, 24, 0.022 + 0.014 * Math.log10(weight + 1), 6, false),
    [curve, weight]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}

// ── Camera rig ───────────────────────────────────────────────────────

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const idleSince = useRef(performance.now() / 1000);

  // Gentle ping-pong sway when idle — constant auto-rotate drifted the camera
  // into the azimuth limit and "lost" the funnel off to the left.
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const now = performance.now() / 1000;
    if (now - idleSince.current > 8) {
      const target = Math.sin(now * 0.12) * 0.18;
      c.setAzimuthalAngle(THREE.MathUtils.lerp(c.getAzimuthalAngle(), target, 0.02));
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={8}
      maxDistance={22}
      minPolarAngle={0.7}
      maxPolarAngle={1.5}
      minAzimuthAngle={-0.6}
      maxAzimuthAngle={0.6}
      onStart={() => { idleSince.current = Number.MAX_SAFE_INTEGER; }}
      onEnd={() => { idleSince.current = performance.now() / 1000; }}
    />
  );
}

// ── Scene root ───────────────────────────────────────────────────────

interface FunnelSceneProps {
  snapshot: FunnelSnapshot;
  events: FunnelEventBus;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  className?: string;
}

const FunnelScene: React.FC<FunnelSceneProps> = ({ snapshot, events, selection, onSelect, className }) => {
  const statusColors = useStatusColors();
  const pulses = useMemo<PulseMap>(() => new Map(), []);
  const cloudTex = useMemo(() => makeCloudTexture(), []);
  useEffect(() => () => cloudTex.dispose(), [cloudTex]);
  const [contextLost, setContextLost] = useState(false);

  const statuses = snapshot.funnel.statuses;
  const agentByKey = useMemo(
    () => Object.fromEntries(snapshot.agents.map((a) => [a.key, a])),
    [snapshot.agents]
  );

  const spineCurves = useMemo(
    () =>
      // Static layout — built once so Edge geometries survive re-renders
      [
        { from: [-8.6, 0.9, 0.4], to: [-6, 0, 0], weightKey: "new" as StageKey },
        { from: [-6, 0, 0], to: [-3, 0, 0], weightKey: "nurturing" as StageKey },
        { from: [-3, 0, 0], to: [0, 0, 0], weightKey: "showing_scheduled" as StageKey },
        { from: [0, 0, 0], to: [3, 0, 0], weightKey: "showed" as StageKey },
        { from: [3, 0, 0], to: [6, 0, 0], weightKey: "in_application" as StageKey },
        { from: [0, 0, 0], to: [1.5, -2.2, -0.8], weightKey: "lost" as StageKey },
      ].map((e) => {
        const mid = new THREE.Vector3(
          (e.from[0] + e.to[0]) / 2,
          (e.from[1] + e.to[1]) / 2 - 0.35,
          (e.from[2] + e.to[2]) / 2
        );
        return {
          weightKey: e.weightKey,
          curve: new THREE.CatmullRomCurve3([
            new THREE.Vector3(...(e.from as [number, number, number])),
            mid,
            new THREE.Vector3(...(e.to as [number, number, number])),
          ]),
        };
      }),
    []
  );

  const curves = useMemo<RegisteredCurve[]>(() => {
    const mk = (from: [number, number, number], to: [number, number, number], sag = 0.35) => {
      const mid = new THREE.Vector3(
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2 - sag,
        (from[2] + to[2]) / 2
      );
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(...from), mid, new THREE.Vector3(...to),
      ]);
    };
    const flowRate = (n: number) => Math.min(2.5, 0.15 + 0.45 * Math.log10(n + 1));
    return [
      { curve: mk([-8.6, 0.9, 0.4], [-6, 0, 0]), baseRate: flowRate(snapshot.flows.inbound_emails_24h + snapshot.flows.leads_created_24h), agentKey: "esther" },
      { curve: mk([-6, 0, 0], [-3, 0, 0]), baseRate: flowRate(snapshot.flows.emails_sent_24h / 10), agentKey: "elijah" },
      { curve: mk([-3, 0, 0], [0, 0, 0]), baseRate: flowRate((statuses.showing_scheduled || 0) * 3) },
      { curve: mk([0, 0, 0], [3, 0, 0]), baseRate: flowRate(snapshot.flows.showings_today * 5 + (statuses.showed || 0)), agentKey: "samuel" },
      { curve: mk([3, 0, 0], [6, 0, 0]), baseRate: flowRate(statuses.in_application || 0) },
      { curve: mk([0, 0, 0], [1.5, -2.2, -0.8], -0.1), baseRate: 0.08 },
      { curve: mk([0, 3.0, -1.6], [0, 0, 0], -0.4), baseRate: flowRate(agentByKey["nehemiah"]?.activity_24h || 0), agentKey: "nehemiah" },
      { curve: mk([7.8, 2.4, -1.2], [6, 0, 0], -0.3), baseRate: 0.05, agentKey: "zacchaeus" },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.generated_at]);

  if (contextLost) {
    throw new Error("webgl-context-lost");
  }

  return (
    <div className={cn("relative w-full h-full", className)}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 40, position: [0, 5, 14.5] }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => setContextLost(true));
        }}
      >
        {/* Light cosmos — matches the app canvas; the galaxy backdrop paints the sky */}
        <color attach="background" args={["#edf0fa"]} />
        <fog attach="fog" args={["#edf0fa", 26, 46]} />

        <AdaptiveDpr pixelated />
        <Env />
        <ambientLight intensity={0.75} />
        <directionalLight position={[7, 9, 5]} intensity={1.25} color="#FFFBF2" />
        <pointLight position={[-10, 3, 5]} intensity={0.5} color="#6366F1" />
        <pointLight position={[9, -2, -5]} intensity={0.35} color="#FFB22C" />

        <GalaxyBackdrop />
        <Sparkles count={90} scale={[20, 8, 8]} size={2} speed={0.25} opacity={0.5} color="#6366F1" />
        <Sparkles count={40} scale={[20, 8, 6]} size={1.4} speed={0.18} opacity={0.4} color="#FFB22C" />

        {spineCurves.map((sc, i) => (
          <Edge
            key={i}
            curve={sc.curve}
            weight={statuses[sc.weightKey] || 0}
            color={sc.weightKey === "lost" ? "#94A3B8" : "#6366F1"}
          />
        ))}

        {STAGES.map((s, idx) => (
          <StageNode
            key={s.key}
            stageKey={s.key}
            label={s.label}
            position={s.position}
            count={statuses[s.key] || 0}
            selected={selection?.type === "stage" && selection.key === s.key}
            pulses={pulses}
            onSelect={onSelect}
            cloudTex={cloudTex}
            seed={idx * 2.3 + 1}
          />
        ))}

        {AGENT_NODES.map((a) => {
          const snap = agentByKey[a.key];
          return (
            <AgentNode
              key={a.key}
              agentKey={a.key}
              label={a.label}
              position={a.position}
              color={a.color}
              health={snap?.health || "idle"}
              tasksToday={snap?.tasks_today.completed || 0}
              selected={selection?.type === "agent" && selection.key === a.key}
              pulses={pulses}
              onSelect={onSelect}
              statusColors={statusColors}
            />
          );
        })}

        <FlowSystem curves={curves} events={events} pulses={pulses} accent={statusColors.accent} />

        <EffectComposer multisampling={0}>
          <Bloom intensity={0.3} luminanceThreshold={0.72} luminanceSmoothing={0.6} mipmapBlur />
        </EffectComposer>

        <CameraRig />
      </Canvas>
    </div>
  );
};

export default FunnelScene;
