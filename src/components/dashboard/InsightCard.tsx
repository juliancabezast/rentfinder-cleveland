import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingDown,
  TrendingUp,
  DollarSign,
  MapPin,
  Lightbulb,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type InsightType =
  | "lead_loss_reason"
  | "pricing_feedback"
  | "location_feedback"
  | "feature_request"
  | "competitive_insight"
  | "seasonal_trend"
  | "recommendation";

interface InsightCardProps {
  insight: {
    id: string;
    insight_type: InsightType;
    headline: string;
    narrative: string;
    confidence_score?: number | null;
    is_highlighted?: boolean;
    period_start?: string;
    period_end?: string;
  };
  loading?: boolean;
}

const insightConfig: Record<
  InsightType,
  { icon: React.ElementType; color: string; label: string }
> = {
  lead_loss_reason: { icon: TrendingDown, color: "text-red-500", label: "Lead Loss" },
  pricing_feedback: { icon: DollarSign, color: "text-amber-500", label: "Pricing" },
  location_feedback: { icon: MapPin, color: "text-blue-500", label: "Location" },
  feature_request: { icon: Lightbulb, color: "text-purple-500", label: "Feature" },
  competitive_insight: { icon: AlertCircle, color: "text-orange-500", label: "Competition" },
  seasonal_trend: { icon: TrendingUp, color: "text-green-500", label: "Trend" },
  recommendation: { icon: Sparkles, color: "text-accent", label: "Recommendation" },
};

export const InsightCard = ({ insight, loading = false }: InsightCardProps) => {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const config = insightConfig[insight.insight_type] || insightConfig.recommendation;
  const Icon = config.icon;

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        insight.is_highlighted && "border-accent border-2"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", config.color)} />
            <Badge variant="outline" className="text-xs">
              {config.label}
            </Badge>
          </div>
          {insight.confidence_score && (
            <span className="text-xs text-muted-foreground">
              {Math.round(insight.confidence_score * 100)}% confidence
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-base mb-2">{insight.headline}</CardTitle>
        <p className="text-sm text-muted-foreground">{insight.narrative}</p>
        {insight.period_start && insight.period_end && (
          <p className="text-xs text-muted-foreground mt-2">
            Period: {insight.period_start} — {insight.period_end}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export const InsightCardSkeleton = () => (
  <InsightCard
    insight={{
      id: "",
      insight_type: "recommendation",
      headline: "",
      narrative: "",
    }}
    loading
  />
);
