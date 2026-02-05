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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface HumanTakeoverModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  onSuccess: () => void;
}

export const HumanTakeoverModal: React.FC<HumanTakeoverModalProps> = ({
  open,
  onOpenChange,
  leadId,
  leadName,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValid = reason.length >= 20 && confirmed;

  const handleSubmit = async () => {
    if (!isValid || !userRecord) return;

    setLoading(true);
    try {
      // Call the pause_lead_agent_tasks function
      const { error: pauseError } = await supabase.rpc("pause_lead_agent_tasks", {
        _lead_id: leadId,
        _reason: reason,
        _user_id: userRecord.id,
      });

      if (pauseError) {
        console.error("Error pausing tasks:", pauseError);
      }

      // Update the lead record
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          is_human_controlled: true,
          human_controlled_by: userRecord.id,
          human_controlled_at: new Date().toISOString(),
          human_control_reason: reason,
        })
        .eq("id", leadId);

      if (updateError) throw updateError;

      toast({
        title: "Control Taken",
        description: `You are now in control of ${leadName}. All automated follow-ups have been paused.`,
      });

      onSuccess();
      onOpenChange(false);
      setReason("");
      setConfirmed(false);
    } catch (error) {
      console.error("Error taking control:", error);
      toast({
        title: "Error",
        description: "Failed to take control of this lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Take Control of This Lead
          </DialogTitle>
          <DialogDescription>
            You are about to take manual control of <strong>{leadName}</strong>.
            This will pause all automated follow-ups and communications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">What happens when you take control:</p>
            <ul className="mt-2 list-disc pl-4 space-y-1">
              <li>All scheduled AI calls will be paused</li>
              <li>Automated SMS/email follow-ups will stop</li>
              <li>You become responsible for all communications</li>
              <li>The lead will be marked with a "Human Controlled" badge</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for taking control{" "}
              <span className="text-muted-foreground">(min 20 characters)</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Explain why you need to take manual control of this lead..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/20 characters minimum
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor="confirm" className="text-sm font-normal">
              I understand all automated follow-ups will be paused
            </Label>
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
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!isValid || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Take Control
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
