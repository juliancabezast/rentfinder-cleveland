import React from "react";
import { cn } from "@/lib/utils";

export interface FilterCounts {
  priority: number;
  humanControlled: number;
  moveInSoon: number;
  section8: number;
  hasShowing: number;
}

export interface ActiveFilters {
  priority: boolean;
  humanControlled: boolean;
  moveInSoon: boolean;
  section8: boolean;
  hasShowing: boolean;
}

interface LeadFilterPillsProps {
  activeFilters: ActiveFilters;
  filterCounts: FilterCounts;
  onToggleFilter: (filter: keyof ActiveFilters) => void;
  loading?: boolean;
}

const FILTER_LABELS: Record<keyof ActiveFilters, string> = {
  priority: "Priority",
  humanControlled: "Human Controlled",
  moveInSoon: "Move-in Soon",
  section8: "Section 8",
  hasShowing: "Has Showing",
};

const LeadFilterPills: React.FC<LeadFilterPillsProps> = ({
  activeFilters,
  filterCounts,
  onToggleFilter,
  loading = false,
}) => {
  const filters: (keyof ActiveFilters)[] = [
    "priority",
    "humanControlled",
    "moveInSoon",
    "section8",
    "hasShowing",
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filterKey) => {
        const isActive = activeFilters[filterKey];
        const count = filterCounts[filterKey];

        return (
          <button
            key={filterKey}
            onClick={() => onToggleFilter(filterKey)}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[20px] text-[13px] font-medium transition-all duration-200",
              "border focus:outline-none focus:ring-2 focus:ring-primary/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:bg-muted/50"
            )}
          >
            <span>{FILTER_LABELS[filterKey]}</span>
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default LeadFilterPills;
