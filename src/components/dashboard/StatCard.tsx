import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon, ArrowUpRight, ArrowDownRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  impact?: "high" | "medium" | "low";
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

// Parse value to extract numeric part and suffix (e.g., "85%" -> { num: 85, suffix: "%" })
const parseValue = (value: string | number): { num: number | null; suffix: string } => {
  if (typeof value === "number") {
    return { num: value, suffix: "" };
  }
  const match = value.match(/^([\d.]+)(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? { num: null, suffix: "" } : { num, suffix: match[2] };
  }
  return { num: null, suffix: "" };
};

// easeOutCubic easing function
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

// Hook for count-up animation
const useCountUp = (targetValue: string | number, duration: number = 600) => {
  const { num: target, suffix } = parseValue(targetValue);
  const [displayValue, setDisplayValue] = useState<string | number>(targetValue);
  const hasAnimated = useRef(false);
  const animationRef = useRef<number>();

  useEffect(() => {
    // Only animate once on first valid target, and only for numeric values
    if (target === null || hasAnimated.current) {
      setDisplayValue(targetValue);
      return;
    }

    hasAnimated.current = true;
    const startTime = performance.now();
    const isInteger = Number.isInteger(target);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = target * easedProgress;

      const formatted = isInteger 
        ? Math.round(currentValue).toString() 
        : currentValue.toFixed(1);
      
      setDisplayValue(formatted + suffix);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [target, suffix, duration, targetValue]);

  return displayValue;
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  impact,
  loading = false,
  className,
  onClick,
}) => {
  const animatedValue = useCountUp(value);

  const impactConfig = {
    high: { label: "High impact", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    medium: { label: "Medium impact", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    low: { label: "Needs attention", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  };

  if (loading) {
    return (
      <Card variant="glass" className={cn("overflow-hidden", className)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-4" />
          </div>
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-20 mb-2" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="glass"
      className={cn(
        "overflow-hidden group",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        {/* Header with icon */}
        <div className="flex items-start justify-between mb-4">
          {Icon && (
            <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/15 transition-colors">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          {onClick && (
            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-muted-foreground mb-1">
          {title}
        </p>

        {/* Value and impact badge */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold tracking-tight text-foreground">
            {animatedValue}
          </span>
          {impact && (
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full",
              impactConfig[impact].className
            )}>
              {impactConfig[impact].label}
            </span>
          )}
        </div>

        {/* Trend and subtitle */}
        <div className="flex items-center gap-2 text-sm">
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-medium",
                trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
          {subtitle && (
            <span className="text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
