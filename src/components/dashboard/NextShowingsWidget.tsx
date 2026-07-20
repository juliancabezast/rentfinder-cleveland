import React from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight, Clock, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { DashboardLive } from "@/hooks/useDashboardLive";

const NY = "America/New_York";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const nyToday = new Date(new Date().toLocaleString("en-US", { timeZone: NY }));
  nyToday.setHours(0, 0, 0, 0);
  const nyD = new Date(d.toLocaleString("en-US", { timeZone: NY }));
  nyD.setHours(0, 0, 0, 0);
  const diff = Math.round((nyD.getTime() - nyToday.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return d.toLocaleDateString("en-US", { timeZone: NY, weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" });
}

interface Props {
  showings: DashboardLive["next_showings"] | undefined;
  loading?: boolean;
}

export const NextShowingsWidget: React.FC<Props> = ({ showings, loading }) => {
  const navigate = useNavigate();
  const list = (showings ?? []).slice(0, 5);

  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-500/10">
            <Calendar className="h-4 w-4 text-amber-500" />
          </span>
          Próximos showings
          {!loading && list.length > 0 && (
            <Badge variant="secondary" className="text-xs">{list.length}</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate("/showings")}>
          Ver todos <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="Sin showings próximos"
            description="Agendá uno desde un lead o el bot de Telegram"
            action={{ label: "Ir a Showings", onClick: () => navigate("/showings") }}
          />
        ) : (
          <div className="relative">
            {/* timeline spine */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />
            <div className="space-y-2.5">
              {list.map((s) => {
                const confirmed = s.status === "confirmed";
                const addr = s.property_address
                  ? `${s.property_address}${s.unit_number ? ` · ${s.unit_number}` : ""}`
                  : "Propiedad sin definir";
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate("/showings")}
                    className="group relative flex w-full items-center gap-3 rounded-xl px-2 py-2.5 -mx-2 text-left transition-colors hover:bg-muted/50"
                  >
                    {/* timeline node */}
                    <span className="relative z-[1] shrink-0">
                      <span className={cn(
                        "block h-3.5 w-3.5 rounded-full ring-4 ring-background",
                        confirmed ? "bg-success" : "bg-primary"
                      )} />
                    </span>

                    {/* time block */}
                    <div className="shrink-0 w-[74px] text-center">
                      <p className="text-xs font-bold text-foreground leading-tight">{dayLabel(s.scheduled_at)}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-0.5">
                        <Clock className="h-3 w-3" />{timeLabel(s.scheduled_at)}
                      </p>
                    </div>

                    {/* details */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{s.lead_name || "Lead sin nombre"}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />{addr}
                      </p>
                    </div>

                    {/* right meta */}
                    <div className="shrink-0 text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px]",
                          confirmed ? "border-success/40 text-success" : "border-primary/40 text-primary"
                        )}
                      >
                        {confirmed ? "Confirmado" : "Agendado"}
                      </Badge>
                      {s.lead_phone && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-end gap-0.5">
                          <Phone className="h-2.5 w-2.5" />{s.lead_phone}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
