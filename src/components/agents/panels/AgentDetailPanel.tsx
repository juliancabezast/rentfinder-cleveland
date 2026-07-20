import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Activity, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { AgentSnapshot } from "../funnel/types";

// Legacy activity-log keys that roll up to each canonical agent (mirror of
// constants.ts LEGACY_TO_CANONICAL, inverted for the feed filter)
const FEED_KEYS: Record<string, string[]> = {
  esther: ["esther", "hemlane_parser"],
  elijah: ["elijah", "welcome_sequence", "campaign_orchestrator", "recapture", "campaign", "campaign_voice"],
  nehemiah: [
    "nehemiah", "system_logger", "task_dispatcher", "notification_dispatcher",
    "scoring", "transcript_analyst", "conversion_predictor", "insight_generator", "report_generator",
  ],
  samuel: ["samuel", "showing_confirmation", "post_showing", "no_show_followup", "no_show_follow_up", "doorloop_pull"],
  zacchaeus: ["zacchaeus", "cost_tracker", "health_monitor", "alert_monitor"],
};

// The dispatcher is the only executor that honors is_enabled — the toggle is
// only shown for agents whose work actually flows through it.
const TOGGLE_WORKS = new Set(["elijah", "samuel", "nehemiah"]);

const AGENT_BLURBS: Record<string, string> = {
  esther: "Parsea emails entrantes (Hemlane/Resend), crea y actualiza leads, y reconcilia la bandeja cada hora.",
  elijah: "Envía los emails de bienvenida y campañas vía la cola de email.",
  nehemiah: "El dispatcher: reclama y ejecuta las tareas de todos los agentes cada 5 minutos.",
  samuel: "Confirmaciones de showings por email y recordatorios por Telegram.",
  zacchaeus: "Chequea la salud de las integraciones cada hora.",
};

interface Props {
  agent: AgentSnapshot | undefined;
  onClose: () => void;
}

export const AgentDetailPanel: React.FC<Props> = ({ agent, onClose }) => {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const queryClient = useQueryClient();

  const feedKeys = agent ? FEED_KEYS[agent.key] || [agent.key] : [];

  const { data: activity, isLoading } = useQuery({
    queryKey: ["agent-panel-activity", orgId, agent?.key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_activity_log")
        .select("id, action, status, message, created_at, execution_ms")
        .eq("organization_id", orgId!)
        .in("agent_key", feedKeys)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId && !!agent,
    refetchInterval: 15_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("agents_registry")
        .update({ is_enabled: enabled })
        .eq("organization_id", orgId!)
        .eq("agent_key", agent!.key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents-funnel-live", orgId] });
      toast({ title: agent?.enabled ? "Agente pausado" : "Agente activado" });
    },
    onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  if (!agent) return null;

  return (
    <aside
      className="absolute top-0 right-0 h-full w-full sm:w-[380px] z-20 overflow-y-auto
        bg-white/[0.82] dark:bg-card/90 backdrop-blur-[20px] border-l shadow-xl p-5 space-y-4"
      role="dialog"
      aria-label={`Detalle del agente ${agent.name}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            {agent.name}
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                agent.health === "active" && "bg-success/15 text-success",
                agent.health === "error" && "bg-destructive/15 text-destructive",
                agent.health === "disabled" && "bg-muted text-muted-foreground"
              )}
            >
              {agent.health}
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{AGENT_BLURBS[agent.key]}</p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-success/10 p-2">
          <CheckCircle2 className="h-4 w-4 text-success mx-auto mb-1" />
          <p className="text-lg font-bold tabular-nums">{agent.tasks_today.completed.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">hechas hoy</p>
        </div>
        <div className="rounded-lg bg-warning/10 p-2">
          <Clock className="h-4 w-4 text-warning mx-auto mb-1" />
          <p className="text-lg font-bold tabular-nums">{agent.tasks_today.pending.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">en cola</p>
        </div>
        <div className="rounded-lg bg-destructive/10 p-2">
          <AlertTriangle className="h-4 w-4 text-destructive mx-auto mb-1" />
          <p className="text-lg font-bold tabular-nums">{agent.tasks_today.failed.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">fallidas hoy</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Última actividad:{" "}
          <span className="font-medium text-foreground">
            {agent.last_activity_at
              ? formatDistanceToNow(new Date(agent.last_activity_at), { addSuffix: true })
              : "nunca"}
          </span>
        </span>
        <span className="tabular-nums text-muted-foreground">{agent.activity_24h.toLocaleString()} acciones/24h</span>
      </div>

      {TOGGLE_WORKS.has(agent.key) ? (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Habilitado</p>
            <p className="text-xs text-muted-foreground">Pausa sus tareas en el dispatcher</p>
          </div>
          <Switch
            checked={agent.enabled}
            disabled={toggleMutation.isPending}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground rounded-lg border p-3">
          Este agente corre por webhooks/crons propios — siempre activo.
        </p>
      )}

      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <Activity className="h-3.5 w-3.5 text-primary" /> Actividad reciente
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : activity && activity.length > 0 ? (
          <div className="space-y-1.5">
            {activity.map((a) => (
              <div key={a.id} className="rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "text-xs font-medium truncate",
                    a.status === "failure" ? "text-destructive" : "text-foreground"
                  )}>
                    {a.action}
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
                {a.message && (
                  <p className="text-[11px] text-muted-foreground truncate" title={a.message}>{a.message}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin actividad en las últimas 24h</p>
        )}
      </div>
    </aside>
  );
};
