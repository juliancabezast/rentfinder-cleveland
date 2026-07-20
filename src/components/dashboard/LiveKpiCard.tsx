import React from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveNumber } from "./LiveNumber";
import type { Flash } from "@/hooks/useDashboardLive";
import { cn } from "@/lib/utils";

export interface SubStat {
  label: string;
  value: string;
  tone?: "default" | "up" | "down" | "hot" | "success" | "warning";
  icon?: LucideIcon;
}

type Accent = "indigo" | "amber" | "violet" | "sky";

const ACCENT: Record<Accent, { border: string; iconBg: string; icon: string }> = {
  indigo: { border: "border-l-indigo-400/70", iconBg: "bg-indigo-500/10", icon: "text-indigo-500" },
  amber: { border: "border-l-amber-400/80", iconBg: "bg-amber-500/10", icon: "text-amber-500" },
  violet: { border: "border-l-violet-400/70", iconBg: "bg-violet-500/10", icon: "text-violet-500" },
  sky: { border: "border-l-sky-400/70", iconBg: "bg-sky-500/10", icon: "text-sky-500" },
};

const TONE: Record<NonNullable<SubStat["tone"]>, string> = {
  default: "text-foreground",
  up: "text-success",
  down: "text-destructive",
  hot: "text-amber-500",
  success: "text-success",
  warning: "text-warning",
};

interface Props {
  title: string;
  icon: LucideIcon;
  value: number;
  format?: (n: number) => string;
  accent: Accent;
  subs: SubStat[];
  flash?: Flash;
  flashLabel?: string;
  onClick?: () => void;
  loading?: boolean;
}

export const LiveKpiCard: React.FC<Props> = ({
  title, icon: Icon, value, format, accent, subs, flash, flashLabel, onClick, loading,
}) => {
  const a = ACCENT[accent];

  if (loading) {
    return (
      <Card variant="glass" className={cn("overflow-hidden border-l-[3px]", a.border)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-9 w-24 mb-3" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="glass"
      onClick={onClick}
      className={cn(
        "relative overflow-hidden border-l-[3px] group transition-all",
        a.border,
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5"
      )}
    >
      {/* Floating +N flash */}
      {flash && (
        <span
          key={flash.id}
          className="dash-flash pointer-events-none absolute right-4 top-12 z-10 text-sm font-bold text-success"
        >
          +{flash.n.toLocaleString()}{flashLabel ? ` ${flashLabel}` : ""}
        </span>
      )}

      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("p-2.5 rounded-xl transition-colors", a.iconBg)}>
            <Icon className={cn("h-5 w-5", a.icon)} />
          </div>
        </div>

        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>

        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2.5">
          <LiveNumber value={value} format={format} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {subs.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {s.icon && <s.icon className={cn("h-3.5 w-3.5", TONE[s.tone ?? "default"])} />}
              <span className={cn("font-semibold tabular-nums", TONE[s.tone ?? "default"])}>{s.value}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
