import React, { useEffect, useMemo, useState } from "react";
import { Bot, Inbox, Mail, Radio, Users, Zap } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnelData } from "@/components/agents/funnel/useFunnelData";
import { STAGES } from "@/components/agents/funnel/funnelLayout";
import { AgentsOffice } from "@/components/agents/office/AgentsOffice";
import { AgentDetailPanel } from "@/components/agents/panels/AgentDetailPanel";
import { StageDetailPanel } from "@/components/agents/panels/StageDetailPanel";
import { getAgentDisplayName } from "@/components/agents/constants";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import type { Selection, StageKey } from "@/components/agents/funnel/types";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface TickerItem {
  id: number;
  text: string;
  tone: "new" | "ok" | "fail";
}

const AgentsPage: React.FC = () => {
  const { snapshot, isLoading, error, live, lastEventAt, events } = useFunnelData();
  const reducedMotion = useReducedMotion();
  const [selection, setSelection] = useState<Selection>(null);

  // Live event ticker — the "it's really real-time" strip over the office
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  useEffect(() => {
    let id = 0;
    return events.onEvent((ev) => {
      const name = ev.type === "lead_new" ? "" : getAgentDisplayName(ev.agentKey, cap(ev.agentKey), "");
      const item: TickerItem =
        ev.type === "lead_new"
          ? { id: ++id, text: ev.magnitude > 1 ? `🆕 +${ev.magnitude} leads nuevos` : "🆕 Lead nuevo", tone: "new" }
          : ev.type === "task_completed"
            ? { id: ++id, text: `✓ ${name}${ev.magnitude > 1 ? ` +${ev.magnitude} tareas` : " completó una tarea"}`, tone: "ok" }
            : { id: ++id, text: `${ev.failed ? "⚠️" : "⚡"} ${name} ${ev.failed ? "falló" : "en acción"}`, tone: ev.failed ? "fail" : "ok" };
      setTicker((prev) => [item, ...prev].slice(0, 4));
    });
  }, [events]);
  useEffect(() => {
    if (ticker.length === 0) return;
    const t = setTimeout(() => setTicker((prev) => prev.slice(0, -1)), 6_000);
    return () => clearTimeout(t);
  }, [ticker]);

  const hud = useMemo(() => {
    if (!snapshot) return null;
    const statuses = snapshot.funnel.statuses;
    const inFunnel = STAGES.filter((s) => s.key !== "lost").reduce((sum, s) => sum + (statuses[s.key] || 0), 0);
    const doneToday = snapshot.agents.reduce((s, a) => s + a.tasks_today.completed, 0);
    const failedToday = snapshot.agents.reduce((s, a) => s + a.tasks_today.failed, 0);
    const success = doneToday + failedToday > 0 ? Math.round((doneToday / (doneToday + failedToday)) * 100) : null;
    return { inFunnel, doneToday, failedToday, success };
  }, [snapshot]);

  const selectedAgent = selection?.type === "agent" ? snapshot?.agents.find((a) => a.key === selection.key) : undefined;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            La Fábrica de Agentes <span aria-hidden>🍫</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu oficina de IA en vivo — cada agente trabajando en tiempo real. Hacé clic en uno para ver sus tareas.
          </p>
        </div>
        <Badge
          variant="secondary"
          className={cn("gap-1.5 text-xs", live ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}
        >
          <Radio className={cn("h-3 w-3", live && "animate-pulse")} />
          {live ? "LIVE" : "conectando…"}
        </Badge>
      </div>

      {/* ── HUD strip ──────────────────────────────────────── */}
      <Card variant="glass">
        <CardContent className="p-3">
          {isLoading || !snapshot || !hud ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-bold tabular-nums">{hud.inFunnel.toLocaleString()}</span>
                <span className="text-muted-foreground">en el funnel</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-success" />
                <span className="font-bold tabular-nums">{hud.doneToday.toLocaleString()}</span>
                <span className="text-muted-foreground">tareas hoy</span>
                {hud.success != null && (
                  <span className={cn("text-xs", hud.failedToday > 0 ? "text-warning" : "text-muted-foreground")}>
                    ({hud.success}% ok)
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Inbox className="h-4 w-4 text-info" />
                <span className="font-bold tabular-nums">{snapshot.queues.tasks_pending.toLocaleString()}</span>
                <span className="text-muted-foreground">en cola</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-bold tabular-nums">{snapshot.flows.emails_sent_24h.toLocaleString()}</span>
                <span className="text-muted-foreground">emails/24h</span>
                {snapshot.flows.emails_bounced_24h > 0 && (
                  <span className="text-xs text-destructive">{snapshot.flows.emails_bounced_24h} rebotes</span>
                )}
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {snapshot.integrations.map((i) => (
                  <span key={i.service} className="flex items-center gap-1" title={`${i.service}: ${i.status}`}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", i.status === "healthy" ? "bg-success" : "bg-destructive animate-pulse")} />
                    {i.service}
                  </span>
                ))}
                {lastEventAt && <span className="tabular-nums">último evento {format(lastEventAt, "HH:mm:ss")}</span>}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {error != null && (
        <Card variant="glass" className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Error cargando el estado de los agentes"}
          </CardContent>
        </Card>
      )}

      {/* ── The office ─────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-[#3a2416] overflow-hidden h-[calc(100vh-210px)] min-h-[520px] bg-[#180f09] shadow-[inset_0_1px_0_rgba(255,208,120,0.08)]">
        <AgentsOffice
          snapshot={snapshot}
          events={events}
          selection={selection}
          onSelect={setSelection}
          reducedMotion={reducedMotion}
        />

        {/* Live event ticker */}
        {ticker.length > 0 && (
          <div className="absolute bottom-3 left-3 z-20 flex flex-col-reverse gap-1.5 pointer-events-none">
            {ticker.map((t) => (
              <span
                key={t.id}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-md shadow-sm animate-fade-up bg-white/85 border",
                  t.tone === "new" && "text-primary border-primary/30",
                  t.tone === "ok" && "text-success border-success/30",
                  t.tone === "fail" && "text-destructive border-destructive/30"
                )}
              >
                {t.text}
              </span>
            ))}
          </div>
        )}

        {/* Detail panels */}
        {selection?.type === "agent" && selectedAgent && (
          <AgentDetailPanel agent={selectedAgent} onClose={() => setSelection(null)} />
        )}
        {selection?.type === "stage" && snapshot && (
          <StageDetailPanel
            stageKey={selection.key}
            count={snapshot.funnel.statuses[selection.key] || 0}
            onClose={() => setSelection(null)}
          />
        )}
      </div>

      {/* Screen-reader mirror + keyboard access to agents/stages */}
      <div className="sr-only">
        <dl>
          {STAGES.map((s) => (
            <React.Fragment key={s.key}>
              <dt>{s.label}</dt>
              <dd>{snapshot?.funnel.statuses[s.key] || 0} leads</dd>
            </React.Fragment>
          ))}
        </dl>
        {snapshot?.agents.map((a) => (
          <button key={a.key} onClick={() => setSelection({ type: "agent", key: a.key })}>
            Abrir detalle de {getAgentDisplayName(a.key, a.name, a.role)}
          </button>
        ))}
        {STAGES.map((s) => (
          <button key={s.key} onClick={() => setSelection({ type: "stage", key: s.key as StageKey })}>
            Abrir etapa {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentsPage;
