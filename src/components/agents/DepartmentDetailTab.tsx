import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Clock, Zap, CheckCircle, XCircle, AlertTriangle, Layers, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { DEPARTMENTS, STATUS_CONFIG, getAgentDisplayName, AGENT_KPIS, resolveAgentKey } from "./constants";
import type { Agent, ActivityLog } from "./types";

interface DepartmentDetailTabProps {
  agents: Agent[];
  pendingTasks: Record<string, number>;
  activityLog: ActivityLog[];
  onToggleAgent: (agentId: string, isEnabled: boolean) => void;
  isToggling: boolean;
}

export const DepartmentDetailTab: React.FC<DepartmentDetailTabProps> = ({
  agents,
  pendingTasks,
  activityLog,
  onToggleAgent,
  isToggling,
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
        deptAgents.some((a) => a.agent_key === resolveAgentKey(log.agent_key))
      ).slice(0, 10),
    [activityLog, deptAgents]
  );

  const deptStats = useMemo(() => {
    const total = deptAgents.length;
    const active = deptAgents.filter((a) => a.is_enabled).length;
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
              <p className="text-xs text-muted-foreground">Enabled</p>
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
          <div className="col-span-full">
            <EmptyState
              icon={Layers}
              title="No agents"
              description="No agents found for this department"
            />
          </div>
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
              .filter((l) => resolveAgentKey(l.agent_key) === agent.agent_key)
              .slice(0, 3);

            return (
              <Card key={agent.id} variant="glass" className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header: name + role + status + toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        {statusConfig.pulse && (
                          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusConfig.bgColor)} />
                        )}
                        <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", statusConfig.bgColor)} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-foreground leading-tight">{agent.biblical_name}</h3>
                        <p className="text-[11px] text-muted-foreground truncate">{functionalName}</p>
                      </div>
                    </div>
                    <Switch
                      checked={agent.is_enabled}
                      onCheckedChange={(checked) => onToggleAgent(agent.id, checked)}
                      disabled={isToggling}
                    />
                  </div>

                  {/* Compact stats row */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="font-semibold text-green-600">{agent.successes_today}</span>
                    </span>
                    {agent.failures_today > 0 && (
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span className="font-semibold text-red-600">{agent.failures_today}</span>
                      </span>
                    )}
                    {pending > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-amber-500" />
                        <span className="font-semibold text-amber-600">{pending}</span>
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground">
                      {agent.last_execution_at
                        ? formatDistanceToNow(new Date(agent.last_execution_at), { addSuffix: true })
                        : "Never run"}
                    </span>
                  </div>

                  {/* Success rate bar */}
                  {agent.executions_today > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Success rate</span>
                        <span className="font-semibold">{successRate}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            successRate >= 80 ? "bg-green-500" : successRate >= 50 ? "bg-amber-500" : "bg-red-500"
                          )}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Services + speed */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {agent.required_services && agent.required_services.map((svc) => (
                      <Badge key={svc} variant="outline" className="text-[9px] h-4 px-1.5">{svc}</Badge>
                    ))}
                    {agent.avg_execution_ms != null && agent.avg_execution_ms > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                        <Zap className="h-3 w-3" />
                        {Math.round(agent.avg_execution_ms)}ms
                      </span>
                    )}
                  </div>

                  {/* Recent activity — compact */}
                  {recentActivity.length > 0 && (
                    <div className="border-t pt-2 space-y-1">
                      {recentActivity.map((log) => (
                        <div key={log.id} className="flex items-center gap-2 text-[11px]">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            log.status === "success" ? "bg-green-500" : log.status === "failure" ? "bg-red-500" : "bg-gray-400"
                          )} />
                          <span className="text-muted-foreground truncate">{log.action.replace(/_/g, " ")}</span>
                          <span className={cn(
                            "text-[10px] ml-auto shrink-0 font-medium",
                            log.status === "success" ? "text-green-600" : log.status === "failure" ? "text-red-600" : "text-muted-foreground"
                          )}>
                            {log.status}
                          </span>
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

      {/* Department activity feed */}
      {deptActivity.length > 0 && (
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              Recent Activity — {dept.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {deptActivity.map((log) => {
                const agentName = getAgentDisplayName(resolveAgentKey(log.agent_key), "", "");
                return (
                  <div key={log.id} className="flex items-center gap-3 text-xs py-1.5 border-b last:border-b-0">
                    <span className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      log.status === "success" ? "bg-green-500" :
                      log.status === "failure" ? "bg-red-500" : "bg-gray-400"
                    )} />
                    <span className="font-medium text-foreground/80 w-20 shrink-0 truncate">{agentName}</span>
                    <span className="text-muted-foreground truncate flex-1">{log.action.replace(/_/g, " ")}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] shrink-0",
                        log.status === "success" && "bg-green-100 text-green-700",
                        log.status === "failure" && "bg-red-100 text-red-700"
                      )}
                    >
                      {log.status}
                    </Badge>
                    <span className="text-muted-foreground shrink-0 w-20 text-right">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
