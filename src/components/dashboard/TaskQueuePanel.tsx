import { useEffect, useState, useCallback, useMemo, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ListChecks,
  RefreshCw,
  MessageSquare,
  Mail,
  Zap,
  Clock,
  Calendar,
  Send,
  RotateCcw,
  UserCheck,
  CheckCircle2,
  Sparkles,
  Hourglass,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { resolveAgentKey } from "@/components/agents/constants";
import { getLeadName } from "@/components/agents/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────

interface LeadNameRef {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  lead_property_interests?: { properties: { address: string | null; unit_number: string | null } | null }[] | null;
}

// Property the lead is interested in — street + unit only (no city / zip, and
// drop the "(Down)/(Up)" parenthetical so the line stays short).
const leadProperty = (leads: LeadNameRef | null): string => {
  const p = leads?.lead_property_interests?.find((x) => x?.properties?.address)?.properties;
  if (!p?.address) return "";
  const unit = (p.unit_number || "").replace(/\s*\(.*\)\s*/g, "").trim();
  return unit ? `${p.address} · ${unit}` : p.address;
};

interface QueuedTask {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  lead_id: string;
  leads: LeadNameRef | null;
}

interface CompletedTask {
  id: string;
  agent_type: string;
  action_type: string;
  completed_at: string;
  leads: LeadNameRef | null;
}

interface TaskInsights {
  pending_total: number;
  due_next_hour: number;
  due_next_15m: number;
  overdue: number;
  completed_1h: number;
  completed_today: number;
  next_at: string | null;
  by_type: { type: string; count: number }[];
}

interface QueueSnapshot {
  tasks: QueuedTask[];
  totalPending: number;
  completedToday: number;
  recent: CompletedTask[];
  insights: TaskInsights | null;
}

// Short, human labels for the queue-composition line
const COMP_LABELS: Record<string, string> = {
  welcome_sequence: "bienvenidas",
  showing_confirmation: "confirmaciones",
  no_show_followup: "seguimientos no-show",
  no_show_follow_up: "seguimientos no-show",
  post_showing: "post-showing",
  notification_dispatcher: "notificaciones",
  recapture: "recapturas",
};

const fmtEta = (h: number): string => {
  if (h < 1 / 60) return "<1 min";
  if (h < 1) return `~${Math.round(h * 60)} min`;
  if (h < 24) return `~${h.toFixed(1)}h`;
  return `~${Math.round(h / 24)}d`;
};

// ── Agent names ──────────────────────────────────────────────────────
// Canonical biblical names — resolveAgentKey (agents/constants) collapses
// legacy agent_types to the 6 canonical agents; the capitalized key IS the
// biblical name (samuel → Samuel), same identity the /agents page shows.

const getAgentName = (key: string) => {
  const canonical = resolveAgentKey(key);
  return canonical.charAt(0).toUpperCase() + canonical.slice(1);
};

// Compact display: first name only (the queue column is narrow).
const firstOnly = (s: string) => (s || "").trim().split(/\s+/)[0] || s;

// ── Action labels & icons ────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  sms: "enviar SMS",
  email: "enviar email",
  score: "evaluar lead",
  confirm_showing: "confirmar showing",
  outbound_callback: "devolver llamada",
  send_application: "enviar aplicación",
  recapture: "recapturar",
  follow_up: "hacer seguimiento",
  sequence: "correr secuencia",
  notify: "enviar notificación",
};

// More descriptive labels based on agent_type (overrides action_type labels)
const AGENT_TYPE_LABELS: Record<string, string> = {
  welcome_sequence: "enviar bienvenida",
  recapture: "recapturar lead",
  campaign: "correr campaña",
  showing_confirmation: "confirmar showing",
  no_show_followup: "seguimiento no-show",
  no_show_follow_up: "seguimiento no-show",
  post_showing: "seguimiento post-showing",
  doorloop_pull: "sincronizar DoorLoop",
  notification_dispatcher: "enviar notificación",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  sms: MessageSquare,
  email: Mail,
  notify: Mail,
  sequence: Zap,
};

// Smarter icon based on agent_type
const AGENT_TYPE_ICONS: Record<string, React.ElementType> = {
  welcome_sequence: Send,
  campaign: Zap,
  showing_confirmation: Calendar,
  no_show_followup: RotateCcw,
  no_show_follow_up: RotateCcw,
  post_showing: UserCheck,
  recapture: Zap,
  doorloop_pull: Zap,
};

const VISIBLE_LIMIT = 10;

// ── Live "fires in" countdown ────────────────────────────────────────
// The dispatcher (nehemiah-dispatch-every-5min) runs on a */5 cron, so a task
// actually goes out at the first 5-minute boundary AT/AFTER its scheduled time.
// That's the honest answer to "in how many seconds does the action fire" — and
// because it's always ≤ 5 min for a ready task, the seconds visibly tick every
// second (the 1s heartbeat drives the re-render).
const DISPATCH_INTERVAL_MS = 5 * 60 * 1000;

function fireCountdown(scheduledIso: string, nowMs: number): { label: string; imminent: boolean; firing: boolean } {
  const scheduledMs = new Date(scheduledIso).getTime();
  // The dispatcher only picks tasks whose time has come; a future task waits
  // until then. Either way it fires at the next cron tick after it's ready.
  const readyMs = Math.max(scheduledMs, nowMs);
  const fireMs = Math.ceil(readyMs / DISPATCH_INTERVAL_MS) * DISPATCH_INTERVAL_MS;
  const diff = fireMs - nowMs;
  const s = Math.max(0, Math.ceil(diff / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (s <= 0) return { label: "ahora…", imminent: true, firing: true };
  if (s < 60) return { label: `en ${s}s`, imminent: s <= 30, firing: false };
  if (m < 60) return { label: `en ${m}m ${s % 60}s`, imminent: false, firing: false };
  if (h < 24) return { label: `en ${h}h ${m % 60}m`, imminent: false, firing: false };
  return { label: `en ${d}d ${h % 24}h`, imminent: false, firing: false };
}

// ── Component ────────────────────────────────────────────────────────

export const TaskQueuePanel = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  // Real realtime-subscription state — the LIVE chip must not lie.
  const [rtLive, setRtLive] = useState(false);
  // 1s heartbeat: re-render so countdowns/"updated Xs ago" tick visibly.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const orgId = userRecord?.organization_id;
  const queryKey = ["live-task-queue", orgId];
  // Stable per-instance suffix for the realtime channel topic. AdminDashboard
  // mounts this panel twice (mobile inline + desktop sticky rail, CSS-hidden),
  // and supabase-js dedupes channels by topic — a shared hardcoded topic makes
  // the second .on() append a duplicate postgres_changes binding, so the join
  // ack errors ("mismatch between server and client bindings") and realtime
  // dies for BOTH instances. A unique topic per instance keeps each subscription
  // independent and SUBSCRIBED.
  const instanceId = useId();

  // ── Query: next 10 + totals + recent completions, one snapshot ──────
  const { data: snap, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async (): Promise<QueueSnapshot> => {
      if (!orgId) return { tasks: [], totalPending: 0, completedToday: 0, recent: [], insights: null };

      // Cleveland midnight (DST-aware) for "completed today"
      const now = new Date();
      const clevNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const tzOffset = now.getTime() - clevNow.getTime();
      clevNow.setHours(0, 0, 0, 0);
      const todayStart = new Date(clevNow.getTime() + tzOffset).toISOString();

      const [tasksRes, pendingRes, doneTodayRes, recentRes, insightsRes] = await Promise.all([
        supabase
          .from("agent_tasks")
          .select(`
            id, agent_type, action_type, scheduled_for, status, lead_id,
            leads:lead_id (full_name, first_name, last_name, lead_property_interests(properties(address, unit_number)))
          `)
          .eq("organization_id", orgId)
          .in("status", ["pending", "in_progress"])
          .neq("action_type", "call") // voice removed — never show dead 'call' tasks
          .order("scheduled_for", { ascending: true })
          .limit(VISIBLE_LIMIT),
        supabase
          .from("agent_tasks")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("status", ["pending", "in_progress"])
          .neq("action_type", "call"),
        supabase
          .from("agent_tasks")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "completed")
          .gte("completed_at", todayStart),
        supabase
          .from("agent_tasks")
          .select(`
            id, agent_type, action_type, completed_at,
            leads:lead_id (full_name, first_name, last_name, lead_property_interests(properties(address, unit_number)))
          `)
          .eq("organization_id", orgId)
          .eq("status", "completed")
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(3),
        supabase.rpc("task_queue_insights"),
      ]);

      // Check ALL five results — a silent failure in any of them used to zero
      // out totals/forecast/ticker while the panel still claimed to be live.
      if (tasksRes.error) throw tasksRes.error;
      if (pendingRes.error) throw pendingRes.error;
      if (doneTodayRes.error) throw doneTodayRes.error;
      if (recentRes.error) throw recentRes.error;
      if (insightsRes.error) throw insightsRes.error;
      setLastUpdate(new Date());
      return {
        tasks: (tasksRes.data as unknown as QueuedTask[]) || [],
        totalPending: pendingRes.count || 0,
        completedToday: doneTodayRes.count || 0,
        recent: (recentRes.data as unknown as CompletedTask[]) || [],
        insights: (insightsRes.data as unknown as TaskInsights) || null,
      };
    },
    enabled: !!orgId,
    refetchInterval: 10_000,
  });

  // ── Realtime subscription ────────────────────────────────────────────
  // Debounced invalidation (same pattern as useDashboardLive): the dispatcher
  // emits 2+ events per task and drains run to thousands — coalesce the burst
  // into one refetch every ~4s instead of a refetch storm of 5 queries each.
  useEffect(() => {
    if (!orgId) return;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const channel: RealtimeChannel = supabase
      .channel(`live-panel-task-queue-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_tasks",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          if (invalidateTimer) return;
          invalidateTimer = setTimeout(() => {
            invalidateTimer = null;
            queryClient.invalidateQueries({ queryKey: ["live-task-queue", orgId] });
          }, 4_000);
        }
      )
      .subscribe((status) => setRtLive(status === "SUBSCRIBED"));
    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      setRtLive(false);
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, instanceId]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey });
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient, queryKey]);

  const tasks = snap?.tasks || [];
  const totalPending = snap?.totalPending || 0;
  const completedToday = snap?.completedToday || 0;
  const recent = snap?.recent || [];
  const hiddenCount = Math.max(0, totalPending - tasks.length);
  const secondsSinceUpdate = Math.max(0, Math.floor((nowMs - lastUpdate.getTime()) / 1000));

  // ── Smart forecast: what's about to go out, real throughput, drain ETA ──
  const forecast = useMemo(() => {
    const ins = snap?.insights;
    if (!ins) return null;
    // Use the SAME pending count the timeline list and footer use
    // (agent_tasks in status pending OR in_progress, 'call' excluded) as the
    // single source of truth. ins.pending_total counts only status='pending',
    // so relying on it made the banner claim "queue empty / agents caught up"
    // while EN CURSO (in_progress) rows were visibly running and the footer
    // still said "N en cola" — three contradictory statements in one card.
    const pending = snap?.totalPending ?? 0;
    if (pending === 0) return { empty: true } as const;

    // Cleveland midnight → hours elapsed today (fallback rate source)
    const now = new Date(nowMs);
    const clev = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    clev.setHours(0, 0, 0, 0);
    const off = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime();
    const hoursElapsed = Math.max(0.25, (nowMs - (clev.getTime() + off)) / 3_600_000);

    // Prefer the last-hour throughput; fall back to today's average.
    const rate = ins.completed_1h > 0 ? ins.completed_1h : ins.completed_today / hoursElapsed;

    // What actually goes out in the next hour ≈ min(what's due, what throughput allows)
    const nextHourOut = rate > 0 ? Math.min(ins.due_next_hour, Math.round(rate)) : ins.due_next_hour;
    const etaLabel = rate >= 1 ? fmtEta(pending / rate) : null;

    // Composition: top pending types, friendly-labeled
    const composition = ins.by_type
      .filter((b) => b.count > 0)
      .slice(0, 3)
      .map((b) => `${b.count.toLocaleString()} ${COMP_LABELS[b.type] || b.type.replace(/_/g, " ")}`)
      .join(" · ");

    return { empty: false as const, pending, rate: Math.round(rate), nextHourOut, etaLabel, composition };
  }, [snap?.insights, snap?.totalPending, nowMs]);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Card variant="glass" className="flex flex-col border-l-2 border-l-emerald-400/50 max-h-[calc(100vh-2rem)] overflow-y-auto">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-500" />
            Cola de tareas
            {/* Status chip — reflects the REAL realtime subscription state */}
            {rtLive ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-ping opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[11px] font-bold tracking-wider text-emerald-700">EN VIVO</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-[11px] font-bold tracking-wider text-amber-700">CONECTANDO</span>
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Actualizar cola"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 text-muted-foreground hover:text-foreground transition-colors",
                isRefreshing && "animate-spin"
              )}
            />
          </Button>
        </div>
        {/* ── Smart forecast strip ── */}
        {forecast && (
          <div className="mt-2 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-emerald-50/50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-indigo-600">Pronóstico de tareas</span>
            </div>
            {forecast.empty ? (
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                Cola de tareas vacía — los agentes están al día
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {[
                    { icon: ListChecks, color: "text-emerald-500", label: "Próxima hora", value: `~${forecast.nextHourOut.toLocaleString()}`, unit: "tareas" },
                    { icon: Hourglass, color: "text-amber-500", label: "Cola de tareas vacía en", value: forecast.etaLabel ?? "—", unit: "" },
                    { icon: Zap, color: "text-indigo-500", label: "Ritmo de ejecución", value: `~${forecast.rate.toLocaleString()}`, unit: "tareas/h" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2">
                      <r.icon className={cn("h-4 w-4 shrink-0", r.color)} />
                      <span className="flex-1 text-xs text-muted-foreground leading-tight">{r.label}</span>
                      <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">
                        {r.value}
                        {r.unit && <span className="ml-1 text-[11px] font-medium text-muted-foreground">{r.unit}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {forecast.composition && (
                  <p className="mt-2 border-t border-indigo-100/70 pt-1.5 text-[11px] text-muted-foreground leading-snug break-words">
                    <span className="font-semibold text-foreground/70">Tareas en cola:</span> {forecast.composition}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground tabular-nums mt-2">
          {secondsSinceUpdate <= 1 ? "Actualizado justo ahora" : `Actualizado hace ${secondsSinceUpdate}s`}
        </p>
      </CardHeader>

      {/* Content */}
      <CardContent className="pt-0 flex flex-col">
        {/* Just-completed ticker — proof the engine is doing things */}
        {recent.length > 0 && (
          <div className="mb-3 space-y-1.5 rounded-lg bg-emerald-50/50 border border-emerald-100 px-3 py-2.5">
            {recent.map((r, i) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-start gap-2 text-xs leading-snug",
                  i === 0 ? "opacity-100" : i === 1 ? "opacity-75" : "opacity-50"
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" />
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-semibold text-emerald-700">{getAgentName(r.agent_type)}</span>
                  <span className="text-muted-foreground"> {AGENT_TYPE_LABELS[r.agent_type] || ACTION_LABELS[r.action_type] || r.action_type.replace(/_/g, " ")} → </span>
                  <span className="font-medium">{firstOnly(getLeadName(r.leads))}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {formatDistanceToNow(new Date(r.completed_at), { addSuffix: true, locale: es })}
                </span>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError && !snap ? (
          // A failed load must NOT masquerade as an empty queue.
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            No se pudo cargar la cola de tareas. Reintentando automáticamente…
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Cola vacía"
            description="Sin tareas pendientes — los agentes están al día"
          />
        ) : (
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
            {/* Timeline: next 10 only */}
            <div className="relative">
              {/* connector line (through the dot centers) */}
              <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />
              <div className="space-y-1.5">
                {tasks.map((task, index) => {
                  const isInProgress = task.status === "in_progress";
                  const isUpNext = index === 0 && !isInProgress;
                  const agentName = getAgentName(task.agent_type);
                  const actionLabel = AGENT_TYPE_LABELS[task.agent_type] || ACTION_LABELS[task.action_type] || task.action_type.replace(/_/g, " ");
                  const ActionIcon = AGENT_TYPE_ICONS[task.agent_type] || ACTION_ICONS[task.action_type] || Zap;
                  const leadName = firstOnly(getLeadName(task.leads));
                  const prop = leadProperty(task.leads);
                  const cd = fireCountdown(task.scheduled_for, nowMs);

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "relative flex items-start gap-3 rounded-lg py-2.5 pl-1 pr-2 transition-all",
                        (isUpNext || isInProgress) && "bg-emerald-50/50",
                        index === 0 && "animate-fade-up"
                      )}
                    >
                      {/* timeline dot */}
                      <div
                        className={cn(
                          "relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm",
                          isInProgress
                            ? "bg-blue-100 text-blue-600"
                            : isUpNext
                              ? "bg-emerald-100 text-emerald-600"
                              : cd.imminent
                                ? "bg-emerald-50 text-emerald-500"
                                : "bg-muted text-muted-foreground"
                        )}
                      >
                        {(isUpNext || isInProgress) && (
                          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-ping opacity-30" />
                        )}
                        <ActionIcon className="h-4 w-4" />
                      </div>

                      {/* body — two balanced lines, no orphan gaps:
                          line 1: agent · action ……… badge
                          line 2: lead name ………… live countdown */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm leading-snug break-words min-w-0">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {agentName}
                            </span>
                            <span className="text-muted-foreground"> · {actionLabel}</span>
                          </p>
                          {isInProgress ? (
                            <Badge className="h-5 px-2 text-[11px] shrink-0 bg-blue-500 hover:bg-blue-500 animate-pulse">
                              EN CURSO
                            </Badge>
                          ) : isUpNext ? (
                            <Badge className="h-5 px-2 text-[11px] shrink-0 bg-emerald-500 hover:bg-emerald-500">
                              SIGUIENTE
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-end justify-between gap-2 mt-0.5">
                          <p className="text-sm font-medium text-foreground truncate min-w-0">
                            {leadName}
                            {prop && <span className="font-normal text-muted-foreground"> · {prop}</span>}
                          </p>
                          <p
                            className={cn(
                              "text-xs tabular-nums flex items-center gap-1 whitespace-nowrap shrink-0",
                              cd.firing
                                ? "text-emerald-600 font-bold animate-pulse"
                                : cd.imminent
                                  ? "text-emerald-600 font-semibold"
                                  : "text-muted-foreground"
                            )}
                          >
                            {cd.firing
                              ? <Zap className="h-3.5 w-3.5" />
                              : <Clock className="h-3.5 w-3.5" />}
                            {cd.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer: live totals */}
        {(totalPending > 0 || completedToday > 0) && (
          <div className="pt-3 mt-2 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {hiddenCount > 0
                ? `+${hiddenCount} más en cola`
                : `${totalPending} en cola`}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              {completedToday} completadas hoy
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
