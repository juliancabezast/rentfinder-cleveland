import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ScoreHistoryEntry {
  id: string;
  change_amount: number;
  reason_text: string;
  created_at: string | null;
}

interface ScoreHistoryPreviewProps {
  history: ScoreHistoryEntry[];
}

export const ScoreHistoryPreview: React.FC<ScoreHistoryPreviewProps> = ({ history }) => {
  if (history.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Minus className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No score changes yet</p>
      </div>
    );
  }

  // Show only first 5
  const displayHistory = history.slice(0, 5);

  return (
    <div className="space-y-2">
      {displayHistory.map((entry) => {
        const isPositive = entry.change_amount > 0;
        const isNegative = entry.change_amount < 0;

        return (
          <div
            key={entry.id}
            className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                isPositive && "bg-green-100",
                isNegative && "bg-red-100",
                !isPositive && !isNegative && "bg-muted"
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : isNegative ? (
                <TrendingDown className="h-4 w-4 text-red-600" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    isPositive && "text-green-600",
                    isNegative && "text-red-600"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {entry.change_amount}
                </span>
                <span className="text-sm text-muted-foreground truncate">
                  {entry.reason_text}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {entry.created_at && format(new Date(entry.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
