import React, { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendNoShowNotification, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notificationService";

interface ShowingReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showingId: string;
  leadId: string;
  propertyAddress?: string;
  onSuccess?: () => void;
}

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rescheduled", label: "Rescheduled" },
];

const INTEREST_LEVELS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "not_interested", label: "Not Interested" },
];

export const ShowingReportDialog: React.FC<ShowingReportDialogProps> = ({
  open,
  onOpenChange,
  showingId,
  leadId,
  propertyAddress,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const [status, setStatus] = useState<string>("");
  const [interestLevel, setInterestLevel] = useState<string>("");
  const [agentReport, setAgentReport] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leadData, setLeadData] = useState<{ full_name: string | null; phone: string } | null>(null);
  const [showingData, setShowingData] = useState<{ scheduled_at: string } | null>(null);

  // Fetch lead and showing data for notifications
  useEffect(() => {
    if (open && leadId && showingId) {
      Promise.all([
        supabase.from("leads").select("full_name, phone").eq("id", leadId).single(),
        supabase.from("showings").select("scheduled_at").eq("id", showingId).single(),
      ]).then(([leadRes, showingRes]) => {
        if (leadRes.data) setLeadData(leadRes.data);
        if (showingRes.data) setShowingData(showingRes.data);
      });
    }
  }, [open, leadId, showingId]);

  const resetForm = () => {
    setStatus("");
    setInterestLevel("");
    setAgentReport("");
    setCancellationReason("");
    setPhotoFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Photo must be less than 5MB");
        return;
      }
      setPhotoFile(file);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!status) {
      toast.error("Please select a status");
      return;
    }

    if ((status === "completed" || status === "no_show") && !agentReport.trim()) {
      toast.error("Please provide an agent report");
      return;
    }

    if (status === "completed" && !interestLevel) {
      toast.error("Please select the prospect's interest level");
      return;
    }

    if ((status === "cancelled" || status === "rescheduled") && !cancellationReason.trim()) {
      toast.error("Please provide a reason for cancellation/rescheduling");
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl: string | null = null;

      // Upload photo if provided
      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${showingId}-${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("property-photos")
          .upload(`showing-reports/${fileName}`, photoFile);

        if (uploadError) {
          console.error("Photo upload error:", uploadError);
          // Continue without photo, don't fail the whole operation
        } else {
          const { data: urlData } = supabase.storage
            .from("property-photos")
            .getPublicUrl(`showing-reports/${fileName}`);
          photoUrl = urlData.publicUrl;
        }
      }

      // Build update data
      const updateData: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
        updateData.prospect_interest_level = interestLevel;
        updateData.agent_report = agentReport;
        if (photoUrl) {
          updateData.agent_report_photo_url = photoUrl;
        }
      }

      if (status === "no_show") {
        updateData.agent_report = agentReport;

        // Send no-show notification email (fire-and-forget)
        if (userRecord?.organization_id && leadData && showingData) {
          // Check notification preferences
          const { data: settingsData } = await supabase
            .from("organization_settings")
            .select("value")
            .eq("organization_id", userRecord.organization_id)
            .eq("key", "email_notification_preferences")
            .single();

          const prefs = settingsData?.value as typeof DEFAULT_NOTIFICATION_PREFS | null;
          const shouldNotify = prefs?.no_show !== false; // Default to true

          if (shouldNotify) {
            const { data: orgData } = await supabase
              .from("organizations")
              .select("owner_email")
              .eq("id", userRecord.organization_id)
              .single();

            const notificationEmail = (prefs?.notification_email as string) || orgData?.owner_email;
            
            if (notificationEmail) {
              sendNoShowNotification({
                adminEmail: notificationEmail,
                organizationId: userRecord.organization_id,
                showing: {
                  id: showingId,
                  scheduled_at: showingData.scheduled_at,
                },
                lead: {
                  id: leadId,
                  full_name: leadData.full_name,
                  phone: leadData.phone,
                },
                propertyAddress: propertyAddress || "Unknown property",
              });
            }
          }
        }
      }

      if (status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
        updateData.cancellation_reason = cancellationReason;
      }

      if (status === "rescheduled") {
        updateData.cancellation_reason = cancellationReason;
        // rescheduled_to_id would be set when the new showing is created
      }

      // Update showing
      const { error: showingError } = await supabase
        .from("showings")
        .update(updateData)
        .eq("id", showingId);

      if (showingError) throw showingError;

      // Update lead status if completed
      if (status === "completed") {
        const { error: leadError } = await supabase
          .from("leads")
          .update({
            status: "showed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);

        if (leadError) {
          console.error("Error updating lead status:", leadError);
        }
      }

      const statusMessages: Record<string, string> = {
        completed: "Showing marked as completed",
        no_show: "Showing marked as no-show",
        cancelled: "Showing marked as cancelled",
        rescheduled: "Showing marked for rescheduling",
      };

      toast.success(statusMessages[status] || "Report submitted");

      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  const showInterestLevel = status === "completed";
  const showAgentReport = status === "completed" || status === "no_show";
  const showCancellationReason = status === "cancelled" || status === "rescheduled";
  const showPhotoUpload = status === "completed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Submit Showing Report</DialogTitle>
          <DialogDescription>
            Record the outcome of this showing appointment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status */}
          <div className="space-y-2">
            <Label>Status *</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Interest Level (only for completed) */}
          {showInterestLevel && (
            <div className="space-y-2">
              <Label>Prospect Interest Level *</Label>
              <Select value={interestLevel} onValueChange={setInterestLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select interest level" />
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_LEVELS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Agent Report (for completed and no_show) */}
          {showAgentReport && (
            <div className="space-y-2">
              <Label>Agent Report *</Label>
              <Textarea
                value={agentReport}
                onChange={(e) => setAgentReport(e.target.value)}
                placeholder="Describe the showing experience, prospect reactions, and any notable observations..."
                rows={4}
              />
            </div>
          )}

          {/* Cancellation Reason (for cancelled and rescheduled) */}
          {showCancellationReason && (
            <div className="space-y-2">
              <Label>
                {status === "cancelled" ? "Cancellation Reason *" : "Reschedule Reason *"}
              </Label>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder={
                  status === "cancelled"
                    ? "Why was the showing cancelled?"
                    : "Why does this need to be rescheduled?"
                }
                rows={3}
              />
            </div>
          )}

          {/* Photo Upload (only for completed) */}
          {showPhotoUpload && (
            <div className="space-y-2">
              <Label>Photo (optional)</Label>
              {photoFile ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <span className="text-sm truncate flex-1">{photoFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPhotoFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button type="button" variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Max file size: 5MB. Supported formats: JPG, PNG
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !status}
          >
            {submitting ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
