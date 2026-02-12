import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { AGENT_DISPLAY_NAMES } from "./constants";
import { getLeadName } from "./types";
import type { AgentTask } from "./types";

interface ScheduleTabProps {
  scheduledTasks: AgentTask[];
  isLoading: boolean;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ scheduledTasks, isLoading }) => {
  const tasksByHour = useMemo(() => {
    const grouped: Record<string, AgentTask[]> = {};
    scheduledTasks.forEach((task) => {
      const hour = format(new Date(task.scheduled_for), "yyyy-MM-dd HH:00");
      if (!grouped[hour]) grouped[hour] = [];
      grouped[hour].push(task);
    });
    return grouped;
  }, [scheduledTasks]);

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Scheduled Tasks (Next 24 Hours)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : Object.keys(tasksByHour).length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No scheduled tasks"
            description="No tasks are scheduled for the next 24 hours"
          />
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              {Object.entries(tasksByHour).map(([hour, tasks]) => (
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
