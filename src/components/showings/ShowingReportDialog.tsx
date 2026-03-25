import React, { useState, useEffect } from "react";
import { Upload, X, FileText, ArrowRight, Home, Sparkles, Undo2, Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAvailableProperties, sendLeadShowingEmail } from "@/lib/notificationService";

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
  { value: "high", label: "High Interest" },
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
  const [leadData, setLeadData] = useState<{ full_name: string | null; phone: string; email: string | null } | null>(null);
  const [showingData, setShowingData] = useState<{ scheduled_at: string; property_id: string | null; properties: { address: string; unit_number: string | null; city: string | null; rent_price: number | null } | null } | null>(null);
  const [moveToApplicant, setMoveToApplicant] = useState(false);
  const [reassignPropertyId, setReassignPropertyId] = useState<string>("");
  const [properties, setProperties] = useState<{ id: string; label: string }[]>([]);
  const [enhancing, setEnhancing] = useState(false);
  const [originalReport, setOriginalReport] = useState<string | null>(null);

  // Fetch lead, showing, and properties data
  useEffect(() => {
    if (open && leadId && showingId && userRecord?.organization_id) {
      Promise.all([
        supabase.from("leads").select("full_name, phone, email").eq("id", leadId).single(),
        supabase.from("showings").select("scheduled_at, property_id, properties(address, unit_number, city, rent_price)").eq("id", showingId).single(),
        supabase.from("properties").select("id, address, unit_number, city").eq("organization_id", userRecord.organization_id).order("address"),
      ]).then(([leadRes, showingRes, propsRes]) => {
        if (leadRes.data) setLeadData(leadRes.data);
        if (showingRes.data) setShowingData(showingRes.data as any);
        if (propsRes.data) {
          setProperties(propsRes.data.map((p: any) => ({
            id: p.id,
            label: `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}${p.city ? `, ${p.city}` : ""}`,
          })));
        }
      }).catch((err) => {
        console.error("Failed to fetch showing/lead data:", err);
      });
    }
  }, [open, leadId, showingId, userRecord?.organization_id]);

  const resetForm = () => {
    setStatus("");
    setInterestLevel("");
    setAgentReport("");
    setCancellationReason("");
    setPhotoFile(null);
    setMoveToApplicant(false);
    setReassignPropertyId("");
    setOriginalReport(null);
  };

  const handleEnhanceReport = async () => {
    if (!agentReport.trim() || !userRecord?.organization_id) return;
    setEnhancing(true);
    setOriginalReport(agentReport);
    try {
      const { data, error } = await supabase.functions.invoke("enhance-report", {
        body: {
          report_text: agentReport,
          organization_id: userRecord.organization_id,
          property_address: propertyAddress || "",
        },
      });
      if (error) throw error;
      if (data?.enhanced_text) {
        setAgentReport(data.enhanced_text);
        toast.success("Report enhanced with AI");
      }
    } catch (err) {
      console.error("Enhance report error:", err);
      toast.error("Failed to enhance report");
      setOriginalReport(null);
    } finally {
      setEnhancing(false);
    }
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

    if (status === "completed" && !agentReport.trim()) {
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
        if (agentReport.trim()) {
          updateData.agent_report = agentReport;
        }

        // Send re-engagement email to lead (fire-and-forget)
        if (userRecord?.organization_id && leadData?.email && showingData) {
          const otherProps = await fetchAvailableProperties(
            userRecord.organization_id,
            showingData.property_id || undefined,
            5,
            showingData.properties?.city || undefined,
          );
          const bookingUrl = `${window.location.origin}/p/book-showing`;
          sendLeadShowingEmail({
            leadEmail: leadData.email,
            organizationId: userRecord.organization_id,
            showingId,
            type: "no_show",
            emailData: {
              leadName: leadData.full_name || "there",
              propertyAddress: propertyAddress || "your scheduled property",
              bookingUrl,
              otherProperties: otherProps,
              scheduledTime: new Date(showingData.scheduled_at).toLocaleString("en-US", {
                weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              }),
            },
          });
        }
      }

      if (status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
        updateData.cancellation_reason = cancellationReason;

        // Send cancellation email to lead
        if (userRecord?.organization_id && leadData?.email && showingData) {
          const otherProps = await fetchAvailableProperties(
            userRecord.organization_id,
            showingData.property_id || undefined,
            5,
            showingData.properties?.city || undefined,
          );
          sendLeadShowingEmail({
            leadEmail: leadData.email,
            organizationId: userRecord.organization_id,
            showingId,
            type: "cancelled",
            emailData: {
              leadName: leadData.full_name || "there",
              propertyAddress: propertyAddress || "your scheduled property",
              bookingUrl: `${window.location.origin}/p/book-showing`,
              otherProperties: otherProps,
            },
          });
        }
      }

      if (status === "rescheduled") {
        updateData.cancellation_reason = cancellationReason;

        // Send rescheduled email to lead
        if (userRecord?.organization_id && leadData?.email && showingData) {
          const otherProps = await fetchAvailableProperties(
            userRecord.organization_id,
            showingData.property_id || undefined,
            5,
            showingData.properties?.city || undefined,
          );
          sendLeadShowingEmail({
            leadEmail: leadData.email,
            organizationId: userRecord.organization_id,
            showingId,
            type: "rescheduled",
            emailData: {
              leadName: leadData.full_name || "there",
              propertyAddress: propertyAddress || "your scheduled property",
              bookingUrl: `${window.location.origin}/p/book-showing`,
              otherProperties: otherProps,
              scheduledTime: new Date(showingData.scheduled_at).toLocaleString("en-US", {
                weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              }),
            },
          });
        }
      }

      // Update showing
      const { error: showingError } = await supabase
        .from("showings")
        .update(updateData)
        .eq("id", showingId);

      if (showingError) throw showingError;

      // Update lead status if completed
      if (status === "completed") {
        const leadUpdate: Record<string, any> = {
          status: moveToApplicant ? "in_application" : "showed",
          updated_at: new Date().toISOString(),
        };
        if (reassignPropertyId && reassignPropertyId !== "keep") {
          leadUpdate.interested_property_id = reassignPropertyId;
        }

        const { error: leadError } = await supabase
          .from("leads")
          .update(leadUpdate)
          .eq("id", leadId);

        if (leadError) {
          console.error("Error updating lead status:", leadError);
        }
      }

      const statusMessages: Record<string, string> = {
        completed: moveToApplicant
          ? "Showing completed — lead moved to Applicants"
          : "Showing marked as completed",
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
  const showAgentReport = status === "completed";
  const showCancellationReason = status === "cancelled" || status === "rescheduled";
  const showPhotoUpload = status === "completed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px]">
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
              <div className="flex items-center justify-between">
                <Label>Agent Report {status === "completed" ? "*" : "(optional)"}</Label>
                {status === "completed" && (
                  <div className="flex items-center gap-1">
                    {originalReport !== null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setAgentReport(originalReport); setOriginalReport(null); }}
                      >
                        <Undo2 className="h-3 w-3 mr-1" />
                        Undo
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleEnhanceReport}
                      disabled={enhancing || !agentReport.trim()}
                    >
                      {enhancing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      AI Enhance
                    </Button>
                  </div>
                )}
              </div>
              <Textarea
                value={agentReport}
                onChange={(e) => { setAgentReport(e.target.value); setOriginalReport(null); }}
                placeholder={status === "completed"
                  ? "Describe the showing experience, prospect reactions, and any notable observations..."
                  : "Optional notes about the no-show..."
                }
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

          {/* Reassign property + Move to applicants (only for completed) */}
          {status === "completed" && (
            <div className="space-y-4 pt-2 border-t">
              {/* Current property preview */}
              {showingData?.properties && (
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40 border border-border/50">
                  <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">{showingData.properties.address}</span>
                    {showingData.properties.unit_number && <span> #{showingData.properties.unit_number}</span>}
                    {showingData.properties.city && <span className="text-muted-foreground">, {showingData.properties.city}</span>}
                    {showingData.properties.rent_price && (
                      <span className="text-muted-foreground"> — ${showingData.properties.rent_price.toLocaleString()}/mo</span>
                    )}
                  </div>
                </div>
              )}

              {/* Reassign property */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" />
                  Reassign Property (optional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  If the lead wants to apply for a different property
                </p>
                <Select value={reassignPropertyId} onValueChange={setReassignPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Keep current property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current property</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Move to applicants */}
              <div className="flex items-center justify-between rounded-lg border p-3 bg-indigo-50/50">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium">Move to Applicants</p>
                    <p className="text-xs text-muted-foreground">
                      Change lead status to "In Application"
                    </p>
                  </div>
                </div>
                <Switch
                  checked={moveToApplicant}
                  onCheckedChange={setMoveToApplicant}
                />
              </div>
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
