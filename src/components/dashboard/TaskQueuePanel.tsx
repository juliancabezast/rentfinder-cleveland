import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ListChecks,
  RefreshCw,
  Phone,
  MessageSquare,
  Mail,
  Zap,
  ChevronRight,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, format, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveAgentKey } from "@/components/agents/constants";
import { getLeadName } from "@/components/agents/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────

interface QueuedTask {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  lead_id: string;
  leads: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
}

// ── Agent biblical names ─────────────────────────────────────────────

const BIBLICAL_NAMES: Record<string, string> = {
  aaron: "Aaron",
  esther: "Esther",
  nehemiah: "Nehemiah",
  ruth: "Ruth",
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
  call: "call",
  sms: "send SMS",
  email: "send email",
  voice: "call",
  score: "score lead",
  confirm_showing: "confirm showing",
  outbound_callback: "make callback",
  send_application: "send application",
  recapture: "recapture",
  follow_up: "follow up",
  sequence: "run sequence",
  notify: "send notification",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  voice: Phone,
  notify: Mail,
  sequence: Zap,
};

// ── Component ────────────────────────────────────────────────────────

export const TaskQueuePanel = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const orgId = userRecord?.organization_id;
  const queryKey = ["live-task-queue", orgId];

  // ── Query ────────────────────────────────────────────────────────────
  const { data: tasks, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("agent_tasks")
        .select(`
          id, agent_type, action_type, scheduled_for, status, lead_id,
          leads:lead_id (full_name, first_name, last_name)
        `)
        .eq("organization_id", orgId)
        .in("status", ["pending", "in_progress"])
        .order("scheduled_for", { ascending: true })
        .limit(30);
      if (error) throw error;
      setLastUpdate(new Date());
      return data as unknown as QueuedTask[];
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

  const totalCount = tasks?.length || 0;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Card variant="glass" className="h-full border-l-2 border-l-emerald-400/50">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <ListChecks className="h-4 w-4 text-emerald-500" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            Task Queue
            {totalCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 ml-1">
                {totalCount}
              </Badge>
            )}
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
        <p className="text-xs text-muted-foreground">
          Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </p>
      </CardHeader>

      {/* Content */}
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-muted">
                <div className="flex items-center gap-2 mb-1.5">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-16 rounded ml-auto" />
                </div>
                <Skeleton className="h-3 w-full ml-8" />
                <Skeleton className="h-3 w-32 ml-8 mt-1" />
              </div>
            ))}
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Queue empty"
            description="No pending tasks — agents are all caught up"
          />
        ) : (
          <ScrollArea className="h-[calc(50vh-140px)] 2xl:h-[calc(100vh-280px)] min-h-[200px]">
            <div className="space-y-2">
              {tasks.map((task, index) => {
                const isOverdue = isPast(new Date(task.scheduled_for)) && task.status === "pending";
                const isInProgress = task.status === "in_progress";
                const agentName = getAgentName(task.agent_type);
                const actionLabel = ACTION_LABELS[task.action_type] || task.action_type.replace(/_/g, " ");
                const ActionIcon = ACTION_ICONS[task.action_type] || Zap;
                const leadName = getLeadName(task.leads);
                const scheduledTime = new Date(task.scheduled_for);

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "p-2.5 rounded-lg border transition-all",
                      isInProgress
                        ? "bg-blue-50/40 border-blue-200/60"
                        : isOverdue
                          ? "bg-amber-50/40 border-amber-200/60"
                          : "bg-emerald-50/20 border-emerald-100/40",
                      index === 0 && "animate-fade-up"
                    )}
                  >
                    {/* Row 1: icon + scheduled time + badge */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                        isInProgress
                          ? "bg-blue-100 text-blue-600"
                          : isOverdue
                            ? "bg-amber-100 text-amber-600"
                            : "bg-emerald-100 text-emerald-600"
                      )}>
                        <ActionIcon className="h-3 w-3" />
                      </div>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(scheduledTime, "MMM d, h:mm a")}
                      </span>
                      {isInProgress && (
                        <Badge className="h-4 px-1.5 text-[10px] bg-blue-500 hover:bg-blue-500 ml-auto">
                          IN PROGRESS
                        </Badge>
                      )}
                      {isOverdue && !isInProgress && (
                        <Badge className="h-4 px-1.5 text-[10px] bg-amber-500 hover:bg-amber-500 ml-auto flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          OVERDUE
                        </Badge>
                      )}
                    </div>

                    {/* Row 2: agent + action */}
                    <p className="text-sm leading-snug ml-8">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {agentName}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}will {actionLabel}
                      </span>
                    </p>

                    {/* Row 3: lead name */}
                    <div className="flex items-center gap-1 ml-8 mt-0.5">
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">
                        {leadName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {tasks && tasks.length > 0 && (
          <div className="pt-3 mt-2 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {totalCount} pending task{totalCount !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
