import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface AgentTaskQueueProps {
  agentKey: string;
  organizationId?: string;
}

export const AgentTaskQueue: React.FC<AgentTaskQueueProps> = ({ agentKey, organizationId }) => {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["agent-tasks-preview", agentKey, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data } = await supabase
        .from("agent_tasks")
        .select(`id, action_type, scheduled_for, status, leads:lead_id (full_name, first_name, last_name)`)
        .eq("organization_id", organizationId)
        .eq("agent_type", agentKey)
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: !!organizationId,
  });

  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t">
        <p className="text-xs text-muted-foreground text-center py-2">No pending tasks</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t space-y-1.5">
      {tasks.map((task: any) => (
        <div key={task.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[10px] shrink-0">
              {task.action_type}
            </Badge>
            <span className="truncate text-muted-foreground">
              {task.leads?.full_name ||
                [task.leads?.first_name, task.leads?.last_name].filter(Boolean).join(" ") ||
                "Unknown"}
            </span>
          </div>
          <span className="text-muted-foreground shrink-0 ml-2">
            {formatDistanceToNow(new Date(task.scheduled_for), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
};
