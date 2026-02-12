import React from "react";
import { DEPARTMENTS } from "./constants";
import { DepartmentSection } from "./DepartmentSection";
import type { Agent } from "./types";

interface OverviewTabProps {
  agents: Agent[];
  pendingTasks: Record<string, number>;
  organizationId?: string;
  onToggleAgent: (agentId: string, isEnabled: boolean) => void;
  isToggling: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  agents,
  pendingTasks,
  organizationId,
  onToggleAgent,
  isToggling,
}) => {
  return (
    <div className="space-y-4">
      {DEPARTMENTS.map((dept) => {
        const deptAgents = agents.filter((a) =>
          dept.agentKeys.includes(a.agent_key)
        );
        if (deptAgents.length === 0) return null;
        return (
          <DepartmentSection
            key={dept.key}
            department={dept}
            agents={deptAgents}
            pendingTasks={pendingTasks}
            organizationId={organizationId}
            onToggleAgent={onToggleAgent}
            isToggling={isToggling}
          />
        );
      })}
    </div>
  );
};
