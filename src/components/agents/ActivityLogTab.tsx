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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Activity } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AGENT_DISPLAY_NAMES } from "./constants";
import type { Agent, ActivityLog } from "./types";

interface ActivityLogTabProps {
  activityLog: ActivityLog[];
  agents: Agent[];
  isLoading: boolean;
}

export const ActivityLogTab: React.FC<ActivityLogTabProps> = ({
  activityLog,
  agents,
  isLoading,
}) => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  const filtered = useMemo(() => {
    return activityLog.filter((log) => {
      const matchesStatus = statusFilter === "all" || log.status === statusFilter;
      const matchesAgent = agentFilter === "all" || log.agent_key === agentFilter;
      return matchesStatus && matchesAgent;
    });
  }, [activityLog, statusFilter, agentFilter]);

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-accent" />
            Live Activity Feed
            <span className="relative flex h-2 w-2 ml-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.agent_key} value={agent.agent_key}>
                    {agent.biblical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity recorded"
            description="Agent activity will appear here as agents execute tasks"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log, index) => {
                  const agent = agents.find((a) => a.agent_key === log.agent_key);
                  return (
                    <TableRow
                      key={log.id}
                      className="animate-fade-up"
                      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                    >
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {agent?.biblical_name || log.agent_key}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {log.action}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            log.status === "success" && "bg-green-100 text-green-700",
                            log.status === "failure" && "bg-red-100 text-red-700",
                            log.status === "skipped" && "bg-gray-100 text-gray-700",
                            log.status === "in_progress" && "bg-blue-100 text-blue-700"
                          )}
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.execution_ms ? `${log.execution_ms}ms` : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
