import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MessageSquare, Mail, Calendar, Zap, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface UpcomingActionsPreviewProps {
  leadId: string;
  onSeeAll: () => void;
}

interface AgentTask {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  context: Record<string, unknown> | null;
}

// Map agent_type to biblical names — 12 operational agents
const AGENT_NAMES: Record<string, string> = {
  recapture: "Elijah",
  no_show_followup: "Samuel",
  no_show_follow_up: "Samuel",
  showing_confirmation: "Samuel",
  post_showing: "Samuel",
  campaign: "Elijah",
  welcome_sequence: "Elijah",
  campaign_voice: "Elijah",
  campaign_sms: "Ruth",
};

// Action type icons
const ACTION_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  voice: Phone,
};

export const UpcomingActionsPreview: React.FC<UpcomingActionsPreviewProps> = ({
  leadId,
  onSeeAll,
}) => {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["upcoming-agent-tasks-preview", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_tasks")
        .select("id, agent_type, action_type, scheduled_for, status, context")
        .eq("lead_id", leadId)
        .in("status", ["pending", "in_progress", "paused_human_control"])
        .order("scheduled_for", { ascending: true })
        .limit(5);

      if (error) throw error;
      return data as AgentTask[];
    },
    enabled: !!leadId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No upcoming actions</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const Icon = ACTION_ICONS[task.action_type] || Zap;
        const agentName = AGENT_NAMES[task.agent_type] || task.agent_type.replace(/_/g, " ");
        const isManuallyTriggered = task.context?.manually_triggered === true;

        return (
          <div
            key={task.id}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{agentName}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {task.action_type}
                </span>
                {isManuallyTriggered && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    Manual
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(task.scheduled_for), "MMM d 'at' h:mm a")}
              </p>
            </div>
          </div>
        );
      })}

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground hover:text-foreground"
        onClick={onSeeAll}
      >
        See all
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
};
