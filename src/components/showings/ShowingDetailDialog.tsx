import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Link2,
  UserCheck,
  Pencil,
  Save,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { getTimezoneForCity, formatTimeInTimezone, buildScheduledAt } from "@/lib/cityTimezone";

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
  booking_source: string | null;
  booked_by_name: string | null;
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
  const [rescheduling, setRescheduling] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !showingId) {
      setShowing(null);
      setCancelMode(false);
      setCancelReason("");
      setEditMode(false);
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
          lead_id, property_id, booking_source, booked_by_name,
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
        const propTz = getTimezoneForCity(showing.properties?.city);
        const showingDate = format(parseISO(showing.scheduled_at), "EEEE, MMM d") + " at " + formatTimeInTimezone(showing.scheduled_at, propTz);

        const smsBody = `Hi ${leadName}, your property showing at ${propertyAddr} on ${showingDate} has been cancelled. To reschedule, visit: ${window.location.origin}/p/book-showing`;

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

  const handleReschedule = async () => {
    if (!showing || !userRecord?.organization_id) return;
    setRescheduling(true);

    try {
      // 1. Update showing status
      const { error: updateErr } = await supabase
        .from("showings")
        .update({
          status: "rescheduled",
          cancellation_reason: "Rescheduled by admin",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", showing.id);

      if (updateErr) throw updateErr;

      // 2. Unbook the time slot
      await supabase
        .from("showing_available_slots")
        .update({ is_booked: false, booked_showing_id: null })
        .eq("booked_showing_id", showing.id);

      // 3. Send reschedule email to lead
      const leadName = showing.leads?.full_name || "there";
      const propertyAddr = showing.properties?.address || "the property";
      const propTz2 = getTimezoneForCity(showing.properties?.city);
      const showingDate = format(parseISO(showing.scheduled_at), "EEEE, MMM d") + " at " + formatTimeInTimezone(showing.scheduled_at, propTz2);

      if (showing.leads?.email) {
        try {
          await supabase.functions.invoke("send-message", {
            body: {
              lead_id: showing.lead_id,
              channel: "email",
              body: `Your property showing at ${propertyAddr} on ${showingDate} needs to be rescheduled.\n\nPlease pick a new time that works for you:\n\n<a href="${window.location.origin}/p/book-showing" style="display:inline-block;background-color:#4F46E5;color:#ffffff;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;margin:8px 0;">Reschedule Showing</a>\n\nWe look forward to seeing you!`,
              organization_id: userRecord.organization_id,
            },
          });
        } catch (emailErr) {
          console.warn("Email send failed (non-fatal):", emailErr);
        }
      }

      // Also send SMS if phone available
      if (showing.leads?.phone) {
        try {
          await supabase.functions.invoke("send-message", {
            body: {
              lead_id: showing.lead_id,
              channel: "sms",
              body: `Hi ${leadName}, your showing at ${propertyAddr} on ${showingDate} needs to be rescheduled. Pick a new time: ${window.location.origin}/p/book-showing`,
              organization_id: userRecord.organization_id,
            },
          });
        } catch (smsErr) {
          console.warn("SMS send failed (non-fatal):", smsErr);
        }
      }

      // 4. Log
      await supabase.from("system_logs").insert({
        organization_id: userRecord.organization_id,
        level: "info",
        category: "general",
        event_type: "showing_rescheduled",
        message: `Showing for ${showing.leads?.full_name || "Unknown"} at ${propertyAddr} was rescheduled`,
        related_lead_id: showing.lead_id,
        related_showing_id: showing.id,
        details: { rescheduled_by: userRecord.id },
      });

      toast({
        title: "Showing rescheduled",
        description: `${showing.leads?.full_name || "Lead"} has been notified to pick a new time.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Reschedule error:", err);
      toast({ title: "Error", description: `Failed to reschedule: ${err.message}`, variant: "destructive" });
    } finally {
      setRescheduling(false);
    }
  };

  const enterEditMode = () => {
    if (!showing) return;
    const tz = getTimezoneForCity(showing.properties?.city);
    // Convert scheduled_at to local date/time in the property timezone
    const d = new Date(showing.scheduled_at);
    const dateStr = d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
    const timeStr = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }); // HH:mm
    setEditDate(dateStr);
    setEditTime(timeStr);
    setEditDuration(showing.duration_minutes || 30);
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!showing || !userRecord?.organization_id || !editDate || !editTime) return;
    setSaving(true);
    try {
      const tz = getTimezoneForCity(showing.properties?.city);
      const newScheduledAt = buildScheduledAt(editDate, `${editTime}:00`, tz);

      const { error } = await supabase
        .from("showings")
        .update({
          scheduled_at: newScheduledAt,
          duration_minutes: editDuration,
        })
        .eq("id", showing.id);

      if (error) throw error;

      // Log the edit
      await supabase.from("system_logs").insert({
        organization_id: userRecord.organization_id,
        level: "info",
        category: "general",
        event_type: "showing_edited",
        message: `Showing for ${showing.leads?.full_name || "Unknown"} at ${showing.properties?.address || "Unknown"} was edited`,
        related_lead_id: showing.lead_id,
        related_showing_id: showing.id,
        details: {
          old_scheduled_at: showing.scheduled_at,
          new_scheduled_at: newScheduledAt,
          edited_by: userRecord.id,
        },
      });

      toast({ title: "Showing updated", description: "Date/time updated successfully." });
      setEditMode(false);
      // Refresh showing data
      setShowing({ ...showing, scheduled_at: newScheduledAt, duration_minutes: editDuration });
      onSuccess?.();
    } catch (err: any) {
      toast({ title: "Error", description: `Failed to save: ${err.message}`, variant: "destructive" });
    } finally {
      setSaving(false);
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
              {editMode ? (
                <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                  <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> Edit Date & Time
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Date</Label>
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Time</Label>
                      <Input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duration (min)</Label>
                    <Input
                      type="number"
                      value={editDuration}
                      onChange={(e) => setEditDuration(Number(e.target.value) || 30)}
                      min={10}
                      max={180}
                      step={5}
                      className="h-9 text-sm w-24"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {format(parseISO(showing.scheduled_at), "EEEE, MMMM d, yyyy")}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTimeInTimezone(showing.scheduled_at, getTimezoneForCity(showing.properties?.city))}
                      {showing.duration_minutes && ` (${showing.duration_minutes} min)`}
                    </div>
                  </div>
                  {isActive && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-indigo-600"
                      onClick={enterEditMode}
                      title="Edit date/time"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}

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

              {/* Booked by */}
              <div className="flex items-center gap-3">
                {showing.booking_source === "public_link" ? (
                  <>
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">Booked via public link</p>
                  </>
                ) : showing.booked_by_name ? (
                  <>
                    <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">Scheduled by {showing.booked_by_name}</p>
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">Scheduled by team</p>
                  </>
                )}
              </div>

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
                  onClick={handleReschedule}
                  disabled={rescheduling}
                >
                  {rescheduling ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                  Reschedule
                </Button>
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
