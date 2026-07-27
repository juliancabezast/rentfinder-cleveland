import React, { useEffect, useRef, useState } from "react";
import { getAgentDisplayName } from "../constants";
import type { FunnelSnapshot, Selection } from "../funnel/types";
import { NATIVE_H, NATIVE_W, OfficeWorld, type AgentInput } from "./engine";

// React wrapper around the Canvas pixel-art world. React owns app state (agent
// data, selection); the engine owns the render loop. The <canvas> is a fixed
// native-resolution buffer scaled up by an INTEGER factor via CSS with
// image-rendering: pixelated → crisp pixels, no blur.

interface Props {
  snapshot: FunnelSnapshot | null;
  events?: unknown;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  reducedMotion: boolean;
}

export const AgentsOffice: React.FC<Props> = ({ snapshot, selection, onSelect, reducedMotion }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<OfficeWorld | null>(null);
  const scaleRef = useRef(1);
  const [cursor, setCursor] = useState<"default" | "pointer">("default");

  // create / destroy the engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new OfficeWorld(canvas, { reducedMotion });
    world.onPick((key) => onSelect(key ? { type: "agent", key } : null));
    worldRef.current = world;
    world.start();
    return () => { world.destroy(); worldRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // push agent data whenever the snapshot changes
  useEffect(() => {
    const agents: AgentInput[] = (snapshot?.agents ?? []).map((a) => ({
      key: a.key,
      name: getAgentDisplayName(a.key, a.name, a.role),
      role: a.role,
      health: a.health,
    }));
    worldRef.current?.setAgents(agents);
  }, [snapshot]);

  // selection highlight
  useEffect(() => {
    worldRef.current?.setSelectedKey(selection?.type === "agent" ? selection.key : null);
  }, [selection]);

  // camera fit — scale the native buffer to FILL the viewport (nearest-neighbor
  // stays crisp even at a fractional factor, so the world dominates the panel
  // instead of sitting tiny inside a dark frame).
  useEffect(() => {
    const el = containerRef.current, canvas = canvasRef.current;
    if (!el || !canvas) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.max(0.5, Math.min(r.width / NATIVE_W, r.height / NATIVE_H) * 0.995);
      scaleRef.current = s;
      canvas.style.width = `${Math.round(NATIVE_W * s)}px`;
      canvas.style.height = `${Math.round(NATIVE_H * s)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toNative = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const s = scaleRef.current;
    return { nx: (e.clientX - r.left) / s, ny: (e.clientY - r.top) / s };
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 38%, #3a2416 0%, #241812 62%, #180f09 100%)" }}
    >
      <canvas
        ref={canvasRef}
        width={NATIVE_W}
        height={NATIVE_H}
        style={{ imageRendering: "pixelated", cursor }}
        onMouseMove={(e) => { const { nx, ny } = toNative(e); setCursor(worldRef.current?.setHover(nx, ny) ? "pointer" : "default"); }}
        onMouseLeave={() => { worldRef.current?.setHover(-99, -99); setCursor("default"); }}
        onClick={(e) => { const { nx, ny } = toNative(e); const k = worldRef.current?.pickAt(nx, ny) ?? null; onSelect(k ? { type: "agent", key: k } : null); }}
      />
    </div>
  );
};
