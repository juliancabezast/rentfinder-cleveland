import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface PredictionFactor {
  factor: string;
  impact: string;
  direction: "positive" | "negative";
}

export interface LeadPrediction {
  id: string;
  lead_id: string;
  conversion_probability: number;
  predicted_days_to_convert: number | null;
  predicted_outcome: "likely_convert" | "needs_nurturing" | "likely_lost" | "insufficient_data";
  factors: PredictionFactor[];
  model_version: string;
  based_on_leads_count: number | null;
  predicted_at: string;
  expires_at: string;
}

interface PredictionCardProps {
  prediction: LeadPrediction | null;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const getOutcomeConfig = (outcome: string, probability: number) => {
  if (outcome === "insufficient_data") {
    return {
      label: "Insufficient Data",
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
      ringColor: "stroke-muted-foreground",
    };
  }
  
  if (probability >= 0.86) {
    return {
      label: "Very Likely to Convert",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      ringColor: "stroke-emerald-500",
    };
  }
  if (probability >= 0.61) {
    return {
      label: "Likely to Convert",
      color: "text-green-600",
      bgColor: "bg-green-50",
      ringColor: "stroke-green-500",
    };
  }
  if (probability >= 0.31) {
    return {
      label: "Needs Nurturing",
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      ringColor: "stroke-amber-500",
    };
  }
  return {
    label: "Likely Lost",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    ringColor: "stroke-rose-500",
  };
};

const ProbabilityGauge: React.FC<{ probability: number; outcome: string }> = ({ 
  probability, 
  outcome 
}) => {
  const config = getOutcomeConfig(outcome, probability);
  const percentage = Math.round(probability * 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (probability * circumference);

  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={config.ringColor}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-3xl font-bold", config.color)}>
          {percentage}%
        </span>
      </div>
    </div>
  );
};

const FactorIcon: React.FC<{ direction: "positive" | "negative" }> = ({ direction }) => {
  if (direction === "positive") {
    return <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />;
  }
  return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
};

export const PredictionCard: React.FC<PredictionCardProps> = ({
  prediction,
  loading = false,
  onRefresh,
  refreshing = false,
}) => {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-28 w-28 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!prediction) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Conversion Prediction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <HelpCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              No prediction available yet
            </p>
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
                Generate Prediction
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const config = getOutcomeConfig(prediction.predicted_outcome, prediction.conversion_probability);
  const sortedFactors = [...prediction.factors].sort((a, b) => {
    const aVal = parseFloat(a.impact.replace(/[^0-9.-]/g, "")) || 0;
    const bVal = parseFloat(b.impact.replace(/[^0-9.-]/g, "")) || 0;
    return Math.abs(bVal) - Math.abs(aVal);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Conversion Prediction
        </CardTitle>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Probability Display */}
        <div className="flex items-center gap-4">
          <ProbabilityGauge 
            probability={prediction.conversion_probability} 
            outcome={prediction.predicted_outcome} 
          />
          <div className="space-y-1">
            <p className={cn("font-semibold", config.color)}>{config.label}</p>
            {prediction.predicted_days_to_convert && prediction.predicted_days_to_convert > 0 && (
              <p className="text-sm text-muted-foreground">
                Est. {prediction.predicted_days_to_convert} days to conversion
              </p>
            )}
          </div>
        </div>

        {/* Factors */}
        {sortedFactors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Why we think so:</p>
            <div className="space-y-1.5">
              {sortedFactors.slice(0, 5).map((factor, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <FactorIcon direction={factor.direction} />
                  <span className={cn(
                    "font-mono text-xs w-12 shrink-0",
                    factor.direction === "positive" ? "text-green-600" : "text-amber-600"
                  )}>
                    {factor.impact}
                  </span>
                  <span className="text-muted-foreground">{factor.factor}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>
            Based on {prediction.based_on_leads_count?.toLocaleString() || "—"} similar leads
          </span>
          <span>
            Updated {formatDistanceToNow(new Date(prediction.predicted_at), { addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

// Small badge version for lists
export const PredictionBadge: React.FC<{ probability: number | null; outcome?: string }> = ({
  probability,
  outcome,
}) => {
  if (probability === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const percentage = Math.round(probability * 100);
  const config = getOutcomeConfig(outcome || "", probability);

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-mono text-xs",
        probability >= 0.61 ? "border-green-200 bg-green-50 text-green-700" :
        probability >= 0.31 ? "border-amber-200 bg-amber-50 text-amber-700" :
        "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {percentage}%
    </Badge>
  );
};
