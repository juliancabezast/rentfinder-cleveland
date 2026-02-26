import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Calendar, Clock, AlertTriangle } from "lucide-react";
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { AGENT_DISPLAY_NAMES } from "./constants";
import { getLeadName } from "./types";
import type { AgentTask } from "./types";

interface ScheduleTabProps {
  scheduledTasks: AgentTask[];
  isLoading: boolean;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ scheduledTasks, isLoading }) => {
  const { overdueTasks, upcomingByHour, overdueCount } = useMemo(() => {
    const now = new Date();
    const overdue: AgentTask[] = [];
    const upcoming: Record<string, AgentTask[]> = {};

    scheduledTasks.forEach((task) => {
      const scheduledDate = new Date(task.scheduled_for);
      if (isPast(scheduledDate)) {
        overdue.push(task);
      } else {
        const hour = format(scheduledDate, "yyyy-MM-dd HH:00");
        if (!upcoming[hour]) upcoming[hour] = [];
        upcoming[hour].push(task);
      }
    });

    return { overdueTasks: overdue, upcomingByHour: upcoming, overdueCount: overdue.length };
  }, [scheduledTasks]);

  const totalTasks = scheduledTasks.length;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Pending Tasks
          {totalTasks > 0 && (
            <Badge variant="secondary" className="text-xs ml-2">
              {totalTasks} total
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : totalTasks === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No pending tasks"
            description="All tasks have been processed"
          />
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              {/* Overdue section */}
              {overdueTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <h4 className="font-medium text-red-600">
                      Overdue
                    </h4>
                    <Badge variant="destructive" className="text-xs">
                      {overdueCount} tasks
                    </Badge>
                  </div>
                  <div className="grid gap-2 pl-6 border-l-2 border-red-300">
                    {overdueTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {AGENT_DISPLAY_NAMES[task.agent_type] || task.agent_type.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {task.action_type}
                          </span>
                          <span className="text-sm font-medium">
                            &rarr; {getLeadName(task.leads)}
                          </span>
                        </div>
                        <span className="text-xs text-red-500">
                          {format(new Date(task.scheduled_for), "MMM d, h:mm a")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming section */}
              {Object.entries(upcomingByHour).map(([hour, tasks]) => (
                <div key={hour}>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium text-foreground">
                      {format(new Date(hour), "EEEE, MMM d 'at' h:mm a")}
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      {tasks.length} tasks
                    </Badge>
                  </div>
                  <div className="grid gap-2 pl-6 border-l-2 border-muted">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg bg-card/50 border flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {AGENT_DISPLAY_NAMES[task.agent_type] || task.agent_type.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {task.action_type}
                          </span>
                          <span className="text-sm font-medium">
                            &rarr; {getLeadName(task.leads)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(task.scheduled_for), "h:mm a")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
