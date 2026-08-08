import React, { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Filter, Users } from "lucide-react";

/**
 * Series colours are MEASURED, not chosen by eye.
 *
 * The first pass paired the indigo brand colour with purple-600 for Milwaukee.
 * The palette validator scored that pair at ΔE 0.9 for protanopia and 11.8 for
 * normal vision — below the 15 floor. Two colours nobody can reliably tell
 * apart, and identical to a red-blind reader.
 *
 * indigo-600 + fuchsia-700 measures 9.5 (protan) / 18.2 (normal): all six
 * checks pass. Same pair is used for the city tags in the Showings grid, so a
 * city keeps one identity across the product.
 */
export const CITY_SERIES: Record<string, { color: string; label: string }> = {
  cleveland: { color: "#4F46E5", label: "Cleveland" },
  milwaukee: { color: "#A21CAF", label: "Milwaukee" },
};

const INK = { primary: "#0f172a", secondary: "#475569", muted: "#94a3b8" };

export interface WeekPoint { week: string; cleveland: number; milwaukee: number }
export interface FunnelStep { stage: string; count: number; hint: string }
export interface CitySummary {
  key: string; leads: number; activeZips: number; totalZips: number;
  avgRent: number; properties: number; showings: number;
}

const fmt = (n: number) => n.toLocaleString();

/** Recharts' default tooltip wears series colours on text; ours stays ink. */
const InkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-semibold text-slate-900 m-0 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs text-slate-600 m-0 flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-slate-900">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ── Side-by-side city comparison ──────────────────────────────────────
export const CityComparison: React.FC<{ cities: CitySummary[] }> = ({ cities }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {cities.map((c) => {
      const s = CITY_SERIES[c.key];
      return (
        <Card key={c.key} variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
              <h3 className="font-semibold text-slate-900 m-0">{s.label}</h3>
            </div>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              {[
                ["Leads", fmt(c.leads)],
                ["Zips con demanda", `${c.activeZips}/${c.totalZips}`],
                ["Renta promedio", c.avgRent > 0 ? `$${fmt(c.avgRent)}` : "—"],
                ["Casas disponibles", fmt(c.properties)],
                ["Visitas agendadas", fmt(c.showings)],
                ["Leads por casa", c.properties > 0 ? fmt(Math.round(c.leads / c.properties)) : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-base font-bold m-0 tabular-nums" style={{ color: INK.primary }}>{v}</p>
                  <p className="text-[11px] m-0" style={{ color: INK.muted }}>{k}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);

// ── Demand over time, both cities ─────────────────────────────────────
export const DemandOverTime: React.FC<{ data: WeekPoint[] }> = ({ data }) => {
  const empty = data.every((d) => d.cleveland === 0 && d.milwaukee === 0);
  return (
    <Card variant="glass">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-[#4F46E5]" />
          <h3 className="font-semibold text-slate-900 m-0">Leads nuevos por semana</h3>
        </div>
        <p className="text-xs m-0 mb-3" style={{ color: INK.muted }}>
          Cuándo llega la demanda, y de qué ciudad
        </p>
        {empty ? (
          <p className="text-sm py-10 text-center" style={{ color: INK.muted }}>
            Sin leads en este rango.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <defs>
                {Object.entries(CITY_SERIES).map(([k, s]) => (
                  <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<InkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} iconType="circle" iconSize={8} />
              {Object.entries(CITY_SERIES).map(([k, s]) => (
                <Area
                  key={k} type="monotone" dataKey={k} name={s.label}
                  stroke={s.color} strokeWidth={2} fill={`url(#g-${k})`}
                  dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

// ── Where leads fall out ──────────────────────────────────────────────
export const LeadFunnel: React.FC<{ steps: FunnelStep[] }> = ({ steps }) => {
  // One hue, light→dark: this is magnitude along a single sequence, not four
  // separate identities, so it takes a sequential ramp rather than categorical.
  const ramp = ["#c7d2fe", "#a5b4fc", "#818cf8", "#4F46E5"];
  const top = steps[0]?.count || 1;
  return (
    <Card variant="glass">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-4 w-4 text-[#4F46E5]" />
          <h3 className="font-semibold text-slate-900 m-0">De lead a aplicación</h3>
        </div>
        <p className="text-xs m-0 mb-3" style={{ color: INK.muted }}>
          Cuántos sobreviven cada paso, sobre el total de leads
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={steps} layout="vertical" margin={{ top: 0, right: 56, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} />
            <YAxis
              type="category" dataKey="stage" width={124}
              tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false}
            />
            <Tooltip content={<InkTooltip />} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} barSize={22}
                 label={{
                   position: "right", fontSize: 11, fill: INK.secondary,
                   formatter: (v: number) => `${fmt(v)} · ${Math.round((v / top) * 100)}%`,
                 }}>
              {steps.map((_, i) => <Cell key={i} fill={ramp[Math.min(i, ramp.length - 1)]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// ── Top zips of the selected city ─────────────────────────────────────
export const TopZipsChart: React.FC<{
  data: Array<{ zip: string; leads: number }>;
  cityKey: string;
}> = ({ data, cityKey }) => {
  const color = CITY_SERIES[cityKey]?.color || "#4F46E5";
  const label = CITY_SERIES[cityKey]?.label || cityKey;
  const rows = useMemo(() => data.slice(0, 8), [data]);
  return (
    <Card variant="glass">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-4 w-4" style={{ color }} />
          <h3 className="font-semibold text-slate-900 m-0">Zips con más demanda — {label}</h3>
        </div>
        <p className="text-xs m-0 mb-3" style={{ color: INK.muted }}>
          Un lead interesado en varios zips cuenta en cada uno
        </p>
        {rows.length === 0 ? (
          <p className="text-sm py-10 text-center" style={{ color: INK.muted }}>Sin demanda registrada.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 14, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="zip" tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<InkTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="leads" name="Leads" fill={color} radius={[4, 4, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
