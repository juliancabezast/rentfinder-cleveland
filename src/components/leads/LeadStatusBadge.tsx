import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LeadStatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  contacted: { label: "Contacted", className: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100" },
  engaged: { label: "Engaged", className: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100" },
  nurturing: { label: "Nurturing", className: "bg-purple-100 text-purple-800 hover:bg-purple-100" },
  qualified: { label: "Qualified", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  showing_scheduled: { label: "Showing Scheduled", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  showed: { label: "Showed", className: "bg-teal-100 text-teal-800 hover:bg-teal-100" },
  in_application: { label: "In Application", className: "bg-orange-100 text-orange-800 hover:bg-orange-100" },
  lost: { label: "Lost", className: "bg-gray-100 text-gray-800 hover:bg-gray-100" },
  converted: { label: "Converted", className: "bg-green-100 text-green-800 hover:bg-green-100" },
};

export const LeadStatusBadge: React.FC<LeadStatusBadgeProps> = ({
  status,
  className,
}) => {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-gray-100 text-gray-800",
  };

  return (
    <Badge variant="secondary" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
};
