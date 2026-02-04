import React, { useState, useEffect } from "react";
import { subDays, format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Filter, TrendingDown, ArrowRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
}

interface FunnelData {
  stages: FunnelStage[];
  lost: number;
  total: number;
  overall_conversion: number;
  period: { from: string; to: string };
}

// Gradient from primary purple (#370d4b) to accent gold (#ffb22c)
const FUNNEL_COLORS = [
  "hsl(280, 73%, 17%)",  // New - deep purple
  "hsl(280, 65%, 25%)",  // Contacted
  "hsl(280, 55%, 33%)",  // Engaged
  "hsl(280, 45%, 40%)",  // Qualified
  "hsl(300, 40%, 45%)",  // Showing Scheduled
  "hsl(320, 50%, 50%)",  // Showed
  "hsl(35, 80%, 50%)",   // In Application
  "hsl(40, 100%, 59%)",  // Converted - gold
];

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  engaged: "Engaged",
  qualified: "Qualified",
  showing_scheduled: "Showing Scheduled",
  showed: "Showed",
  in_application: "In Application",
  converted: "Converted",
};

export const LeadFunnelCard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [loading, setLoading] = useState(true);
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);

  useEffect(() => {
    const fetchFunnel = async () => {
      if (!dateRange?.from || !dateRange?.to) return;

      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_lead_funnel", {
          _date_from: dateRange.from.toISOString(),
          _date_to: dateRange.to.toISOString(),
        });

        if (error) throw error;
        setFunnelData(data as unknown as FunnelData);
      } catch (err) {
        console.error("Error fetching funnel data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFunnel();
  }, [dateRange]);

  // Calculate drop-off between stages
  const getDropOff = (currentIndex: number): number | null => {
    if (!funnelData?.stages || currentIndex === 0) return null;
    const current = funnelData.stages[currentIndex];
    const previous = funnelData.stages[currentIndex - 1];
    if (previous.count === 0) return null;
    return Math.round(((previous.count - current.count) / previous.count) * 100);
  };

  // Prepare chart data
  const chartData = funnelData?.stages.map((stage, index) => ({
    name: STAGE_LABELS[stage.stage] || stage.stage,
    count: stage.count,
    rate: stage.rate,
    dropOff: getDropOff(index),
    fill: FUNNEL_COLORS[index] || FUNNEL_COLORS[FUNNEL_COLORS.length - 1],
  })) || [];

  return (
    <Card variant="glass" className="col-span-full">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Filter className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Lead Funnel</CardTitle>
            <p className="text-sm text-muted-foreground">
              Conversion journey from new lead to tenant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {funnelData && (
            <Badge variant="secondary" className="bg-accent/20 text-accent-foreground">
              {funnelData.overall_conversion}% Overall Conversion
            </Badge>
          )}
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-[350px] w-full" />
          </div>
        ) : !funnelData || funnelData.total === 0 ? (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            No lead data for this period
          </div>
        ) : (
          <div className="space-y-6">
            {/* Horizontal Funnel Visualization */}
            <ResponsiveContainer width="100%" height={120}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 120, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    `${value} leads (${props.payload.rate}%)`,
                    props.payload.name,
                  ]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Stage Cards with Drop-off */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {chartData.map((stage, index) => (
                <div key={stage.name} className="relative">
                  <div
                    className="rounded-lg p-3 text-center transition-all hover:scale-105"
                    style={{ backgroundColor: `${stage.fill}20` }}
                  >
                    <div
                      className="text-2xl font-bold"
                      style={{ color: stage.fill }}
                    >
                      {stage.count}
                    </div>
                    <div className="text-xs font-medium text-foreground truncate">
                      {stage.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {stage.rate}%
                    </div>
                  </div>
                  {/* Drop-off indicator */}
                  {stage.dropOff !== null && stage.dropOff > 0 && (
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full hidden lg:flex items-center gap-1">
                      <div className="flex items-center gap-0.5 text-[10px] text-destructive/70">
                        <TrendingDown className="h-3 w-3" />
                        {stage.dropOff}%
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary Stats */}
            <div className="flex flex-wrap items-center gap-4 pt-4 border-t text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Total Leads:</span>
                <span className="font-semibold">{funnelData.total}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Lost:</span>
                <span className="font-semibold text-destructive">{funnelData.lost}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Converted:</span>
                <span className="font-semibold text-accent">
                  {chartData.find((s) => s.name === "Converted")?.count || 0}
                </span>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {format(new Date(funnelData.period.from), "MMM d")} -{" "}
                {format(new Date(funnelData.period.to), "MMM d, yyyy")}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
