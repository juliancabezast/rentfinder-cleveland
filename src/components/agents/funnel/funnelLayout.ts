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

export function fmtCount(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}
