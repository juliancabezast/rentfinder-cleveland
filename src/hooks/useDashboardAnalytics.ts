import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, subWeeks, format } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────

interface PropertyRow {
  id: string;
  address: string;
  rent_price: number | null;
  status: string;
  bedrooms: number | null;
}

interface LeadRow {
  id: string;
  status: string;
  source: string;
  lead_score: number | null;
  budget_max: number | null;
  interested_property_id: string | null;
  created_at: string;
}

interface ShowingRow {
  id: string;
  lead_id: string | null;
  property_id: string | null;
  status: string;
}

interface AgentTaskRow {
  agent_type: string;
  status: string;
}

interface CostRecordRow {
  service: string;
  total_cost: number;
}

interface CallCostRow {
  cost_twilio: number | null;
  cost_bland: number | null;
  cost_openai: number | null;
}

interface PropertyPerformanceRow {
  property_id: string;
  address: string;
  rent_price: number | null;
  status: string;
  days_on_market: number | null;
  total_leads: number;
  active_leads: number;
  avg_lead_score: number | null;
  showings_scheduled: number;
  showings_completed: number;
  lead_to_showing_rate: number | null;
}

// ── Computed data types ──────────────────────────────────────────────

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  color: string;
}

export interface VelocityWeek {
  week: string;
  count: number;
}

export interface PropertyPerf {
  address: string;
  rentPrice: number;
  totalLeads: number;
  showingsScheduled: number;
  showingsCompleted: number;
  avgLeadScore: number | null;
  daysOnMarket: number | null;
}

export interface ScoreBucket {
  tier: string;
  count: number;
  color: string;
}

export interface SourceData {
  source: string;
  label: string;
  count: number;
  showingCount: number;
  showingRate: number;
}

export interface AgentTaskPerf {
  agent: string;
  label: string;
  completed: number;
  pending: number;
  cancelled: number;
  failed: number;
}

export interface CostSlice {
  service: string;
  label: string;
  amount: number;
  color: string;
}

export interface DashboardAnalytics {
  // Hero KPIs
  portfolioValue: number;
  vacancyLoss: number;
  vacantUnits: number;
  totalUnits: number;
  occupancyRate: number;
  pipelineValue: number;
  activeLeads: number;
  leadsThisWeek: number;
  leadsLastWeek: number;
  leadTrend: number;
  aiSpend: number;

  // Charts
  funnelStages: FunnelStage[];
  funnelTotal: number;
  funnelLost: number;
  leadVelocity: VelocityWeek[];
  propertyPerformance: PropertyPerf[];
  scoreDistribution: ScoreBucket[];
  leadsBySource: SourceData[];
  agentTasks: AgentTaskPerf[];
  costBreakdown: CostSlice[];

  // Insights
  newStatusPercent: number;
  showingRate: number;
}

// ── Constants ────────────────────────────────────────────────────────

const FUNNEL_ORDER = [
  "new", "contacted", "engaged", "nurturing", "qualified",
  "showing_scheduled", "showed", "in_application", "converted",
];

const FUNNEL_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  engaged: "Engaged",
  nurturing: "Nurturing",
  qualified: "Qualified",
  showing_scheduled: "Showing Scheduled",
  showed: "Showed",
  in_application: "In Application",
  converted: "Converted",
};

const FUNNEL_COLORS = [
  "hsl(280, 73%, 17%)",
  "hsl(280, 65%, 25%)",
  "hsl(280, 55%, 33%)",
  "hsl(280, 45%, 40%)",
  "hsl(300, 40%, 45%)",
  "hsl(320, 50%, 50%)",
  "hsl(35, 80%, 50%)",
  "hsl(40, 95%, 55%)",
  "hsl(40, 100%, 59%)",
];

const SCORE_BUCKETS: { tier: string; min: number; max: number; color: string }[] = [
  { tier: "Hot (80-100)", min: 80, max: 100, color: "hsl(0, 84%, 60%)" },
  { tier: "Warm (60-79)", min: 60, max: 79, color: "hsl(40, 100%, 59%)" },
  { tier: "Medium (40-59)", min: 40, max: 59, color: "hsl(38, 92%, 50%)" },
  { tier: "Cool (20-39)", min: 20, max: 39, color: "hsl(200, 70%, 50%)" },
  { tier: "Cold (0-19)", min: 0, max: 19, color: "hsl(0, 0%, 60%)" },
];

const SOURCE_LABELS: Record<string, string> = {
  hemlane: "Hemlane",
  website: "Website",
  inbound_call: "Inbound Call",
  referral: "Referral",
  sms: "SMS",
  campaign: "Campaign",
  csv_import: "CSV Import",
  manual: "Manual",
  user: "Manual",
};

// Sources that should be merged into a single key
const SOURCE_MERGE: Record<string, string> = {
  hemlane_email: "hemlane",
};

const AGENT_LABELS: Record<string, string> = {
  welcome_sequence: "Elijah",
  notification_dispatcher: "Nehemiah",
  elijah: "Elijah",
  nehemiah: "Nehemiah",
  aaron: "Aaron",
  esther: "Esther",
  ruth: "Ruth",
  samuel: "Samuel",
  zacchaeus: "Zacchaeus",
  sms_inbound: "Ruth",
  showing_confirmation: "Samuel",
  conversion_predictor: "Solomon",
  lead_scoring: "Daniel",
};

const COST_COLORS: Record<string, string> = {
  openai: "hsl(142, 71%, 45%)",
  twilio_voice: "hsl(280, 73%, 17%)",
  twilio_sms: "hsl(280, 73%, 40%)",
  bland_ai: "hsl(40, 100%, 59%)",
  persona: "hsl(38, 92%, 50%)",
  resend: "hsl(0, 84%, 60%)",
};

const COST_LABELS: Record<string, string> = {
  openai: "OpenAI",
  twilio_voice: "Twilio Voice",
  twilio_sms: "Twilio SMS",
  bland_ai: "Bland AI",
  persona: "Persona",
  resend: "Resend",
};

// ── Hook ─────────────────────────────────────────────────────────────

export function useDashboardAnalytics() {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;

  return useQuery<DashboardAnalytics>({
    queryKey: ["dashboard-analytics", orgId],
    queryFn: async () => {
      if (!orgId) throw new Error("No org");

      const [
        { data: properties },
        { data: leads },
        { data: showings },
        { data: agentTasks },
        { data: costRecords },
        { data: calls },
        { data: propPerf },
      ] = await Promise.all([
        supabase
          .from("properties")
          .select("id, address, rent_price, status, bedrooms")
          .eq("organization_id", orgId)
          .limit(1000),
        supabase
          .from("leads")
          .select("id, status, source, lead_score, budget_max, interested_property_id, created_at")
          .eq("organization_id", orgId)
          .limit(5000),
        supabase
          .from("showings")
          .select("id, lead_id, property_id, status")
          .eq("organization_id", orgId)
          .limit(2000),
        supabase
          .from("agent_tasks")
          .select("agent_type, status")
          .eq("organization_id", orgId)
          .limit(5000),
        supabase
          .from("cost_records")
          .select("service, total_cost")
          .eq("organization_id", orgId)
          .limit(5000),
        supabase
          .from("calls")
          .select("cost_twilio, cost_bland, cost_openai")
          .eq("organization_id", orgId)
          .limit(5000),
        supabase
          .from("property_performance")
          .select("property_id, address, rent_price, status, days_on_market, total_leads, active_leads, avg_lead_score, showings_scheduled, showings_completed, lead_to_showing_rate")
          .eq("organization_id", orgId)
          .limit(500),
      ]);

      const props = (properties || []) as PropertyRow[];
      const lds = (leads || []) as LeadRow[];
      const shs = (showings || []) as ShowingRow[];
      const tasks = (agentTasks || []) as AgentTaskRow[];
      const costs = (costRecords || []) as CostRecordRow[];
      const cls = (calls || []) as CallCostRow[];
      const pp = (propPerf || []) as PropertyPerformanceRow[];

      // ── Hero KPIs ──────────────────────────────────────────────
      const totalUnits = props.length;
      const rentedStatuses = ["rented", "occupied"];
      const occupiedUnits = props.filter((p) => rentedStatuses.includes(p.status)).length;
      const vacantUnits = totalUnits - occupiedUnits;
      const portfolioValue = props.reduce((s, p) => s + (p.rent_price || 0), 0);
      const vacancyLoss = props
        .filter((p) => !rentedStatuses.includes(p.status))
        .reduce((s, p) => s + (p.rent_price || 0), 0);
      const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

      const activeLeads = lds.filter((l) => l.status !== "lost").length;
      const pipelineValue = lds
        .filter((l) => l.status !== "lost" && l.status !== "converted")
        .reduce((s, l) => s + (l.budget_max || 0), 0);

      const now = new Date();
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = subWeeks(thisWeekStart, 1);
      const leadsThisWeek = lds.filter(
        (l) => new Date(l.created_at) >= thisWeekStart
      ).length;
      const leadsLastWeek = lds.filter((l) => {
        const d = new Date(l.created_at);
        return d >= lastWeekStart && d < thisWeekStart;
      }).length;
      const leadTrend =
        leadsLastWeek > 0
          ? Math.round(((leadsThisWeek - leadsLastWeek) / leadsLastWeek) * 100)
          : leadsThisWeek > 0
            ? 100
            : 0;

      // AI Spend from cost_records + calls
      const costRecordTotal = costs.reduce((s, c) => s + Number(c.total_cost || 0), 0);
      const callCostTotal = cls.reduce(
        (s, c) => s + (c.cost_twilio || 0) + (c.cost_bland || 0) + (c.cost_openai || 0),
        0
      );
      const aiSpend = costRecordTotal + callCostTotal;

      // ── Funnel ─────────────────────────────────────────────────
      const statusCounts: Record<string, number> = {};
      let lostCount = 0;
      lds.forEach((l) => {
        if (l.status === "lost") {
          lostCount++;
        } else {
          statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
        }
      });

      const funnelStages: FunnelStage[] = FUNNEL_ORDER.map((stage, idx) => ({
        stage,
        label: FUNNEL_LABELS[stage] || stage,
        count: statusCounts[stage] || 0,
        color: FUNNEL_COLORS[idx] || FUNNEL_COLORS[FUNNEL_COLORS.length - 1],
      }));

      // ── Lead Velocity (8 weeks) ───────────────────────────────
      const velocityMap = new Map<string, number>();
      for (let i = 7; i >= 0; i--) {
        const wStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
        const key = format(wStart, "MMM d");
        velocityMap.set(key, 0);
      }
      lds.forEach((l) => {
        const wStart = startOfWeek(new Date(l.created_at), { weekStartsOn: 1 });
        const key = format(wStart, "MMM d");
        if (velocityMap.has(key)) {
          velocityMap.set(key, (velocityMap.get(key) || 0) + 1);
        }
      });
      const leadVelocity: VelocityWeek[] = Array.from(velocityMap.entries()).map(
        ([week, count]) => ({ week, count })
      );

      // ── Property Performance (top 10) ─────────────────────────
      const propertyPerformance: PropertyPerf[] = pp
        .filter((p) => p.total_leads > 0)
        .sort((a, b) => b.total_leads - a.total_leads)
        .slice(0, 10)
        .map((p) => ({
          address: p.address
            ? p.address.length > 30
              ? p.address.slice(0, 28) + "..."
              : p.address
            : "Unknown",
          rentPrice: Number(p.rent_price) || 0,
          totalLeads: Number(p.total_leads),
          showingsScheduled: Number(p.showings_scheduled),
          showingsCompleted: Number(p.showings_completed),
          avgLeadScore: p.avg_lead_score ? Number(p.avg_lead_score) : null,
          daysOnMarket: p.days_on_market,
        }));

      // ── Score Distribution ─────────────────────────────────────
      const scoreCounts = new Map<string, number>();
      SCORE_BUCKETS.forEach((b) => scoreCounts.set(b.tier, 0));
      lds.forEach((l) => {
        if (l.lead_score != null) {
          const bucket = SCORE_BUCKETS.find(
            (b) => l.lead_score! >= b.min && l.lead_score! <= b.max
          );
          if (bucket) {
            scoreCounts.set(bucket.tier, (scoreCounts.get(bucket.tier) || 0) + 1);
          }
        }
      });
      const scoreDistribution: ScoreBucket[] = SCORE_BUCKETS.map((b) => ({
        tier: b.tier,
        count: scoreCounts.get(b.tier) || 0,
        color: b.color,
      })).filter((b) => b.count > 0);

      // ── Leads by Source ────────────────────────────────────────
      const srcMap = new Map<string, { count: number; showingLeadIds: Set<string> }>();
      const resolveSource = (src: string) => SOURCE_MERGE[src] || src;
      lds.forEach((l) => {
        const src = resolveSource(l.source || "unknown");
        if (!srcMap.has(src)) srcMap.set(src, { count: 0, showingLeadIds: new Set() });
        srcMap.get(src)!.count++;
      });
      // Count leads that reached showing stage per source
      const showingLeadIds = new Set(shs.map((s) => s.lead_id).filter(Boolean));
      lds.forEach((l) => {
        if (showingLeadIds.has(l.id) || ["showing_scheduled", "showed", "in_application", "converted"].includes(l.status)) {
          const src = resolveSource(l.source || "unknown");
          srcMap.get(src)?.showingLeadIds.add(l.id);
        }
      });
      const leadsBySource: SourceData[] = Array.from(srcMap.entries())
        .map(([source, data]) => ({
          source,
          label: SOURCE_LABELS[source] || source.replace(/_/g, " "),
          count: data.count,
          showingCount: data.showingLeadIds.size,
          showingRate: data.count > 0 ? Math.round((data.showingLeadIds.size / data.count) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // ── Agent Task Performance ─────────────────────────────────
      const agentMap = new Map<string, { completed: number; pending: number; cancelled: number; failed: number }>();
      tasks.forEach((t) => {
        const key = AGENT_LABELS[t.agent_type] || t.agent_type;
        if (!agentMap.has(key)) agentMap.set(key, { completed: 0, pending: 0, cancelled: 0, failed: 0 });
        const entry = agentMap.get(key)!;
        if (t.status === "completed") entry.completed++;
        else if (t.status === "pending" || t.status === "in_progress") entry.pending++;
        else if (t.status === "cancelled") entry.cancelled++;
        else if (t.status === "failed") entry.failed++;
      });
      const agentTasksData: AgentTaskPerf[] = Array.from(agentMap.entries())
        .map(([agent, data]) => ({
          agent,
          label: agent.charAt(0).toUpperCase() + agent.slice(1),
          ...data,
        }))
        .sort((a, b) => (b.completed + b.pending + b.cancelled) - (a.completed + a.pending + a.cancelled));

      // ── Cost Breakdown ─────────────────────────────────────────
      const costMap = new Map<string, number>();
      costs.forEach((c) => {
        const svc = c.service || "other";
        costMap.set(svc, (costMap.get(svc) || 0) + Number(c.total_cost || 0));
      });
      // Add call costs
      let twilioVoice = 0, blandAi = 0, openai = 0;
      cls.forEach((c) => {
        twilioVoice += c.cost_twilio || 0;
        blandAi += c.cost_bland || 0;
        openai += c.cost_openai || 0;
      });
      if (twilioVoice > 0) costMap.set("twilio_voice", (costMap.get("twilio_voice") || 0) + twilioVoice);
      if (blandAi > 0) costMap.set("bland_ai", (costMap.get("bland_ai") || 0) + blandAi);
      if (openai > 0) costMap.set("openai", (costMap.get("openai") || 0) + openai);

      const defaultColors = ["hsl(200, 60%, 50%)", "hsl(160, 60%, 45%)", "hsl(30, 80%, 55%)"];
      let colorIdx = 0;
      const costBreakdown: CostSlice[] = Array.from(costMap.entries())
        .filter(([, amt]) => amt > 0)
        .map(([service, amount]) => ({
          service,
          label: COST_LABELS[service] || service.replace(/_/g, " "),
          amount: Math.round(amount * 100) / 100,
          color: COST_COLORS[service] || defaultColors[colorIdx++ % defaultColors.length],
        }))
        .sort((a, b) => b.amount - a.amount);

      // ── Insight metrics ────────────────────────────────────────
      const totalLeads = lds.length;
      const newCount = statusCounts["new"] || 0;
      const newStatusPercent = totalLeads > 0 ? Math.round((newCount / totalLeads) * 100) : 0;
      const leadsWithShowing = lds.filter(
        (l) => showingLeadIds.has(l.id) || ["showing_scheduled", "showed", "in_application", "converted"].includes(l.status)
      ).length;
      const showingRate = totalLeads > 0 ? Math.round((leadsWithShowing / totalLeads) * 100 * 10) / 10 : 0;

      return {
        portfolioValue,
        vacancyLoss,
        vacantUnits,
        totalUnits,
        occupancyRate,
        pipelineValue,
        activeLeads,
        leadsThisWeek,
        leadsLastWeek,
        leadTrend,
        aiSpend,
        funnelStages,
        funnelTotal: totalLeads,
        funnelLost: lostCount,
        leadVelocity,
        propertyPerformance,
        scoreDistribution,
        leadsBySource,
        agentTasks: agentTasksData,
        costBreakdown,
        newStatusPercent,
        showingRate,
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
