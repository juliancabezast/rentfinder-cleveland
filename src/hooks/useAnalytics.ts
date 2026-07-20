import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Filters ──────────────────────────────────────────────────────────

export interface AnalyticsFilters {
  from: Date; // calendar day (inclusive)
  to: Date; // calendar day (inclusive)
  source: string | null; // canonical: hemlane | campaign | manual | website
  propertyIds: string[] | null;
}

const NY_TZ = "America/New_York";

// Offset (tz-wall-clock minus UTC, in ms) of a timezone at a given instant,
// computed via formatToParts so it never depends on the browser's own timezone.
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p: Record<string, number> = {};
  parts.forEach((x) => { if (x.type !== "literal") p[x.type] = parseInt(x.value, 10); });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - utcMs;
}

// UTC instant of Cleveland midnight for a calendar day (DST-aware — never
// hardcode -05:00). Two passes so a guess that lands on the wrong side of a
// DST transition gets corrected; works in ANY browser timezone.
export function clevelandDayStartUtc(day: Date, addDays = 0): Date {
  const y = day.getFullYear();
  const m = day.getMonth();
  const d = day.getDate() + addDays;
  const wallMidnightAsUtc = Date.UTC(y, m, d, 0, 0, 0);
  let utc = wallMidnightAsUtc - tzOffsetMs(wallMidnightAsUtc + 5 * 3600000, NY_TZ);
  utc = wallMidnightAsUtc - tzOffsetMs(utc, NY_TZ);
  return new Date(utc);
}

export function bucketForRange(from: Date, to: Date): "day" | "week" | "month" {
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}

// ── RPC result types ─────────────────────────────────────────────────

export interface OverviewMilestones {
  m0: number; m10: number; m50: number; m80: number; m100: number;
}

export interface OverviewFunnel {
  total: number; ge10: number; ge50: number; ge80: number; eq100: number;
}

export interface OverviewShowings {
  scheduled: number; completed: number; no_show: number; cancelled: number;
  rescheduled: number; total: number; show_rate: number | null;
}

export interface OverviewFirstResponse {
  measured: number; median_mins: number | null; p90_mins: number | null;
  pct_within_1h: number | null;
}

export interface OverviewSource {
  source: string; leads: number; avg_score: number | null; with_showing: number;
}

export interface OverviewTopProperty {
  id: string; address: string; unit_number: string | null; bedrooms: number | null;
  rent_price: number | null; status: string; leads: number;
  avg_score: number | null; showings: number;
}

export interface OverviewPeakHour {
  hour: number; leads: number; inbound: number;
}

export interface OverviewPortfolio {
  total: number; active: number; available: number; coming_soon: number;
  in_leasing: number; rented: number; rent_active_total: number;
  rent_rented: number; rent_available: number; rent_coming_soon: number;
  rent_in_leasing: number; occupancy_pct: number | null;
}

export interface OverviewAgentTasksWeek {
  week: string; completed: number; pending: number; failed: number; cancelled: number;
}

export interface OverviewCosts {
  total: number;
  by_service: Record<string, number>;
  emails_sent: number;
  sms_sent: number;
}

export interface AnalyticsOverview {
  leads_in_range: number;
  prev_period_leads: number;
  milestones: OverviewMilestones;
  funnel: OverviewFunnel;
  avg_milestone: number | null;
  showings: OverviewShowings;
  first_response: OverviewFirstResponse;
  sources: OverviewSource[];
  top_properties: OverviewTopProperty[];
  peak_hours: OverviewPeakHour[];
  portfolio: OverviewPortfolio;
  agent_tasks: {
    by_status: Record<string, number>;
    weekly: OverviewAgentTasksWeek[];
  };
  costs: OverviewCosts;
  team_activity: { notes: number; leads_touched: number };
  inbound: { messages: number; outcomes: Record<string, number> };
  snapshot: {
    total_leads: number; hot: number; aplico_total: number;
    statuses: Record<string, number> | null;
  };
}

export interface TimeSeriesPoint {
  bucket: string;
  leads: number;
  showings_scheduled: number;
  showings_completed: number;
  showings_no_show: number;
  showings_cancelled: number;
}

export interface EmailSummary {
  total: number;
  attempted: number; // total minus still-queued — honest denominator for rates
  delivered: number; opened: number; clicked: number;
  bounced: number; pending: number; suppressed: number; failed: number;
}

export interface EmailSeriesPoint {
  bucket: string; total: number; delivered: number; opened: number; bounced: number;
}

export interface EmailCampaignRow {
  id: string; name: string; started_at: string | null;
  total: number; delivered: number; opened: number; clicked: number; bounced: number;
}

export interface EmailCampaignsData {
  summary: EmailSummary;
  series: EmailSeriesPoint[];
  campaigns: EmailCampaignRow[];
  inbound: { messages: number; outcomes: Record<string, number> };
}

export interface UnitCosts {
  resendPerEmail: number | null;
  twilioPerSms: number | null;
}

export interface AnalyticsData {
  overview: AnalyticsOverview;
  series: TimeSeriesPoint[];
  email: EmailCampaignsData;
  unitCosts: UnitCosts;
  bucket: "day" | "week" | "month";
  fetchedAt: string;
}

// ── Hook ─────────────────────────────────────────────────────────────

const settingNumber = (value: unknown): number | null => {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
};

export function useAnalytics(filters: AnalyticsFilters) {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;

  const fromUtc = clevelandDayStartUtc(filters.from);
  const toUtc = clevelandDayStartUtc(filters.to, 1); // exclusive upper bound
  const bucket = bucketForRange(filters.from, filters.to);

  return useQuery<AnalyticsData>({
    queryKey: [
      "analytics", orgId, fromUtc.toISOString(), toUtc.toISOString(),
      filters.source, filters.propertyIds?.join(",") ?? null,
    ],
    queryFn: async () => {
      if (!orgId) throw new Error("No org");

      const rpcParams = {
        p_from: fromUtc.toISOString(),
        p_to: toUtc.toISOString(),
        p_source: filters.source,
        p_property: filters.propertyIds && filters.propertyIds.length > 0 ? filters.propertyIds : null,
      };

      const [overviewRes, seriesRes, emailRes, settingsRes] = await Promise.all([
        supabase.rpc("analytics_overview", rpcParams),
        supabase.rpc("analytics_time_series", { ...rpcParams, p_bucket: bucket }),
        supabase.rpc("analytics_email_campaigns", {
          p_from: fromUtc.toISOString(),
          p_to: toUtc.toISOString(),
          p_bucket: bucket === "day" ? "day" : bucket,
        }),
        supabase
          .from("organization_settings")
          .select("key, value")
          .eq("organization_id", orgId)
          .in("key", ["resend_unit_cost", "twilio_sms_unit_cost"]),
      ]);

      if (overviewRes.error) throw overviewRes.error;
      if (seriesRes.error) throw seriesRes.error;
      if (emailRes.error) throw emailRes.error;

      const settings = (settingsRes.data || []) as { key: string; value: unknown }[];
      const unitCosts: UnitCosts = {
        resendPerEmail: settingNumber(settings.find((s) => s.key === "resend_unit_cost")?.value),
        twilioPerSms: settingNumber(settings.find((s) => s.key === "twilio_sms_unit_cost")?.value),
      };

      return {
        overview: overviewRes.data as AnalyticsOverview,
        series: (seriesRes.data || []) as TimeSeriesPoint[],
        email: emailRes.data as EmailCampaignsData,
        unitCosts,
        bucket,
        fetchedAt: new Date().toISOString(),
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// Property options for the filter bar (107 rows — the one allowed client fetch)
export interface PropertyOption {
  id: string; address: string; unit_number: string | null; status: string;
}

export function usePropertyOptions() {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;

  return useQuery<PropertyOption[]>({
    queryKey: ["analytics-property-options", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, unit_number, status")
        .eq("organization_id", orgId!)
        .order("address", { ascending: true });
      if (error) throw error;
      return (data || []) as PropertyOption[];
    },
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });
}

// ── CSV export ───────────────────────────────────────────────────────

export const MILESTONE_TIER_LABELS: Record<string, string> = {
  m0: "Normal (0)",
  m10: "Intentó (10)",
  m50: "Agendó (50)",
  m80: "Asistió (80)",
  m100: "Aplicó (100)",
};

export function exportAnalyticsToCSV(data: AnalyticsData, range: { from: Date; to: Date }) {
  const o = data.overview;
  const rows: string[][] = [
    ["Metric", "Value"],
    ["Period", `${format(range.from, "yyyy-MM-dd")} to ${format(range.to, "yyyy-MM-dd")}`],
    ["Leads (range)", o.leads_in_range.toString()],
    ["Leads (previous period)", o.prev_period_leads.toString()],
    ["Total leads (all-time)", o.snapshot.total_leads.toString()],
    ["Hot now (Agendó+)", o.snapshot.hot.toString()],
    ["Showings (range)", o.showings.total.toString()],
    ["Showings completed", o.showings.completed.toString()],
    ["Showings no-show", o.showings.no_show.toString()],
    ["Showings cancelled", o.showings.cancelled.toString()],
    ["Show rate", o.showings.show_rate != null ? `${o.showings.show_rate}%` : "N/A"],
    ["Avg milestone (scored leads)", o.avg_milestone != null ? o.avg_milestone.toString() : "N/A"],
    ["AI cost (range)", `$${Number(o.costs.total).toFixed(2)}`],
    [""],
    ["Milestone", "Leads"],
    ...(Object.entries(o.milestones) as [string, number][]).map(([k, v]) => [
      MILESTONE_TIER_LABELS[k] || k, v.toString(),
    ]),
    [""],
    ["Source", "Leads", "Avg Milestone", "With Showing"],
    ...o.sources.map((s) => [
      s.source, s.leads.toString(),
      s.avg_score != null ? s.avg_score.toString() : "N/A",
      s.with_showing.toString(),
    ]),
    [""],
    ["Property", "Leads", "Showings", "Avg Milestone", "Rent"],
    ...o.top_properties.map((p) => [
      p.unit_number ? `${p.address} · ${p.unit_number}` : p.address,
      p.leads.toString(), p.showings.toString(),
      p.avg_score != null ? p.avg_score.toString() : "N/A",
      p.rent_price ? `$${p.rent_price}` : "N/A",
    ]),
    [""],
    ["Email", "Count"],
    ["Sent", data.email.summary.total.toString()],
    ["Delivered", data.email.summary.delivered.toString()],
    ["Opened", data.email.summary.opened.toString()],
    ["Clicked", data.email.summary.clicked.toString()],
    ["Bounced", data.email.summary.bounced.toString()],
  ];

  const escapeCSV = (val: string) =>
    val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
  const csvContent = rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `analytics_${format(new Date(), "yyyy-MM-dd")}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
