import React from "react";
import { cn } from "@/lib/utils";
import { STAGES, AGENT_NODES, logRadius, fmtCount } from "./funnelLayout";
import type { FunnelSnapshot, Selection, StageKey } from "./types";

// SVG fallback for the 3D funnel: no WebGL, prefers-reduced-motion, context
// loss, or explicit user preference. Same data, same selection model.

const VB_W = 1000;
const VB_H = 480;

// Project the 3D layout's x/y into the SVG viewBox
const px = (x: number) => ((x + 9.5) / 19) * VB_W;
const py = (y: number) => VB_H * 0.62 - y * 62;

interface Props {
  snapshot: FunnelSnapshot;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  animated: boolean;
  className?: string;
}

export const FunnelFlow2D: React.FC<Props> = ({ snapshot, selection, onSelect, animated, className }) => {
  const statuses = snapshot.funnel.statuses;
  const agentByKey = Object.fromEntries(snapshot.agents.map((a) => [a.key, a]));

  const spine: [StageKey, StageKey][] = [
    ["new", "nurturing"],
    ["nurturing", "showing_scheduled"],
    ["showing_scheduled", "showed"],
    ["showed", "in_application"],
  ];
  const stageBy = Object.fromEntries(STAGES.map((s) => [s.key, s]));

  const ribbon = (fromKey: StageKey, toKey: StageKey) => {
    const a = stageBy[fromKey];
    const b = stageBy[toKey];
    const x1 = px(a.position[0]);
    const y1 = py(a.position[1]);
    const x2 = px(b.position[0]);
    const y2 = py(b.position[1]);
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} Q ${mx} ${(y1 + y2) / 2 + 26} ${x2} ${y2}`;
  };

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-full" role="presentation">
        {/* Spine ribbons */}
        {spine.map(([f, t]) => (
          <path key={`${f}-${t}`} d={ribbon(f, t)} fill="none"
            stroke="hsl(var(--primary))" strokeOpacity={0.25}
            strokeWidth={4 + 3 * Math.log10((statuses[t] || 0) + 1)} strokeLinecap="round" />
        ))}
        {/* Lost drain */}
        <path d={ribbon("showing_scheduled", "lost")} fill="none"
          stroke="hsl(var(--muted-foreground))" strokeOpacity={0.2} strokeWidth={4} strokeDasharray="6 6" />

        {/* Agent chips */}
        {AGENT_NODES.map((a) => {
          const snap = agentByKey[a.key];
          const x = px(a.position[0]);
          const y = py(a.position[1]);
          const isSel = selection?.type === "agent" && selection.key === a.key;
          const health = snap?.health || "idle";
          return (
            <g key={a.key} transform={`translate(${x},${y})`} className="cursor-pointer"
              onClick={() => onSelect({ type: "agent", key: a.key })}>
              <circle r={22} fill={a.color} fillOpacity={isSel ? 1 : 0.85}
                stroke={health === "error" ? "hsl(var(--destructive))" : health === "active" ? "hsl(var(--success))" : "hsl(var(--border))"}
                strokeWidth={3}
                className={cn(animated && health === "active" && "animate-pulse")} />
              <text y={-30} textAnchor="middle" className="fill-foreground text-[15px] font-bold">{a.label}</text>
              <text y={42} textAnchor="middle" className="fill-muted-foreground text-[12px]">
                {snap && snap.tasks_today.completed > 0 ? `${fmtCount(snap.tasks_today.completed)} hoy` : health}
              </text>
            </g>
          );
        })}

        {/* Stage nodes */}
        {STAGES.map((s) => {
          const count = statuses[s.key] || 0;
          const r = logRadius(count) * 34;
          const x = px(s.position[0]);
          const y = py(s.position[1]);
          const isSel = selection?.type === "stage" && selection.key === s.key;
          return (
            <g key={s.key} transform={`translate(${x},${y})`} className="cursor-pointer"
              onClick={() => onSelect({ type: "stage", key: s.key })}>
              <circle r={r} fill={s.key === "lost" ? "hsl(var(--muted-foreground))" : s.color}
                fillOpacity={0.85} stroke={isSel ? "hsl(var(--foreground))" : "white"} strokeWidth={isSel ? 3 : 1.5} />
              <text y={-r - 22} textAnchor="middle" className="fill-foreground text-[17px] font-bold tabular-nums">
                {fmtCount(count)}
              </text>
              <text y={-r - 6} textAnchor="middle" className="fill-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
