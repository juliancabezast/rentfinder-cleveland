import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, Users, Calendar, ChevronDown, Check, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface PropertyInterest {
  property_id: string;
  address: string;
  city: string;
  lead_count: number;
}

type InterestRange = "3d" | "week" | "month" | "all";

const RANGE_OPTIONS: { value: InterestRange; label: string }[] = [
  { value: "3d", label: "3 días" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "all", label: "Histórico" },
];

const RANK_COLORS = [
  "bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm ring-1 ring-amber-500/20", // gold
  "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm ring-1 ring-slate-400/20", // silver
  "bg-gradient-to-br from-orange-400 to-amber-600 text-white shadow-sm ring-1 ring-amber-600/20", // bronze
];

export const TopPropertiesWidget: React.FC = () => {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const [range, setRange] = useState<InterestRange>("3d");

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["top-properties-by-interest", orgId, range],
    queryFn: async (): Promise<PropertyInterest[]> => {
      const { data, error } = await supabase.rpc("top_properties_by_interest", {
        p_limit: 5,
        p_range: range,
      });
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        property_id: r.property_id,
        address: r.address,
        city: r.city,
        lead_count: Number(r.lead_count) || 0,
      }));
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const activeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "3 días";

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Top propiedades por interés
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Cambiar rango"
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 py-1 pl-2.5 pr-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur transition-all",
                  "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                  "data-[state=open]:border-primary/50 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
                )}
              >
                <Calendar className="h-3.5 w-3.5 opacity-70" />
                {activeLabel}
                <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[9rem]">
              {RANGE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className={cn(
                    "cursor-pointer justify-between gap-4 text-sm",
                    range === opt.value && "font-semibold text-primary"
                  )}
                >
                  {opt.label}
                  {range === opt.value && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          // A failed RPC must NOT masquerade as "zero interest" — that empty
          // state lies. Surface the error like the LeadsPulse WifiOff branch.
          <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-muted-foreground">
            <WifiOff className="h-4 w-4" />
            <p className="text-xs">No se pudieron cargar los datos — reintentando…</p>
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin interés en propiedades en este rango
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((item, index) => (
              <div
                key={item.property_id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0",
                    RANK_COLORS[index] || "bg-muted text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.address}</p>
                  <p className="text-xs text-muted-foreground">{item.city}</p>
                </div>
                <div className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full shrink-0">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-sm font-semibold">{item.lead_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
