import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Bot, Boxes, Flame, Inbox, Mail, Radio, Square, Users, Zap } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFunnelData } from "@/components/agents/funnel/useFunnelData";
import { FunnelFlow2D } from "@/components/agents/funnel/FunnelFlow2D";
import { STAGES } from "@/components/agents/funnel/funnelLayout";
import { supportsWebGL } from "@/components/agents/funnel/webgl";
import { AgentDetailPanel } from "@/components/agents/panels/AgentDetailPanel";
import { StageDetailPanel } from "@/components/agents/panels/StageDetailPanel";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import type { Selection, StageKey } from "@/components/agents/funnel/types";

// The ONLY importer of three/react-three-fiber/drei → own vendor-three chunk,
// downloaded only when a WebGL-capable, motion-OK client opens /agents.
const FunnelScene = React.lazy(() => import("@/components/agents/funnel/FunnelScene"));

// Demotes to the 2D SVG view if the scene throws (WebGL context loss, driver
// quirks) — the page keeps working with the same data.
class SceneBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const VIEW_PREF_KEY = "agents-funnel-view";

const AgentsPage: React.FC = () => {
  const { snapshot, isLoading, error, live, lastEventAt, events } = useFunnelData();
  const reducedMotion = useReducedMotion();
  const [selection, setSelection] = useState<Selection>(null);
  const [viewPref, setViewPref] = useState<"3d" | "2d">(
    () => (localStorage.getItem(VIEW_PREF_KEY) === "2d" ? "2d" : "3d")
  );

  const use3D = viewPref === "3d" && supportsWebGL() && !reducedMotion;

  const setView = useCallback((v: "3d" | "2d") => {
    setViewPref(v);
    localStorage.setItem(VIEW_PREF_KEY, v);
  }, []);

  const hud = useMemo(() => {
    if (!snapshot) return null;
    const statuses = snapshot.funnel.statuses;
    // Sum only the stages the funnel renders, so the headline always matches
    // the picture (unused legacy statuses would silently inflate it).
    const inFunnel = STAGES.filter((s) => s.key !== "lost")
      .reduce((sum, s) => sum + (statuses[s.key] || 0), 0);
    const doneToday = snapshot.agents.reduce((s, a) => s + a.tasks_today.completed, 0);
    const failedToday = snapshot.agents.reduce((s, a) => s + a.tasks_today.failed, 0);
    const success = doneToday + failedToday > 0
      ? Math.round((doneToday / (doneToday + failedToday)) * 100)
      : null;
    return { inFunnel, doneToday, failedToday, success };
  }, [snapshot]);

  const selectedAgent = selection?.type === "agent"
    ? snapshot?.agents.find((a) => a.key === selection.key)
    : undefined;

  const ariaSummary = snapshot
    ? `Embudo de leads: ${STAGES.map((s) => `${s.label} ${snapshot.funnel.statuses[s.key] || 0}`).join(", ")}. ` +
      `${snapshot.agents.filter((a) => a.health === "active").length} agentes activos.`
    : "Cargando embudo";

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Agents
          </h1>
          <p className="text-sm text-muted-foreground">
            El pipeline en vivo — leads fluyendo entre etapas y los agentes que los mueven
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              "gap-1.5 text-xs",
              live ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            )}
          >
            <Radio className={cn("h-3 w-3", live && "animate-pulse")} />
            {live ? "LIVE" : "conectando…"}
          </Badge>
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant={use3D ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-none gap-1.5"
              onClick={() => setView("3d")}
              disabled={!supportsWebGL() || reducedMotion}
              title={reducedMotion ? "Deshabilitado por prefers-reduced-motion" : undefined}
            >
              <Boxes className="h-3.5 w-3.5" /> 3D
            </Button>
            <Button
              variant={!use3D ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-none gap-1.5"
              onClick={() => setView("2d")}
            >
              <Square className="h-3.5 w-3.5" /> 2D
            </Button>
          </div>
        </div>
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
                <Flame className="h-4 w-4 text-accent-foreground" />
                <span className="font-bold tabular-nums">{snapshot.funnel.hot}</span>
                <span className="text-muted-foreground">hot</span>
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
                  <span className="text-xs text-destructive">
                    {snapshot.flows.emails_bounced_24h} rebotes
                  </span>
                )}
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {snapshot.integrations.map((i) => (
                  <span key={i.service} className="flex items-center gap-1" title={`${i.service}: ${i.status}`}>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        i.status === "healthy" ? "bg-success" : "bg-destructive animate-pulse"
                      )}
                    />
                    {i.service}
                  </span>
                ))}
                {lastEventAt && (
                  <span className="tabular-nums">último evento {format(lastEventAt, "HH:mm:ss")}</span>
                )}
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

      {/* ── The funnel ─────────────────────────────────────── */}
      <div
        className="relative rounded-2xl border bg-white/40 dark:bg-card/40 backdrop-blur-sm overflow-hidden
          h-[calc(100vh-320px)] min-h-[440px]"
        role="img"
        aria-label={ariaSummary}
      >
        {isLoading || !snapshot ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-24 rounded-full" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          </div>
        ) : use3D ? (
          <SceneBoundary
            fallback={
              <FunnelFlow2D
                snapshot={snapshot}
                selection={selection}
                onSelect={setSelection}
                animated={!reducedMotion}
                className="absolute inset-0"
              />
            }
          >
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  Cargando escena 3D…
                </div>
              }
            >
              <FunnelScene
                snapshot={snapshot}
                events={events}
                selection={selection}
                onSelect={setSelection}
                className="absolute inset-0"
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          <FunnelFlow2D
            snapshot={snapshot}
            selection={selection}
            onSelect={setSelection}
            animated={!reducedMotion}
            className="absolute inset-0"
          />
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

      {/* Screen-reader mirror + keyboard access to nodes */}
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
            Abrir detalle de {a.name}
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
