import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Clock, Zap, CheckCircle, XCircle, AlertTriangle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { DEPARTMENTS, STATUS_CONFIG, getAgentDisplayName } from "./constants";
import type { Agent, ActivityLog } from "./types";

interface DepartmentDetailTabProps {
  agents: Agent[];
  pendingTasks: Record<string, number>;
  activityLog: ActivityLog[];
}

export const DepartmentDetailTab: React.FC<DepartmentDetailTabProps> = ({
  agents,
  pendingTasks,
  activityLog,
}) => {
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0].key);
  const dept = DEPARTMENTS.find((d) => d.key === selectedDept)!;

  const deptAgents = useMemo(
    () => agents.filter((a) => dept.agentKeys.includes(a.agent_key)),
    [agents, dept]
  );

  const deptActivity = useMemo(
    () =>
      activityLog.filter((log) =>
        deptAgents.some((a) => a.agent_key === log.agent_key)
      ).slice(0, 10),
    [activityLog, deptAgents]
  );

  const deptStats = useMemo(() => {
    const total = deptAgents.length;
    const active = deptAgents.filter((a) => a.is_enabled && (a.status === "active" || a.status === "idle")).length;
    const executed = deptAgents.reduce((s, a) => s + (a.executions_today || 0), 0);
    const successes = deptAgents.reduce((s, a) => s + (a.successes_today || 0), 0);
    const failures = deptAgents.reduce((s, a) => s + (a.failures_today || 0), 0);
    const pending = deptAgents.reduce((s, a) => s + (pendingTasks[a.agent_key] || 0), 0);
    const avgMs = deptAgents.filter((a) => a.avg_execution_ms).reduce((s, a) => s + (a.avg_execution_ms || 0), 0) /
      (deptAgents.filter((a) => a.avg_execution_ms).length || 1);
    return { total, active, executed, successes, failures, pending, avgMs: Math.round(avgMs) };
  }, [deptAgents, pendingTasks]);

  const Icon = dept.icon;

  return (
    <div className="space-y-4">
      {/* Department selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedDept} onValueChange={setSelectedDept}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Department summary stats */}
      <Card variant="glass" className={cn("border-l-4", dept.color)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Icon className="h-6 w-6 text-foreground/70" />
            <h2 className="text-xl font-bold">{dept.label}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{deptStats.active}/{deptStats.total}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{deptStats.executed}</p>
              <p className="text-xs text-muted-foreground">Executed Today</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{deptStats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{deptStats.avgMs > 0 ? `${deptStats.avgMs}ms` : "—"}</p>
              <p className="text-xs text-muted-foreground">Avg Execution</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent detail cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {deptAgents.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No agents"
            description="No agents found for this department"
          />
        ) : (
          deptAgents.map((agent) => {
            const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
            const pending = pendingTasks[agent.agent_key] || 0;
            const successRate =
              agent.executions_today > 0
                ? Math.round((agent.successes_today / agent.executions_today) * 100)
                : 0;
            const functionalName = getAgentDisplayName(agent.agent_key, agent.biblical_name, agent.display_role);
            const recentActivity = activityLog
              .filter((l) => l.agent_key === agent.agent_key)
              .slice(0, 3);

            return (
              <Card key={agent.id} variant="glass" className="overflow-hidden">
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          {statusConfig.pulse && (
                            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusConfig.bgColor)} />
                          )}
                          <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", statusConfig.bgColor)} />
                        </span>
                        {agent.biblical_name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{functionalName}</p>
                    </div>
                    <Badge variant={agent.is_enabled ? "default" : "secondary"} className="text-xs">
                      {agent.is_enabled ? "ON" : "OFF"}
                    </Badge>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="bg-muted/30 rounded p-2">
                      <p className="text-sm font-bold text-green-600">{agent.successes_today}</p>
                      <p className="text-[10px] text-muted-foreground">Success</p>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <p className={cn("text-sm font-bold", agent.failures_today > 0 ? "text-red-600" : "text-muted-foreground")}>{agent.failures_today}</p>
                      <p className="text-[10px] text-muted-foreground">Failures</p>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <p className={cn("text-sm font-bold", pending > 0 ? "text-amber-600" : "text-muted-foreground")}>{pending}</p>
                      <p className="text-[10px] text-muted-foreground">Pending</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
                      style={{ width: `${successRate}%` }}
                    />
                  </div>

                  {/* Services */}
                  {agent.required_services && agent.required_services.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agent.required_services.map((svc) => (
                        <Badge key={svc} variant="outline" className="text-[10px]">{svc}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Last execution + avg time */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {agent.last_execution_at
                        ? formatDistanceToNow(new Date(agent.last_execution_at), { addSuffix: true })
                        : "Never"}
                    </span>
                    {agent.avg_execution_ms && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {Math.round(agent.avg_execution_ms)}ms avg
                      </span>
                    )}
                  </div>

                  {/* Recent activity */}
                  {recentActivity.length > 0 && (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Recent Activity</p>
                      {recentActivity.map((log) => (
                        <div key={log.id} className="flex items-center justify-between text-xs">
                          <span className="truncate max-w-[200px]">{log.action}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] ml-1",
                              log.status === "success" && "bg-green-100 text-green-700",
                              log.status === "failure" && "bg-red-100 text-red-700"
                            )}
                          >
                            {log.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
