import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, format, differenceInDays } from "date-fns";

interface DateRange {
  from: Date;
  to: Date;
}

interface ServiceCost {
  service: string;
  label: string;
  total: number;
}

interface SpendOverTimeData {
  date: string;
  twilio_sms: number;
  openai: number;
  persona: number;
  resend: number;
}

interface LeadCostData {
  id: string;
  full_name: string | null;
  phone: string;
  source: string;
  status: string;
  callCount: number;
  messageCount: number;
  totalCost: number;
  avgCostPerInteraction: number;
}

interface SourceCostData {
  source: string;
  leads: number;
  showings: number;
  converted: number;
  totalCost: number;
  costPerLead: number;
  costPerShowing: number;
  costPerConversion: number;
  isMostEfficient: boolean;
  isLeastEfficient: boolean;
}

interface CostOverviewData {
  totalSpend: number;
  costPerLead: number | null;
  costPerShowing: number | null;
  mostExpensiveService: string | null;
  serviceBreakdown: ServiceCost[];
  spendOverTime: SpendOverTimeData[];
}

interface CostData {
  overview: CostOverviewData;
  perLead: LeadCostData[];
  perSource: SourceCostData[];
}

const SERVICE_LABELS: Record<string, string> = {
  twilio_sms: "Twilio SMS",
  openai: "OpenAI",
  persona: "Persona",
  resend: "Resend",
};

export function useCostData(dateRange: DateRange | undefined) {
  const { userRecord } = useAuth();
  const [data, setData] = useState<CostData | null>(null);
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

        // Fetch communications with costs
        const { data: communications, error: commsError } = await supabase
          .from("communications")
          .select("id, lead_id, cost_twilio, sent_at, channel")
          .eq("organization_id", orgId)
          .gte("sent_at", startDate)
          .lte("sent_at", endDate);

        if (commsError) throw commsError;

        // Fetch cost_records if available
        const { data: costRecords, error: recordsError } = await supabase
          .from("cost_records")
          .select("*")
          .eq("organization_id", orgId)
          .gte("recorded_at", startDate)
          .lte("recorded_at", endDate);

        // Don't throw on cost_records error - it might be empty
        const records = recordsError ? [] : (costRecords || []);

        // Fetch leads in date range
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("id, full_name, phone, source, status, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", startDate)
          .lte("created_at", endDate);

        if (leadsError) throw leadsError;

        // Fetch showings in date range
        const { data: showings, error: showingsError } = await supabase
          .from("showings")
          .select("id, lead_id, status")
          .eq("organization_id", orgId)
          .gte("scheduled_at", startDate)
          .lte("scheduled_at", endDate);

        if (showingsError) throw showingsError;

        // Calculate totals from communications and cost_records
        const commCostTotal = communications?.reduce((sum, c) => sum + (c.cost_twilio || 0), 0) || 0;
        const twilioSmsTotal = communications?.filter(c => c.channel === "sms").reduce((sum, c) => sum + (c.cost_twilio || 0), 0) || 0;

        // Build service breakdown from cost_records + communications
        let serviceBreakdown: ServiceCost[] = [];
        const serviceTotals = new Map<string, number>();
        if (records.length > 0) {
          records.forEach(r => {
            const current = serviceTotals.get(r.service) || 0;
            serviceTotals.set(r.service, current + Number(r.total_cost));
          });
        }
        if (twilioSmsTotal > 0) {
          serviceTotals.set("twilio_sms", (serviceTotals.get("twilio_sms") || 0) + twilioSmsTotal);
        }
        serviceBreakdown = Array.from(serviceTotals.entries()).map(([service, total]) => ({
          service,
          label: SERVICE_LABELS[service] || service,
          total,
        })).filter(s => s.total > 0);

        // Find most expensive service
        const mostExpensiveService = serviceBreakdown.length > 0
          ? serviceBreakdown.reduce((max, s) => s.total > max.total ? s : max).label
          : null;

        // Calculate total spend from all sources
        const recordsTotal = records.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
        const totalSpend = recordsTotal + commCostTotal;

        // Calculate cost per lead
        const leadsCount = leads?.length || 0;
        const costPerLead = leadsCount > 0 ? totalSpend / leadsCount : null;

        // Calculate cost per showing
        const completedShowings = showings?.filter(s => s.status === "completed").length || 0;
        const costPerShowing = completedShowings > 0 ? totalSpend / completedShowings : null;

        // Calculate spend over time
        const daysDiff = differenceInDays(dateRange.to, dateRange.from);
        const groupByWeek = daysDiff > 31;
        
        const timeGroups = new Map<string, SpendOverTimeData>();

        communications?.filter(c => c.sent_at).forEach(comm => {
          const date = new Date(comm.sent_at!);
          const key = groupByWeek
            ? format(startOfWeek(date), "MMM dd")
            : format(date, "MMM dd");

          const current = timeGroups.get(key) || {
            date: key,
            twilio_sms: 0,
            openai: 0,
            persona: 0,
            resend: 0,
          };

          if (comm.channel === "sms") {
            current.twilio_sms += comm.cost_twilio || 0;
          }

          timeGroups.set(key, current);
        });

        const spendOverTime = Array.from(timeGroups.values())
          .sort((a, b) => a.date.localeCompare(b.date));

        // Calculate per-lead costs
        const leadCostsMap = new Map<string, { messages: number; cost: number }>();

        communications?.forEach(comm => {
          if (comm.lead_id) {
            const current = leadCostsMap.get(comm.lead_id) || { messages: 0, cost: 0 };
            current.messages++;
            current.cost += comm.cost_twilio || 0;
            leadCostsMap.set(comm.lead_id, current);
          }
        });

        const perLead: LeadCostData[] = (leads || []).map(lead => {
          const costs = leadCostsMap.get(lead.id) || { messages: 0, cost: 0 };
          return {
            id: lead.id,
            full_name: lead.full_name,
            phone: lead.phone,
            source: lead.source,
            status: lead.status,
            callCount: 0,
            messageCount: costs.messages,
            totalCost: costs.cost,
            avgCostPerInteraction: costs.messages > 0 ? costs.cost / costs.messages : 0,
          };
        }).sort((a, b) => b.totalCost - a.totalCost);

        // Calculate per-source costs
        const sourceStats = new Map<string, { leads: number; showings: number; converted: number; cost: number }>();
        
        leads?.forEach(lead => {
          const current = sourceStats.get(lead.source) || { leads: 0, showings: 0, converted: 0, cost: 0 };
          current.leads++;
          if (lead.status === "converted") current.converted++;
          
          const leadCost = leadCostsMap.get(lead.id);
          if (leadCost) {
            current.cost += leadCost.cost;
          }
          
          sourceStats.set(lead.source, current);
        });

        showings?.forEach(showing => {
          const lead = leads?.find(l => l.id === showing.lead_id);
          if (lead && showing.status === "completed") {
            const current = sourceStats.get(lead.source) || { leads: 0, showings: 0, converted: 0, cost: 0 };
            current.showings++;
            sourceStats.set(lead.source, current);
          }
        });

        const perSourceRaw = Array.from(sourceStats.entries()).map(([source, stats]) => ({
          source,
          leads: stats.leads,
          showings: stats.showings,
          converted: stats.converted,
          totalCost: stats.cost,
          costPerLead: stats.leads > 0 ? stats.cost / stats.leads : 0,
          costPerShowing: stats.showings > 0 ? stats.cost / stats.showings : 0,
          costPerConversion: stats.converted > 0 ? stats.cost / stats.converted : 0,
        }));

        // Find most and least efficient (by cost per conversion)
        const withConversions = perSourceRaw.filter(s => s.converted > 0);
        const mostEfficient = withConversions.length > 0
          ? withConversions.reduce((min, s) => s.costPerConversion < min.costPerConversion ? s : min).source
          : null;
        const leastEfficient = withConversions.length > 0
          ? withConversions.reduce((max, s) => s.costPerConversion > max.costPerConversion ? s : max).source
          : null;

        const perSource: SourceCostData[] = perSourceRaw.map(s => ({
          ...s,
          isMostEfficient: s.source === mostEfficient,
          isLeastEfficient: s.source === leastEfficient,
        }));

        setData({
          overview: {
            totalSpend,
            costPerLead,
            costPerShowing,
            mostExpensiveService,
            serviceBreakdown,
            spendOverTime,
          },
          perLead,
          perSource,
        });
      } catch (err) {
        console.error("Error fetching cost data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch cost data");
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
