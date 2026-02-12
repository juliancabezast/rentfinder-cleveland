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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { RealtimeChannel } from "@supabase/supabase-js";

interface AgentTaskRow {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  context: Record<string, unknown> | null;
  attempt_number: number | null;
  max_attempts: number | null;
  lead_id: string;
  leads: {
    full_name: string | null;
    phone: string;
    properties: {
      address: string;
      city: string;
    } | null;
  } | null;
}

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

const AGENT_DEPT_COLORS: Record<string, string> = {
  main_inbound: "text-teal-600",
  bland_call_webhook: "text-teal-600",
  sms_inbound: "text-teal-600",
  hemlane_parser: "text-teal-600",
  scoring: "text-blue-600",
  transcript_analyst: "text-blue-600",
  task_dispatcher: "text-purple-600",
  recapture: "text-amber-600",
  showing_confirmation: "text-amber-600",
  no_show_followup: "text-amber-600",
  no_show_follow_up: "text-amber-600",
  post_showing: "text-amber-600",
  campaign: "text-amber-600",
  campaign_voice: "text-amber-600",
  campaign_sms: "text-amber-600",
  welcome_sequence: "text-amber-600",
  conversion_predictor: "text-green-600",
  insight_generator: "text-green-600",
  report_generator: "text-green-600",
  doorloop_pull: "text-slate-600",
  cost_tracker: "text-slate-600",
};

const ACTION_LABELS: Record<string, string> = {
  call: "llamar a",
  sms: "enviar SMS a",
  email: "enviar email a",
  voice: "llamar a",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  voice: Phone,
};

const AGENT_ACTION_DESCRIPTIONS: Record<string, string> = {
  recapture: "recapturar",
  no_show_followup: "seguimiento no-show",
  no_show_follow_up: "seguimiento no-show",
  showing_confirmation: "confirmar showing",
  post_showing: "seguimiento post-showing",
  campaign: "campaña outbound",
  campaign_voice: "campaña de voz",
  campaign_sms: "campaña SMS",
  welcome_sequence: "secuencia bienvenida",
  scoring: "evaluar",
  transcript_analyst: "analizar transcripción",
};

export const RealTimeAgentPanel = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const queryKey = ["realtime-agent-tasks", userRecord?.organization_id];

  const { data: tasks, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];

      const { data, error } = await supabase
        .from("agent_tasks")
        .select(`
          id, agent_type, action_type, scheduled_for, status, context,
          attempt_number, max_attempts, lead_id,
          leads(full_name, phone, properties(address, city))
        `)
        .eq("organization_id", userRecord.organization_id)
        .in("status", ["pending", "in_progress"])
        .order("scheduled_for", { ascending: true })
        .limit(30);

      if (error) throw error;
      setLastUpdate(new Date());
      return data as unknown as AgentTaskRow[];
    },
    enabled: !!userRecord?.organization_id,
    refetchInterval: 15000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!userRecord?.organization_id) return;

    const channel: RealtimeChannel = supabase
      .channel("realtime-agent-tasks-panel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_tasks",
          filter: `organization_id=eq.${userRecord.organization_id}`,
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
  }, [userRecord?.organization_id, queryClient]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey });
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient, queryKey]);

  const getAgentName = (agentType: string) =>
    AGENT_NAMES[agentType] || agentType.replace(/_/g, " ");

  const getActionDesc = (agentType: string) =>
    AGENT_ACTION_DESCRIPTIONS[agentType] || agentType.replace(/_/g, " ");

  const formatTaskLine = (task: AgentTaskRow) => {
    const leadName = task.leads?.full_name || task.leads?.phone || "Lead desconocido";
    const property = task.leads?.properties
      ? `${task.leads.properties.address}`
      : null;
    const actionDesc = getActionDesc(task.agent_type);

    return { leadName, property, actionDesc };
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

      {/* Task List */}
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-2">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin tareas programadas"
            description="Las acciones pendientes aparecen aqui"
          />
        ) : (
          <ScrollArea className="h-[calc(100vh-280px)] min-h-[400px]">
            <div className="space-y-1">
              {tasks.map((task, index) => {
                const { leadName, property, actionDesc } = formatTaskLine(task);
                const agentName = getAgentName(task.agent_type);
                const Icon = ACTION_ICONS[task.action_type] || Zap;
                const isOverdue = isPast(new Date(task.scheduled_for));
                const isInProgress = task.status === "in_progress";

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start gap-2.5 p-2.5 rounded-lg transition-all hover:bg-muted/50",
                      isInProgress && "bg-blue-50/50 border border-blue-100",
                      isOverdue && !isInProgress && "bg-amber-50/30",
                      index === 0 && "animate-fade-up"
                    )}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        isInProgress
                          ? "bg-blue-100 text-blue-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Time */}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={cn(
                            "text-xs font-mono font-semibold",
                            isOverdue && !isInProgress
                              ? "text-amber-600"
                              : "text-muted-foreground"
                          )}
                        >
                          {format(new Date(task.scheduled_for), "h:mm a")}
                        </span>
                        {isInProgress && (
                          <Badge className="h-4 px-1 text-[10px] bg-blue-500 hover:bg-blue-500">
                            EN CURSO
                          </Badge>
                        )}
                        {isOverdue && !isInProgress && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px] text-amber-600 border-amber-300"
                          >
                            PENDIENTE
                          </Badge>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm leading-snug">
                        <span
                          className={cn(
                            "font-semibold",
                            AGENT_DEPT_COLORS[task.agent_type] || "text-foreground"
                          )}
                        >
                          {agentName}
                        </span>
                        <span className="text-muted-foreground"> va a </span>
                        <span className="text-foreground">{actionDesc}</span>
                        <span className="text-muted-foreground"> a </span>
                        <span className="font-medium text-foreground">{leadName}</span>
                      </p>

                      {/* Property */}
                      {property && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {property}
                        </p>
                      )}

                      {/* Attempt info */}
                      {task.attempt_number !== null &&
                        task.max_attempts !== null &&
                        task.attempt_number > 1 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Intento {task.attempt_number}/{task.max_attempts}
                          </p>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Footer count */}
        {tasks && tasks.length > 0 && (
          <div className="pt-3 mt-2 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Mostrando {tasks.length} tarea{tasks.length !== 1 ? "s" : ""} programada{tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
