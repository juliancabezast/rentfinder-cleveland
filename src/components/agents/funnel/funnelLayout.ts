import type { StageKey } from "./types";

// Pure layout constants shared by the 3D scene and the 2D fallback.
// Funnel flows left → right along X; LOST drains below the spine.

export interface StageDef {
  key: StageKey;
  label: string;
  position: [number, number, number];
  color: string; // hex fallback; the scene re-reads live CSS tokens
}

export const STAGES: StageDef[] = [
  { key: "new", label: "New", position: [-6, 0, 0], color: "#4F46E5" },
  { key: "nurturing", label: "Nurturing", position: [-3, 0, 0], color: "#6366F1" },
  { key: "showing_scheduled", label: "Agendó", position: [0, 0, 0], color: "#8B5CF6" },
  { key: "showed", label: "Asistió", position: [3, 0, 0], color: "#D97706" },
  { key: "in_application", label: "Aplicó", position: [6, 0, 0], color: "#FFB22C" },
  { key: "lost", label: "Lost", position: [1.5, -2.2, -0.8], color: "#9CA3AF" },
];

export interface AgentDef {
  key: string;
  label: string;
  position: [number, number, number];
  color: string;
  // Edge this agent "works": particles burst along it on task completion
  edge: [[number, number, number], [number, number, number]];
}

export const AGENT_NODES: AgentDef[] = [
  { key: "esther", label: "Venus", position: [-8.6, 0.9, 0.4], color: "#4F46E5", edge: [[-8.6, 0.9, 0.4], [-6, 0, 0]] },
  { key: "elijah", label: "Mars", position: [-4.5, 1.6, -0.4], color: "#FFB22C", edge: [[-6, 0, 0], [-3, 0, 0]] },
  { key: "samuel", label: "Jupiter", position: [1.5, 1.6, -0.4], color: "#10B981", edge: [[0, 0, 0], [3, 0, 0]] },
  { key: "nehemiah", label: "Neptune", position: [0, 3.0, -1.6], color: "#8B5CF6", edge: [[0, 3.0, -1.6], [0, 0, 0]] },
  { key: "zacchaeus", label: "Saturn", position: [7.8, 2.4, -1.2], color: "#64748B", edge: [[7.8, 2.4, -1.2], [6, 0, 0]] },
];

// Spine edges between consecutive stages + lost drains
export const SPINE_EDGES: { from: [number, number, number]; to: [number, number, number]; weightKey: StageKey }[] = [
  { from: [-8.6, 0.9, 0.4], to: [-6, 0, 0], weightKey: "new" }, // inflow (Esther)
  { from: [-6, 0, 0], to: [-3, 0, 0], weightKey: "nurturing" },
  { from: [-3, 0, 0], to: [0, 0, 0], weightKey: "showing_scheduled" },
  { from: [0, 0, 0], to: [3, 0, 0], weightKey: "showed" },
  { from: [3, 0, 0], to: [6, 0, 0], weightKey: "in_application" },
  { from: [0, 0, 0], to: [1.5, -2.2, -0.8], weightKey: "lost" },
];

// Real counts span 17,959 → 7: linear scale would make 4 nodes invisible.
export function logRadius(count: number): number {
  return Math.min(1.6, Math.max(0.45, 0.45 + 0.28 * Math.log10(count + 1)));
}

export function fmtCount(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}
