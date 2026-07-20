import React, { useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { format, parse, isValid, subDays, startOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  BarChart3,
  Bot,
  Building2,
  Calendar,
  DollarSign,
  Download,
  Flame,
  Home,
  Inbox,
  Mail,
  MapPin,
  MessagesSquare,
  NotebookPen,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { StatCard } from "@/components/dashboard/StatCard";
import { MilestoneFunnel } from "@/components/analytics/MilestoneFunnel";
import { InvestorReportsTab } from "@/components/settings/InvestorReportsTab";
import {
  useAnalytics,
  usePropertyOptions,
  exportAnalyticsToCSV,
} from "@/hooks/useAnalytics";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

const SOURCE_LABELS: Record<string, string> = {
  hemlane: "Hemlane",
  campaign: "Campaign",
  manual: "Manual",
  website: "Website",
  referral: "Referral",
  unknown: "Unknown",
};

const PROPERTY_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  coming_soon: "Coming Soon",
  in_leasing_process: "In Leasing",
  rented: "Rented",
  inactive: "Inactive",
};

// Statuses actually used by the pipeline (contacted/engaged/qualified/converted
// are permanently 0 in this org — showing them reads as broken).
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  nurturing: "Nurturing",
  showing_scheduled: "Showing Scheduled",
  showed: "Showed",
  in_application: "In Application",
  lost: "Lost",
};

// Data-era boundaries: metrics are masked/badged before these dates because the
// underlying tracking simply did not exist earlier (not a display preference).
const FIRST_RESPONSE_VALID_FROM = new Date(2026, 6, 1); // campaign blasts to old leads pollute earlier cohorts
const OPEN_TRACKING_SINCE = new Date(2026, 6, 17); // Resend open/click tracking enabled Jul 17
const INBOUND_PERSIST_SINCE = new Date(2026, 6, 10); // inbound_emails persistence live Jul 10

const DATE_FMT = "yyyy-MM-dd";

interface Preset {
  key: string;
  label: string;
  range: () => { from: Date; to: Date };
}

const PRESETS: Preset[] = [
  { key: "hoy", label: "Hoy", range: () => ({ from: new Date(), to: new Date() }) },
  { key: "7d", label: "7 días", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { key: "30d", label: "30 días", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { key: "mes", label: "Este mes", range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { key: "90d", label: "90 días", range: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
  { key: "2026", label: "2026", range: () => ({ from: new Date(2026, 0, 1), to: new Date() }) },
  { key: "todo", label: "Todo", range: () => ({ from: new Date(2023, 0, 1), to: new Date() }) },
];

const DEFAULT_PRESET = "30d";

// ── Formatting helpers ───────────────────────────────────────────────

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);

const fmtMoneyCents = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(v);

const fmtMins = (mins: number | null | undefined): string => {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 60 * 24) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / (60 * 24)).toFixed(1)}d`;
};

const pctOf = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

// ── Small building blocks ────────────────────────────────────────────

const NowChip: React.FC = () => (
  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
    Ahora
  </Badge>
);

const SinceBadge: React.FC<{ label: string }> = ({ label }) => (
  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
    {label}
  </Badge>
);

// ── Page ─────────────────────────────────────────────────────────────

const Analytics: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const permissions = usePermissions();
  const showCosts = permissions.canViewCostDashboard;
  const showInformes = permissions.canViewInvestorReports;

  // Filters from URL (?tab=&from=&to=&source=&property=). The tab param is
  // sanitized against the tabs THIS user can see — otherwise an editor hitting
  // the legacy /costs redirect (?tab=costos) or any typo'd tab would render a
  // Tabs value with no matching panel: a blank page.
  const rawTab = searchParams.get("tab") || "resumen";
  const validTabs = [
    "resumen", "pipeline", "propiedades", "email",
    ...(showCosts ? ["costos"] : []),
    ...(showInformes ? ["informes"] : []),
  ];
  const tab = validTabs.includes(rawTab) ? rawTab : "resumen";
  const source = searchParams.get("source");
  const propertyId = searchParams.get("property");
  const hasLeadFilters = !!(source || propertyId);

  const { from, to } = useMemo(() => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (fromParam && toParam) {
      const f = parse(fromParam, DATE_FMT, new Date());
      const t = parse(toParam, DATE_FMT, new Date());
      if (isValid(f) && isValid(t) && f <= t) return { from: f, to: t };
    }
    return PRESETS.find((p) => p.key === DEFAULT_PRESET)!.range();
  }, [searchParams]);

  const activePreset = useMemo(() => {
    const fromStr = format(from, DATE_FMT);
    const toStr = format(to, DATE_FMT);
    return PRESETS.find((p) => {
      const r = p.range();
      return format(r.from, DATE_FMT) === fromStr && format(r.to, DATE_FMT) === toStr;
    })?.key;
  }, [from, to]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null) next.delete(k);
        else next.set(k, v);
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setRange = useCallback(
    (r: { from: Date; to: Date }) =>
      updateParams({ from: format(r.from, DATE_FMT), to: format(r.to, DATE_FMT) }),
    [updateParams]
  );

  const handlePickerChange = useCallback(
    (r: DateRange | undefined) => {
      if (r?.from && r?.to) setRange({ from: r.from, to: r.to });
    },
    [setRange]
  );

  const filters = useMemo(
    () => ({
      from,
      to,
      source,
      propertyIds: propertyId ? [propertyId] : null,
    }),
    [from, to, source, propertyId]
  );

  const { data, isLoading, refetch, isRefetching, error } = useAnalytics(filters);
  const { data: propertyOptions } = usePropertyOptions();

  const o = data?.overview;

  const leadsTrend = useMemo(() => {
    if (!o || o.prev_period_leads === 0) return null;
    return Math.round(((o.leads_in_range - o.prev_period_leads) / o.prev_period_leads) * 100);
  }, [o]);

  const firstResponseMasked = from < FIRST_RESPONSE_VALID_FROM;
  const rangeIncludesPreOpenTracking = from < OPEN_TRACKING_SINCE;
  const rangeIncludesPreInbound = from < INBOUND_PERSIST_SINCE;

  // Estimated channel costs from real counts × owner-editable unit costs
  const estimatedCosts = useMemo(() => {
    if (!data || !o) return null;
    const resend =
      data.unitCosts.resendPerEmail != null ? o.costs.emails_sent * data.unitCosts.resendPerEmail : null;
    const twilio =
      data.unitCosts.twilioPerSms != null ? o.costs.sms_sent * data.unitCosts.twilioPerSms : null;
    const real = Number(o.costs.total) || 0;
    return { resend, twilio, real, combined: real + (resend ?? 0) + (twilio ?? 0) };
  }, [data, o]);

  const handleExport = useCallback(() => {
    if (data) exportAnalyticsToCSV(data, { from, to });
  }, [data, from, to]);

  const usedStatuses = useMemo(() => {
    const statuses = o?.snapshot.statuses || {};
    return Object.entries(statuses)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [o]);

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Pipeline, propiedades, email y costos — datos reales, una sola fuente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            Refresh
          </Button>
          {permissions.canExportData && (
            <Button
              size="sm"
              onClick={handleExport}
              disabled={!data || isLoading}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Global filter bar ───────────────────────────────── */}
      <Card variant="glass">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                variant={activePreset === p.key ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setRange(p.range())}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <DateRangePicker date={{ from, to }} onDateChange={handlePickerChange} />
            <Select
              value={source ?? "all"}
              onValueChange={(v) => updateParams({ source: v === "all" ? null : v })}
            >
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fuentes</SelectItem>
                <SelectItem value="hemlane">Hemlane</SelectItem>
                <SelectItem value="campaign">Campaign</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="website">Website</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={propertyId ?? "all"}
              onValueChange={(v) => updateParams({ property: v === "all" ? null : v })}
            >
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Propiedad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las propiedades</SelectItem>
                {(propertyOptions || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.unit_number ? `${p.address} · ${p.unit_number}` : p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card variant="glass" className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Error cargando analytics"}
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => updateParams({ tab: v === "resumen" ? null : v })}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline & Fuentes</TabsTrigger>
          <TabsTrigger value="propiedades">Propiedades & Showings</TabsTrigger>
          <TabsTrigger value="email">Email & Campañas</TabsTrigger>
          {showCosts && <TabsTrigger value="costos">Costos & Sistema</TabsTrigger>}
          {showInformes && <TabsTrigger value="informes">Informes</TabsTrigger>}
        </TabsList>

        {/* ═══ TAB: RESUMEN ═══════════════════════════════════ */}
        <TabsContent value="resumen" className="space-y-5 mt-4">
          <div className="grid gap-2 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              title="Leads nuevos"
              value={o?.leads_in_range ?? 0}
              icon={Users}
              subtitle={o ? `${o.snapshot.total_leads.toLocaleString()} total` : "cargando"}
              trend={
                leadsTrend != null && leadsTrend !== 0
                  ? { value: Math.abs(leadsTrend), isPositive: leadsTrend > 0 }
                  : undefined
              }
              loading={isLoading || !data}
            />
            <StatCard
              title="Hot ahora"
              value={o?.snapshot.hot ?? 0}
              icon={Flame}
              subtitle="Agendó o más · ahora"
              loading={isLoading || !data}
            />
            <StatCard
              title="Showings"
              value={o?.showings.total ?? 0}
              icon={Calendar}
              subtitle={
                o?.showings.show_rate != null
                  ? `${o.showings.show_rate}% show-rate`
                  : "sin resueltos en el rango"
              }
              loading={isLoading || !data}
            />
            <StatCard
              title="Aplicó"
              value={o?.funnel.eq100 ?? 0}
              icon={TrendingUp}
              subtitle={o ? `${o.snapshot.aplico_total} total` : "cargando"}
              loading={isLoading || !data}
            />
            <StatCard
              title="1ª respuesta"
              value={firstResponseMasked ? "—" : fmtMins(o?.first_response.median_mins)}
              icon={Zap}
              subtitle={
                firstResponseMasked
                  ? "válido desde jul 2026"
                  : o?.first_response.pct_within_1h != null
                    ? `${o.first_response.pct_within_1h}% en <1h`
                    : "sin datos"
              }
              loading={isLoading || !data}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Leads over time */}
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Nuevos leads en el tiempo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Bucket: {data?.bucket === "day" ? "día" : data?.bucket === "week" ? "semana" : "mes"} · Cleveland (ET)
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : data && data.series.length > 0 ? (
                  <div role="img" aria-label={`Leads nuevos por ${data.bucket} en el rango seleccionado`}>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={data.series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="bucket"
                          tick={AXIS_TICK}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d")}
                        />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number) => [`${v} leads`, "Nuevos"]}
                          labelFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d, yyyy")}
                        />
                        <Area
                          type="monotone"
                          dataKey="leads"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          fill="url(#leadsGradient)"
                          activeDot={{ r: 5, fill: "hsl(var(--accent))", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos en el rango
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Milestone funnel */}
            <MilestoneFunnel funnel={o?.funnel} milestones={o?.milestones} loading={isLoading || !data} />
          </div>

          {/* Ops tiles */}
          <div className={cn("grid gap-4", showCosts ? "md:grid-cols-3" : "md:grid-cols-2")}>
            <Card variant="glass">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <NotebookPen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Acciones del equipo</p>
                    <p className="text-xs text-muted-foreground">Notas y acciones registradas</p>
                  </div>
                </div>
                <p className="text-2xl font-bold">{(o?.team_activity.notes ?? 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  en {(o?.team_activity.leads_touched ?? 0).toLocaleString()} leads distintos
                </p>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-info/10">
                      <MessagesSquare className="h-5 w-5 text-info" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Respuestas de leads</p>
                      <p className="text-xs text-muted-foreground">Mensajes entrantes</p>
                    </div>
                  </div>
                  {rangeIncludesPreInbound && <SinceBadge label="desde 10 jul" />}
                </div>
                <p className="text-2xl font-bold">{(o?.inbound.messages ?? 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {(o?.inbound.outcomes?.message_attached ?? 0).toLocaleString()} respuestas a leads existentes
                </p>
              </CardContent>
            </Card>

            {showCosts && (
              <Card variant="glass">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-success/10">
                      <Bot className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Costo AI (rango)</p>
                      <p className="text-xs text-muted-foreground">cost_records · real</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{fmtMoneyCents(Number(o?.costs.total ?? 0))}</p>
                  <p className="text-xs text-muted-foreground">detalle en Costos & Sistema</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: PIPELINE & FUENTES ════════════════════════ */}
        <TabsContent value="pipeline" className="space-y-5 mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Source performance — the ONE source rendering */}
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Rendimiento por fuente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6"><Skeleton className="h-[200px] w-full" /></div>
                ) : o && o.sources.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fuente</TableHead>
                        <TableHead className="text-center">Leads</TableHead>
                        <TableHead className="text-center">Hito prom.</TableHead>
                        <TableHead className="text-center">Con showing</TableHead>
                        <TableHead className="text-center">% a showing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {o.sources.map((s) => (
                        <TableRow key={s.source}>
                          <TableCell className="font-medium text-sm">
                            {SOURCE_LABELS[s.source] || s.source}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {s.leads.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">{s.avg_score ?? 0}</TableCell>
                          <TableCell className="text-center tabular-nums">{s.with_showing}</TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                "text-xs font-bold",
                                s.with_showing > 0 ? "text-success" : "text-muted-foreground"
                              )}
                            >
                              {pctOf(s.with_showing, s.leads)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-6 text-center text-muted-foreground text-sm">Sin datos en el rango</div>
                )}
              </CardContent>
            </Card>

            {/* First response detail + statuses */}
            <div className="space-y-5">
              <Card variant="glass">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Primera respuesta (email)
                    </CardTitle>
                    {firstResponseMasked && <SinceBadge label="válido desde jul 2026" />}
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[90px] w-full" />
                  ) : firstResponseMasked ? (
                    <p className="text-sm text-muted-foreground">
                      Los rangos que empiezan antes de julio 2026 mezclan blasts de campañas a
                      leads viejos y dan tiempos sin sentido. Elegí un rango desde julio.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-2xl font-bold text-primary">{fmtMins(o?.first_response.median_mins)}</p>
                        <p className="text-xs text-muted-foreground">mediana</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{fmtMins(o?.first_response.p90_mins)}</p>
                        <p className="text-xs text-muted-foreground">p90</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-success">
                          {o?.first_response.pct_within_1h != null ? `${o.first_response.pct_within_1h}%` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          en &lt;1h · n={o?.first_response.measured ?? 0}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Estados operativos</CardTitle>
                    <NowChip />
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[120px] w-full" />
                  ) : (
                    <div className="space-y-1.5">
                      {usedStatuses.map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{STATUS_LABELS[status] || status}</span>
                          <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Peak hours */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                Horas pico (Cleveland)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {hasLeadFilters
                  ? "Leads nuevos por hora del día (6am–10pm ET) — los mensajes entrantes no se filtran por fuente/propiedad y se ocultan"
                  : "Leads nuevos + mensajes entrantes por hora del día (6am–10pm ET)"}
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                if (isLoading) return <Skeleton className="h-[240px] w-full" />;
                const visibleHours = (o?.peak_hours ?? [])
                  .filter((h) => h.hour >= 6 && h.hour <= 22)
                  .map((h) => ({
                    ...h,
                    inbound: hasLeadFilters ? 0 : h.inbound,
                    label: `${((h.hour + 11) % 12) + 1}${h.hour >= 12 ? "pm" : "am"}`,
                  }));
                if (!visibleHours.some((h) => h.leads > 0 || h.inbound > 0)) {
                  return (
                    <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                      Sin actividad entre 6am y 10pm en el rango
                    </div>
                  );
                }
                return (
                  <div role="img" aria-label="Actividad por hora del día en Cleveland">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={visibleHours} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Bar dataKey="leads" stackId="a" fill="hsl(var(--primary))" name="Leads nuevos" />
                        {!hasLeadFilters && (
                          <Bar dataKey="inbound" stackId="a" fill="hsl(var(--info))" name="Mensajes entrantes" radius={[3, 3, 0, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: PROPIEDADES & SHOWINGS ════════════════════ */}
        <TabsContent value="propiedades" className="space-y-5 mt-4">
          {/* Portfolio snapshot */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Portafolio
                </CardTitle>
                <NowChip />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[120px] w-full" />
              ) : o ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-success/10 p-3">
                      <p className="text-xs text-muted-foreground">Disponibles</p>
                      <p className="text-xl font-bold text-success">{o.portfolio.available}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(o.portfolio.rent_available)}/mo</p>
                    </div>
                    <div className="rounded-lg bg-info/10 p-3">
                      <p className="text-xs text-muted-foreground">Coming soon</p>
                      <p className="text-xl font-bold text-info">{o.portfolio.coming_soon}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(o.portfolio.rent_coming_soon)}/mo</p>
                    </div>
                    <div className="rounded-lg bg-warning/10 p-3">
                      <p className="text-xs text-muted-foreground">En proceso</p>
                      <p className="text-xl font-bold text-warning">{o.portfolio.in_leasing}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(o.portfolio.rent_in_leasing)}/mo</p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      <p className="text-xs text-muted-foreground">Rentadas</p>
                      <p className="text-xl font-bold text-primary">{o.portfolio.rented}</p>
                      <p className="text-xs text-muted-foreground">{fmtMoney(o.portfolio.rent_rented)}/mo</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          Ocupación ({o.portfolio.rented} de {o.portfolio.active} unidades activas)
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            (o.portfolio.occupancy_pct ?? 0) >= 70
                              ? "text-success"
                              : (o.portfolio.occupancy_pct ?? 0) >= 50
                                ? "text-warning"
                                : "text-destructive"
                          )}
                        >
                          {o.portfolio.occupancy_pct ?? 0}%
                        </span>
                      </div>
                      <Progress value={o.portfolio.occupancy_pct ?? 0} className="h-2" />
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-right">
                      <p>
                        Vacancia accionable:{" "}
                        <span className="font-semibold text-foreground">
                          {fmtMoney(o.portfolio.rent_available)}/mo
                        </span>{" "}
                        ({o.portfolio.available} disponibles)
                      </p>
                      <p>
                        Pipeline de renta: {fmtMoney(o.portfolio.rent_coming_soon + o.portfolio.rent_in_leasing)}/mo
                        en coming soon + en proceso
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Property demand table */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  Demanda por propiedad
                </CardTitle>
                {o && o.top_properties.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    Top {o.top_properties.length} del rango
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : o && o.top_properties.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Propiedad</TableHead>
                        <TableHead className="text-center">Leads</TableHead>
                        <TableHead className="text-center">Showings</TableHead>
                        <TableHead className="text-center">Hito prom.</TableHead>
                        <TableHead className="text-right">Renta</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {o.top_properties.map((p, idx) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
                                  idx === 0
                                    ? "bg-accent/20 text-accent-foreground"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {idx + 1}
                              </span>
                              <div>
                                <p className="font-medium text-sm" title={p.address}>
                                  {p.unit_number ? `${p.address} · ${p.unit_number}` : p.address}
                                </p>
                                {p.bedrooms != null && (
                                  <p className="text-xs text-muted-foreground">{p.bedrooms} BR</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {p.leads.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">{p.showings}</TableCell>
                          <TableCell className="text-center tabular-nums">{p.avg_score ?? 0}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.rent_price ? `$${p.rent_price.toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={p.status === "available" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {PROPERTY_STATUS_LABELS[p.status] || p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Sin interés registrado en el rango</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Showings over time + links */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card variant="glass" className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Showings en el tiempo
                  </CardTitle>
                  {o?.showings.show_rate != null && (
                    <Badge variant="secondary" className="text-xs">
                      show-rate {o.showings.show_rate}%
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : data && data.series.some((p) =>
                    p.showings_scheduled + p.showings_completed + p.showings_no_show + p.showings_cancelled > 0
                  ) ? (
                  <div role="img" aria-label="Showings por período con resultado">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={data.series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="bucket"
                          tick={AXIS_TICK}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d")}
                        />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d, yyyy")}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Bar dataKey="showings_completed" stackId="a" fill="hsl(var(--success))" name="Completados" />
                        <Bar dataKey="showings_no_show" stackId="a" fill="hsl(var(--destructive))" name="No-show" />
                        <Bar dataKey="showings_cancelled" stackId="a" fill="hsl(var(--muted-foreground))" name="Cancelados" />
                        <Bar dataKey="showings_scheduled" stackId="a" fill="hsl(var(--primary))" name="Agendados" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin showings en el rango
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card variant="glass">
                <CardContent className="p-5 space-y-3">
                  <p className="font-semibold text-sm">Resultados del rango</p>
                  {isLoading ? (
                    <Skeleton className="h-[100px] w-full" />
                  ) : (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completados</span>
                        <span className="font-semibold text-success tabular-nums">{o?.showings.completed ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">No-show</span>
                        <span className="font-semibold text-destructive tabular-nums">{o?.showings.no_show ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cancelados</span>
                        <span className="font-semibold tabular-nums">{o?.showings.cancelled ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reagendados</span>
                        <span className="font-semibold tabular-nums">{o?.showings.rescheduled ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Agendados (pend.)</span>
                        <span className="font-semibold text-primary tabular-nums">{o?.showings.scheduled ?? 0}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="p-5 space-y-2">
                  <p className="font-semibold text-sm mb-2">Más análisis</p>
                  <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                    <Link to="/analytics/heat-map">
                      <MapPin className="h-4 w-4" /> Heat Map
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                    <Link to="/analytics/competitor-radar">
                      <Target className="h-4 w-4" /> Rent Benchmark
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB: EMAIL & CAMPAÑAS ══════════════════════════ */}
        <TabsContent value="email" className="space-y-5 mt-4">
          {hasLeadFilters && (
            <p className="text-xs text-muted-foreground -mb-2">
              Los filtros de fuente/propiedad no aplican a email — este tab siempre
              muestra el volumen completo de la organización.
            </p>
          )}
          <div className="grid gap-2 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              title="Enviados"
              value={data?.email.summary.attempted ?? 0}
              icon={Mail}
              subtitle={
                data && data.email.summary.total > data.email.summary.attempted
                  ? `+${(data.email.summary.total - data.email.summary.attempted).toLocaleString()} en cola`
                  : "emails en el rango"
              }
              loading={isLoading || !data}
            />
            <StatCard
              title="Entregados"
              value={data ? pctOf(data.email.summary.delivered, data.email.summary.attempted) : "—"}
              icon={Mail}
              subtitle={data ? `${data.email.summary.delivered.toLocaleString()} emails` : "cargando"}
              loading={isLoading || !data}
            />
            <StatCard
              title="Rebote"
              value={data ? pctOf(data.email.summary.bounced, data.email.summary.attempted) : "—"}
              icon={Mail}
              subtitle={data ? `${data.email.summary.bounced.toLocaleString()} rebotados` : "cargando"}
              loading={isLoading || !data}
            />
            <StatCard
              title="Abiertos"
              value={data ? pctOf(data.email.summary.opened, data.email.summary.delivered) : "—"}
              icon={Mail}
              subtitle={rangeIncludesPreOpenTracking ? "tracking desde 17 jul" : "de los entregados"}
              loading={isLoading || !data}
            />
            <StatCard
              title="Clicks"
              value={data?.email.summary.clicked ?? 0}
              icon={Mail}
              subtitle={rangeIncludesPreOpenTracking ? "tracking desde 17 jul" : "en el rango"}
              loading={isLoading || !data}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Email volume over time */}
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Emails en el tiempo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : data && data.email.series.length > 0 ? (
                  <div role="img" aria-label="Volumen de emails por período: entregados, rebotados y abiertos">
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={data.email.series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="bucket"
                          tick={AXIS_TICK}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d")}
                        />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d, yyyy")}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Area type="monotone" dataKey="delivered" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} name="Entregados" />
                        <Area type="monotone" dataKey="bounced" stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.25} name="Rebotados" />
                        <Area type="monotone" dataKey="opened" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.15} name="Abiertos" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                    Sin emails en el rango
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Inbound breakdown */}
            <Card variant="glass">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-primary" />
                    Respuestas entrantes
                  </CardTitle>
                  {rangeIncludesPreInbound && <SinceBadge label="desde 10 jul" />}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold">{(data?.email.inbound.messages ?? 0).toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">mensajes entrantes</p>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t">
                      {(() => {
                        // Esther writes many internal outcome codes (digest:*, non_lead,
                        // billing_alert…) — surface the 4 meaningful ones, bucket the rest.
                        const KNOWN: Record<string, string> = {
                          message_attached: "Respuesta a lead existente",
                          lead_created: "Lead nuevo creado",
                          lead_updated: "Lead actualizado",
                          shell_created: "Shell creado (por completar)",
                        };
                        const outcomes = data?.email.inbound.outcomes || {};
                        const rows: [string, number][] = Object.entries(KNOWN)
                          .map(([k, label]): [string, number] => [label, outcomes[k] ?? 0])
                          .filter(([, count]) => count > 0);
                        const other = Object.entries(outcomes)
                          .filter(([k]) => !(k in KNOWN))
                          .reduce((s, [, c]) => s + c, 0);
                        if (other > 0) rows.push(["Otros (digest, no-lead, sistema)", other]);
                        if (rows.length === 0) {
                          return <p className="text-sm text-muted-foreground">Sin emails entrantes en el rango</p>;
                        }
                        return rows.map(([label, count]) => (
                          <div key={label} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-campaign performance */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Rendimiento por campaña
                </CardTitle>
                {rangeIncludesPreOpenTracking && <SinceBadge label="opens/clicks desde 17 jul" />}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><Skeleton className="h-[200px] w-full" /></div>
              ) : data && data.email.campaigns.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaña</TableHead>
                        <TableHead className="text-center">Enviados</TableHead>
                        <TableHead className="text-center">Entregados</TableHead>
                        <TableHead className="text-center">Abiertos</TableHead>
                        <TableHead className="text-center">Clicks</TableHead>
                        <TableHead className="text-center">Rebotes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.email.campaigns.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <p className="font-medium text-sm">{c.name}</p>
                            {c.started_at && (
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(c.started_at), "MMM d, yyyy")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {c.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {c.delivered.toLocaleString()}
                            <span className="text-xs text-muted-foreground ml-1">
                              {pctOf(c.delivered, c.total)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {c.opened.toLocaleString()}
                            <span className="text-xs text-muted-foreground ml-1">
                              {pctOf(c.opened, c.delivered)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center tabular-nums">{c.clicked}</TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                "tabular-nums",
                                c.total > 0 && c.bounced / c.total > 0.1 ? "text-destructive font-semibold" : ""
                              )}
                            >
                              {c.bounced.toLocaleString()}
                              <span className="text-xs text-muted-foreground ml-1">{pctOf(c.bounced, c.total)}</span>
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Sin campañas con envíos en el rango
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: COSTOS & SISTEMA (admin) ══════════════════ */}
        {showCosts && (
          <TabsContent value="costos" className="space-y-5 mt-4">
            {hasLeadFilters && (
              <p className="text-xs text-muted-foreground -mb-2">
                Los filtros de fuente/propiedad no aplican a costos ni tareas — este
                tab siempre muestra la organización completa (solo filtra por fecha).
              </p>
            )}
            <div className="grid gap-2 sm:gap-4 grid-cols-2 sm:grid-cols-4">
              <StatCard
                title="Gasto AI (real)"
                value={fmtMoneyCents(Number(o?.costs.total ?? 0))}
                icon={Bot}
                subtitle="cost_records en el rango"
                loading={isLoading || !data}
              />
              <StatCard
                title="Email (estimado)"
                value={estimatedCosts?.resend != null ? fmtMoneyCents(estimatedCosts.resend) : "—"}
                icon={Mail}
                subtitle={o ? `${o.costs.emails_sent.toLocaleString()} enviados × unitario` : "cargando"}
                loading={isLoading || !data}
              />
              <StatCard
                title="SMS (estimado)"
                value={estimatedCosts?.twilio != null ? fmtMoneyCents(estimatedCosts.twilio) : "—"}
                icon={MessagesSquare}
                subtitle={o ? `${o.costs.sms_sent.toLocaleString()} SMS × unitario` : "cargando"}
                loading={isLoading || !data}
              />
              <StatCard
                title="Costo por lead"
                value={
                  estimatedCosts && o && o.leads_in_range > 0
                    ? fmtMoneyCents(estimatedCosts.combined / o.leads_in_range)
                    : "—"
                }
                icon={DollarSign}
                subtitle={
                  o && o.funnel.eq100 > 0 && estimatedCosts
                    ? `${fmtMoneyCents(estimatedCosts.combined / o.funnel.eq100)} por aplicación`
                    : "real + estimado ÷ leads"
                }
                loading={isLoading || !data}
              />
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
              Los costos de email/SMS son <span className="font-semibold">estimados</span> (conteos reales ×
              costo unitario editable en organization_settings). El gasto AI es real de cost_records — solo
              OpenAI registra costos hoy.
            </p>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Agent tasks weekly */}
              <Card variant="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    Tareas de agentes por semana
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {o
                      ? `${Object.values(o.agent_tasks.by_status).reduce((a, b) => a + b, 0).toLocaleString()} tareas en el rango`
                      : ""}
                  </p>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[240px] w-full" />
                  ) : o && o.agent_tasks.weekly.length > 0 ? (
                    <div role="img" aria-label="Tareas de agentes por semana y estado">
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={o.agent_tasks.weekly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis
                            dataKey="week"
                            tick={AXIS_TICK}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d")}
                          />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelFormatter={(v: string) => format(new Date(`${v}T12:00:00`), "MMM d, yyyy")}
                          />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                          <Bar dataKey="completed" stackId="a" fill="hsl(var(--success))" name="Completadas" />
                          <Bar dataKey="pending" stackId="a" fill="hsl(var(--warning))" name="Pendientes" />
                          <Bar dataKey="failed" stackId="a" fill="hsl(var(--destructive))" name="Fallidas" />
                          <Bar dataKey="cancelled" stackId="a" fill="hsl(var(--muted-foreground))" name="Canceladas" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                      Sin tareas en el rango
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cost breakdown by service */}
              <Card variant="glass">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Desglose de costos
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      real + estimado
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[240px] w-full" />
                  ) : estimatedCosts && estimatedCosts.combined > 0 ? (() => {
                    const costSlices = [
                      ...Object.entries(o?.costs.by_service || {}).map(([service, amount]) => ({
                        name: service === "openai" ? "OpenAI (real)" : `${service} (real)`,
                        value: Number(amount),
                      })),
                      ...(estimatedCosts.resend != null && estimatedCosts.resend > 0
                        ? [{ name: "Resend (est.)", value: estimatedCosts.resend }]
                        : []),
                      ...(estimatedCosts.twilio != null && estimatedCosts.twilio > 0
                        ? [{ name: "Twilio SMS (est.)", value: estimatedCosts.twilio }]
                        : []),
                    ];
                    const CHART_TOKENS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
                    return (
                    <div role="img" aria-label="Desglose de costos por servicio">
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={costSlices}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                            stroke="none"
                          >
                            {costSlices.map((_, i) => (
                              <Cell key={i} fill={CHART_TOKENS[i % CHART_TOKENS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(v: number, name: string) => [fmtMoneyCents(v), name]}
                          />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "11px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    );
                  })() : (
                    <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                      Sin costos registrados en el rango
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* ═══ TAB: INFORMES ══════════════════════════════════ */}
        {showInformes && (
          <TabsContent value="informes" className="mt-4">
            <InvestorReportsTab />
          </TabsContent>
        )}
      </Tabs>

      {data?.fetchedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Actualizado: {format(new Date(data.fetchedAt), "MMM d, yyyy h:mm a")}
        </p>
      )}
    </div>
  );
};

export default Analytics;
