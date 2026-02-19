import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showPriorityBadge?: boolean;
}

const getScoreColor = (score: number): string => {
  if (score <= 30) return "text-red-600";
  if (score <= 50) return "text-yellow-600";
  if (score <= 70) return "text-green-600";
  return "text-emerald-500";
};

const getScoreBgColor = (score: number): string => {
  if (score <= 30) return "bg-red-100";
  if (score <= 50) return "bg-yellow-100";
  if (score <= 70) return "bg-green-100";
  return "bg-emerald-100";
};

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  score,
  size = "md",
  showPriorityBadge = true,
}) => {
  const isPriority = score >= 85;

  const sizeClasses = {
    sm: "text-xs font-semibold min-w-[2.25rem] h-9 px-2",
    md: "text-sm font-bold min-w-[2.75rem] h-11 px-2.5",
    lg: "text-xl font-bold min-w-[3.5rem] h-14 px-3",
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "rounded-full flex items-center justify-center shrink-0",
          sizeClasses[size],
          getScoreBgColor(score),
          getScoreColor(score)
        )}
      >
        {score}
      </div>
      {showPriorityBadge && isPriority && (
        <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
          Priority
        </Badge>
      )}
    </div>
  );
};

export const ScoreChange: React.FC<{ change: number; className?: string }> = ({
  change,
  className,
}) => {
  if (change === 0) return null;

  const isPositive = change > 0;

  return (
    <span
      className={cn(
        "font-semibold",
        isPositive ? "text-green-600" : "text-red-600",
        className
      )}
    >
      {isPositive ? "+" : ""}
      {change}
    </span>
  );
};
