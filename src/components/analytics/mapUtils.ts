import type { PathOptions } from "leaflet";
import type { Feature } from "geojson";

// ── City map centers & zoom ──────────────────────────────────────────────────

export const CITY_CENTERS: Record<string, { center: [number, number]; zoom: number }> = {
  cleveland: { center: [41.4993, -81.6944], zoom: 11 },
  milwaukee: { center: [43.0389, -87.9065], zoom: 11 },
};

// ── Heat color scale (indigo palette) ────────────────────────────────────────

export function getHeatColor(count: number): string {
  if (count === 0) return "#e2e8f0";   // slate-200
  if (count <= 5) return "#c7d2fe";    // indigo-200
  if (count <= 15) return "#818cf8";   // indigo-400
  if (count <= 30) return "#6366f1";   // indigo-500
  if (count <= 50) return "#4f46e5";   // indigo-600
  return "#3730a3";                     // indigo-800
}

export function getHeatLabel(count: number): string {
  if (count === 0) return "No data";
  if (count <= 5) return "Low";
  if (count <= 15) return "Moderate";
  if (count <= 30) return "Active";
  if (count <= 50) return "Hot";
  return "Very Hot";
}

// ── GeoJSON styling ──────────────────────────────────────────────────────────

export function zipStyle(
  feature: Feature | undefined,
  zipStats: Record<string, { leadCount: number }>
): PathOptions {
  const zip = feature?.properties?.ZCTA5CE10 || "";
  const count = zipStats[zip]?.leadCount || 0;

  return {
    fillColor: getHeatColor(count),
    fillOpacity: count === 0 ? 0.3 : 0.6,
    color: "#4F46E5",
    weight: 1.5,
    opacity: 0.7,
  };
}

export const ZIP_HIGHLIGHT_STYLE: PathOptions = {
  weight: 3,
  fillOpacity: 0.85,
  color: "#ffb22c", // accent gold
};

// ── Legend entries ────────────────────────────────────────────────────────────

export const LEGEND_ENTRIES = [
  { label: "No data", color: "#e2e8f0", range: "0" },
  { label: "Low", color: "#c7d2fe", range: "1-5" },
  { label: "Moderate", color: "#818cf8", range: "6-15" },
  { label: "Active", color: "#6366f1", range: "16-30" },
  { label: "Hot", color: "#4f46e5", range: "31-50" },
  { label: "Very Hot", color: "#3730a3", range: "50+" },
];
