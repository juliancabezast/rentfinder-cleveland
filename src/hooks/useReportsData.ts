import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays, differenceInHours, format, startOfWeek, subMonths } from "date-fns";

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

interface PeakHourData {
  hour: number;
  label: string;
  leads: number;
  calls: number;
  total: number;
}

interface TopPropertyData {
  id: string;
  address: string;
  rent_price: number | null;
  bedrooms: number | null;
  status: string;
  leads: number;
  showings: number;
  converted: number;
  avgScore: number;
}

interface SourcePerformanceData {
  source: string;
  leads: number;
  converted: number;
  conversionRate: number;
  avgScore: number;
  showings: number;
}

interface ReportsData {
  // Summary stats
  totalLeads: number;
  totalLeadsPrevious: number;
  activePipeline: number;
  showingsCompleted: number;
  showingsScheduled: number;
  noShowRate: number;
  conversionRate: number;
  avgLeadScore: number;
  avgResponseHours: number | null;

  // Chart data
  leadFunnel: LeadFunnelData[];
  leadsBySource: LeadsBySourceData[];
  leadsOverTime: LeadsOverTimeData[];
  showingsPerformance: ShowingsPerformanceData[];
  leadScoreDistribution: LeadScoreDistribution[];
  peakHours: PeakHourData[];
  topProperties: TopPropertyData[];
  sourcePerformance: SourcePerformanceData[];

  // Metadata
  fetchedAt: string;
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

const ACTIVE_STATUSES = ["contacted", "engaged", "nurturing", "qualified", "showing_scheduled", "showed", "in_application"];

export function useReportsData(dateRange: DateRange | undefined) {
  const { userRecord } = useAuth();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userRecord?.organization_id || !dateRange?.from || !dateRange?.to) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const orgId = userRecord.organization_id;
      const startDate = dateRange.from.toISOString();
      const endDate = dateRange.to.toISOString();

      // Previous period for comparison
      const prevStart = subMonths(dateRange.from, 1).toISOString();
      const prevEnd = subMonths(dateRange.to, 1).toISOString();

      // Paginate through Supabase results (PostgREST caps at 1000 rows per request)
      const fetchPaginated = async (
        buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>
      ) => {
        const PAGE = 1000;
        let all: any[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await buildQuery(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < PAGE) break;
          offset += PAGE;
        }
        return all;
      };

      // Base lead filters (exclude incomplete / junk data — matches LeadsList.tsx)
      const applyLeadFilters = (query: any) =>
        query
          .not("full_name", "is", null)
          .not("phone", "is", null)
          .not("email", "is", null)
          .not("full_name", "ilike", "%.com%")
          .not("full_name", "ilike", "%http%")
          .not("full_name", "ilike", "%@%")
          .not("full_name", "ilike", "%comments%")
          .not("full_name", "ilike", "%unsubscribe%")
          .not("full_name", "ilike", "%click here%")
          .not("full_name", "ilike", "%mailto:%")
          .not("full_name", "ilike", "%subject:%")
          .not("full_name", "ilike", "%reply%");

      // Parallel fetch all data
      const [
        leads,
        prevLeadsRes,
        showingsRes,
        callsRes,
        propertiesRes,
      ] = await Promise.all([
        // Current period leads (paginated — Supabase caps at 1000 per request)
        fetchPaginated((from, to) =>
          applyLeadFilters(
            supabase
              .from("leads")
              .select("id, status, source, lead_score, created_at, interested_property_id")
              .eq("organization_id", orgId)
              .gte("created_at", startDate)
              .lte("created_at", endDate)
          )
            .order("created_at")
            .range(from, to)
        ),
        // Previous period leads (count only)
        applyLeadFilters(
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("created_at", prevStart)
            .lte("created_at", prevEnd)
        ),
        // Showings
        supabase
          .from("showings")
          .select("id, status, scheduled_at, lead_id, property_id")
          .eq("organization_id", orgId)
          .gte("scheduled_at", startDate)
          .lte("scheduled_at", endDate)
          .limit(1000),
        // Calls (for peak hours + response time)
        supabase
          .from("calls")
          .select("id, lead_id, started_at")
          .eq("organization_id", orgId)
          .gte("started_at", startDate)
          .lte("started_at", endDate)
          .limit(1000),
        // Properties (for top properties)
        supabase
          .from("properties")
          .select("id, address, rent_price, bedrooms, status")
          .eq("organization_id", orgId)
          .limit(1000),
      ]);

      if (prevLeadsRes.error) throw prevLeadsRes.error;
      if (showingsRes.error) throw showingsRes.error;
      if (callsRes.error) throw callsRes.error;
      if (propertiesRes.error) throw propertiesRes.error;

      const totalLeadsPrevious = prevLeadsRes.count || 0;
      const showings = showingsRes.data || [];
      const calls = callsRes.data || [];
      const properties = propertiesRes.data || [];

      // === SUMMARY STATS ===
      const totalLeads = leads.length;
      const activePipeline = leads.filter(l => ACTIVE_STATUSES.includes(l.status)).length;
      const convertedLeads = leads.filter(l => l.status === "converted").length;
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
      const scoredLeads = leads.filter(l => l.lead_score != null && l.lead_score > 0);
      const avgLeadScore = scoredLeads.length > 0
        ? scoredLeads.reduce((s, l) => s + (l.lead_score || 0), 0) / scoredLeads.length
        : 0;

      const showingsCompleted = showings.filter(s => s.status === "completed").length;
      const showingsScheduled = showings.length;
      const noShows = showings.filter(s => s.status === "no_show").length;
      const noShowRate = showingsScheduled > 0 ? (noShows / showingsScheduled) * 100 : 0;

      // === AVG RESPONSE TIME ===
      // For each lead, find the first call to that lead
      let avgResponseHours: number | null = null;
      if (calls.length > 0 && leads.length > 0) {
        const firstCallByLead = new Map<string, string>();
        // calls are ordered by started_at ascending — take first per lead
        const sortedCalls = [...calls].sort((a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        );
        sortedCalls.forEach(c => {
          if (c.lead_id && !firstCallByLead.has(c.lead_id)) {
            firstCallByLead.set(c.lead_id, c.started_at);
          }
        });

        const responseTimes: number[] = [];
        leads.forEach(lead => {
          const firstCall = firstCallByLead.get(lead.id);
          if (firstCall) {
            const hours = differenceInHours(new Date(firstCall), new Date(lead.created_at));
            if (hours >= 0 && hours < 720) { // ignore > 30 days
              responseTimes.push(hours);
            }
          }
        });

        if (responseTimes.length > 0) {
          avgResponseHours = Math.round(
            responseTimes.reduce((s, h) => s + h, 0) / responseTimes.length
          );
        }
      }

      // === LEAD FUNNEL ===
      const statusCounts = new Map<string, number>();
      leads.forEach(l => statusCounts.set(l.status, (statusCounts.get(l.status) || 0) + 1));
      const leadFunnel: LeadFunnelData[] = LEAD_STATUS_ORDER.map(s => ({
        status: s.value,
        label: s.label,
        count: statusCounts.get(s.value) || 0,
      }));

      // === LEADS BY SOURCE ===
      const sourceCounts = new Map<string, number>();
      leads.forEach(l => {
        const src = l.source || "unknown";
        sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
      });
      const leadsBySource: LeadsBySourceData[] = Array.from(sourceCounts.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // === LEADS OVER TIME ===
      const daysDiff = differenceInDays(dateRange.to, dateRange.from);
      const groupByWeek = daysDiff > 31;
      const timeGroups = new Map<string, { label: string; sortKey: string; count: number }>();
      leads.forEach(l => {
        const d = new Date(l.created_at);
        const groupDate = groupByWeek ? startOfWeek(d) : d;
        const sortKey = format(groupDate, "yyyy-MM-dd");
        const label = format(groupDate, "MMM dd");
        const existing = timeGroups.get(sortKey);
        if (existing) {
          existing.count++;
        } else {
          timeGroups.set(sortKey, { label, sortKey, count: 1 });
        }
      });
      const leadsOverTime: LeadsOverTimeData[] = Array.from(timeGroups.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(({ label, count }) => ({ date: label, count }));

      // === SHOWINGS PERFORMANCE ===
      const showingWeeks = new Map<string, { sortKey: string; label: string; completed: number; no_show: number; cancelled: number; scheduled: number }>();
      showings.forEach(s => {
        const weekDate = startOfWeek(new Date(s.scheduled_at));
        const sortKey = format(weekDate, "yyyy-MM-dd");
        const label = format(weekDate, "MMM dd");
        const cur = showingWeeks.get(sortKey) || { sortKey, label, completed: 0, no_show: 0, cancelled: 0, scheduled: 0 };
        if (s.status === "completed") cur.completed++;
        else if (s.status === "no_show") cur.no_show++;
        else if (s.status === "cancelled") cur.cancelled++;
        else cur.scheduled++;
        showingWeeks.set(sortKey, cur);
      });
      const showingsPerformance: ShowingsPerformanceData[] = Array.from(showingWeeks.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(({ label, completed, no_show, cancelled, scheduled }) => ({
          week: label, completed, no_show, cancelled, scheduled,
        }));

      // === LEAD SCORE DISTRIBUTION ===
      const scoreBuckets = [
        { min: 0, max: 20, label: "0-20" },
        { min: 21, max: 40, label: "21-40" },
        { min: 41, max: 60, label: "41-60" },
        { min: 61, max: 80, label: "61-80" },
        { min: 81, max: 100, label: "81-100" },
      ];
      const leadScoreDistribution: LeadScoreDistribution[] = scoreBuckets.map(b => ({
        bucket: b.label,
        count: leads.filter(l => (l.lead_score || 0) >= b.min && (l.lead_score || 0) <= b.max).length,
      }));

      // === PEAK ACTIVITY HOURS ===
      const hourBuckets: number[] = new Array(24).fill(0);
      const callHourBuckets: number[] = new Array(24).fill(0);

      leads.forEach(l => {
        const h = new Date(l.created_at).getHours();
        hourBuckets[h]++;
      });
      calls.forEach(c => {
        const h = new Date(c.started_at).getHours();
        callHourBuckets[h]++;
      });

      const peakHours: PeakHourData[] = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`,
        leads: hourBuckets[i],
        calls: callHourBuckets[i],
        total: hourBuckets[i] + callHourBuckets[i],
      }));

      // === TOP PROPERTIES ===
      const propLeadCounts = new Map<string, { leads: number; scores: number[]; converted: number }>();
      leads.forEach(l => {
        if (!l.interested_property_id) return;
        const cur = propLeadCounts.get(l.interested_property_id) || { leads: 0, scores: [], converted: 0 };
        cur.leads++;
        cur.scores.push(l.lead_score || 0);
        if (l.status === "converted") cur.converted++;
        propLeadCounts.set(l.interested_property_id, cur);
      });

      const propShowingCounts = new Map<string, number>();
      showings.forEach(s => {
        if (s.property_id) {
          propShowingCounts.set(s.property_id, (propShowingCounts.get(s.property_id) || 0) + 1);
        }
      });

      const topProperties: TopPropertyData[] = properties
        .map(p => {
          const stats = propLeadCounts.get(p.id) || { leads: 0, scores: [], converted: 0 };
          return {
            id: p.id,
            address: p.address,
            rent_price: p.rent_price,
            bedrooms: p.bedrooms,
            status: p.status,
            leads: stats.leads,
            showings: propShowingCounts.get(p.id) || 0,
            converted: stats.converted,
            avgScore: stats.scores.length > 0
              ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
              : 0,
          };
        })
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 10);

      // === SOURCE PERFORMANCE ===
      const sourceMap = new Map<string, { leads: number; converted: number; scores: number[]; showings: number }>();
      leads.forEach(l => {
        const src = l.source || "unknown";
        const cur = sourceMap.get(src) || { leads: 0, converted: 0, scores: [], showings: 0 };
        cur.leads++;
        cur.scores.push(l.lead_score || 0);
        if (l.status === "converted") cur.converted++;
        sourceMap.set(src, cur);
      });
      // Add showings counts per source (using Map for O(1) lookups)
      const leadSourceMap = new Map<string, string>();
      leads.forEach(l => leadSourceMap.set(l.id, l.source || "unknown"));
      showings.forEach(s => {
        if (!s.lead_id) return;
        const src = leadSourceMap.get(s.lead_id);
        if (src) {
          const cur = sourceMap.get(src);
          if (cur) cur.showings++;
        }
      });

      const sourcePerformance: SourcePerformanceData[] = Array.from(sourceMap.entries())
        .map(([source, stats]) => ({
          source,
          leads: stats.leads,
          converted: stats.converted,
          conversionRate: stats.leads > 0 ? Math.round((stats.converted / stats.leads) * 100) : 0,
          avgScore: stats.scores.length > 0
            ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
            : 0,
          showings: stats.showings,
        }))
        .sort((a, b) => b.leads - a.leads);

      setData({
        totalLeads,
        totalLeadsPrevious,
        activePipeline,
        showingsCompleted,
        showingsScheduled,
        noShowRate,
        conversionRate,
        avgLeadScore,
        avgResponseHours,
        leadFunnel,
        leadsBySource,
        leadsOverTime,
        showingsPerformance,
        leadScoreDistribution,
        peakHours,
        topProperties,
        sourcePerformance,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Error fetching reports data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch reports data");
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}

export function exportReportToCSV(data: ReportsData) {
  const rows: string[][] = [
    ["Metric", "Value"],
    ["Total Leads", data.totalLeads.toString()],
    ["Active Pipeline", data.activePipeline.toString()],
    ["Showings Completed", data.showingsCompleted.toString()],
    ["No-Show Rate", `${data.noShowRate.toFixed(1)}%`],
    ["Conversion Rate", `${data.conversionRate.toFixed(1)}%`],
    ["Avg Lead Score", data.avgLeadScore.toFixed(1)],
    ["Avg Response Time", data.avgResponseHours != null ? `${data.avgResponseHours}h` : "N/A"],
    [""],
    ["Source", "Leads", "Converted", "Conv%", "Avg Score", "Showings"],
    ...data.sourcePerformance.map(s => [
      s.source, s.leads.toString(), s.converted.toString(),
      `${s.conversionRate}%`, s.avgScore.toString(), s.showings.toString(),
    ]),
    [""],
    ["Property", "Leads", "Showings", "Converted", "Avg Score", "Rent"],
    ...data.topProperties.map(p => [
      p.address, p.leads.toString(), p.showings.toString(),
      p.converted.toString(), p.avgScore.toString(), p.rent_price ? `$${p.rent_price}` : "N/A",
    ]),
    [""],
    ["Lead Status", "Count"],
    ...data.leadFunnel.map(f => [f.label, f.count.toString()]),
  ];

  const escapeCSV = (val: string) => val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
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
