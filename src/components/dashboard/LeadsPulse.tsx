import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LiveNumber } from "./LiveNumber";
import { useLeadCharts } from "@/hooks/useLeadCharts";
import { Activity, Flame, Calendar, ChevronDown, Check, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Range chip options (trend window). "7 días" is the default active range.
const RANGES: { label: string; days: number }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "1 año", days: 365 },
];

const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

// Compact tooltip for the area chart
const AreaTip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white/95 px-2.5 py-1.5 shadow-md backdrop-blur dark:bg-card/95">
      <p className="text-[11px] font-medium text-muted-foreground">{p.d}</p>
      <p className="text-sm font-bold text-indigo-600 tabular-nums">
        {p.count} {p.count === 1 ? "lead" : "leads"}
      </p>
    </div>
  );
};

const Panel: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({ title, className, children }) => (
  <div className={cn("rounded-xl border border-slate-200/60 bg-white/50 p-3 dark:border-white/5 dark:bg-white/[0.02]", className)}>
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    {children}
  </div>
);

export const LeadsPulse: React.FC = () => {
  const [range, setRange] = useState(7);
  const { data, isLoading } = useLeadCharts(range);
  const activeLabel = RANGES.find((r) => r.days === range)?.label ?? "7 días";

  const peak = useMemo(() => Math.max(1, ...(data.daily || []).map((d) => d.count)), [data.daily]);

  // "Hoy vs. histórico" — leads per day: today vs trailing daily averages.
  const compare = useMemo(() => {
    const rows = [
      { label: "Hoy", value: data.today, highlight: true },
      { label: "Sem. pasada", value: data.avg_prev_week },
      { label: "Mes pasado", value: data.avg_prev_month },
      { label: "Prom. total", value: data.avg_all },
    ];
    const max = Math.max(1, ...rows.map((r) => r.value));
    const delta = data.avg_all > 0 ? Math.round(((data.today - data.avg_all) / data.avg_all) * 100) : null;
    return { rows, max, delta };
  }, [data.today, data.avg_prev_week, data.avg_prev_month, data.avg_all]);

  if (isLoading && data.daily.length === 0) {
    return (
      <Card variant="glass">
        <CardContent className="p-4 sm:p-5">
          <Skeleton className="h-5 w-40 mb-3" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-[130px] rounded-xl xl:col-span-2" />
            <Skeleton className="h-[130px] rounded-xl" />
            <Skeleton className="h-[130px] rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        {/* Header */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-indigo-500/10 p-2">
              <Activity className="h-4 w-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Pulso de Leads</h2>
              <p className="text-xs text-muted-foreground">Actividad de leads en tiempo real</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-base font-bold tabular-nums leading-none text-amber-500" title="Leads hot">
              <Flame className="h-3.5 w-3.5" />
              <LiveNumber value={data.hot} />
            </div>
            {/* Range chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Cambiar rango"
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 py-1 pl-2.5 pr-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur transition-all",
                    "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                    "data-[state=open]:border-primary/50 data-[state=open]:bg-primary/10 data-[state=open]:text-primary",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5 opacity-70" />
                  {activeLabel}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[9rem]">
                {RANGES.map((r) => (
                  <DropdownMenuItem
                    key={r.days}
                    onClick={() => setRange(r.days)}
                    className={cn("cursor-pointer justify-between gap-4 text-sm", range === r.days && "font-semibold text-primary")}
                  >
                    {r.label}
                    {range === r.days && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="relative flex h-2.5 w-2.5" title="En vivo">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Nuevos por día — the hero trend (window from the range chip) */}
          <Panel title={`Nuevos por día · ${activeLabel}`} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={data.daily} margin={{ top: 6, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadPulseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 9, fill: "#94a3b8" }}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={22}
                />
                <YAxis hide domain={[0, peak * 1.15]} />
                <Tooltip content={<AreaTip />} cursor={{ stroke: "#c7d2fe", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#4F46E5"
                  strokeWidth={2.5}
                  fill="url(#leadPulseGrad)"
                  isAnimationActive
                  animationDuration={900}
                  dot={false}
                  activeDot={{ r: 4, fill: "#4F46E5", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Hoy vs. histórico — leads por día (today vs trailing daily averages) */}
          <Panel title="Ritmo · leads por día">
            <div className="space-y-2">
              {compare.rows.map((r) => (
                <div key={r.label}>
                  <div className="mb-0.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={cn("font-semibold tabular-nums", r.highlight && "text-indigo-600")}>{fmtNum(r.value)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-700 ease-out", r.highlight ? "bg-indigo-500" : "bg-slate-300 dark:bg-white/25")}
                      style={{ width: `${Math.min(100, (r.value / compare.max) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {compare.delta != null && (
              <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-1.5 text-[11px] dark:border-white/5">
                {compare.delta >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className={cn("font-semibold tabular-nums", compare.delta >= 0 ? "text-emerald-600" : "text-destructive")}>
                  {compare.delta >= 0 ? "+" : ""}{compare.delta}%
                </span>
                <span className="text-muted-foreground">hoy vs. promedio total</span>
              </div>
            )}
          </Panel>
        </div>
      </CardContent>
    </Card>
  );
};
