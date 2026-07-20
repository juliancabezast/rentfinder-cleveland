import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { STAGES } from "../funnel/funnelLayout";
import type { StageKey } from "../funnel/types";

interface Props {
  stageKey: StageKey;
  count: number;
  onClose: () => void;
}

export const StageDetailPanel: React.FC<Props> = ({ stageKey, count, onClose }) => {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const label = STAGES.find((s) => s.key === stageKey)?.label || stageKey;

  const { data: leads, isLoading } = useQuery({
    queryKey: ["stage-panel-leads", orgId, stageKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, phone, lead_score, created_at")
        .eq("organization_id", orgId!)
        .eq("status", stageKey)
        .not("is_demo", "is", true)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  return (
    <aside
      className="absolute top-0 right-0 h-full w-full sm:w-[380px] z-30 overflow-y-auto
        bg-white/[0.82] dark:bg-card/90 backdrop-blur-[20px] border-l shadow-xl p-5 space-y-4"
      role="dialog"
      aria-label={`Etapa ${label}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> {label}
          </h2>
          <p className="text-xs text-muted-foreground">{count.toLocaleString()} leads en esta etapa · ahora</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Más recientes</h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : leads && leads.length > 0 ? (
          <div className="space-y-1.5">
            {leads.map((l) => (
              <Link
                key={l.id}
                to={`/leads/${l.id}`}
                className="block rounded-lg bg-muted/40 hover:bg-muted/70 px-3 py-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{l.full_name || "Sin nombre"}</span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{l.phone || "sin teléfono"} · score {l.lead_score ?? 0}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin leads en esta etapa</p>
        )}
      </div>

      <Button asChild variant="outline" size="sm" className="w-full gap-2">
        <Link to="/leads">
          Ver en Leads <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </aside>
  );
};
