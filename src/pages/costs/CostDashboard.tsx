import React, { useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LabelList,
} from "recharts";
import {
  Building2,
  Users,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Target,
  Bot,
  Zap,
  BarChart3,
  RefreshCw,
  Home,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";
import type { FunnelStage } from "@/hooks/useDashboardAnalytics";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatCurrencyDecimal = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);

// ── Component ────────────────────────────────────────────────────────

const CostDashboard: React.FC = () => {
  const { data, isLoading, refetch, isRefetching } = useDashboardAnalytics();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytics Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Portfolio intelligence & pipeline health
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefetching}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── Section 1: Hero KPIs ────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div className="animate-fade-up stagger-1">
          <StatCard
            title="Portfolio Value"
            value={data ? `${formatCurrency(data.portfolioValue)}/mo` : "$0"}
            icon={Building2}
            subtitle={data ? `${data.totalUnits} units` : "loading"}
            loading={isLoading}
          />
        </div>
        <div className="animate-fade-up stagger-2">
          <StatCard
            title="Vacancy Loss"
            value={data ? `${formatCurrency(data.vacancyLoss)}/mo` : "$0"}
            icon={TrendingDown}
            subtitle={data ? `${data.vacantUnits} vacant (${data.occupancyRate}% occupied)` : "loading"}
            impact="low"
            loading={isLoading}
          />
        </div>
        <div className="animate-fade-up stagger-3">
          <StatCard
            title="Pipeline Value"
            value={data ? formatCurrency(data.pipelineValue) : "$0"}
            icon={Target}
            subtitle="active lead budgets"
            loading={isLoading}
          />
        </div>
        <div className="animate-fade-up stagger-4">
          <StatCard
            title="Active Leads"
            value={data?.activeLeads ?? 0}
            icon={Users}
            subtitle={data ? `${data.leadsThisWeek} this week` : "loading"}
            trend={
              data && data.leadTrend !== 0
                ? { value: Math.abs(data.leadTrend), isPositive: data.leadTrend > 0 }
                : undefined
            }
            loading={isLoading}
          />
        </div>
        <div className="animate-fade-up stagger-5">
          <StatCard
            title="AI Spend"
            value={data ? formatCurrencyDecimal(data.aiSpend) : "$0.00"}
            icon={Bot}
            subtitle="all-time total"
            loading={isLoading}
          />
        </div>
      </div>

      {/* ── Section 2: Funnel + Velocity ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Conversion Funnel
              </CardTitle>
              {data && (
                <Badge variant="secondary" className="text-xs">
                  {data.funnelTotal} total &middot; {data.funnelLost} lost
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : data ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.funnelStages}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 5, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, _name: string, props: { payload: FunnelStage }) => [
                        `${value} leads`,
                        props.payload.label,
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                      {data.funnelStages.map((entry, index) => (
                        <Cell key={`funnel-${index}`} fill={entry.color} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Stage cards */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {data.funnelStages.filter((s) => s.count > 0).map((stage) => (
                    <div
                      key={stage.stage}
                      className="rounded-lg p-2 text-center transition-all hover:scale-105"
                      style={{ backgroundColor: `${stage.color}15` }}
                    >
                      <div className="text-lg font-bold" style={{ color: stage.color }}>
                        {stage.count}
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground truncate">
                        {stage.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Lead Velocity */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Lead Velocity
              </CardTitle>
              {data && data.leadTrend !== 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    data.leadTrend > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                  )}
                >
                  {data.leadTrend > 0 ? "+" : ""}
                  {data.leadTrend}% vs last week
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">New leads per week (last 8 weeks)</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : data ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={data.leadVelocity}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(280, 73%, 17%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(280, 73%, 17%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} leads`, "New Leads"]} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(280, 73%, 17%)"
                    strokeWidth={2.5}
                    fill="url(#velocityGradient)"
                    dot={{ r: 4, fill: "hsl(280, 73%, 17%)", stroke: "white", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "hsl(40, 100%, 59%)", stroke: "hsl(280, 73%, 17%)", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3: Property Performance ─────────────────── */}
      <Card variant="glass">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Top Properties by Lead Interest
            </CardTitle>
            {data && data.propertyPerformance.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                Top {data.propertyPerformance.length} of {data.totalUnits}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : data && data.propertyPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(250, data.propertyPerformance.length * 38)}>
              <BarChart
                data={data.propertyPerformance}
                layout="vertical"
                margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="address"
                  tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={180}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs space-y-1">
                        <p className="font-semibold text-sm">{d.address}</p>
                        <p>Rent: <span className="font-medium">{formatCurrency(d.rentPrice)}/mo</span></p>
                        <p>Leads: <span className="font-medium">{d.totalLeads}</span></p>
                        <p>Showings: <span className="font-medium">{d.showingsScheduled} scheduled, {d.showingsCompleted} completed</span></p>
                        {d.avgLeadScore != null && (
                          <p>Avg Score: <span className="font-medium">{Math.round(d.avgLeadScore)}</span></p>
                        )}
                        {d.daysOnMarket != null && (
                          <p>Days on Market: <span className="font-medium">{d.daysOnMarket}</span></p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="totalLeads" radius={[0, 6, 6, 0]} barSize={20}>
                  {data.propertyPerformance.map((_, index) => (
                    <Cell
                      key={`prop-${index}`}
                      fill={`hsl(280, ${55 + index * 2}%, ${20 + index * 3}%)`}
                    />
                  ))}
                  <LabelList
                    dataKey="totalLeads"
                    position="right"
                    style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                    formatter={(v: number) => `${v} leads`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No property lead data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Scores + Sources ─────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead Score Distribution */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Lead Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : data && data.scoreDistribution.length > 0 ? (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.scoreDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="tier"
                      stroke="none"
                    >
                      {data.scoreDistribution.map((entry, index) => (
                        <Cell key={`score-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, name: string) => [`${v} leads`, name]}
                    />
                    {/* Center label */}
                    <text
                      x="50%"
                      y="47%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground"
                      style={{ fontSize: "22px", fontWeight: 700 }}
                    >
                      {data.activeLeads}
                    </text>
                    <text
                      x="50%"
                      y="57%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-muted-foreground"
                      style={{ fontSize: "11px" }}
                    >
                      total leads
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-3">
                  {data.scoreDistribution.map((bucket) => (
                    <div key={bucket.tier} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: bucket.color }}
                      />
                      <span className="text-muted-foreground">{bucket.tier}:</span>
                      <span className="font-semibold">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No scored leads yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads by Source */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Leads by Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : data && data.leadsBySource.length > 0 ? (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.leadsBySource}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, _name: string, props: { payload: { label: string; showingRate: number } }) => [
                        `${v} leads (${props.payload.showingRate}% showing rate)`,
                        props.payload.label,
                      ]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                      {data.leadsBySource.map((_, index) => (
                        <Cell
                          key={`src-${index}`}
                          fill={index === 0 ? "hsl(280, 73%, 17%)" : `hsl(280, ${65 - index * 10}%, ${25 + index * 8}%)`}
                        />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="top"
                        style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Source showing rates */}
                <div className="flex flex-wrap gap-3">
                  {data.leadsBySource.map((src) => (
                    <div key={src.source} className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">{src.label}:</span>
                      <span className={cn("font-semibold", src.showingRate > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                        {src.showingRate}% to showing
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No lead source data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 5: AI Operations ────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agent Task Performance */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Agent Task Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : data && data.agentTasks.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, data.agentTasks.length * 36)}>
                <BarChart
                  data={data.agentTasks}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  <Bar dataKey="completed" stackId="a" fill="hsl(142, 71%, 45%)" name="Completed" radius={[0, 0, 0, 0]} barSize={16} />
                  <Bar dataKey="pending" stackId="a" fill="hsl(40, 100%, 59%)" name="Pending" radius={[0, 0, 0, 0]} barSize={16} />
                  <Bar dataKey="failed" stackId="a" fill="hsl(0, 84%, 60%)" name="Failed" radius={[0, 0, 0, 0]} barSize={16} />
                  <Bar dataKey="cancelled" stackId="a" fill="hsl(0, 0%, 75%)" name="Cancelled" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No agent task data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Breakdown */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Cost Breakdown
              </CardTitle>
              {data && (
                <Badge variant="secondary" className="text-xs font-semibold">
                  {formatCurrencyDecimal(data.aiSpend)} total
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : data && data.costBreakdown.length > 0 ? (
              <div className="space-y-3">
                {data.aiSpend < 1 && (
                  <div className="text-center py-1">
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Minimal AI costs &mdash; system is cost-efficient
                    </Badge>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.costBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="amount"
                      nameKey="label"
                      stroke="none"
                    >
                      {data.costBreakdown.map((entry, index) => (
                        <Cell key={`cost-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => [formatCurrencyDecimal(v), "Cost"]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      wrapperStyle={{ fontSize: "11px" }}
                      formatter={(value: string, entry: { payload?: { amount?: number } }) => (
                        <span>
                          {value}: {formatCurrencyDecimal(entry.payload?.amount ?? 0)}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-center p-6">
                <div className="p-3 rounded-full bg-muted/50 mb-3">
                  <DollarSign className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No cost data recorded yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Costs will appear as AI agents process calls and messages
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 6: Insight Cards ────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Vacancy Alert */}
        <Card variant="glass" className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Vacancy Alert</p>
                <p className="text-xs text-muted-foreground">Revenue opportunity</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-1">
              {data ? formatCurrency(data.vacancyLoss) : "$0"}/mo
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {data ? `${data.vacantUnits} vacant units losing potential revenue` : "Loading..."}
            </p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Occupancy</span>
                <span className="font-medium">{data?.occupancyRate ?? 0}%</span>
              </div>
              <Progress value={data?.occupancyRate ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Bottleneck */}
        <Card variant="glass" className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Pipeline Health</p>
                <p className="text-xs text-muted-foreground">Lead progression</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-primary mb-1">
              {data?.newStatusPercent ?? 0}%
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              of leads still at &quot;new&quot; status — nurture to convert
            </p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">New leads %</span>
                <span className="font-medium">{data?.newStatusPercent ?? 0}%</span>
              </div>
              <Progress value={data?.newStatusPercent ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Showing Conversion */}
        <Card variant="glass" className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Showing Conversion</p>
                <p className="text-xs text-muted-foreground">Lead to showing</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
              {data?.showingRate ?? 0}%
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              of leads reach the showing stage
            </p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Showing rate</span>
                <span className="font-medium">{data?.showingRate ?? 0}%</span>
              </div>
              <Progress value={data?.showingRate ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CostDashboard;
