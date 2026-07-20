import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows, AdaptiveDpr } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { cn } from "@/lib/utils";
import { STAGES, AGENT_NODES, SPINE_EDGES, logRadius, fmtCount } from "./funnelLayout";
import type { FunnelEventBus } from "./funnelEvents";
import type { FunnelSnapshot, Selection, StageKey } from "./types";

// ── Live theme colors (canvas can't read CSS vars directly) ──────────

function cssHsl(token: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return raw ? `hsl(${raw})` : fallback;
}

function useThemeColors() {
  const read = () => ({
    primary: cssHsl("--primary", "#4F46E5"),
    accent: cssHsl("--accent", "#FFB22C"),
    destructive: cssHsl("--destructive", "#EF4444"),
    success: cssHsl("--success", "#10B981"),
    muted: cssHsl("--muted-foreground", "#64748B"),
    dark: document.documentElement.classList.contains("dark"),
  });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

// ── Pulse registry: realtime events → imperative scale/emissive springs ──

type PulseMap = Map<string, { t: number; failed: boolean; magnitude: number }>;

// ── Stage node ───────────────────────────────────────────────────────

function StageNode({
  stageKey, label, position, color, count, selected, pulses, onSelect,
}: {
  stageKey: StageKey;
  label: string;
  position: [number, number, number];
  color: string;
  count: number;
  selected: boolean;
  pulses: PulseMap;
  onSelect: (sel: Selection) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const radius = logRadius(count);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const pulse = pulses.get(`stage:${stageKey}`);
    let scale = 1;
    if (pulse) {
      const k = Math.min(1, pulse.t);
      scale = 1 + 0.14 * Math.sin(k * Math.PI) * Math.min(2, 1 + Math.log10(pulse.magnitude + 1));
      pulse.t += 0.035;
      if (pulse.t >= 1) pulses.delete(`stage:${stageKey}`);
    }
    m.scale.setScalar(scale * (hovered || selected ? 1.06 : 1));
  });

  return (
    <group position={position}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect({ type: "stage", key: stageKey }); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <icosahedronGeometry args={[radius, 2]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.25}
          metalness={0.1}
          transmission={0.55}
          thickness={1.2}
          transparent
          opacity={0.92}
          emissive={color}
          emissiveIntensity={selected ? 0.5 : 0.18}
        />
      </mesh>
      <Html center distanceFactor={11} position={[0, radius + 0.55, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center whitespace-nowrap select-none">
          <span className="text-[15px] font-bold tabular-nums text-foreground drop-shadow-sm">{fmtCount(count)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      </Html>
    </group>
  );
}

// ── Agent node ───────────────────────────────────────────────────────

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
  const ring = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  const ringColor =
    health === "error" ? statusColors.destructive
    : health === "active" ? statusColors.success
    : health === "disabled" ? statusColors.muted
    : statusColors.accent;

  useFrame(({ clock }) => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;
    // idle bob
    g.position.y = position[1] + Math.sin(clock.elapsedTime * 1.4 + phase) * 0.08;
    const pulse = pulses.get(`agent:${agentKey}`);
    let scale = 1;
    let emissive = selected || hovered ? 0.55 : 0.25;
    if (pulse) {
      const k = Math.min(1, pulse.t);
      scale = 1 + 0.16 * Math.sin(k * Math.PI) * Math.min(2, 1 + Math.log10(pulse.magnitude + 1));
      emissive = 0.3 + 0.7 * Math.sin(k * Math.PI);
      pulse.t += 0.04;
      if (pulse.t >= 1) pulses.delete(`agent:${agentKey}`);
    }
    m.scale.setScalar(scale);
    (m.material as THREE.MeshStandardMaterial).emissiveIntensity = emissive;
    (m.material as THREE.MeshStandardMaterial).emissive.set(
      pulse?.failed ? statusColors.destructive : color
    );
    // error ring pulses continuously
    if (ring.current && health === "error") {
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        0.5 + 0.4 * Math.sin(clock.elapsedTime * 5);
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect({ type: "agent", key: agentKey }); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.3} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[0.58, 0.028, 8, 48]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.85} />
      </mesh>
      <Html center distanceFactor={11} position={[0, 0.95, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center whitespace-nowrap select-none">
          <span className="text-[12px] font-bold text-foreground drop-shadow-sm">{label}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {tasksToday > 0 ? `${fmtCount(tasksToday)} hoy` : health}
          </span>
        </div>
      </Html>
    </group>
  );
}

// ── Edges + particle system (one InstancedMesh for everything) ───────

interface RegisteredCurve {
  curve: THREE.CatmullRomCurve3;
  baseRate: number; // idle particles/sec
  agentKey?: string;
  stageKey?: StageKey;
}

const PARTICLE_BUDGET = 600;

function FlowSystem({
  curves, events, pulses, colors,
}: {
  curves: RegisteredCurve[];
  events: FunnelEventBus;
  pulses: PulseMap;
  colors: { primary: string; accent: string; destructive: string };
}) {
  const inst = useRef<THREE.InstancedMesh>(null);
  // Per-instance state
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
  }, [curves]);

  const spawn = (curveIdx: number, big = false) => {
    for (let i = 0; i < PARTICLE_BUDGET; i++) {
      if (state.curveIdx[i] === -1) {
        state.curveIdx[i] = curveIdx;
        state.t[i] = 0;
        state.speed[i] = 0.10 + Math.random() * 0.12;
        state.scale[i] = big ? 0.11 : 0.05 + Math.random() * 0.03;
        return;
      }
    }
  };

  useFrame((_, delta) => {
    const mesh = inst.current;
    if (!mesh) return;

    // 1) Drain realtime events → pulses + particle bursts
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

    // 2) Idle emission proportional to real volume
    curves.forEach((c, idx) => {
      spawnAccumulator.current[idx] = (spawnAccumulator.current[idx] || 0) + c.baseRate * delta;
      while (spawnAccumulator.current[idx] >= 1) {
        spawnAccumulator.current[idx] -= 1;
        spawn(idx);
      }
    });

    // 3) Advance + write matrices
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
    // park unused instances far away
    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = rendered; i < PARTICLE_BUDGET; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, PARTICLE_BUDGET]} frustumCulled={false} raycast={() => null}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={colors.accent} transparent opacity={0.9} />
    </instancedMesh>
  );
}

function Edge({ curve, weight, color }: { curve: THREE.CatmullRomCurve3; weight: number; color: string }) {
  const geometry = useMemo(
    () => new THREE.TubeGeometry(curve, 24, 0.028 + 0.016 * Math.log10(weight + 1), 6, false),
    [curve, weight]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial color={color} transparent opacity={0.22} />
    </mesh>
  );
}

// ── Camera rig: gentle auto-orbit, pauses on interaction ─────────────

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  // One time base only (performance.now in seconds) — mixing clock.elapsedTime
  // (since Canvas mount) with performance.now (since page load) broke resume.
  const idleSince = useRef(performance.now() / 1000);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    c.autoRotate = performance.now() / 1000 - idleSince.current > 10;
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      autoRotate
      autoRotateSpeed={0.35}
      enablePan={false}
      minDistance={8}
      maxDistance={22}
      minPolarAngle={0.7}
      maxPolarAngle={1.45}
      minAzimuthAngle={-0.9}
      maxAzimuthAngle={0.9}
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
  const colors = useThemeColors();
  const pulses = useMemo<PulseMap>(() => new Map(), []);
  const [contextLost, setContextLost] = useState(false);

  const statuses = snapshot.funnel.statuses;
  const agentByKey = useMemo(
    () => Object.fromEntries(snapshot.agents.map((a) => [a.key, a])),
    [snapshot.agents]
  );

  // Static layout — build once so Edge geometries aren't rebuilt/disposed on
  // every parent render (lastEventAt ticks re-render the page frequently).
  const spineCurves = useMemo(
    () =>
      SPINE_EDGES.map((e) => {
        const mid = new THREE.Vector3(
          (e.from[0] + e.to[0]) / 2,
          (e.from[1] + e.to[1]) / 2 - 0.35,
          (e.from[2] + e.to[2]) / 2
        );
        return {
          weightKey: e.weightKey,
          curve: new THREE.CatmullRomCurve3([
            new THREE.Vector3(...e.from), mid, new THREE.Vector3(...e.to),
          ]),
        };
      }),
    []
  );

  // Curves registered once (layout is static); base emission from real 24h flows
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
    throw new Error("webgl-context-lost"); // caught by the page error boundary → 2D fallback
  }

  return (
    <div className={cn("relative w-full h-full", className)}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 40, position: [0, 5.5, 14] }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => setContextLost(true));
        }}
      >
        <AdaptiveDpr pixelated />
        <ambientLight intensity={colors.dark ? 0.5 : 0.85} />
        <directionalLight position={[6, 10, 6]} intensity={colors.dark ? 0.9 : 1.2} />
        <pointLight position={[-8, 4, 4]} intensity={0.5} color={colors.primary} />
        <pointLight position={[8, 4, -4]} intensity={0.4} color={colors.accent} />

        {spineCurves.map((sc, i) => (
          <Edge
            key={i}
            curve={sc.curve}
            weight={statuses[sc.weightKey] || 0}
            color={sc.weightKey === "lost" ? colors.muted : colors.primary}
          />
        ))}

        {STAGES.map((s) => (
          <StageNode
            key={s.key}
            stageKey={s.key}
            label={s.label}
            position={s.position}
            color={s.key === "lost" ? colors.muted : s.color}
            count={statuses[s.key] || 0}
            selected={selection?.type === "stage" && selection.key === s.key}
            pulses={pulses}
            onSelect={onSelect}
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
              statusColors={colors}
            />
          );
        })}

        <FlowSystem curves={curves} events={events} pulses={pulses} colors={colors} />
        <ContactShadows position={[0, -3.2, 0]} opacity={0.25} scale={26} blur={2.2} far={6} resolution={256} frames={1} />
        <CameraRig />
      </Canvas>
    </div>
  );
};

export default FunnelScene;
