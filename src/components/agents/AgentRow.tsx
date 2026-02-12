import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { STATUS_CONFIG, getAgentDisplayName } from "./constants";
import { AgentTaskQueue } from "./AgentTaskQueue";
import type { Agent } from "./types";

interface AgentRowProps {
  agent: Agent;
  pendingCount: number;
  organizationId?: string;
  onToggle: (agentId: string, isEnabled: boolean) => void;
  isToggling: boolean;
}

export const AgentRow: React.FC<AgentRowProps> = ({
  agent,
  pendingCount,
  organizationId,
  onToggle,
  isToggling,
}) => {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const successRate =
    agent.executions_today > 0
      ? Math.round((agent.successes_today / agent.executions_today) * 100)
      : 0;
  const functionalName = getAgentDisplayName(agent.agent_key, agent.biblical_name, agent.display_role);

  return (
    <div className="group">
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/40 transition-colors">
        {/* Status dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {statusConfig.pulse && (
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                statusConfig.bgColor
              )}
            />
          )}
          <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", statusConfig.bgColor)} />
        </span>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-sm text-foreground">{agent.biblical_name}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">— {functionalName}</span>
          </div>
        </div>

        {/* ON/OFF switch */}
        <Switch
          checked={agent.is_enabled}
          onCheckedChange={(checked) => onToggle(agent.id, checked)}
          disabled={isToggling}
          className="data-[state=checked]:bg-green-500 shrink-0"
        />

        {/* Pending count */}
        <div className="w-16 text-center shrink-0 hidden sm:block">
          {pendingCount > 0 ? (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
              {pendingCount} pend
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">0 pend</span>
          )}
        </div>

        {/* Success / Failures */}
        <div className="flex items-center gap-2 text-xs shrink-0 hidden md:flex">
          <span className="text-green-600 font-medium">{agent.successes_today}<span className="text-green-500/70">&#10003;</span></span>
          <span className={cn("font-medium", agent.failures_today > 0 ? "text-red-600" : "text-muted-foreground")}>
            {agent.failures_today}<span className={agent.failures_today > 0 ? "text-red-500/70" : "text-muted-foreground"}>&#10007;</span>
          </span>
        </div>

        {/* Mini progress bar */}
        <div className="w-16 shrink-0 hidden lg:block">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>

        {/* Last execution */}
        <div className="w-24 text-right shrink-0 hidden lg:block">
          <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
            <Clock className="h-3 w-3" />
            {agent.last_execution_at
              ? formatDistanceToNow(new Date(agent.last_execution_at), { addSuffix: true })
              : "Never"}
          </span>
        </div>

        {/* Expand button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Expanded task queue */}
      {expanded && (
        <div className="ml-8 mr-3 mb-2">
          <AgentTaskQueue agentKey={agent.agent_key} organizationId={organizationId} />
        </div>
      )}
    </div>
  );
};
