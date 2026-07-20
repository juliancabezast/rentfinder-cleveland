import React from "react";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { OverviewFunnel, OverviewMilestones } from "@/hooks/useAnalytics";

// Milestone ladder — keep in sync with ScoreDisplay.getMilestoneLabel and
// ScoringTab MILESTONES (the ladder is duplicated by design; change together).
const STAGES: {
  key: keyof OverviewFunnel;
  label: string;
  hint: string;
  colorClass: string;
  barColor: string;
}[] = [
  { key: "total", label: "Leads", hint: "todos en el rango", colorClass: "text-muted-foreground", barColor: "hsl(var(--muted-foreground) / 0.35)" },
  { key: "ge10", label: "Intentó+", hint: "score ≥ 10", colorClass: "text-info", barColor: "hsl(var(--info))" },
  { key: "ge50", label: "Agendó+", hint: "score ≥ 50 · hot", colorClass: "text-primary", barColor: "hsl(var(--primary))" },
  { key: "ge80", label: "Asistió+", hint: "score ≥ 80", colorClass: "text-accent-foreground", barColor: "hsl(var(--accent))" },
  { key: "eq100", label: "Aplicó", hint: "score = 100", colorClass: "text-success", barColor: "hsl(var(--success))" },
];

const DIST_TIERS: { key: keyof OverviewMilestones; label: string }[] = [
  { key: "m0", label: "Normal" },
  { key: "m10", label: "Intentó" },
  { key: "m50", label: "Agendó" },
  { key: "m80", label: "Asistió" },
  { key: "m100", label: "Aplicó" },
];

interface MilestoneFunnelProps {
  funnel?: OverviewFunnel;
  milestones?: OverviewMilestones;
  loading?: boolean;
}

export const MilestoneFunnel: React.FC<MilestoneFunnelProps> = ({
  funnel,
  milestones,
  loading = false,
}) => {
  const total = funnel?.total ?? 0;

  return (
    <Card variant="glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Embudo de hitos
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            alcanzó alguna vez
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada barra cuenta leads que llegaron al menos a ese hito. Aplicó puede
          superar a Asistió: aplicar no requiere showing previo.
        </p>
      </CardHeader>
      <CardContent>
        {loading || !funnel ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <div
            role="img"
            aria-label={`Embudo de hitos: ${total} leads, ${funnel.ge10} intentaron, ${funnel.ge50} agendaron, ${funnel.ge80} asistieron, ${funnel.eq100} aplicaron`}
            className="space-y-3"
          >
            {STAGES.map((stage) => {
              const count = funnel[stage.key] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={stage.key} className="space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className={`font-semibold ${stage.colorClass}`}>
                      {stage.label}
                      <span className="ml-1.5 font-normal text-muted-foreground">{stage.hint}</span>
                    </span>
                    <span className="font-bold tabular-nums">
                      {count.toLocaleString()}
                      <span className="ml-1 font-normal text-muted-foreground">
                        {total > 0 ? `${pct < 1 && count > 0 ? pct.toFixed(1) : Math.round(pct)}%` : "—"}
                      </span>
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: count > 0 ? `${Math.max(pct, 1.5)}%` : "0%",
                        backgroundColor: stage.barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {milestones && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {DIST_TIERS.map((tier) => (
                  <div key={tier.key} className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">{tier.label}:</span>
                    <span className="font-semibold tabular-nums">
                      {(milestones[tier.key] ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
