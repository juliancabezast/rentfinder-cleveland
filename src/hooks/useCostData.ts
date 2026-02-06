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
  twilio_voice: number;
  twilio_sms: number;
  bland_ai: number;
  openai: number;
  persona: number;
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
  twilio_voice: "Twilio Voice",
  twilio_sms: "Twilio SMS",
  bland_ai: "Bland AI",
  openai: "OpenAI",
  persona: "Persona",
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

        // Fetch calls with costs
        const { data: calls, error: callsError } = await supabase
          .from("calls")
          .select("id, lead_id, cost_twilio, cost_bland, cost_openai, cost_total, started_at")
          .eq("organization_id", orgId)
          .gte("started_at", startDate)
          .lte("started_at", endDate);

        if (callsError) throw callsError;

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

        // Calculate totals from calls
        const callCostTotal = calls?.reduce((sum, c) => sum + (c.cost_total || 0), 0) || 0;
        const commCostTotal = communications?.reduce((sum, c) => sum + (c.cost_twilio || 0), 0) || 0;
        const totalSpend = callCostTotal + commCostTotal;

        // Calculate service breakdown from calls
        const twilioVoiceTotal = calls?.reduce((sum, c) => sum + (c.cost_twilio || 0), 0) || 0;
        const blandTotal = calls?.reduce((sum, c) => sum + (c.cost_bland || 0), 0) || 0;
        const openaiTotal = calls?.reduce((sum, c) => sum + (c.cost_openai || 0), 0) || 0;
        const twilioSmsTotal = communications?.filter(c => c.channel === "sms").reduce((sum, c) => sum + (c.cost_twilio || 0), 0) || 0;

        // If cost_records exist, use those for more granular breakdown
        let serviceBreakdown: ServiceCost[] = [];
        if (records.length > 0) {
          const serviceTotals = new Map<string, number>();
          records.forEach(r => {
            const current = serviceTotals.get(r.service) || 0;
            serviceTotals.set(r.service, current + Number(r.total_cost));
          });
          serviceBreakdown = Array.from(serviceTotals.entries()).map(([service, total]) => ({
            service,
            label: SERVICE_LABELS[service] || service,
            total,
          }));
        } else {
          // Fallback to calls data
          serviceBreakdown = [
            { service: "twilio_voice", label: "Twilio Voice", total: twilioVoiceTotal },
            { service: "twilio_sms", label: "Twilio SMS", total: twilioSmsTotal },
            { service: "bland_ai", label: "Bland AI", total: blandTotal },
            { service: "openai", label: "OpenAI", total: openaiTotal },
          ].filter(s => s.total > 0);
        }

        // Find most expensive service
        const mostExpensiveService = serviceBreakdown.length > 0
          ? serviceBreakdown.reduce((max, s) => s.total > max.total ? s : max).label
          : null;

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
        
        calls?.forEach(call => {
          const date = new Date(call.started_at);
          const key = groupByWeek 
            ? format(startOfWeek(date), "MMM dd")
            : format(date, "MMM dd");
          
          const current = timeGroups.get(key) || {
            date: key,
            twilio_voice: 0,
            twilio_sms: 0,
            bland_ai: 0,
            openai: 0,
            persona: 0,
          };
          
          current.twilio_voice += call.cost_twilio || 0;
          current.bland_ai += call.cost_bland || 0;
          current.openai += call.cost_openai || 0;
          
          timeGroups.set(key, current);
        });

        communications?.forEach(comm => {
          const date = new Date(comm.sent_at!);
          const key = groupByWeek 
            ? format(startOfWeek(date), "MMM dd")
            : format(date, "MMM dd");
          
          const current = timeGroups.get(key) || {
            date: key,
            twilio_voice: 0,
            twilio_sms: 0,
            bland_ai: 0,
            openai: 0,
            persona: 0,
          };
          
          if (comm.channel === "sms") {
            current.twilio_sms += comm.cost_twilio || 0;
          }
          
          timeGroups.set(key, current);
        });

        const spendOverTime = Array.from(timeGroups.values())
          .sort((a, b) => a.date.localeCompare(b.date));

        // Calculate per-lead costs
        const leadCostsMap = new Map<string, { calls: number; messages: number; cost: number }>();
        
        calls?.forEach(call => {
          if (call.lead_id) {
            const current = leadCostsMap.get(call.lead_id) || { calls: 0, messages: 0, cost: 0 };
            current.calls++;
            current.cost += call.cost_total || 0;
            leadCostsMap.set(call.lead_id, current);
          }
        });

        communications?.forEach(comm => {
          if (comm.lead_id) {
            const current = leadCostsMap.get(comm.lead_id) || { calls: 0, messages: 0, cost: 0 };
            current.messages++;
            current.cost += comm.cost_twilio || 0;
            leadCostsMap.set(comm.lead_id, current);
          }
        });

        const perLead: LeadCostData[] = (leads || []).map(lead => {
          const costs = leadCostsMap.get(lead.id) || { calls: 0, messages: 0, cost: 0 };
          const interactions = costs.calls + costs.messages;
          return {
            id: lead.id,
            full_name: lead.full_name,
            phone: lead.phone,
            source: lead.source,
            status: lead.status,
            callCount: costs.calls,
            messageCount: costs.messages,
            totalCost: costs.cost,
            avgCostPerInteraction: interactions > 0 ? costs.cost / interactions : 0,
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

    fetchData();
  }, [userRecord?.organization_id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()]);

  return { data, loading, error };
}
