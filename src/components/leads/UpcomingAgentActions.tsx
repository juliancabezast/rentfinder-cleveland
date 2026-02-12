import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  Play,
  Loader2,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface UpcomingAgentActionsProps {
  leadId: string;
}

interface AgentTask {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  context: Record<string, unknown> | null;
  attempt_number: number | null;
  max_attempts: number | null;
}

// Map agent_type to biblical names — 13 operational agents + 1 webhook
const AGENT_NAMES: Record<string, string> = {
  // Actual DB agent_keys
  main_inbound: "Aaron",
  bland_call_webhook: "Deborah",
  sms_inbound: "Ruth",
  hemlane_parser: "Esther",
  scoring: "Daniel",
  transcript_analyst: "Isaiah",
  task_dispatcher: "Nehemiah",
  recapture: "Elijah",
  showing_confirmation: "Samuel",
  conversion_predictor: "Solomon",
  insight_generator: "Moses",
  report_generator: "David",
  doorloop_pull: "Ezra",
  cost_tracker: "Zacchaeus",
  // Legacy agent_type values
  no_show_followup: "Samuel",
  no_show_follow_up: "Samuel",
  post_showing: "Samuel",
  campaign: "Elijah",
  welcome_sequence: "Elijah",
  campaign_voice: "Elijah",
  campaign_sms: "Ruth",
};

// Agent type to color mapping (by department)
const AGENT_COLORS: Record<string, string> = {
  // Recepción (teal)
  main_inbound: "bg-teal-100 text-teal-700 border-teal-200",
  bland_call_webhook: "bg-teal-100 text-teal-700 border-teal-200",
  sms_inbound: "bg-teal-100 text-teal-700 border-teal-200",
  hemlane_parser: "bg-teal-100 text-teal-700 border-teal-200",
  // Evaluación (blue)
  scoring: "bg-blue-100 text-blue-700 border-blue-200",
  transcript_analyst: "bg-blue-100 text-blue-700 border-blue-200",
  // Operaciones (purple)
  task_dispatcher: "bg-purple-100 text-purple-700 border-purple-200",
  // Ventas (amber)
  recapture: "bg-amber-100 text-amber-700 border-amber-200",
  showing_confirmation: "bg-amber-100 text-amber-700 border-amber-200",
  // Inteligencia (green)
  conversion_predictor: "bg-green-100 text-green-700 border-green-200",
  insight_generator: "bg-green-100 text-green-700 border-green-200",
  report_generator: "bg-green-100 text-green-700 border-green-200",
  // Administración (slate)
  doorloop_pull: "bg-slate-100 text-slate-700 border-slate-200",
  cost_tracker: "bg-slate-100 text-slate-700 border-slate-200",
  // Legacy
  no_show_followup: "bg-red-100 text-red-700 border-red-200",
  no_show_follow_up: "bg-red-100 text-red-700 border-red-200",
  post_showing: "bg-green-100 text-green-700 border-green-200",
  campaign: "bg-amber-100 text-amber-700 border-amber-200",
  campaign_voice: "bg-amber-100 text-amber-700 border-amber-200",
  campaign_sms: "bg-amber-100 text-amber-700 border-amber-200",
  welcome_sequence: "bg-amber-100 text-amber-700 border-amber-200",
};

// Status colors
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  paused_human_control: "bg-red-100 text-red-700",
};

// Action type icons
const ACTION_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  voice: Phone,
};

export const UpcomingAgentActions: React.FC<UpcomingAgentActionsProps> = ({
  leadId,
}) => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    task: AgentTask | null;
  }>({ open: false, task: null });
  const [executing, setExecuting] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["upcoming-agent-tasks", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_tasks")
        .select("id, agent_type, action_type, scheduled_for, status, context, attempt_number, max_attempts")
        .eq("lead_id", leadId)
        .in("status", ["pending", "in_progress", "paused_human_control"])
        .order("scheduled_for", { ascending: true });

      if (error) throw error;
      return data as AgentTask[];
    },
    enabled: !!leadId,
  });

  const handleExecuteNow = async () => {
    if (!confirmDialog.task || !userRecord?.id) return;

    setExecuting(true);
    try {
      const { error } = await supabase.rpc("execute_agent_task_now", {
        p_task_id: confirmDialog.task.id,
        p_executed_by: userRecord.id,
      });

      if (error) throw error;

      toast.success("Task execution triggered successfully");
      queryClient.invalidateQueries({ queryKey: ["upcoming-agent-tasks", leadId] });
    } catch (error) {
      console.error("Error executing task:", error);
      toast.error("Failed to execute task");
    } finally {
      setExecuting(false);
      setConfirmDialog({ open: false, task: null });
    }
  };

  const getAgentName = (agentType: string) => {
    return AGENT_NAMES[agentType] || agentType.replace(/_/g, " ");
  };

  const getIcon = (actionType: string) => {
    return ACTION_ICONS[actionType] || Zap;
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Upcoming Agent Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Upcoming Agent Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!tasks || tasks.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming actions scheduled"
              description="Agent tasks for this lead will appear here when scheduled"
            />
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-muted" />

              <div className="space-y-4">
                {tasks.map((task, index) => {
                  const Icon = getIcon(task.action_type);
                  const agentName = getAgentName(task.agent_type);
                  const isManuallyTriggered = task.context?.manually_triggered === true;

                  return (
                    <div
                      key={task.id}
                      className="relative pl-12 animate-fade-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Icon on timeline */}
                      <div
                        className={cn(
                          "absolute left-0 w-10 h-10 rounded-full flex items-center justify-center border-2",
                          AGENT_COLORS[task.agent_type] || "bg-gray-100 text-gray-700 border-gray-200"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Task card */}
                      <div className="p-4 rounded-lg border bg-card/50 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground">
                                {agentName}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn("text-xs", AGENT_COLORS[task.agent_type])}
                              >
                                {task.action_type}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn("text-xs", STATUS_COLORS[task.status])}
                              >
                                {task.status.replace(/_/g, " ")}
                              </Badge>
                              {isManuallyTriggered && (
                                <Badge variant="secondary" className="text-xs">
                                  <Zap className="h-3 w-3 mr-1" />
                                  Manually Triggered
                                </Badge>
                              )}
                            </div>

                            <p className="text-sm text-muted-foreground mt-1">
                              Scheduled:{" "}
                              <span className="font-medium">
                                {format(new Date(task.scheduled_for), "MMM d, yyyy 'at' h:mm a")}
                              </span>
                              <span className="text-xs ml-2">
                                ({formatDistanceToNow(new Date(task.scheduled_for), { addSuffix: true })})
                              </span>
                            </p>

                            {task.attempt_number !== null && task.max_attempts !== null && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Attempt {task.attempt_number} of {task.max_attempts}
                              </p>
                            )}
                          </div>

                          {task.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => setConfirmDialog({ open: true, task })}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Execute Now
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, task: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Execute Agent Task Now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will trigger{" "}
              <strong>{confirmDialog.task ? getAgentName(confirmDialog.task.agent_type) : ""}</strong>{" "}
              to{" "}
              <strong>{confirmDialog.task?.action_type}</strong>{" "}
              this lead immediately. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecuteNow} disabled={executing}>
              {executing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Execute Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
