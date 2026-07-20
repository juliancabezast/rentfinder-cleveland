import { useEffect, useState, useCallback, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { resolveAgentKey } from "@/components/agents/constants";
import { getLeadName } from "@/components/agents/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────

interface LeadNameRef {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

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

// ── Agent biblical names ─────────────────────────────────────────────

const BIBLICAL_NAMES: Record<string, string> = {
  aaron: "Aaron",
  esther: "Esther",
  nehemiah: "Nehemiah",
  elijah: "Elijah",
  samuel: "Samuel",
  zacchaeus: "Zacchaeus",
};

const getAgentName = (key: string) => {
  const canonical = resolveAgentKey(key);
  return BIBLICAL_NAMES[canonical] || canonical;
};

// ── Action labels & icons ────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  sms: "send SMS",
  email: "send email",
  score: "score lead",
  confirm_showing: "confirm showing",
  outbound_callback: "make callback",
  send_application: "send application",
  recapture: "recapture",
  follow_up: "follow up",
  sequence: "run sequence",
  notify: "send notification",
};

// More descriptive labels based on agent_type (overrides action_type labels)
const AGENT_TYPE_LABELS: Record<string, string> = {
  welcome_sequence: "send welcome email",
  recapture: "recapture lead",
  campaign: "run outreach campaign",
  showing_confirmation: "confirm showing",
  no_show_followup: "follow up no-show",
  no_show_follow_up: "follow up no-show",
  post_showing: "do post-showing follow-up",
  doorloop_pull: "sync with DoorLoop",
  notification_dispatcher: "send notification",
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

  if (s <= 0) return { label: "firing now…", imminent: true, firing: true };
  if (s < 60) return { label: `fires in ${s}s`, imminent: s <= 30, firing: false };
  if (m < 60) return { label: `fires in ${m}m ${s % 60}s`, imminent: false, firing: false };
  if (h < 24) return { label: `fires in ${h}h ${m % 60}m`, imminent: false, firing: false };
  return { label: `fires in ${d}d ${h % 24}h`, imminent: false, firing: false };
}

// ── Component ────────────────────────────────────────────────────────

export const TaskQueuePanel = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  // 1s heartbeat: re-render so countdowns/"updated Xs ago" tick visibly.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const orgId = userRecord?.organization_id;
  const queryKey = ["live-task-queue", orgId];

  // ── Query: next 10 + totals + recent completions, one snapshot ──────
  const { data: snap, isLoading } = useQuery({
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
            leads:lead_id (full_name, first_name, last_name)
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
            leads:lead_id (full_name, first_name, last_name)
          `)
          .eq("organization_id", orgId)
          .eq("status", "completed")
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(3),
        supabase.rpc("task_queue_insights"),
      ]);

      if (tasksRes.error) throw tasksRes.error;
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
  useEffect(() => {
    if (!orgId) return;
    const channel: RealtimeChannel = supabase
      .channel("live-panel-task-queue")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_tasks",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
          setLastUpdate(new Date());
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

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
    const pending = ins.pending_total;
    if (pending === 0) return { empty: true } as const;

    // Cleveland midnight → hours elapsed today (fallback rate source)
    const now = new Date(nowMs);
    const clev = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    clev.setHours(0, 0, 0, 0);
    const off = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime();
    const hoursElapsed = Math.max(0.25, (nowMs - (clev.getTime() + off)) / 3_600_000);

    // Prefer the last-hour throughput; fall back to today's average.
    const rate = ins.completed_1h > 0 ? ins.completed_1h : ins.completed_today / hoursElapsed;

    // What actually fires in the next hour ≈ min(what's due, what throughput allows)
    const nextHourOut = rate > 0 ? Math.min(ins.due_next_hour, Math.round(rate)) : ins.due_next_hour;
    const etaLabel = rate >= 1 ? fmtEta(pending / rate) : null;

    // Composition: top pending types, friendly-labeled
    const composition = ins.by_type
      .filter((b) => b.count > 0)
      .slice(0, 3)
      .map((b) => `${b.count.toLocaleString()} ${COMP_LABELS[b.type] || b.type.replace(/_/g, " ")}`)
      .join(" · ");

    return { empty: false as const, pending, rate: Math.round(rate), nextHourOut, etaLabel, composition };
  }, [snap?.insights, nowMs]);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Card variant="glass" className="flex flex-col border-l-2 border-l-emerald-400/50 max-h-[calc(100vh-2rem)] overflow-y-auto">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-500" />
            Task Queue
            {/* LIVE chip — broadcast-style pulse */}
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-ping opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] font-bold tracking-wider text-emerald-700">LIVE</span>
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
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
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-indigo-600">Pronóstico</span>
            </div>
            {forecast.empty ? (
              <p className="flex items-center gap-1.5 text-[13px] text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Cola vacía — los agentes están al día
              </p>
            ) : (
              <div className="space-y-1">
                {forecast.nextHourOut > 0 && (
                  <p className="flex items-center gap-1.5 text-[13px] text-foreground leading-snug">
                    <Send className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>
                      <span className="font-bold tabular-nums">~{forecast.nextHourOut.toLocaleString()}</span>{" "}
                      salen en la próxima hora
                    </span>
                  </p>
                )}
                {forecast.etaLabel && (
                  <p className="flex items-center gap-1.5 text-[13px] text-foreground leading-snug">
                    <Hourglass className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>
                      cola vacía en <span className="font-bold">{forecast.etaLabel}</span>
                      <span className="text-muted-foreground"> a ~{forecast.rate.toLocaleString()}/h</span>
                    </span>
                  </p>
                )}
                {forecast.composition && (
                  <p className="text-[11px] text-muted-foreground pt-0.5 leading-snug break-words">
                    {forecast.composition}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground tabular-nums mt-2">
          Updated {secondsSinceUpdate <= 1 ? "just now" : `${secondsSinceUpdate}s ago`}
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
                  <span className="font-medium">{getLeadName(r.leads)}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {formatDistanceToNow(new Date(r.completed_at), { addSuffix: true })}
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
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Queue empty"
            description="No pending tasks — agents are all caught up"
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
                  const leadName = getLeadName(task.leads);
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
                              RUNNING
                            </Badge>
                          ) : isUpNext ? (
                            <Badge className="h-5 px-2 text-[11px] shrink-0 bg-emerald-500 hover:bg-emerald-500">
                              UP NEXT
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-end justify-between gap-2 mt-0.5">
                          <p className="text-sm font-medium text-foreground break-words min-w-0">{leadName}</p>
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
          <div className="pt-3 mt-2 border-t flex items-center justify-between text-[13px] text-muted-foreground">
            <span>
              {hiddenCount > 0
                ? `+${hiddenCount} more queued`
                : `${totalPending} in queue`}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              {completedToday} done today
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
