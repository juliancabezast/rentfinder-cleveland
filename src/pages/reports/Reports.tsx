import React, { useState } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import {
  BarChart3,
  Download,
  Users,
  Calendar,
  TrendingUp,
  Target,
  AlertCircle,
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
  LineChart,
  Line,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/StatCard";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useReportsData, exportReportToCSV } from "@/hooks/useReportsData";
import { LeadFunnelCard } from "@/components/reports/LeadFunnelCard";
import { cn } from "@/lib/utils";

// Chart colors from CSS variables (HSL to actual colors)
const CHART_COLORS = [
  "hsl(280, 73%, 17%)", // Primary purple
  "hsl(40, 100%, 59%)", // Accent gold
  "hsl(142, 71%, 45%)", // Success green
  "hsl(38, 92%, 50%)", // Warning amber
  "hsl(0, 84%, 60%)", // Destructive red
];

const SHOWING_COLORS = {
  completed: "hsl(142, 71%, 45%)",
  no_show: "hsl(0, 84%, 60%)",
  cancelled: "hsl(0, 0%, 60%)",
  scheduled: "hsl(38, 92%, 50%)",
};

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const { data, loading, error } = useReportsData(
    dateRange?.from && dateRange?.to
      ? { from: dateRange.from, to: dateRange.to }
      : undefined
  );

  const handleExport = () => {
    if (data) {
      exportReportToCSV(data);
    }
  };

  // Calculate trend percentage
  const leadsTrend = data
    ? data.totalLeadsPrevious > 0
      ? ((data.totalLeads - data.totalLeadsPrevious) / data.totalLeadsPrevious) * 100
      : data.totalLeads > 0
      ? 100
      : 0
    : 0;

  const completionRate = data && data.showingsScheduled > 0
    ? (data.showingsCompleted / data.showingsScheduled) * 100
    : 0;

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

      {/* Error State */}
      {error && (
        <Card variant="glass" className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value={data?.totalLeads ?? 0}
          icon={Users}
          trend={
            leadsTrend !== 0
              ? { value: Math.abs(Math.round(leadsTrend)), isPositive: leadsTrend > 0 }
              : undefined
          }
          subtitle="vs previous period"
          loading={loading}
        />
        <StatCard
          title="Showings Completed"
          value={data?.showingsCompleted ?? 0}
          icon={Calendar}
          subtitle={`${completionRate.toFixed(0)}% completion rate`}
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
      </div>

      {/* Lead Funnel - New RPC-powered component */}
      <LeadFunnelCard />

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Chart 2: Leads by Source */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : data?.leadsBySource.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.leadsBySource}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="source"
                    label={({ source, percent }) =>
                      `${source} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {data.leadsBySource.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Leads Over Time */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">New Leads Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : data?.leadsOverTime.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={data.leadsOverTime}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
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
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 4: Showings Performance */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Showings Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : data?.showingsPerformance.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={data.showingsPerformance}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="completed" stackId="a" fill={SHOWING_COLORS.completed} name="Completed" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="no_show" stackId="a" fill={SHOWING_COLORS.no_show} name="No Show" />
                  <Bar dataKey="cancelled" stackId="a" fill={SHOWING_COLORS.cancelled} name="Cancelled" />
                  <Bar dataKey="scheduled" stackId="a" fill={SHOWING_COLORS.scheduled} name="Scheduled" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 5: Lead Score Distribution */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Lead Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : data?.leadScoreDistribution.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={data.leadScoreDistribution}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(40, 100%, 59%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 6: Response Time (Placeholder) */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg">Avg Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex flex-col items-center justify-center text-center p-6">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <LineChart className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                Response time tracking will be available when call integration is active
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
