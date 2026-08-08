import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Send, Clock, ArrowDown, UserPlus, CalendarCheck, CheckCircle2,
  Ghost, Repeat, Pencil, AlertTriangle, Code2,
} from "lucide-react";
import {
  LEAD_FLOW, allFlowSteps, COPY_SOURCE_LABEL, COPY_SOURCE_HELP,
  type FlowStep, type FlowBranch,
} from "@/lib/leadFlow";

interface StepStat {
  step_key: string;
  sent: number;
  delivered: number;
  opened: number;
  last_sent_at: string | null;
}

const BRANCH_ICON: Record<string, React.ElementType> = {
  booked: CalendarCheck,
  showed: CheckCircle2,
  no_show: Ghost,
  nurture: Repeat,
};

const BRANCH_TONE: Record<FlowBranch["tone"], string> = {
  positive: "border-emerald-200 bg-emerald-50/40",
  neutral: "border-slate-200 bg-slate-50/40",
  warning: "border-amber-200 bg-amber-50/40",
};

/** A single step card, with the numbers it actually produced. */
const StepCard: React.FC<{ step: FlowStep; stat?: StepStat }> = ({ step, stat }) => {
  const openRate = stat && stat.delivered > 0
    ? Math.round((stat.opened / stat.delivered) * 1000) / 10
    : null;
  const ChannelIcon = step.channel === "telegram" ? Send : Mail;
  const isCode = step.copySource !== "saved-template";

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-7 w-7 shrink-0 rounded-md bg-[#4F46E5]/10 flex items-center justify-center">
          <ChannelIcon className="h-3.5 w-3.5 text-[#4F46E5]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-900">{step.label}</span>
            <Badge variant="outline" className="text-[10px] gap-1 border-slate-200 text-slate-500">
              <Clock className="h-2.5 w-2.5" /> {step.delay}
            </Badge>
            {step.channel === "telegram" && (
              <Badge variant="outline" className="text-[10px] border-sky-200 text-sky-600">
                al equipo, no al inquilino
              </Badge>
            )}
          </div>

          <p className="text-xs text-slate-500 mt-1">{step.trigger}</p>

          {/* What it really produced */}
          {stat ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-2 text-xs">
              <span className="font-semibold text-slate-700 tabular-nums">
                {stat.sent.toLocaleString()} <span className="font-normal text-slate-400">enviados</span>
              </span>
              <span className="font-semibold text-emerald-600 tabular-nums">
                {stat.delivered.toLocaleString()} <span className="font-normal text-slate-400">entregados</span>
              </span>
              {openRate !== null && (
                <span
                  className="font-semibold text-blue-600 tabular-nums"
                  title="Aperturas sobre entregados — quien rebotó nunca tuvo chance de abrir"
                >
                  {openRate}% <span className="font-normal text-slate-400">apertura</span>
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-2">Sin envíos en los últimos 60 días</p>
          )}

          {/* Where the copy really comes from — the honest bit */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge
              variant="outline"
              className={`text-[10px] gap-1 ${
                isCode
                  ? "border-amber-200 text-amber-700 bg-amber-50"
                  : "border-emerald-200 text-emerald-700 bg-emerald-50"
              }`}
              title={COPY_SOURCE_HELP[step.copySource]}
            >
              {isCode ? <Code2 className="h-2.5 w-2.5" /> : <Pencil className="h-2.5 w-2.5" />}
              {COPY_SOURCE_LABEL[step.copySource]}
            </Badge>
            {step.templateKey && (
              <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                <Link to="/leads/nurturing?tab=email_templates">Editar texto</Link>
              </Button>
            )}
          </div>

          {step.exits && step.exits.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {step.exits.map((e) => (
                <li key={e} className="text-[11px] text-slate-400 flex items-start gap-1">
                  <span className="mt-[3px] h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[10px] text-slate-300 mt-2 font-mono truncate" title={step.source}>
            {step.source}
          </p>
        </div>
      </div>
    </div>
  );
};

const Connector: React.FC = () => (
  <div className="flex justify-center py-1.5">
    <ArrowDown className="h-4 w-4 text-slate-300" />
  </div>
);

export const FlowsTab: React.FC = () => {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ["flow-step-stats", orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data, error } = await supabase.rpc("report_flow_step_stats", {
        p_org: orgId,
        p_days: 60,
      });
      if (error) throw error;
      const byKey: Record<string, StepStat> = {};
      for (const r of (data || []) as StepStat[]) byKey[r.step_key] = r;
      return byKey;
    },
    enabled: !!orgId,
  });

  const statFor = (s: FlowStep) => (s.notificationKey ? stats?.[s.notificationKey] : undefined);
  const codeOnlySteps = allFlowSteps().filter((s) => s.copySource !== "saved-template");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Qué le pasa a un lead</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          El recorrido automático real, con lo que produjo en los últimos 60 días.
          Solo aparece lo que el sistema hace de verdad hoy.
        </p>
      </div>

      {/* The honesty banner — without it the map would imply the editor is in charge */}
      {codeOnlySteps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900">
            <span className="font-semibold">
              {codeOnlySteps.length} de {allFlowSteps().length} pasos no salen de la plantilla que ves en el editor.
            </span>{" "}
            Su texto está fijo en el código, así que editarlo en pantalla no cambia lo que se envía
            hasta que guardes esa plantilla al menos una vez. Cada paso lo dice en su etiqueta.
          </div>
        </div>
      )}

      {/* Entry */}
      <Card variant="glass">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-[#4F46E5] flex items-center justify-center">
              <UserPlus className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{LEAD_FLOW.entry.label}</p>
              <p className="text-xs text-slate-500">{LEAD_FLOW.entry.sources.join(" · ")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Connector />

      {/* Steps every lead gets */}
      <div className="space-y-2">
        {LEAD_FLOW.common.map((s) => <StepCard key={s.id} step={s} stat={statFor(s)} />)}
      </div>

      <Connector />

      {/* Branches */}
      <div className="grid gap-3 lg:grid-cols-2">
        {LEAD_FLOW.branches.map((b) => {
          const Icon = BRANCH_ICON[b.id] || Repeat;
          return (
            <div key={b.id} className={`rounded-xl border p-3 ${BRANCH_TONE[b.tone]}`}>
              <div className="flex items-center gap-2 mb-2.5">
                <Icon className="h-4 w-4 text-slate-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900">{b.label}</p>
                  <p className="text-[11px] text-slate-500">{b.condition}</p>
                </div>
              </div>
              <div className="space-y-2">
                {b.steps.map((s) => <StepCard key={s.id} step={s} stat={statFor(s)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FlowsTab;
