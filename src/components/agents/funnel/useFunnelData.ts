import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveAgentKey } from "@/components/agents/constants";
import { FunnelEventBus } from "./funnelEvents";
import type { FunnelSnapshot } from "./types";

// Numbers come ONLY from the 15s RPC poll; realtime drives visuals (pulses,
// particles) plus a debounced invalidate so counts feel live between polls.
export function useFunnelData() {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const queryClient = useQueryClient();

  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const events = useMemo(() => new FunnelEventBus(), []);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useQuery<FunnelSnapshot>({
    queryKey: ["agents-funnel-live", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agents_live_status");
      if (error) throw error;
      return data as unknown as FunnelSnapshot;
    },
    enabled: !!orgId,
    refetchInterval: 10_000,
    staleTime: 8_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!orgId) return;

    const debouncedInvalidate = () => {
      if (invalidateTimer.current) return;
      invalidateTimer.current = setTimeout(() => {
        invalidateTimer.current = null;
        queryClient.invalidateQueries({ queryKey: ["agents-funnel-live", orgId] });
      }, 5_000);
    };

    const channel = supabase
      .channel("agents-funnel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: `organization_id=eq.${orgId}` },
        () => {
          events.emit({ type: "lead_new", magnitude: 1 });
          setLastEventAt(new Date());
          debouncedInvalidate();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_activity_log", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { agent_key?: string; status?: string };
          events.emit({
            type: "agent_activity",
            agentKey: resolveAgentKey(row.agent_key || ""),
            failed: row.status === "failure",
            magnitude: 1,
          });
          setLastEventAt(new Date());
          debouncedInvalidate();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_tasks", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const next = payload.new as { agent_type?: string; status?: string };
          const prev = payload.old as { status?: string } | null;
          if (next.status === "completed" && prev?.status !== "completed") {
            events.emit({
              type: "task_completed",
              agentKey: resolveAgentKey(next.agent_type || ""),
              magnitude: 1,
            });
            setLastEventAt(new Date());
            debouncedInvalidate();
          }
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, events]);

  return {
    snapshot: query.data,
    isLoading: query.isLoading || !query.data,
    error: query.error,
    live,
    lastEventAt,
    events,
  };
}
