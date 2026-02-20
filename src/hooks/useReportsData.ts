import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, subMonths, differenceInDays, format, startOfWeek, endOfWeek } from "date-fns";

interface DateRange {
  from: Date;
  to: Date;
}

interface LeadFunnelData {
  status: string;
  count: number;
  label: string;
}

interface LeadsBySourceData {
  source: string;
  count: number;
}

interface LeadsOverTimeData {
  date: string;
  count: number;
}

interface ShowingsPerformanceData {
  week: string;
  completed: number;
  no_show: number;
  cancelled: number;
  scheduled: number;
}

interface LeadScoreDistribution {
  bucket: string;
  count: number;
}

interface ReportsData {
  // Summary stats
  totalLeads: number;
  totalLeadsPrevious: number;
  showingsCompleted: number;
  showingsScheduled: number;
  conversionRate: number;
  avgLeadScore: number;
  
  // Chart data
  leadFunnel: LeadFunnelData[];
  leadsBySource: LeadsBySourceData[];
  leadsOverTime: LeadsOverTimeData[];
  showingsPerformance: ShowingsPerformanceData[];
  leadScoreDistribution: LeadScoreDistribution[];
}

const LEAD_STATUS_ORDER = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "nurturing", label: "Nurturing" },
  { value: "qualified", label: "Qualified" },
  { value: "showing_scheduled", label: "Showing Scheduled" },
  { value: "showed", label: "Showed" },
  { value: "in_application", label: "In Application" },
  { value: "converted", label: "Converted" },
];

export function useReportsData(dateRange: DateRange | undefined) {
  const { userRecord } = useAuth();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userRecord?.organization_id || !dateRange?.from || !dateRange?.to) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const orgId = userRecord.organization_id;
        const startDate = dateRange.from.toISOString();
        const endDate = dateRange.to.toISOString();
        
        // Calculate previous period for comparison
        const periodDays = differenceInDays(dateRange.to, dateRange.from);
        const prevStart = subMonths(dateRange.from, 1).toISOString();
        const prevEnd = subMonths(dateRange.to, 1).toISOString();

        // Fetch all leads in date range
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("id, status, source, lead_score, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", startDate)
          .lte("created_at", endDate);

        if (leadsError) throw leadsError;

        // Fetch previous period leads for comparison
        const { data: prevLeads, error: prevLeadsError } = await supabase
          .from("leads")
          .select("id")
          .eq("organization_id", orgId)
          .gte("created_at", prevStart)
          .lte("created_at", prevEnd);

        if (prevLeadsError) throw prevLeadsError;

        // Fetch showings in date range
        const { data: showings, error: showingsError } = await supabase
          .from("showings")
          .select("id, status, scheduled_at")
          .eq("organization_id", orgId)
          .gte("scheduled_at", startDate)
          .lte("scheduled_at", endDate);

        if (showingsError) throw showingsError;

        // Process summary stats
        const totalLeads = leads?.length || 0;
        const totalLeadsPrevious = prevLeads?.length || 0;
        const convertedLeads = leads?.filter(l => l.status === "converted").length || 0;
        const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
        const avgLeadScore = totalLeads > 0 
          ? (leads?.reduce((sum, l) => sum + (l.lead_score || 0), 0) || 0) / totalLeads 
          : 0;
        
        const showingsCompleted = showings?.filter(s => s.status === "completed").length || 0;
        const showingsScheduled = showings?.length || 0;

        // Process lead funnel
        const statusCounts = new Map<string, number>();
        leads?.forEach(lead => {
          const count = statusCounts.get(lead.status) || 0;
          statusCounts.set(lead.status, count + 1);
        });
        
        const leadFunnel: LeadFunnelData[] = LEAD_STATUS_ORDER.map(s => ({
          status: s.value,
          label: s.label,
          count: statusCounts.get(s.value) || 0,
        }));

        // Process leads by source
        const sourceCounts = new Map<string, number>();
        leads?.forEach(lead => {
          const source = lead.source || "unknown";
          const count = sourceCounts.get(source) || 0;
          sourceCounts.set(source, count + 1);
        });
        
        const leadsBySource: LeadsBySourceData[] = Array.from(sourceCounts.entries())
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count);

        // Process leads over time
        const daysDiff = differenceInDays(dateRange.to, dateRange.from);
        const groupByWeek = daysDiff > 31;
        
        const timeGroups = new Map<string, number>();
        leads?.forEach(lead => {
          const date = new Date(lead.created_at);
          const key = groupByWeek 
            ? format(startOfWeek(date), "MMM dd")
            : format(date, "MMM dd");
          const count = timeGroups.get(key) || 0;
          timeGroups.set(key, count + 1);
        });
        
        const leadsOverTime: LeadsOverTimeData[] = Array.from(timeGroups.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Process showings performance by week
        const showingWeeks = new Map<string, { completed: number; no_show: number; cancelled: number; scheduled: number }>();
        showings?.forEach(showing => {
          const date = new Date(showing.scheduled_at);
          const weekKey = format(startOfWeek(date), "MMM dd");
          const current = showingWeeks.get(weekKey) || { completed: 0, no_show: 0, cancelled: 0, scheduled: 0 };
          
          if (showing.status === "completed") current.completed++;
          else if (showing.status === "no_show") current.no_show++;
          else if (showing.status === "cancelled") current.cancelled++;
          else current.scheduled++;
          
          showingWeeks.set(weekKey, current);
        });
        
        const showingsPerformance: ShowingsPerformanceData[] = Array.from(showingWeeks.entries())
          .map(([week, stats]) => ({ week, ...stats }))
          .sort((a, b) => a.week.localeCompare(b.week));

        // Process lead score distribution
        const scoreBuckets = [
          { min: 0, max: 20, label: "0-20" },
          { min: 21, max: 40, label: "21-40" },
          { min: 41, max: 60, label: "41-60" },
          { min: 61, max: 80, label: "61-80" },
          { min: 81, max: 100, label: "81-100" },
        ];
        
        const leadScoreDistribution: LeadScoreDistribution[] = scoreBuckets.map(bucket => ({
          bucket: bucket.label,
          count: leads?.filter(l => {
            const score = l.lead_score || 0;
            return score >= bucket.min && score <= bucket.max;
          }).length || 0,
        }));

        setData({
          totalLeads,
          totalLeadsPrevious,
          showingsCompleted,
          showingsScheduled,
          conversionRate,
          avgLeadScore,
          leadFunnel,
          leadsBySource,
          leadsOverTime,
          showingsPerformance,
          leadScoreDistribution,
        });
      } catch (err) {
        console.error("Error fetching reports data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch reports data");
      } finally {
        setLoading(false);
      }
    };

    let cancelled = false;
    fetchData().finally(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [userRecord?.organization_id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  return { data, loading, error };
}

export function exportReportToCSV(data: ReportsData) {
  const rows: string[][] = [
    ["Metric", "Value"],
    ["Total Leads", data.totalLeads.toString()],
    ["Showings Completed", data.showingsCompleted.toString()],
    ["Conversion Rate", `${data.conversionRate.toFixed(1)}%`],
    ["Avg Lead Score", data.avgLeadScore.toFixed(1)],
    [""],
    ["Leads by Source", "Count"],
    ...data.leadsBySource.map(s => [s.source, s.count.toString()]),
    [""],
    ["Lead Status", "Count"],
    ...data.leadFunnel.map(f => [f.label, f.count.toString()]),
  ];

  const csvContent = rows.map(row => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `reports_${format(new Date(), "yyyy-MM-dd")}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
