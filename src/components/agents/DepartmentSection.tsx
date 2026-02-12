import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentRow } from "./AgentRow";
import type { DepartmentConfig } from "./constants";
import type { Agent } from "./types";

interface DepartmentSectionProps {
  department: DepartmentConfig;
  agents: Agent[];
  pendingTasks: Record<string, number>;
  organizationId?: string;
  onToggleAgent: (agentId: string, isEnabled: boolean) => void;
  isToggling: boolean;
  defaultOpen?: boolean;
}

export const DepartmentSection: React.FC<DepartmentSectionProps> = ({
  department,
  agents,
  pendingTasks,
  organizationId,
  onToggleAgent,
  isToggling,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = department.icon;
  const activeCount = agents.filter(
    (a) => a.is_enabled && (a.status === "active" || a.status === "idle")
  ).length;

  return (
    <Card variant="glass" className={cn("border-l-4 overflow-hidden", department.color)}>
      {/* Department header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-colors",
          department.bgColor
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-foreground/70" />
          <h3 className="font-semibold text-foreground">{department.label}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {agents.length} agents &middot;{" "}
            <span className="text-green-600 font-medium">{activeCount} active</span>
          </span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Agent rows */}
      {isOpen && (
        <CardContent className="p-2 pt-1">
          <div className="divide-y divide-border/50">
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                pendingCount={pendingTasks[agent.agent_key] || 0}
                organizationId={organizationId}
                onToggle={onToggleAgent}
                isToggling={isToggling}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
