import React from "react";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";

type StatusType = "lead" | "property" | "showing";

interface StatusBadgeProps {
  status: string;
  type: StatusType;
  className?: string;
}

const leadStatusConfig: Record<string, { label: string; dotColor: string }> = {
  new: { label: "New", dotColor: "bg-blue-500" },
  contacted: { label: "Contacted", dotColor: "bg-purple-500" },
  engaged: { label: "Engaged", dotColor: "bg-amber-500" },
  nurturing: { label: "Nurturing", dotColor: "bg-indigo-500" },
  qualified: { label: "Qualified", dotColor: "bg-emerald-500" },
  showing_scheduled: { label: "Showing Scheduled", dotColor: "bg-cyan-500" },
  showed: { label: "Showed", dotColor: "bg-teal-500" },
  in_application: { label: "In Application", dotColor: "bg-orange-500" },
  lost: { label: "Lost", dotColor: "bg-gray-400" },
  converted: { label: "Converted", dotColor: "bg-green-500" },
};

const propertyStatusConfig: Record<string, { label: string; dotColor: string }> = {
  available: { label: "Available", dotColor: "bg-green-500" },
  coming_soon: { label: "Coming Soon", dotColor: "bg-amber-500" },
  in_leasing_process: { label: "In Leasing", dotColor: "bg-blue-500" },
  rented: { label: "Rented", dotColor: "bg-gray-400" },
};

const showingStatusConfig: Record<string, { label: string; dotColor: string }> = {
  scheduled: { label: "Scheduled", dotColor: "bg-blue-500" },
  confirmed: { label: "Confirmed", dotColor: "bg-green-500" },
  completed: { label: "Completed", dotColor: "bg-gray-400" },
  no_show: { label: "No Show", dotColor: "bg-red-500" },
  cancelled: { label: "Cancelled", dotColor: "bg-gray-400" },
  rescheduled: { label: "Rescheduled", dotColor: "bg-amber-500" },
};

const getStatusConfig = (status: string, type: StatusType) => {
  switch (type) {
    case "lead":
      return leadStatusConfig[status] || { label: status.replace(/_/g, " "), dotColor: "bg-gray-400" };
    case "property":
      return propertyStatusConfig[status] || { label: status.replace(/_/g, " "), dotColor: "bg-gray-400" };
    case "showing":
      return showingStatusConfig[status] || { label: status.replace(/_/g, " "), dotColor: "bg-gray-400" };
    default:
      return { label: status.replace(/_/g, " "), dotColor: "bg-gray-400" };
  }
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type,
  className,
}) => {
  const config = getStatusConfig(status, type);

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 capitalize font-medium",
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dotColor)} />
      {config.label}
    </Badge>
  );
};
