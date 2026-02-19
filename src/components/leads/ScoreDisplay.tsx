import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showPriorityBadge?: boolean;
}

// Continuous HSL gradient: 0 = red (0°), 50 = yellow (45°), 100 = green (142°)
const getScoreHue = (score: number): number => {
  const clamped = Math.max(0, Math.min(100, score));
  // 0→0°(red)  50→45°(yellow-amber)  100→142°(green)
  if (clamped <= 50) return (clamped / 50) * 45;
  return 45 + ((clamped - 50) / 50) * 97;
};

const getScoreStyles = (score: number) => {
  const hue = getScoreHue(score);
  return {
    color: `hsl(${hue}, 70%, 35%)`,
    backgroundColor: `hsl(${hue}, 60%, 92%)`,
  };
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

  const scoreStyles = getScoreStyles(score);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "rounded-full flex items-center justify-center shrink-0",
          sizeClasses[size]
        )}
        style={scoreStyles}
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
