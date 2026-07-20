import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Types (shape of dashboard_live() RPC) ────────────────────────────

export interface DashboardLive {
  generated_at: string;
  leads: {
    total: number; hot: number; applicants: number;
    this_week: number; prev_week: number; created_today: number; created_24h: number;
  };
  showings: {
    total: number; today: number; completed: number; no_show: number;
    upcoming: number; show_up_rate: number | null;
  };
  portfolio: {
    total_doors: number; properties: number; available: number; coming_soon: number;
    in_leasing: number; rented: number; active: number; occupancy_pct: number;
  };
  comms: {
    emails_sent_24h: number; emails_sent_total: number; inbound_24h: number;
    queue_pending: number; queue_overdue: number;
  };
  next_showings: {
    id: string; scheduled_at: string; status: string; duration_minutes: number | null;
    property_address: string | null; property_city: string | null; unit_number: string | null;
    lead_name: string | null; lead_phone: string | null;
  }[];
}

// A transient "+N" badge to float over a card when its metric jumps
export interface Flash { key: string; n: number; id: number }

// ── Hook ─────────────────────────────────────────────────────────────

export function useDashboardLive() {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const queryClient = useQueryClient();

  const [live, setLive] = useState(false);
  const [pulseAt, setPulseAt] = useState<number>(0); // last realtime event (drives LIVE blink)
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const prevRef = useRef<DashboardLive | null>(null);
  const prevOrgRef = useRef<string | undefined>(undefined);
  const flashId = useRef(0);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPulse = useRef(0);
  const flashTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Reset the diff baseline + clear stale flashes when the org changes, so the
  // first poll of a new org never diffs against the previous org's snapshot.
  if (prevOrgRef.current !== orgId) {
    prevOrgRef.current = orgId;
    prevRef.current = null;
  }

  // Clear any pending flash timers on unmount (they call setState otherwise)
  useEffect(() => () => {
    flashTimers.current.forEach(clearTimeout);
    flashTimers.current.clear();
  }, []);

  const query = useQuery<DashboardLive>({
    queryKey: ["dashboard-live", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_live");
      if (error) throw error;
      return data as unknown as DashboardLive;
    },
    enabled: !!orgId,
    refetchInterval: 10_000,
    staleTime: 8_000,
    refetchOnWindowFocus: true,
  });

  // Flash any metric that INCREASED between polls — single source of the +N
  // animation so realtime and polling never double-count.
  useEffect(() => {
    const d = query.data;
    if (!d) return;
    const prev = prevRef.current;
    if (prev) {
      // Only metrics an actual card renders a flash for (keep in sync with
      // AdminDashboard's flash props) — no dead flashes.
      const deltas: [string, number][] = [
        ["leads", d.leads.total - prev.leads.total],
        ["showings", d.showings.total - prev.showings.total],
        ["emails", d.comms.emails_sent_total - prev.comms.emails_sent_total],
      ];
      const fresh: Flash[] = [];
      for (const [key, delta] of deltas) {
        // Guard against the rare negative/huge swing (e.g. a bulk merge lowering
        // total, or the very first reconcile) — only celebrate small, real jumps.
        if (delta > 0 && delta < 100000) fresh.push({ key, n: delta, id: ++flashId.current });
      }
      if (fresh.length) {
        const keys = new Set(fresh.map((f) => f.key));
        // One flash per key (latest wins); each self-expires by id → bounded array
        setFlashes((cur) => [...cur.filter((f) => !keys.has(f.key)), ...fresh]);
        fresh.forEach((f) => {
          const t = setTimeout(() => {
            flashTimers.current.delete(t);
            setFlashes((cur) => cur.filter((x) => x.id !== f.id));
          }, 2_400);
          flashTimers.current.add(t);
        });
      }
    }
    prevRef.current = d;
  }, [query.data]);

  // Realtime → keep polls timely + blink the LIVE badge on any activity
  useEffect(() => {
    if (!orgId) return;
    const bump = () => {
      // Throttle the LIVE blink so a bulk drain (thousands of events) can't
      // storm React with setState; the debounced invalidate handles the data.
      const now = Date.now();
      if (now - lastPulse.current > 900) {
        lastPulse.current = now;
        setPulseAt(now);
      }
      if (invalidateTimer.current) return;
      invalidateTimer.current = setTimeout(() => {
        invalidateTimer.current = null;
        queryClient.invalidateQueries({ queryKey: ["dashboard-live", orgId] });
      }, 4_000);
    };
    const channel = supabase
      .channel(`dashboard-live-${orgId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads", filter: `organization_id=eq.${orgId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "showings", filter: `organization_id=eq.${orgId}` }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_activity_log", filter: `organization_id=eq.${orgId}` }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agent_tasks", filter: `organization_id=eq.${orgId}` }, bump)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  const flashByKey = useMemo(() => {
    const m: Record<string, Flash> = {};
    for (const f of flashes) m[f.key] = f; // latest wins
    return m;
  }, [flashes]);

  return {
    data: query.data,
    // Skeletons only until the FIRST successful load — a later RPC error keeps
    // the last-good data visible rather than pinning the whole dashboard on
    // skeletons forever.
    isLoading: query.isLoading && !query.data,
    error: query.error,
    live,
    pulseAt,
    flashByKey,
  };
}
