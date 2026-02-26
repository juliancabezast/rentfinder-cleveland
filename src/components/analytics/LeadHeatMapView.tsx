import React, { useRef, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJSON as GeoJSONLayer, Layer, LeafletMouseEvent } from "leaflet";
import type { Feature } from "geojson";
import "leaflet/dist/leaflet.css";

import { CITY_GEO } from "@/data/geo";
import {
  CITY_CENTERS,
  zipStyle,
  ZIP_HIGHLIGHT_STYLE,
  LEGEND_ENTRIES,
  getHeatLabel,
} from "./mapUtils";
import type { CityKey } from "./ClevelandHeatGrid";

interface ZipStats {
  leadCount: number;
  avgBudget: number;
  voucherPercent: number;
  conversionRate: number;
  topProperties: Array<{ id: string; address: string; count: number }>;
}

interface ZipEntry {
  zip: string;
  name: string;
}

interface LeadHeatMapViewProps {
  city: CityKey;
  zipStats: Record<string, ZipStats>;
  properties: Array<{ id: string; address: string; zip_code: string }>;
  zips: ZipEntry[];
}

// ── Map fly-to controller ────────────────────────────────────────────────────

function MapController({ city }: { city: CityKey }) {
  const map = useMap();

  useEffect(() => {
    const config = CITY_CENTERS[city];
    if (config) {
      map.flyTo(config.center, config.zoom, { duration: 1.2 });
    }
  }, [city, map]);

  return null;
}

// ── Main component ───────────────────────────────────────────────────────────

export const LeadHeatMapView: React.FC<LeadHeatMapViewProps> = ({
  city,
  zipStats,
  properties,
  zips,
}) => {
  const geojsonRef = useRef<GeoJSONLayer | null>(null);

  const geoData = CITY_GEO[city];
  const cityConfig = CITY_CENTERS[city];

  // Build a quick lookup from zip -> name
  const zipNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    zips.forEach((z) => (m[z.zip] = z.name));
    return m;
  }, [zips]);

  // Count available properties per zip
  const propertyCountByZip = useMemo(() => {
    const m: Record<string, number> = {};
    properties.forEach((p) => {
      if (p.zip_code) {
        m[p.zip_code] = (m[p.zip_code] || 0) + 1;
      }
    });
    return m;
  }, [properties]);

  if (!geoData || !cityConfig) {
    return (
      <div className="h-[500px] flex items-center justify-center text-muted-foreground">
        No map data available for this city.
      </div>
    );
  }

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const zip = feature.properties?.ZCTA5CE10 || "";
    const name = zipNameMap[zip] || "";
    const stats = zipStats[zip] || {
      leadCount: 0,
      avgBudget: 0,
      voucherPercent: 0,
      conversionRate: 0,
      topProperties: [],
    };
    const count = stats.leadCount;

    // Tooltip on hover
    layer.bindTooltip(
      `<div style="text-align:center;">
        <strong style="font-size:13px;color:#4F46E5;">${zip}</strong>
        <span style="color:#888;"> ${name}</span><br/>
        <span style="font-size:14px;font-weight:700;color:#4F46E5;">${count}</span>
        <span style="color:#888;"> lead${count !== 1 ? "s" : ""}</span>
      </div>`,
      { sticky: true, className: "leaflet-zip-tooltip", direction: "top", offset: [0, -10] }
    );

    // Highlight on hover
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        e.target.setStyle(ZIP_HIGHLIGHT_STYLE);
        e.target.bringToFront();
      },
      mouseout: (e: LeafletMouseEvent) => {
        if (geojsonRef.current) {
          geojsonRef.current.resetStyle(e.target);
        }
      },
    });

    // Popup on click
    layer.bindPopup(() => {
      const container = document.createElement("div");
      const propCount = propertyCountByZip[zip] || 0;
      container.innerHTML = buildPopupHtml(zip, name, stats, propCount);
      return container;
    }, { maxWidth: 340, className: "leaflet-zip-popup" });
  };

  return (
    <div className="relative rounded-xl overflow-hidden">
      <MapContainer
        center={cityConfig.center}
        zoom={cityConfig.zoom}
        className="h-[450px] sm:h-[530px] lg:h-[580px] w-full"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <GeoJSON
          key={city}
          data={geoData}
          ref={geojsonRef as React.Ref<GeoJSONLayer>}
          style={(feature) => zipStyle(feature, zipStats)}
          onEachFeature={onEachFeature}
        />

        <MapController city={city} />
      </MapContainer>

      {/* Color Legend - horizontal at bottom */}
      <div className="absolute bottom-3 left-3 right-3 z-[1000]">
        <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-white/50 px-4 py-2.5 flex items-center gap-4 overflow-x-auto">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest shrink-0">
            Density
          </span>
          <div className="flex items-center gap-3">
            {LEGEND_ENTRIES.map((entry) => (
              <div key={entry.label} className="flex items-center gap-1.5 shrink-0">
                <span
                  className="h-3.5 w-3.5 rounded-md shrink-0 border border-black/5"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-[11px] text-foreground/70 whitespace-nowrap">
                  {entry.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Popup HTML builder ───────────────────────────────────────────────────────

function buildPopupHtml(
  zip: string,
  name: string,
  stats: {
    leadCount: number;
    avgBudget: number;
    voucherPercent: number;
    conversionRate: number;
    topProperties: Array<{ id: string; address: string; count: number }>;
  },
  propertyCount: number
): string {
  const budget = stats.avgBudget > 0 ? `$${Math.round(stats.avgBudget)}` : "N/A";
  const voucher = `${Math.round(stats.voucherPercent)}%`;
  const conversion = `${Math.round(stats.conversionRate)}%`;

  const topProps = stats.topProperties
    .slice(0, 3)
    .map(
      (p) =>
        `<div style="font-size:11px;color:#555;padding:3px 0;border-bottom:1px solid #f0f0f0;">${escapeHtml(p.address)} <span style="color:#4F46E5;font-weight:600;">(${p.count})</span></div>`
    )
    .join("");

  const propsSection =
    stats.topProperties.length > 0
      ? `<div style="border-top:2px solid #f0f0f0;padding-top:8px;margin-top:8px;">
          <div style="font-size:11px;font-weight:700;color:#4F46E5;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Top Properties</div>
          ${topProps}
        </div>`
      : "";

  const warning =
    propertyCount === 0 && stats.leadCount > 0
      ? `<div style="margin-top:8px;padding:6px 10px;background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:8px;font-size:11px;color:#92400e;font-weight:500;">No available properties in this zip</div>`
      : "";

  return `
    <div style="min-width:240px;max-width:320px;font-family:'Montserrat',sans-serif;">
      <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #4F46E5;">
        <div style="font-size:18px;font-weight:800;color:#4F46E5;letter-spacing:-0.5px;">${escapeHtml(zip)}</div>
        <div style="font-size:13px;color:#888;margin-top:2px;">${escapeHtml(name)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        ${statBox("Leads", String(stats.leadCount), "#4F46E5")}
        ${statBox("Avg Budget", budget, "#16a34a")}
        ${statBox("Section 8", voucher, "#d97706")}
        ${statBox("Conversion", conversion, "#7c3aed")}
      </div>
      ${propsSection}
      ${warning}
    </div>
  `;
}

function statBox(label: string, value: string, color: string): string {
  return `<div style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-radius:10px;padding:8px 10px;text-align:center;">
    <div style="font-size:10px;color:#888;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
    <div style="font-size:16px;font-weight:800;color:${color};">${value}</div>
  </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
