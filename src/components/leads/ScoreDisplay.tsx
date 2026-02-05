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
    sm: "text-lg font-semibold w-10 h-10",
    md: "text-2xl font-bold w-14 h-14",
    lg: "text-4xl font-bold w-20 h-20",
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "rounded-full flex items-center justify-center",
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
