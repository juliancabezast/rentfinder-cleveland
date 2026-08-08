import React, { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Mail, Clock, ArrowDown, Plus, Trash2, ChevronUp, ChevronDown,
  Pencil, AlertTriangle, Code2, Lock, Workflow, Check, X,
} from "lucide-react";

// ── Shapes ────────────────────────────────────────────────────────────
interface Flow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  is_system: boolean;
}
interface FlowStep {
  id: string;
  flow_id: string;
  position: number;
  label: string | null;
  delay_minutes: number;
  delay_anchor: string;
  template_key: string | null;
  notification_key: string | null;
  exit_conditions: unknown;
  is_enabled: boolean;
  email_config: Record<string, unknown>;
}
interface StepStat { step_key: string; sent: number; delivered: number; opened: number }

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: "Entra un lead nuevo",
  showing_booked: "Reservan una visita",
  showing_completed: "La visita se completó",
  showing_no_show: "No asistieron",
  manual_enroll: "Inscripción manual",
};

/** Minutes → the way a person would say it. */
function humanDelay(min: number, anchor: string): string {
  const before = anchor === "before_event";
  if (min === 0) return before ? "Al momento" : "Inmediato";
  const unit =
    min % 1440 === 0 ? `${min / 1440} día${min / 1440 === 1 ? "" : "s"}`
    : min % 60 === 0 ? `${min / 60} hora${min / 60 === 1 ? "" : "s"}`
    : `${min} min`;
  return before ? `${unit} antes` : `${unit} después`;
}

// ── One step in the chain ─────────────────────────────────────────────
const StepRow: React.FC<{
  step: FlowStep;
  stat?: StepStat;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onRename: (label: string, delayMinutes: number) => void;
  busy: boolean;
}> = ({ step, stat, isFirst, isLast, onMove, onDelete, onRename, busy }) => {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(step.label || "");
  const [delay, setDelay] = useState(String(step.delay_minutes));

  const openRate = stat && stat.delivered > 0
    ? Math.round((stat.opened / stat.delivered) * 1000) / 10 : null;

  // Where this step's copy really comes from — the distinction that decides
  // whether editing the template changes anything.
  const materialised = step.email_config && Object.keys(step.email_config).length > 0;
  const source = materialised ? "flow" : step.template_key ? "template" : "code";

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-7 w-7 shrink-0 rounded-md bg-[#4F46E5]/10 flex items-center justify-center">
          <Mail className="h-3.5 w-3.5 text-[#4F46E5]" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={label} onChange={(e) => setLabel(e.target.value)}
                     className="h-8 text-sm flex-1 min-w-[140px]" placeholder="Nombre del paso" />
              <Input value={delay} onChange={(e) => setDelay(e.target.value.replace(/\D/g, ""))}
                     className="h-8 text-sm w-24" placeholder="minutos" />
              <Button size="sm" className="h-8 px-2" disabled={busy}
                      onClick={() => { onRename(label, Number(delay) || 0); setEditing(false); }}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-900">
                {step.label || `Paso ${step.position}`}
              </span>
              <Badge variant="outline" className="text-[10px] gap-1 border-slate-200 text-slate-500">
                <Clock className="h-2.5 w-2.5" /> {humanDelay(step.delay_minutes, step.delay_anchor)}
              </Badge>
            </div>
          )}

          {stat ? (
            <div className="flex flex-wrap items-baseline gap-x-3 mt-1.5 text-xs">
              <span className="font-semibold text-slate-700 tabular-nums">
                {stat.sent.toLocaleString()} <span className="font-normal text-slate-400">enviados</span>
              </span>
              {openRate !== null && (
                <span className="font-semibold text-blue-600 tabular-nums"
                      title="Aperturas sobre entregados — quien rebotó nunca tuvo chance de abrir">
                  {openRate}% <span className="font-normal text-slate-400">apertura</span>
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-1.5">Sin envíos en 60 días</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {source === "flow" && (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-200 text-emerald-700 bg-emerald-50"
                     title="El texto vive en este paso. Lo que edites acá es lo que se envía.">
                <Pencil className="h-2.5 w-2.5" /> Texto propio
              </Badge>
            )}
            {source === "template" && (
              <Badge variant="outline" className="text-[10px] gap-1 border-amber-200 text-amber-700 bg-amber-50"
                     title="Este paso usa la plantilla compartida, exactamente igual que el camino actual. Si esa plantilla nunca se guardó, el envío sale de un texto fijo en el código.">
                <Code2 className="h-2.5 w-2.5" /> Plantilla «{step.template_key}»
              </Badge>
            )}
            {source === "code" && (
              <Badge variant="outline" className="text-[10px] gap-1 border-slate-200 text-slate-500"
                     title="El texto de este paso vive dentro de la edge function; cambiarlo requiere desplegar.">
                <Lock className="h-2.5 w-2.5" /> Solo en el código
              </Badge>
            )}
            {step.template_key && (
              <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                <Link to="/leads/nurturing?tab=email_templates">Editar texto</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5 shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={isFirst || busy}
                  onClick={() => onMove(-1)} title="Subir"><ChevronUp className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={isLast || busy}
                  onClick={() => onMove(1)} title="Bajar"><ChevronDown className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy}
                  onClick={() => setEditing((v) => !v)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600"
                  disabled={busy} onClick={onDelete} title="Quitar"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
};

// ── The tab ───────────────────────────────────────────────────────────
export const FlowsTab: React.FC = () => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const orgId = userRecord?.organization_id;
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Flow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["flows", orgId],
    queryFn: async () => {
      if (!orgId) return { flows: [], steps: [], stats: {} as Record<string, StepStat> };
      const [{ data: flows }, { data: steps }, { data: statRows }] = await Promise.all([
        supabase.from("flows").select("*").eq("organization_id", orgId).order("created_at"),
        supabase.from("flow_steps").select("*").order("position"),
        supabase.rpc("report_flow_step_stats", { p_org: orgId, p_days: 60 }),
      ]);
      const stats: Record<string, StepStat> = {};
      for (const r of (statRows || []) as StepStat[]) stats[r.step_key] = r;
      return {
        flows: (flows || []) as Flow[],
        steps: (steps || []) as unknown as FlowStep[],
        stats,
      };
    },
    enabled: !!orgId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["flows", orgId] });

  const run = async (label: string, fn: () => Promise<{ error: unknown }>) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast({ title: "Error", description: String((error as { message?: string })?.message || error), variant: "destructive" });
      return;
    }
    toast({ title: label });
    refresh();
  };

  if (isLoading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>;
  }

  const flows = data?.flows || [];
  const steps = data?.steps || [];
  const stepsOf = (fid: string) => steps.filter((s) => s.flow_id === fid).sort((a, b) => a.position - b.position);
  const codeBacked = steps.filter((s) => !(s.email_config && Object.keys(s.email_config).length > 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Flujos</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            El recorrido automático de un lead, paso a paso, con lo que produjo en los últimos 60 días.
          </p>
        </div>
      </div>

      {/* Two things the owner must know before trusting this screen. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-900 space-y-1">
          <p>
            <span className="font-semibold">Los cinco flujos están importados del código y nacen inactivos.</span>{" "}
            Mientras estén apagados manda el camino actual y nada cambia. Se hizo a propósito:
            la bienvenida mueve 15.754 correos y hay 196 leads dentro del nurture.
          </p>
          <p>
            {codeBacked.length} de {steps.length} pasos toman su texto de una plantilla compartida
            o directamente del código. Cada paso lo dice en su etiqueta.
          </p>
        </div>
      </div>

      {flows.map((flow) => {
        const fsteps = stepsOf(flow.id);
        return (
          <Card key={flow.id} variant="glass">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Workflow className="h-4 w-4 text-[#4F46E5]" />
                    <h3 className="font-semibold text-slate-900">{flow.name}</h3>
                    <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">
                      {TRIGGER_LABEL[flow.trigger_type] || flow.trigger_type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${flow.is_active
                        ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                        : "border-slate-200 text-slate-400"}`}
                    >
                      {flow.is_active ? "Activo · manda este flujo" : "Inactivo · manda el camino actual"}
                    </Badge>
                  </div>
                  {flow.description && (
                    <p className="text-xs text-slate-500 mt-1 max-w-3xl">{flow.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">
                    {flow.is_active ? "Activo" : "Activar"}
                  </span>
                  <Switch
                    checked={flow.is_active}
                    disabled={busy}
                    onCheckedChange={(on) => {
                      // Turning one ON is the moment real mail changes hands, so
                      // it asks first. Turning OFF is a safety action and never
                      // gets in the way.
                      if (on) setConfirming(flow);
                      else run("Flujo desactivado", async () =>
                        supabase.from("flows").update({ is_active: false }).eq("id", flow.id));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {fsteps.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 && (
                      <div className="flex justify-center"><ArrowDown className="h-3.5 w-3.5 text-slate-300" /></div>
                    )}
                    <StepRow
                      step={s}
                      stat={s.notification_key ? data?.stats[s.notification_key] : undefined}
                      isFirst={i === 0}
                      isLast={i === fsteps.length - 1}
                      busy={busy}
                      onMove={(dir) => {
                        const other = fsteps[i + dir];
                        if (!other) return;
                        // Two-phase swap: position is UNIQUE per flow, so parking
                        // one row out of the way first avoids a constraint clash.
                        run("Paso movido", async () => {
                          const park = -1 * (s.position + 1);
                          let r = await supabase.from("flow_steps").update({ position: park }).eq("id", s.id);
                          if (r.error) return r;
                          r = await supabase.from("flow_steps").update({ position: s.position }).eq("id", other.id);
                          if (r.error) return r;
                          return supabase.from("flow_steps").update({ position: other.position }).eq("id", s.id);
                        });
                      }}
                      onDelete={() => run("Paso eliminado", async () =>
                        supabase.from("flow_steps").delete().eq("id", s.id))}
                      onRename={(label, delayMinutes) => run("Paso actualizado", async () =>
                        supabase.from("flow_steps").update({ label, delay_minutes: delayMinutes }).eq("id", s.id))}
                    />
                  </React.Fragment>
                ))}

                <Button
                  variant="outline" size="sm" className="w-full h-8 text-xs border-dashed"
                  disabled={busy}
                  onClick={() => run("Paso agregado", async () =>
                    supabase.from("flow_steps").insert({
                      flow_id: flow.id,
                      position: (fsteps[fsteps.length - 1]?.position ?? 0) + 1,
                      label: "Correo nuevo",
                      delay_minutes: 1440,
                      notification_key: "flow_custom",
                    }))}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar paso
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar «{confirming?.name}»?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A partir de ahora este flujo pasa a mandar los correos de ese disparador,
                  en vez del camino actual.
                </p>
                <p>
                  Los pasos que no editaste ejecutan <strong>exactamente la misma función</strong>{" "}
                  que hoy, así que el correo sale idéntico. Lo que cambia es el calendario:
                  se respetan las demoras y los pasos que hayas agregado.
                </p>
                <p className="text-slate-500">
                  Se puede apagar en cualquier momento, y apagarlo también corta las
                  secuencias que ya estén en curso.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const f = confirming;
                setConfirming(null);
                if (f) run("Flujo activado", async () =>
                  supabase.from("flows").update({ is_active: true }).eq("id", f.id));
              }}
            >
              Activar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FlowsTab;
