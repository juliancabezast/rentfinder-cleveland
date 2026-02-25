import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays,
  Clock,
  MapPin,
  User,
  Phone,
  CalendarX2,
  RefreshCw,
  FileText,
  Loader2,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface ShowingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showingId: string | null;
  onSuccess?: () => void;
  onOpenReport?: (showingId: string, leadId: string, propertyAddress: string) => void;
}

interface ShowingData {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  cancellation_reason: string | null;
  agent_report: string | null;
  agent_report_photo_url: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  confirmation_attempts: number | null;
  prospect_interest_level: string | null;
  lead_id: string;
  property_id: string;
  properties: { id: string; address: string; unit_number: string | null; city: string | null } | null;
  leads: { id: string; full_name: string | null; phone: string; email: string | null; sms_consent: boolean | null } | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-800", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  confirmed: { label: "Confirmed", color: "bg-emerald-100 text-emerald-800", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800", icon: <XCircle className="h-3.5 w-3.5" /> },
  no_show: { label: "No Show", color: "bg-amber-100 text-amber-800", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  rescheduled: { label: "Rescheduled", color: "bg-purple-100 text-purple-800", icon: <RefreshCw className="h-3.5 w-3.5" /> },
};

export const ShowingDetailDialog: React.FC<ShowingDetailDialogProps> = ({
  open,
  onOpenChange,
  showingId,
  onSuccess,
  onOpenReport,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [showing, setShowing] = useState<ShowingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!open || !showingId) {
      setShowing(null);
      setCancelMode(false);
      setCancelReason("");
      return;
    }

    const fetchShowing = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("showings")
        .select(`
          id, scheduled_at, status, duration_minutes, cancellation_reason,
          agent_report, agent_report_photo_url, confirmed_at, cancelled_at,
          completed_at, confirmation_attempts, prospect_interest_level,
          lead_id, property_id,
          properties(id, address, unit_number, city),
          leads(id, full_name, phone, email, sms_consent)
        `)
        .eq("id", showingId)
        .single();

      if (error) {
        console.error("Error fetching showing:", error);
        toast({ title: "Error", description: "Failed to load showing details.", variant: "destructive" });
        onOpenChange(false);
      } else {
        setShowing(data as any);
      }
      setLoading(false);
    };

    fetchShowing();
  }, [open, showingId]);

  const handleCancel = async () => {
    if (!showing || !userRecord?.organization_id) return;
    setCancelling(true);

    try {
      // 1. Update showing status
      const { error: updateErr } = await supabase
        .from("showings")
        .update({
          status: "cancelled",
          cancellation_reason: cancelReason || "Cancelled by admin",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", showing.id);

      if (updateErr) throw updateErr;

      // 2. Unbook the time slot
      await supabase
        .from("showing_available_slots")
        .update({ is_booked: false, booked_showing_id: null })
        .eq("booked_showing_id", showing.id);

      // 3. Send cancellation SMS to lead
      if (showing.leads?.phone) {
        const leadName = showing.leads.full_name || "there";
        const propertyAddr = showing.properties?.address || "the property";
        const showingDate = format(parseISO(showing.scheduled_at), "EEEE, MMM d 'at' h:mm a");

        const smsBody = `Hi ${leadName}, your property showing at ${propertyAddr} on ${showingDate} has been cancelled. To reschedule, visit: https://rentfindercleveland.com/p/book-showing`;

        try {
          await supabase.functions.invoke("send-message", {
            body: {
              lead_id: showing.lead_id,
              channel: "sms",
              body: smsBody,
              organization_id: userRecord.organization_id,
            },
          });
        } catch (smsErr) {
          console.warn("SMS send failed (non-fatal):", smsErr);
        }
      }

      // 4. Log to system_logs
      await supabase.from("system_logs").insert({
        organization_id: userRecord.organization_id,
        level: "info",
        category: "general",
        event_type: "showing_cancelled",
        message: `Showing for ${showing.leads?.full_name || "Unknown"} at ${showing.properties?.address || "Unknown"} was cancelled`,
        related_lead_id: showing.lead_id,
        related_showing_id: showing.id,
        details: {
          reason: cancelReason,
          cancelled_by: userRecord.id,
        },
      });

      toast({
        title: "Showing cancelled",
        description: `SMS notification sent to ${showing.leads?.full_name || "lead"} with rescheduling link.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Cancel error:", err);
      toast({ title: "Error", description: `Failed to cancel: ${err.message}`, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const isActive = showing?.status === "scheduled" || showing?.status === "confirmed";
  const sc = statusConfig[showing?.status || ""] || statusConfig.scheduled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Showing Details
            {showing && (
              <Badge className={`${sc.color} gap-1`}>
                {sc.icon}
                {sc.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-10 w-full mt-4" />
          </div>
        ) : showing ? (
          <div className="space-y-4">
            {/* Info Section */}
            <div className="space-y-3 rounded-lg border border-[#e5e7eb] p-4">
              {/* Date/Time */}
              <div className="flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISO(showing.scheduled_at), "EEEE, MMMM d, yyyy")}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(showing.scheduled_at), "h:mm a")}
                    {showing.duration_minutes && ` (${showing.duration_minutes} min)`}
                  </div>
                </div>
              </div>

              {/* Property */}
              {showing.properties && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm">
                    {showing.properties.address}
                    {showing.properties.unit_number && ` #${showing.properties.unit_number}`}
                    {showing.properties.city && `, ${showing.properties.city}`}
                  </p>
                </div>
              )}

              {/* Lead */}
              {showing.leads && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">{showing.leads.full_name || "Unknown"}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {showing.leads.phone}
                      {showing.leads.email && ` · ${showing.leads.email}`}
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation info */}
              {showing.confirmed_at && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Confirmed {format(parseISO(showing.confirmed_at), "MMM d 'at' h:mm a")}
                  </p>
                </div>
              )}
              {(showing.confirmation_attempts ?? 0) > 0 && !showing.confirmed_at && (
                <p className="text-xs text-amber-600 ml-7">
                  {showing.confirmation_attempts} confirmation attempt(s), not yet confirmed
                </p>
              )}
            </div>

            {/* Completed showing info */}
            {showing.status === "completed" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <p className="text-sm font-medium text-emerald-800">Showing Completed</p>
                {showing.prospect_interest_level && (
                  <p className="text-xs text-emerald-700">
                    Interest level: <span className="font-medium capitalize">{showing.prospect_interest_level}</span>
                  </p>
                )}
                {showing.agent_report && (
                  <p className="text-xs text-emerald-700">{showing.agent_report}</p>
                )}
                {showing.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(showing.completed_at), "MMM d 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}

            {/* Cancelled showing info */}
            {showing.status === "cancelled" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                <p className="text-sm font-medium text-red-800">Cancelled</p>
                {showing.cancellation_reason && (
                  <p className="text-xs text-red-700">{showing.cancellation_reason}</p>
                )}
                {showing.cancelled_at && (
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(showing.cancelled_at), "MMM d 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}

            {/* No-show info */}
            {showing.status === "no_show" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">Lead did not show up</p>
                {showing.agent_report && (
                  <p className="text-xs text-amber-700 mt-1">{showing.agent_report}</p>
                )}
              </div>
            )}

            {/* Cancel confirmation area */}
            {cancelMode && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
                <p className="text-sm font-medium text-red-800">Cancel this showing?</p>
                <p className="text-xs text-red-700">
                  An SMS will be sent to {showing.leads?.full_name || "the lead"} with a link to reschedule.
                </p>
                <Textarea
                  placeholder="Reason for cancellation (optional)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    {cancelling && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Confirm Cancellation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setCancelMode(false); setCancelReason(""); }}
                    disabled={cancelling}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {/* Action buttons (only for active showings, hide when in cancel mode) */}
            {isActive && !cancelMode && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#e5e7eb]">
                {onOpenReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenReport(
                        showing.id,
                        showing.lead_id,
                        showing.properties?.address || ""
                      );
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    Submit Report
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => setCancelMode(true)}
                >
                  <CalendarX2 className="h-4 w-4 mr-1.5" />
                  Cancel Showing
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
