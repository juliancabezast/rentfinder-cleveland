import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface LeadCharts {
  daily: { d: string; iso: string; count: number }[];
  by_source: { source: string; count: number }[];
  today: number;
  week_total: number;
  hot: number;
  avg_prev_week: number;
  avg_prev_month: number;
  avg_all: number;
}

const EMPTY: LeadCharts = {
  daily: [], by_source: [], today: 0, week_total: 0, hot: 0,
  avg_prev_week: 0, avg_prev_month: 0, avg_all: 0,
};

/**
 * Lead-focused chart data for the dashboard's animated "Leads pulse" strip.
 * Polls every 15s AND refetches on any realtime change to the org's leads, so
 * the charts move as new leads arrive. `days` sets the trend window (range chip).
 * Backed by the dashboard_lead_charts RPC (org from auth.uid(), Cleveland TZ,
 * demo excluded).
 */
export function useLeadCharts(days = 7) {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const queryClient = useQueryClient();
  const queryKey = ["dashboard-lead-charts", orgId, days];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<LeadCharts> => {
      const { data, error } = await supabase.rpc("dashboard_lead_charts", { p_days: days });
      if (error) throw error;
      const d = (data as unknown as Partial<LeadCharts>) || {};
      return {
        daily: d.daily || [],
        by_source: d.by_source || [],
        today: d.today || 0,
        week_total: d.week_total || 0,
        hot: d.hot || 0,
        avg_prev_week: d.avg_prev_week || 0,
        avg_prev_month: d.avg_prev_month || 0,
        avg_all: d.avg_all || 0,
      };
    },
    enabled: !!orgId,
    refetchInterval: 15_000,
    staleTime: 10_000,
    placeholderData: (prev) => prev, // keep the last chart while refetching (no flicker)
  });

  // Realtime: any lead insert/update/delete → refetch (debounced so a burst of
  // inserts doesn't hammer the RPC).
  useEffect(() => {
    if (!orgId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        // Invalidate every range variant (prefix match), not just the current one.
        queryClient.invalidateQueries({ queryKey: ["dashboard-lead-charts", orgId] });
      }, 1500);
    };
    const channel: RealtimeChannel = supabase
      .channel("dashboard-lead-charts-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `organization_id=eq.${orgId}` },
        bump,
      )
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  return { ...query, data: query.data ?? EMPTY };
}
