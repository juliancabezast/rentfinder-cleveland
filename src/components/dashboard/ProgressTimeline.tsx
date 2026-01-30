import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineStep {
  label: string;
  sublabel?: string;
  completed: boolean;
  current?: boolean;
}

interface ProgressTimelineProps {
  steps: TimelineStep[];
  className?: string;
}

export const ProgressTimeline: React.FC<ProgressTimelineProps> = ({
  steps,
  className,
}) => {
  return (
    <div className={cn("flex items-start justify-between w-full", className)}>
      {steps.map((step, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-col items-center relative",
            index < steps.length - 1 && "flex-1"
          )}
        >
          {/* Step indicator and label */}
          <div className="flex flex-col items-center z-10">
            {/* Circle */}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300",
                step.completed
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                  : step.current
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {step.completed ? (
                <Check className="h-4 w-4" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>

            {/* Labels */}
            <div className="mt-2 text-center max-w-[100px]">
              <p
                className={cn(
                  "text-xs font-medium leading-tight",
                  step.completed || step.current
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.sublabel && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {step.sublabel}
                </p>
              )}
            </div>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div
              className={cn(
                "absolute top-4 left-1/2 w-full h-0.5 -translate-y-1/2",
                step.completed
                  ? "bg-emerald-500"
                  : "bg-muted"
              )}
              style={{ marginLeft: "16px" }}
            />
          )}
        </div>
      ))}
    </div>
  );
};
