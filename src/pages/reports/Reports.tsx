import React, { useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  BarChart3,
  Download,
  Users,
  Calendar,
  TrendingUp,
  Target,
  AlertCircle,
  Activity,
  Clock,
  RefreshCw,
  Building2,
  Zap,
} from "lucide-react";
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
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportsData, exportReportToCSV } from "@/hooks/useReportsData";
import { LeadFunnelCard } from "@/components/reports/LeadFunnelCard";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "hsl(280, 73%, 17%)",
  "hsl(40, 100%, 59%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(200, 70%, 50%)",
  "hsl(320, 60%, 50%)",
];

const SHOWING_COLORS = {
  completed: "hsl(142, 71%, 45%)",
  no_show: "hsl(0, 84%, 60%)",
  cancelled: "hsl(0, 0%, 60%)",
  scheduled: "hsl(38, 92%, 50%)",
};

const SOURCE_LABELS: Record<string, string> = {
  inbound_call: "Inbound Call",
  hemlane_email: "Hemlane Email",
  hemlane: "Hemlane",
  website: "Website",
  referral: "Referral",
  manual: "Manual",
  sms: "SMS",
  campaign: "Campaign",
  csv_import: "CSV Import",
  unknown: "Unknown",
};

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  coming_soon: "Coming Soon",
  in_leasing_process: "In Leasing",
  rented: "Rented",
};

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const { data, loading, error, refresh } = useReportsData(
    dateRange?.from && dateRange?.to
      ? { from: dateRange.from, to: dateRange.to }
      : undefined
  );

  const handleExport = () => {
    if (data) exportReportToCSV(data);
  };

  const leadsTrend = data
    ? data.totalLeadsPrevious > 0
      ? ((data.totalLeads - data.totalLeadsPrevious) / data.totalLeadsPrevious) * 100
      : data.totalLeads > 0 ? 100 : 0
    : 0;

  const completionRate = data && data.showingsScheduled > 0
    ? (data.showingsCompleted / data.showingsScheduled) * 100
    : 0;

  // Find peak hour
  const peakHour = data?.peakHours.reduce((max, h) => h.total > max.total ? h : max, { total: 0, label: "" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Reports
          </h1>
          <p className="text-muted-foreground">
            Analytics and performance metrics
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          <Button
            onClick={handleExport}
            disabled={!data || loading}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
          >
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Export Report</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Last Updated Banner */}
      <div className="flex items-center justify-between rounded-lg bg-muted/40 border px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {data?.fetchedAt ? (
            <span>Last updated: {format(new Date(data.fetchedAt), "MMM d, yyyy 'at' h:mm a")}</span>
          ) : (
            <span>Loading...</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="h-7 gap-1.5 text-xs"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card variant="glass" className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats — 6 cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Leads"
          value={data?.totalLeads ?? 0}
          icon={Users}
          trend={leadsTrend !== 0
            ? { value: Math.abs(Math.round(leadsTrend)), isPositive: leadsTrend > 0 }
            : undefined}
          subtitle="vs previous period"
          loading={loading}
        />
        <StatCard
          title="Active Pipeline"
          value={data?.activePipeline ?? 0}
          icon={Activity}
          subtitle="in progress"
          loading={loading}
        />
        <StatCard
          title="Showings"
          value={data?.showingsCompleted ?? 0}
          icon={Calendar}
          subtitle={`${completionRate.toFixed(0)}% completion · ${(data?.noShowRate ?? 0).toFixed(0)}% no-show`}
          loading={loading}
        />
        <StatCard
          title="Conversion Rate"
          value={`${(data?.conversionRate ?? 0).toFixed(1)}%`}
          icon={TrendingUp}
          subtitle="leads to converted"
          loading={loading}
        />
        <StatCard
          title="Avg Lead Score"
          value={(data?.avgLeadScore ?? 0).toFixed(0)}
          icon={Target}
          subtitle="out of 100"
          loading={loading}
        />
        <StatCard
          title="Avg Response"
          value={data?.avgResponseHours != null ? `${data.avgResponseHours}h` : "N/A"}
          icon={Zap}
          subtitle="first contact time"
          loading={loading}
        />
      </div>

      {/* Lead Funnel */}
      <LeadFunnelCard />

      {/* Top Properties */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            Top Properties
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : data?.topProperties.length ? (
            <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Showings</TableHead>
                    <TableHead className="text-center">Converted</TableHead>
                    <TableHead className="text-center">Avg Score</TableHead>
                    <TableHead className="text-right">Rent</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topProperties.map((p, idx) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0",
                            idx === 0 ? "bg-amber-100 text-amber-700" :
                            idx === 1 ? "bg-gray-100 text-gray-600" :
                            idx === 2 ? "bg-orange-100 text-orange-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{p.address}</p>
                            {p.bedrooms && (
                              <p className="text-xs text-muted-foreground">{p.bedrooms} BR</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{p.leads}</TableCell>
                      <TableCell className="text-center">{p.showings}</TableCell>
                      <TableCell className="text-center">
                        {p.converted > 0 ? (
                          <span className="text-green-600 font-semibold">{p.converted}</span>
                        ) : "0"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-bold",
                          p.avgScore >= 60 ? "bg-green-100 text-green-700" :
                          p.avgScore >= 40 ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {p.avgScore}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.rent_price ? `$${p.rent_price.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.status === "available" ? "default" : "secondary"} className="text-[10px]">
                          {STATUS_LABELS[p.status] || p.status}
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
              <p className="text-sm">No property data for this period</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Grid — 2 columns */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Peak Activity Hours */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Peak Activity Hours</span>
              {peakHour && peakHour.total > 0 && (
                <Badge variant="outline" className="text-xs font-normal">
                  Busiest: {peakHour.label}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data?.peakHours.some(h => h.total > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data.peakHours.filter(h => h.hour >= 6 && h.hour <= 22)}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="leads" stackId="a" fill="hsl(280, 73%, 17%)" name="New Leads" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="calls" stackId="a" fill="hsl(40, 100%, 59%)" name="Calls" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                No activity data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads Over Time */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">New Leads Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data?.leadsOverTime.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.leadsOverTime} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(280, 73%, 17%)"
                    fill="hsl(280, 73%, 17%)"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Source Performance Table */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Source Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6"><Skeleton className="h-[200px] w-full" /></div>
            ) : data?.sourcePerformance.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Conv.</TableHead>
                    <TableHead className="text-center">Conv%</TableHead>
                    <TableHead className="text-center">Avg Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sourcePerformance.map(s => (
                    <TableRow key={s.source}>
                      <TableCell className="font-medium text-sm">
                        {SOURCE_LABELS[s.source] || s.source}
                      </TableCell>
                      <TableCell className="text-center font-semibold">{s.leads}</TableCell>
                      <TableCell className="text-center">
                        {s.converted > 0 ? (
                          <span className="text-green-600 font-semibold">{s.converted}</span>
                        ) : "0"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-xs font-bold",
                          s.conversionRate > 0 ? "text-green-600" : "text-muted-foreground"
                        )}>
                          {s.conversionRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">{s.avgScore}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-center text-muted-foreground text-sm">No source data</div>
            )}
          </CardContent>
        </Card>

        {/* Leads by Source Pie */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data?.leadsBySource.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.leadsBySource.map(s => ({ ...s, name: SOURCE_LABELS[s.source] || s.source }))}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="name"
                  >
                    {data.leadsBySource.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={40}
                    formatter={(value: string) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Showings Performance */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Showings Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data?.showingsPerformance.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.showingsPerformance} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="completed" stackId="a" fill={SHOWING_COLORS.completed} name="Completed" />
                  <Bar dataKey="no_show" stackId="a" fill={SHOWING_COLORS.no_show} name="No Show" />
                  <Bar dataKey="cancelled" stackId="a" fill={SHOWING_COLORS.cancelled} name="Cancelled" />
                  <Bar dataKey="scheduled" stackId="a" fill={SHOWING_COLORS.scheduled} name="Scheduled" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead Score Distribution */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Lead Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data?.leadScoreDistribution.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.leadScoreDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="hsl(40, 100%, 59%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
