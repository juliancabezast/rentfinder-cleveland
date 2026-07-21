import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClipboardList, Phone, Flame } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Kanban stages ─────────────────────────────────────────────────────
type Stage = "pending" | "sent" | "in_progress" | "submitted" | "approved" | "rejected";

const STAGES: { key: Stage; label: string; dot: string; ring: string }[] = [
  { key: "pending", label: "Pendiente", dot: "bg-amber-500", ring: "ring-amber-400" },
  { key: "sent", label: "Aplicación enviada", dot: "bg-blue-500", ring: "ring-blue-400" },
  { key: "in_progress", label: "En proceso", dot: "bg-indigo-500", ring: "ring-indigo-400" },
  { key: "submitted", label: "Enviada por el lead", dot: "bg-violet-500", ring: "ring-violet-400" },
  { key: "approved", label: "Aprobado", dot: "bg-emerald-500", ring: "ring-emerald-400" },
  { key: "rejected", label: "Rechazado", dot: "bg-red-500", ring: "ring-red-400" },
];
const STAGE_KEYS = new Set(STAGES.map((s) => s.key));
const normStage = (s: string | null): Stage => (s && STAGE_KEYS.has(s as Stage) ? (s as Stage) : "pending");

interface RequestLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  request_stage: string | null;
  application_requested_at: string;
  created_at: string;
  is_priority: boolean | null;
  status: string | null;
}

function prettySource(s: string | null): string {
  if (!s) return "—";
  const map: Record<string, string> = {
    hemlane_email: "Hemlane", hemlane: "Hemlane", manual: "Manual", website: "Sitio web",
    zillow: "Zillow", facebook: "Facebook", referral: "Referido", apartments: "Apartments",
    rent: "Rent", zumper: "Zumper", unknown: "Otro",
  };
  return map[s] || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Card ──────────────────────────────────────────────────────────────
const RequestCard: React.FC<{
  lead: RequestLead;
  onDragStart: (e: React.DragEvent, lead: RequestLead) => void;
  onDragEnd: () => void;
  dragging: boolean;
}> = ({ lead, onDragStart, onDragEnd, dragging }) => {
  const navigate = useNavigate();
  const movedRef = React.useRef(false);
  return (
    <div
      draggable
      onDragStart={(e) => { movedRef.current = true; onDragStart(e, lead); }}
      onDragEnd={() => { onDragEnd(); setTimeout(() => (movedRef.current = false), 0); }}
      onClick={() => { if (!movedRef.current) navigate(`/leads/${lead.id}`); }}
      className={cn(
        "group cursor-pointer rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm backdrop-blur transition-all hover:shadow-md hover:border-primary/30 active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1.5">
        <p className="flex-1 truncate text-sm font-semibold text-slate-900">
          {lead.full_name || "Sin nombre"}
        </p>
        {lead.is_priority && <Flame className="h-3.5 w-3.5 shrink-0 text-amber-500" title="Hot" />}
      </div>
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 inline-flex items-center gap-1 text-xs text-[#4F46E5] hover:underline"
        >
          <Phone className="h-3 w-3" />
          {lead.phone}
        </a>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          {prettySource(lead.source)}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(lead.application_requested_at), { addSuffix: true, locale: es })}
        </span>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────
const RequestsKanban: React.FC = () => {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["requests-kanban", orgId];

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<RequestLead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, phone, email, source, request_stage, application_requested_at, created_at, is_priority, status")
        .eq("organization_id", orgId!)
        .not("application_requested_at", "is", null)
        .order("application_requested_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as RequestLead[]) || [];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // Realtime: any lead change → refetch (keeps the board live across devices)
  useEffect(() => {
    if (!orgId) return;
    const channel: RealtimeChannel = supabase
      .channel("requests-kanban-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `organization_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, queryClient]);

  const byStage = useMemo(() => {
    const m: Record<Stage, RequestLead[]> = {
      pending: [], sent: [], in_progress: [], submitted: [], approved: [], rejected: [],
    };
    for (const l of data) m[normStage(l.request_stage)].push(l);
    return m;
  }, [data]);

  const handleDragStart = (e: React.DragEvent, lead: RequestLead) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.id);
    setDraggingId(lead.id);
  };

  const handleDrop = async (stage: Stage) => {
    const leadId = draggingId;
    setDraggingId(null);
    setOverStage(null);
    if (!leadId) return;
    const lead = data.find((l) => l.id === leadId);
    if (!lead || normStage(lead.request_stage) === stage) return;

    // Optimistic move
    const prev = queryClient.getQueryData<RequestLead[]>(queryKey);
    queryClient.setQueryData<RequestLead[]>(queryKey, (old) =>
      (old || []).map((l) => (l.id === leadId ? { ...l, request_stage: stage } : l)),
    );

    const { error } = await supabase.from("leads").update({ request_stage: stage }).eq("id", leadId);
    if (error) {
      queryClient.setQueryData(queryKey, prev); // revert
      toast({ title: "No se pudo mover", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-6 w-6 text-[#4F46E5]" />
            Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Personas que pidieron que les enviemos aplicación
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{data.length}</span> en el tablero
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((s) => (
            <div key={s.key} className="min-w-[248px] flex-1 space-y-2 rounded-xl bg-muted/30 p-2">
              <Skeleton className="h-6 w-32" />
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card variant="glass">
          <EmptyState
            icon={ClipboardList}
            title="Sin requests todavía"
            description="Cuando un lead pida que le enviemos una aplicación, aparece acá como Pendiente."
          />
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {STAGES.map((stage) => {
            const cards = byStage[stage.key];
            const isOver = overStage === stage.key;
            return (
              <div
                key={stage.key}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overStage !== stage.key) setOverStage(stage.key); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage((s) => (s === stage.key ? null : s)); }}
                onDrop={() => handleDrop(stage.key)}
                className={cn(
                  "flex min-w-[248px] flex-1 flex-col rounded-xl bg-muted/30 p-2 transition-all",
                  isOver && `ring-2 ring-offset-1 ${stage.ring} bg-muted/60`,
                )}
              >
                {/* Column header */}
                <div className="mb-2 flex items-center gap-2 px-1.5 py-1">
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", stage.dot)} />
                  <span className="truncate text-sm font-semibold text-slate-700">{stage.label}</span>
                  <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {cards.length}
                  </span>
                </div>
                {/* Column body */}
                <div className="flex-1 space-y-2 overflow-y-auto pr-0.5 max-h-[calc(100vh-16rem)]">
                  {cards.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">—</p>
                  ) : (
                    cards.map((lead) => (
                      <RequestCard
                        key={lead.id}
                        lead={lead}
                        dragging={draggingId === lead.id}
                        onDragStart={handleDragStart}
                        onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RequestsKanban;
