import React from "react";
import { cn } from "@/lib/utils";

interface LeadStatusBadgeProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

const statusConfig: Record<string, { label: string; className: string; dotColor: string }> = {
  new: { 
    label: "New", 
    className: "bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-500/10 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    dotColor: "bg-blue-500"
  },
  contacted: { 
    label: "Contacted", 
    className: "bg-purple-50 text-purple-700 border-purple-200 ring-1 ring-purple-500/10 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800",
    dotColor: "bg-purple-500"
  },
  engaged: { 
    label: "Engaged", 
    className: "bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-500/10 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
    dotColor: "bg-amber-500"
  },
  nurturing: { 
    label: "Nurturing", 
    className: "bg-indigo-50 text-indigo-700 border-indigo-200 ring-1 ring-indigo-500/10 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800",
    dotColor: "bg-indigo-500"
  },
  qualified: { 
    label: "Qualified", 
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-500/10 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
    dotColor: "bg-emerald-500"
  },
  showing_scheduled: { 
    label: "Showing Scheduled", 
    className: "bg-cyan-50 text-cyan-700 border-cyan-200 ring-1 ring-cyan-500/10 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800",
    dotColor: "bg-cyan-500"
  },
  showed: { 
    label: "Showed", 
    className: "bg-teal-50 text-teal-700 border-teal-200 ring-1 ring-teal-500/10 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800",
    dotColor: "bg-teal-500"
  },
  in_application: { 
    label: "In Application", 
    className: "bg-orange-50 text-orange-700 border-orange-200 ring-1 ring-orange-500/10 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800",
    dotColor: "bg-orange-500"
  },
  lost: { 
    label: "Lost", 
    className: "bg-gray-50 text-gray-600 border-gray-200 ring-1 ring-gray-500/10 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700",
    dotColor: "bg-gray-400"
  },
  converted: { 
    label: "Converted", 
    className: "bg-green-50 text-green-700 border-green-200 ring-1 ring-green-500/10 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    dotColor: "bg-green-500"
  },
};

export const LeadStatusBadge: React.FC<LeadStatusBadgeProps> = ({
  status,
  className,
  showDot = true,
}) => {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400",
    dotColor: "bg-gray-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
        config.className,
        className
      )}
    >
      {showDot && (
        <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
      )}
      {config.label}
    </span>
  );
};
