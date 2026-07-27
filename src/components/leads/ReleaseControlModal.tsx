import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Bot, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ReleaseControlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  onSuccess: () => void;
}

export const ReleaseControlModal: React.FC<ReleaseControlModalProps> = ({
  open,
  onOpenChange,
  leadId,
  leadName,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const [taskAction, setTaskAction] = useState<"resume" | "new">("resume");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const orgId = userRecord?.organization_id;
    if (!orgId) return;

    setLoading(true);
    try {
      // Handle paused tasks FIRST (while the lead is still human-controlled the
      // dispatcher can't claim them), then release the lead — so a task-update
      // failure never leaves a released lead with stuck paused tasks.
      if (taskAction === "resume") {
        // Push past-due tasks slightly forward so a long takeover doesn't
        // release a burst of stale follow-ups in one dispatcher tick
        const nowIso = new Date().toISOString();
        const staggerIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const { error: bumpError } = await supabase
          .from("agent_tasks")
          .update({ scheduled_for: staggerIso })
          .eq("lead_id", leadId)
          .eq("organization_id", orgId)
          .eq("status", "paused_human_control")
          .lt("scheduled_for", nowIso);

        if (bumpError) throw bumpError;

        // Resume paused tasks
        const { error: resumeError } = await supabase
          .from("agent_tasks")
          .update({ status: "pending", paused_by: null, paused_at: null, pause_reason: null })
          .eq("lead_id", leadId)
          .eq("organization_id", orgId)
          .eq("status", "paused_human_control");

        if (resumeError) throw resumeError;
      } else {
        // Cancel paused tasks — nothing new is scheduled automatically
        const { error: cancelError } = await supabase
          .from("agent_tasks")
          .update({ status: "cancelled" })
          .eq("lead_id", leadId)
          .eq("organization_id", orgId)
          .eq("status", "paused_human_control");

        if (cancelError) throw cancelError;
      }

      // Update the lead record
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          is_human_controlled: false,
          human_controlled_by: null,
          human_controlled_at: null,
          human_control_reason: null,
        })
        .eq("id", leadId)
        .eq("organization_id", orgId);

      if (updateError) throw updateError;

      toast.success("Control Released", {
        description: `${leadName} has been released back to automation.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error releasing control:", error);
      toast.error("Failed to release control. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Release to Automation
          </DialogTitle>
          <DialogDescription>
            You are about to release <strong>{leadName}</strong> back to
            automated follow-ups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-primary/10 p-4 text-sm">
            <p className="font-medium text-primary">What happens next:</p>
            <ul className="mt-2 list-disc pl-4 space-y-1 text-muted-foreground">
              <li>The AI will resume managing this lead</li>
              <li>Paused follow-ups are resumed or cancelled based on your choice below</li>
              <li>You can always take control again if needed</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Label>What should happen with paused tasks?</Label>
            <RadioGroup
              value={taskAction}
              onValueChange={(v) => setTaskAction(v as "resume" | "new")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="resume" id="resume" />
                <Label htmlFor="resume" className="font-normal">
                  Resume previously paused tasks
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new" />
                <Label htmlFor="new" className="font-normal">
                  Cancel paused tasks (no new follow-ups will be scheduled)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Release to Automation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
