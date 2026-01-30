import React from "react";
import { cn } from "@/lib/utils";

interface ScoreGaugeProps {
  score: number;
  maxScore?: number;
  change?: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  maxScore = 100,
  change,
  label = "Lead Score",
  size = "md",
  className,
}) => {
  const percentage = Math.min((score / maxScore) * 100, 100);
  
  // Calculate stroke dash for the arc (semicircle)
  const radius = 45;
  const circumference = Math.PI * radius; // Half circle
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getScoreColor = (score: number) => {
    if (score >= 80) return { stroke: "#22c55e", text: "text-emerald-500" };
    if (score >= 60) return { stroke: "#eab308", text: "text-amber-500" };
    if (score >= 40) return { stroke: "#f97316", text: "text-orange-500" };
    return { stroke: "#ef4444", text: "text-rose-500" };
  };

  const colors = getScoreColor(score);

  const sizeConfig = {
    sm: { 
      container: "w-32 h-20", 
      score: "text-2xl", 
      change: "text-[9px] px-1.5 py-0.5",
      labels: "text-[9px]",
      labelText: "text-xs",
      strokeWidth: 6,
    },
    md: { 
      container: "w-44 h-28", 
      score: "text-4xl", 
      change: "text-[10px] px-2 py-0.5",
      labels: "text-[10px]",
      labelText: "text-sm",
      strokeWidth: 8,
    },
    lg: { 
      container: "w-56 h-36", 
      score: "text-5xl", 
      change: "text-xs px-2.5 py-1",
      labels: "text-xs",
      labelText: "text-base",
      strokeWidth: 10,
    },
  };

  const config = sizeConfig[size];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className={cn("relative", config.container)}>
        {/* SVG Gauge */}
        <svg
          viewBox="0 0 100 55"
          className="w-full h-full"
          style={{ overflow: "visible" }}
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id={`gaugeGradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          
          {/* Background track */}
          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-muted/30"
            strokeLinecap="round"
          />
          
          {/* Colored progress arc */}
          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke={`url(#gaugeGradient-${score})`}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.8s ease-out",
            }}
          />
        </svg>

        {/* Score display */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          {change !== undefined && change !== 0 && (
            <span
              className={cn(
                "rounded-full font-medium mb-1",
                config.change,
                change > 0
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
              )}
            >
              {change > 0 ? "▲" : "▼"} {Math.abs(change)} pts
            </span>
          )}
          <span className={cn("font-bold", config.score, colors.text)}>
            {score}
          </span>
        </div>

        {/* Min/Max labels */}
        <span className={cn("absolute bottom-0 left-1 text-muted-foreground font-medium", config.labels)}>
          0
        </span>
        <span className={cn("absolute bottom-0 right-1 text-muted-foreground font-medium", config.labels)}>
          {maxScore}
        </span>
      </div>

      {/* Label */}
      <p className={cn("text-muted-foreground font-medium mt-2", config.labelText)}>
        {label}
      </p>
    </div>
  );
};
