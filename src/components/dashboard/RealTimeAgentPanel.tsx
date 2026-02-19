import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Phone,
  MessageSquare,
  Mail,
  RefreshCw,
  Radio,
  Zap,
  Clock,
  UserPlus,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────

interface RecentLeadRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  properties: {
    address: string;
    city: string;
  } | null;
}

interface NextTaskRow {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  lead_id: string;
  status: string;
}

// ── Agent names ──────────────────────────────────────────────────────

const AGENT_NAMES: Record<string, string> = {
  main_inbound: "Aaron",
  bland_call_webhook: "Deborah",
  sms_inbound: "Ruth",
  hemlane_parser: "Esther",
  scoring: "Daniel",
  transcript_analyst: "Isaiah",
  task_dispatcher: "Nehemiah",
  recapture: "Elijah",
  showing_confirmation: "Samuel",
  conversion_predictor: "Solomon",
  insight_generator: "Moses",
  report_generator: "David",
  doorloop_pull: "Ezra",
  cost_tracker: "Zacchaeus",
  no_show_followup: "Samuel",
  no_show_follow_up: "Samuel",
  post_showing: "Samuel",
  campaign: "Elijah",
  welcome_sequence: "Elijah",
  campaign_voice: "Elijah",
  campaign_sms: "Ruth",
};

// ── Source → agent that brought the lead in ──────────────────────────

const SOURCE_INFO: Record<string, { agent: string; action: string }> = {
  hemlane_email: { agent: "Esther", action: "registró vía Hemlane" },
  inbound_call: { agent: "Aaron", action: "registró por llamada entrante" },
  website: { agent: "Aaron", action: "capturó desde sitio web" },
  sms: { agent: "Ruth", action: "registró por SMS entrante" },
  referral: { agent: "Aaron", action: "registró como referido" },
  manual: { agent: "—", action: "ingresó manualmente" },
  campaign: { agent: "Elijah", action: "captó en campaña outbound" },
};

// ── Next-task action labels ──────────────────────────────────────────

const NEXT_ACTION_LABELS: Record<string, string> = {
  call: "llamar",
  sms: "enviar SMS",
  email: "enviar email",
  voice: "llamar",
  score: "evaluar lead",
  confirm_showing: "confirmar showing",
  outbound_callback: "hacer callback",
  send_application: "enviar aplicación",
  recapture: "recapturar",
  follow_up: "hacer seguimiento",
};

// ── Action icons ─────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  voice: Phone,
};

// ── Component ────────────────────────────────────────────────────────

export const RealTimeAgentPanel = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const orgId = userRecord?.organization_id;
  const leadsQueryKey = ["realtime-recent-leads", orgId];
  const tasksQueryKey = ["realtime-next-tasks", orgId];

  // ── Fetch recent leads with property info ───────────────────────────
  const { data: recentLeads, isLoading: leadsLoading } = useQuery({
    queryKey: leadsQueryKey,
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, phone, email, source, created_at, updated_at, properties(address, city)")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setLastUpdate(new Date());
      return data as unknown as RecentLeadRow[];
    },
    enabled: !!orgId,
    refetchInterval: 15000,
  });

  // ── Fetch next pending task per lead ────────────────────────────────
  const leadIds = recentLeads?.map((l) => l.id) || [];

  const { data: nextTasks } = useQuery({
    queryKey: [...tasksQueryKey, leadIds],
    queryFn: async () => {
      if (leadIds.length === 0) return [];

      const { data, error } = await supabase
        .from("agent_tasks")
        .select("id, agent_type, action_type, scheduled_for, lead_id, status")
        .in("lead_id", leadIds)
        .in("status", ["pending", "in_progress"])
        .order("scheduled_for", { ascending: true });

      if (error) throw error;
      return data as NextTaskRow[];
    },
    enabled: leadIds.length > 0,
    refetchInterval: 15000,
  });

  // Build next-task lookup: first (soonest) task per lead
  const nextTaskByLead: Record<string, NextTaskRow> = {};
  (nextTasks || []).forEach((task) => {
    if (!nextTaskByLead[task.lead_id]) {
      nextTaskByLead[task.lead_id] = task;
    }
  });

  // ── Realtime subscriptions ──────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;

    const channel: RealtimeChannel = supabase
      .channel("realtime-activity-panel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: leadsQueryKey });
          setLastUpdate(new Date());
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_tasks",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: tasksQueryKey });
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
      queryClient.invalidateQueries({ queryKey: tasksQueryKey }),
    ]);
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient, leadsQueryKey, tasksQueryKey]);

  // ── Helpers ─────────────────────────────────────────────────────────

  const describeNextTask = (task: NextTaskRow) => {
    const agent = AGENT_NAMES[task.agent_type] || task.agent_type;
    const action =
      NEXT_ACTION_LABELS[task.action_type] || task.action_type.replace(/_/g, " ");
    const Icon = ACTION_ICONS[task.action_type] || Zap;
    return { agent, action, Icon };
  };

  return (
    <Card variant="glass" className="h-full border-l-2 border-l-emerald-400/50">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <Radio className="h-4 w-4 text-emerald-500" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            Actividad en Tiempo Real
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative group"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors",
                isRefreshing && "animate-spin"
              )}
            />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Actualizado {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </p>
      </CardHeader>

      {/* Lead Activity */}
      <CardContent className="pt-0">
        {leadsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-muted">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <Skeleton className="h-3.5 w-full ml-9" />
                <Skeleton className="h-3 w-40 ml-9 mt-1.5" />
              </div>
            ))}
          </div>
        ) : !recentLeads || recentLeads.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin actividad"
            description="Los nuevos leads aparecerán aquí"
          />
        ) : (
          <ScrollArea className="h-[calc(100vh-280px)] min-h-[400px]">
            <div className="space-y-2">
              {recentLeads.map((lead, index) => {
                const sourceInfo = SOURCE_INFO[lead.source] || {
                  agent: "Sistema",
                  action: `registró desde ${lead.source}`,
                };
                const nextTask = nextTaskByLead[lead.id];
                const leadName =
                  lead.full_name || lead.phone || lead.email || "Lead sin nombre";
                const createdAt = new Date(lead.created_at);
                const updatedAt = new Date(lead.updated_at || lead.created_at);
                // Show the most recent timestamp (created or updated)
                const displayTime = updatedAt > createdAt ? updatedAt : createdAt;
                // "New" = created in the last hour; otherwise it's returning activity
                const isNew = (Date.now() - createdAt.getTime()) < 60 * 60 * 1000;

                return (
                  <div
                    key={lead.id}
                    className={cn(
                      "p-3 rounded-lg transition-all",
                      isNew
                        ? "bg-emerald-50/30 border border-emerald-100/60 hover:bg-emerald-50/60"
                        : "bg-blue-50/30 border border-blue-100/60 hover:bg-blue-50/60",
                      index === 0 && "animate-fade-up"
                    )}
                  >
                    {/* Row 1: icon + time + badge */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                        isNew ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                      )}>
                        <UserPlus className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {format(displayTime, "h:mm a")} ·{" "}
                        {formatDistanceToNow(displayTime, { addSuffix: true })}
                      </span>
                      <Badge className={cn(
                        "h-4 px-1.5 text-[10px] ml-auto",
                        isNew
                          ? "bg-emerald-500 hover:bg-emerald-500"
                          : "bg-blue-500 hover:bg-blue-500"
                      )}>
                        {isNew ? "NUEVO LEAD" : "ACTIVIDAD"}
                      </Badge>
                    </div>

                    {/* Row 2: agent action + lead name */}
                    <p className="text-sm leading-snug ml-9">
                      <span className="font-semibold text-teal-600">
                        {sourceInfo.agent}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}{sourceInfo.action} a{" "}
                      </span>
                      <span className="font-semibold text-foreground">
                        {leadName}
                      </span>
                    </p>

                    {/* Row 3: property interest (only if matched) */}
                    {lead.properties && (
                      <p className="text-xs text-muted-foreground ml-9 mt-0.5">
                        Interesado en:{" "}
                        <span className="font-medium text-foreground">
                          {lead.properties.address}, {lead.properties.city}
                        </span>
                      </p>
                    )}

                    {/* Row 4: next automation step */}
                    {nextTask && (() => {
                      const { agent, action, Icon } = describeNextTask(nextTask);
                      return (
                        <div className="flex items-center gap-1.5 ml-9 mt-2 py-1 px-2 rounded bg-blue-50/80 border border-blue-100/60 w-fit">
                          <ChevronRight className="h-3 w-3 text-blue-500 shrink-0" />
                          <Icon className="h-3 w-3 text-blue-500 shrink-0" />
                          <span className="text-xs text-blue-700 font-medium">
                            Siguiente: {agent} va a {action}
                          </span>
                          {nextTask.status === "in_progress" && (
                            <Badge className="h-3.5 px-1 text-[9px] bg-blue-500 hover:bg-blue-500">
                              EN CURSO
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {recentLeads && recentLeads.length > 0 && (
          <div className="pt-3 mt-2 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {recentLeads.length} lead{recentLeads.length !== 1 ? "s" : ""} reciente{recentLeads.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
