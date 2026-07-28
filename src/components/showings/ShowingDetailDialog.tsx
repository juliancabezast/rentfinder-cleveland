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
import { toast } from "sonner";
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
  ClipboardCheck,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { getTimezoneForCity, formatTimeInTimezone, buildScheduledAt, todayInTimezone } from "@/lib/cityTimezone";
import { fetchAvailableProperties, sendLeadShowingEmail, sendNotificationEmail } from "@/lib/notificationService";
import { markApplicationGenerated, unmarkApplicationGenerated } from "@/lib/applications";
import { renderEmailHtml, DEFAULT_CONFIGS } from "@/lib/emailTemplateDefaults";
import type { EmailTemplatesMap } from "@/lib/emailTemplateDefaults";
import type { TablesUpdate } from "@/integrations/supabase/types";

// Showings book only on the hour or half-hour (:00 / :30) — mirrors every
// picker in the app and the DB guard (trg_enforce_showing_half_hour). Takes an
// "HH:MM" value from an <input type="time">.
const isOnHalfHour = (hhmm: string) => {
  const min = parseInt((hhmm || "").slice(3, 5), 10);
  return min === 0 || min === 30;
};

// Half-hour times a showing occupies, starting at "HH:MM:SS". A >30-min showing
// spans several slots and the single agent can't be in two places, so every
// spanned time must be guarded/blocked — shared by the reschedule + edit paths.
const computeSpannedTimes = (slotTime: string, durationMinutes: number): string[] => {
  const slotsSpanned = Math.max(1, Math.ceil((durationMinutes || 30) / 30));
  const out: string[] = [];
  const [sH, sM] = slotTime.split(":").map(Number);
  for (let i = 0; i < slotsSpanned; i++) {
    const total = sH * 60 + sM + i * 30;
    if (Math.floor(total / 60) >= 24) break;
    out.push(
      `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`,
    );
  }
  return out;
};

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
  leads: { id: string; full_name: string | null; phone: string; email: string | null; sms_consent: boolean | null; has_voucher: boolean | null; applied_at: string | null } | null;
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
  const [showing, setShowing] = useState<ShowingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleChooser, setRescheduleChooser] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  useEffect(() => {
    if (!open || !showingId) {
      setShowing(null);
      setCancelMode(false);
      setCancelReason("");
      setEditMode(false);
      setRescheduleMode(false);
      setRescheduleChooser(false);
      return;
    }

    const fetchShowing = async () => {
      setLoading(true);
      // Defense-in-depth org scoping (RLS is the only other backstop). Applied
      // when the org is known — the dialog only opens inside an authenticated
      // session, so userRecord is effectively always set by this point.
      let query = supabase
        .from("showings")
        .select(`
          id, scheduled_at, status, duration_minutes, cancellation_reason,
          agent_report, agent_report_photo_url, confirmed_at, cancelled_at,
          completed_at, confirmation_attempts, prospect_interest_level,
          lead_id, property_id, booking_source, booked_by_name,
          properties(id, address, unit_number, city),
          leads(id, full_name, phone, email, sms_consent, has_voucher, applied_at)
        `)
        .eq("id", showingId);
      if (userRecord?.organization_id) query = query.eq("organization_id", userRecord.organization_id);
      const { data, error } = await query.single();

      if (error) {
        console.error("Error fetching showing:", error);
        toast.error("Failed to load showing details");
        onOpenChange(false);
      } else {
        setShowing(data as any);
      }
      setLoading(false);
    };

    fetchShowing();
  }, [open, showingId, userRecord?.organization_id]);

  // True when a DIFFERENT property's active showing overlaps the interval
  // [newScheduledAt, newScheduledAt + duration). The slot table can miss a
  // >30-min tour's tail (no row exists to be flagged), so the real bookings
  // are the authority — mirrors the load-bearing single-agent invariant.
  const agentBusyElsewhere = async (newScheduledAt: string, durationMinutes: number): Promise<boolean> => {
    if (!showing || !userRecord?.organization_id) return false;
    const newStart = new Date(newScheduledAt).getTime();
    const newEnd = newStart + (durationMinutes || 30) * 60 * 1000;
    // Window: showings can be up to 180 min, so anything starting up to 3h
    // before the new start could still overlap it.
    const { data: nearby, error } = await supabase
      .from("showings")
      .select("id, scheduled_at, duration_minutes, property_id")
      .eq("organization_id", userRecord.organization_id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date(newStart - 3 * 60 * 60 * 1000).toISOString())
      .lt("scheduled_at", new Date(newEnd).toISOString())
      .neq("id", showing.id);
    if (error) {
      console.error("Overlap check failed:", error);
      return false; // the DB trigger still hard-blocks exact-instant conflicts
    }
    return (nearby || []).some((s: any) => {
      if (s.property_id === showing.property_id) return false; // same address → group tour, OK
      const sStart = new Date(s.scheduled_at).getTime();
      const sEnd = sStart + (s.duration_minutes || 30) * 60 * 1000;
      return sStart < newEnd && newStart < sEnd;
    });
  };

  // A cancelled/rescheduled showing must not keep emailing the lead: kill its
  // pending Samuel follow-up tasks (confirmation / no-show / post-showing).
  // Best-effort — the status change is already committed.
  const cancelPendingShowingTasks = async (showingIdToCancel: string) => {
    if (!userRecord?.organization_id) return;
    const { error } = await supabase
      .from("agent_tasks")
      .update({ status: "cancelled" })
      .eq("organization_id", userRecord.organization_id)
      .eq("status", "pending")
      .eq("context->>showing_id", showingIdToCancel);
    if (error) console.error("Cancel pending showing tasks failed:", error);
  };

  // When a showing MOVES, its pending follow-up tasks were scheduled off the
  // OLD time — re-anchor them to the new one so the lead isn't reminded about
  // (or chased after) a time that no longer exists. Best-effort; note that
  // agent_tasks has NO updated_at column.
  const retimePendingShowingTasks = async (showingIdToMove: string, newScheduledAt: string) => {
    if (!userRecord?.organization_id) return;
    const OFFSETS_MS: Record<string, number> = {
      showing_confirmation: -24 * 60 * 60 * 1000,
      no_show_followup: 60 * 60 * 1000,
      post_showing: 24 * 60 * 60 * 1000,
    };
    const { data: tasks, error } = await supabase
      .from("agent_tasks")
      .select("id, agent_type, context")
      .eq("organization_id", userRecord.organization_id)
      .eq("status", "pending")
      .eq("context->>showing_id", showingIdToMove);
    if (error) {
      console.error("Fetch pending showing tasks failed:", error);
      return;
    }
    const base = new Date(newScheduledAt).getTime();
    for (const t of tasks || []) {
      const offset = OFFSETS_MS[t.agent_type as string];
      if (offset === undefined) continue;
      const newFor = new Date(base + offset);
      if (t.agent_type === "showing_confirmation" && newFor.getTime() <= Date.now()) {
        // A 24h-before confirmation that would fire immediately is noise —
        // the reschedule confirmation email already covers it. Drop it.
        const { error: cancelErr } = await supabase
          .from("agent_tasks")
          .update({ status: "cancelled" })
          .eq("id", t.id)
          .eq("status", "pending");
        if (cancelErr) console.error("Cancel stale confirmation task failed:", cancelErr);
        continue;
      }
      const { error: updErr } = await supabase
        .from("agent_tasks")
        .update({
          scheduled_for: newFor.toISOString(),
          context: { ...((t.context as Record<string, unknown>) || {}), scheduled_at: newScheduledAt },
        })
        .eq("id", t.id)
        .eq("status", "pending");
      if (updErr) console.error(`Retime task ${t.id} failed:`, updErr);
    }
  };

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
        .eq("organization_id", userRecord.organization_id)
        .eq("id", showing.id);

      if (updateErr) throw updateErr;

      // 2. Unbook the time slot (redundant with the status-sync DB trigger,
      // kept as belt-and-braces — but at least LOG a failure).
      {
        const { error: relErr } = await supabase
          .from("showing_available_slots")
          .update({ is_booked: false, booked_showing_id: null })
          .eq("organization_id", userRecord.organization_id)
          .eq("booked_showing_id", showing.id);
        if (relErr) console.error("Slot release failed (trigger should cover it):", relErr);
      }

      // 2b. Kill pending follow-up tasks so the lead isn't reminded about a
      // showing that no longer exists.
      await cancelPendingShowingTasks(showing.id);

      // 3. Send cancellation SMS to lead. Track the real outcome — a consent
      // block or send failure must not produce a "notification sent" toast.
      let smsSent = false;
      if (showing.leads?.phone) {
        const leadName = showing.leads.full_name || "there";
        const propertyAddr = showing.properties?.address || "the property";
        const propTz = getTimezoneForCity(showing.properties?.city);
        const showingDate = format(parseISO(showing.scheduled_at), "EEEE, MMM d") + " at " + formatTimeInTimezone(showing.scheduled_at, propTz);

        const smsBody = `Hi ${leadName}, your property showing at ${propertyAddr} on ${showingDate} has been cancelled. To reschedule, visit: ${window.location.origin}/p/book-showing`;

        try {
          const { error: smsError } = await supabase.functions.invoke("send-message", {
            body: {
              lead_id: showing.lead_id,
              channel: "sms",
              body: smsBody,
              organization_id: userRecord.organization_id,
            },
          });
          if (smsError) {
            console.warn("SMS send failed (non-fatal):", smsError);
          } else {
            smsSent = true;
          }
        } catch (smsErr) {
          console.warn("SMS send failed (non-fatal):", smsErr);
        }
      }

      // 3b. Send cancellation email to lead with other properties (same city)
      let emailQueued = false;
      if (showing.leads?.email) {
        const otherProps = await fetchAvailableProperties(
          userRecord.organization_id,
          showing.property_id || undefined,
          5,
          showing.properties?.city || undefined,
        );
        sendLeadShowingEmail({
          leadEmail: showing.leads.email,
          organizationId: userRecord.organization_id,
          showingId: showing.id,
          type: "cancelled",
          emailData: {
            leadName: showing.leads.full_name || "there",
            propertyAddress: showing.properties?.address || "the property",
            bookingUrl: `${window.location.origin}/p/book-showing`,
            otherProperties: otherProps,
          },
        });
        emailQueued = true; // fire-and-forget queue — best signal we have
      }

      // 4. Log to system_logs
      {
        const { error: logErr } = await supabase.from("system_logs").insert({
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
            sms_sent: smsSent,
            email_queued: emailQueued,
          },
        });
        if (logErr) console.error("System log insert failed:", logErr);
      }

      // Honest toast: only claim what actually happened.
      const leadLabel = showing.leads?.full_name || "the lead";
      const notified = [smsSent && "SMS", emailQueued && "email"].filter(Boolean).join(" + ");
      if (notified) {
        toast.success("Showing cancelled", {
          description: `${leadLabel} was notified by ${notified} with a rescheduling link.`,
        });
      } else {
        toast.warning("Showing cancelled — lead NOT notified", {
          description: `We couldn't reach ${leadLabel} automatically. Contact them directly.`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Cancel error:", err);
      toast.error(`Failed to cancel: ${err.message}`);
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
        .eq("organization_id", userRecord.organization_id)
        .eq("id", showing.id);

      if (updateErr) throw updateErr;

      // 2. Unbook the time slot (redundant with the status-sync DB trigger,
      // kept as belt-and-braces — but at least LOG a failure).
      {
        const { error: relErr } = await supabase
          .from("showing_available_slots")
          .update({ is_booked: false, booked_showing_id: null })
          .eq("organization_id", userRecord.organization_id)
          .eq("booked_showing_id", showing.id);
        if (relErr) console.error("Slot release failed (trigger should cover it):", relErr);
      }

      // 2b. Kill pending follow-up tasks — they were anchored to the old time.
      await cancelPendingShowingTasks(showing.id);

      // 3. Send reschedule notifications. Track real outcomes for the toast.
      let smsSent = false;
      let emailQueued = false;
      const leadName = showing.leads?.full_name || "there";
      const propertyAddr = showing.properties?.address || "the property";
      const propTz2 = getTimezoneForCity(showing.properties?.city);
      const showingDate = format(parseISO(showing.scheduled_at), "EEEE, MMM d") + " at " + formatTimeInTimezone(showing.scheduled_at, propTz2);

      // Send rich reschedule email with available properties (same city)
      if (showing.leads?.email) {
        const otherProps = await fetchAvailableProperties(
          userRecord.organization_id,
          showing.property_id || undefined,
          5,
          showing.properties?.city || undefined,
        );
        sendLeadShowingEmail({
          leadEmail: showing.leads.email,
          organizationId: userRecord.organization_id,
          showingId: showing.id,
          type: "rescheduled",
          emailData: {
            leadName,
            propertyAddress: propertyAddr,
            bookingUrl: `${window.location.origin}/p/book-showing`,
            otherProperties: otherProps,
            scheduledTime: showingDate,
          },
        });
        emailQueued = true; // fire-and-forget queue — best signal we have
      }

      // Also send SMS if phone available
      if (showing.leads?.phone) {
        try {
          const { error: smsError } = await supabase.functions.invoke("send-message", {
            body: {
              lead_id: showing.lead_id,
              channel: "sms",
              body: `Hi ${leadName}, your showing at ${propertyAddr} on ${showingDate} needs to be rescheduled. Pick a new time: ${window.location.origin}/p/book-showing`,
              organization_id: userRecord.organization_id,
            },
          });
          if (smsError) {
            console.warn("SMS send failed (non-fatal):", smsError);
          } else {
            smsSent = true;
          }
        } catch (smsErr) {
          console.warn("SMS send failed (non-fatal):", smsErr);
        }
      }

      // 4. Log
      {
        const { error: logErr } = await supabase.from("system_logs").insert({
          organization_id: userRecord.organization_id,
          level: "info",
          category: "general",
          event_type: "showing_rescheduled",
          message: `Showing for ${showing.leads?.full_name || "Unknown"} at ${propertyAddr} was rescheduled`,
          related_lead_id: showing.lead_id,
          related_showing_id: showing.id,
          details: { rescheduled_by: userRecord.id, sms_sent: smsSent, email_queued: emailQueued },
        });
        if (logErr) console.error("System log insert failed:", logErr);
      }

      // Honest toast: only claim the channels that actually went out.
      const leadLabel2 = showing.leads?.full_name || "The lead";
      const sentVia = [emailQueued && "emailed", smsSent && "texted"].filter(Boolean).join(" + ");
      if (sentVia) {
        toast.success("Reschedule link sent", {
          description: `${leadLabel2} was ${sentVia} a link to pick a new time.`,
        });
      } else {
        toast.warning("Time freed — lead NOT notified", {
          description: `We couldn't reach ${leadLabel2} automatically. Send them the booking link directly.`,
        });
      }

      setRescheduleChooser(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Reschedule error:", err);
      toast.error(`Failed to reschedule: ${err.message}`);
    } finally {
      setRescheduling(false);
    }
  };

  const enterRescheduleMode = () => {
    if (!showing) return;
    // Default to tomorrow, same time
    const tz = getTimezoneForCity(showing.properties?.city);
    const d = new Date(showing.scheduled_at);
    const timeStr = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleDate(format(tomorrow, "yyyy-MM-dd"));
    setRescheduleTime(timeStr);
    setRescheduleMode(true);
  };

  const handleReactivate = async () => {
    if (!showing || !userRecord?.organization_id || !rescheduleDate || !rescheduleTime) return;
    if (!isOnHalfHour(rescheduleTime)) {
      toast.error("Showings can only be booked on the hour (:00) or half-hour (:30).");
      return;
    }
    setReactivating(true);
    try {
      const tz = getTimezoneForCity(showing.properties?.city);
      const newScheduledAt = buildScheduledAt(rescheduleDate, rescheduleTime, tz);
      const slotTime = rescheduleTime.length === 5 ? `${rescheduleTime}:00` : rescheduleTime;

      // Reject a move into the past (mirrors ScheduleShowingDialog) — a reschedule
      // targets a NEW future time, never a bygone one. Compared against the
      // property's calendar day/clock so a traveling admin can't backdate it.
      const rescheduleToday = todayInTimezone(tz);
      if (rescheduleDate < rescheduleToday) {
        toast.error("That date is in the past", { description: "Pick a future date." });
        setReactivating(false);
        return;
      }
      if (rescheduleDate === rescheduleToday) {
        const [rh, rm] = rescheduleTime.split(":").map(Number);
        const nowParts = new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
        if (rh * 60 + rm + 30 <= nowParts[0] * 60 + nowParts[1]) {
          toast.error("That time has already passed today", { description: "Pick a later time." });
          setReactivating(false);
          return;
        }
      }

      // Half-hour times this showing occupies — every spanned time must be
      // free and gets blocked (mirrors ScheduleShowingDialog; the DB trigger
      // only guards the exact start instant).
      const durationMinutes = showing.duration_minutes || 30;
      const spannedTimes = computeSpannedTimes(slotTime, durationMinutes);

      // 0. Double-booking guard (load-bearing): refuse if ANY spanned time is
      // already booked by anything other than THIS showing — including a
      // null-owner manual block (is_booked=true, booked_showing_id=NULL).
      const { data: conflictRows } = await supabase
        .from("showing_available_slots")
        .select("slot_time, booked_showing_id")
        .eq("organization_id", userRecord.organization_id)
        .eq("slot_date", rescheduleDate)
        .in("slot_time", spannedTimes)
        .eq("is_booked", true);
      if ((conflictRows || []).some((r: any) => r.booked_showing_id !== showing.id)) {
        toast.error("That time isn't free", { description: "The agent is already booked then — pick another time." });
        setReactivating(false);
        return;
      }
      // 0b. Slot rows can miss another tour's >30-min tail — check the real
      // bookings for interval overlap too.
      if (await agentBusyElsewhere(newScheduledAt, durationMinutes)) {
        toast.error("That time isn't free", { description: "The agent is touring another property then — pick another time." });
        setReactivating(false);
        return;
      }

      // 1. Secure the PRIMARY slot FIRST (before touching the showing), the way
      // ScheduleShowingDialog does: find-or-materialize the row, refuse an
      // owner-off time, then book it ATOMICALLY (only if still free) so a
      // concurrent booking or manual block is never clobbered. slotRowId lets
      // the old-slot release below skip the new primary.
      let slotRowId: string | null = null;
      // True when the slot at the NEW time is already held by THIS showing
      // (reschedule onto an overlapping time) — so the rollback below must not
      // free a slot the still-active showing legitimately holds.
      let alreadyOurs = false;
      if (showing.property_id) {
        const { data: existing } = await supabase
          .from("showing_available_slots")
          .select("id, is_booked, is_enabled, booked_showing_id")
          .eq("organization_id", userRecord.organization_id)
          .eq("property_id", showing.property_id)
          .eq("slot_date", rescheduleDate)
          .eq("slot_time", slotTime)
          .maybeSingle();
        if (existing && existing.is_enabled === false) {
          toast.error("That time is turned off for this property", { description: "Enable it in the calendar first, or pick another." });
          setReactivating(false);
          return;
        }
        // Booked by a DIFFERENT showing → taken. Booked by THIS showing already
        // (rescheduling onto a time it currently occupies) → reuse as-is.
        alreadyOurs = !!(existing?.is_booked && existing.booked_showing_id === showing.id);
        if (existing?.is_booked && existing.booked_showing_id !== showing.id) {
          toast.error("That time was just taken", { description: "Pick another time." });
          setReactivating(false);
          return;
        }
        if (existing) {
          slotRowId = existing.id;
        } else {
          const { data: created, error: createErr } = await supabase
            .from("showing_available_slots")
            .insert({
              organization_id: userRecord.organization_id,
              property_id: showing.property_id,
              slot_date: rescheduleDate,
              slot_time: slotTime,
              duration_minutes: durationMinutes,
              is_enabled: true,
              is_booked: false,
            })
            .select("id")
            .single();
          if (createErr || !created) throw createErr || new Error("Could not create the time slot");
          slotRowId = created.id;
        }
        if (!alreadyOurs) {
          const { data: bookedSlot, error: bookErr } = await supabase
            .from("showing_available_slots")
            .update({ is_booked: true, booked_showing_id: showing.id, booked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", slotRowId)
            .eq("is_booked", false) // atomic — only if still free
            .select("id")
            .single();
          if (bookErr || !bookedSlot) {
            toast.error("That time was just taken", { description: "Pick another time." });
            setReactivating(false);
            return;
          }
        }
      }

      // 2. Move the showing to the new time. If this fails, ROLL BACK the slot
      // booking so we never leave a booked slot with no showing (or vice-versa).
      const { error: updateErr } = await supabase
        .from("showings")
        .update({
          status: "scheduled",
          scheduled_at: newScheduledAt,
          cancelled_at: null,
          cancellation_reason: null,
          confirmed_at: null, // moved time needs re-confirmation; clear stale stamp
        })
        .eq("organization_id", userRecord.organization_id)
        .eq("id", showing.id);
      if (updateErr) {
        // Roll back ONLY a slot we freshly booked — never a slot the still-active
        // showing already held (alreadyOurs), which it legitimately keeps.
        if (slotRowId && !alreadyOurs) {
          await supabase
            .from("showing_available_slots")
            .update({ is_booked: false, booked_showing_id: null, booked_at: null })
            .eq("id", slotRowId);
        }
        throw updateErr;
      }

      // The showing + primary slot are now committed. Everything below is
      // best-effort bookkeeping/side-effects — a failure here must NOT surface
      // as "Failed" or skip onSuccess (mirrors ScheduleShowingDialog).
      try {

      // 3. Release every OTHER slot this showing held (old primary + old spanned
      // + buffer), keeping the just-booked new primary. Error-checked so a stuck
      // old slot is at least logged.
      {
        let rel = supabase
          .from("showing_available_slots")
          .update({ is_booked: false, booked_showing_id: null, booked_at: null })
          .eq("organization_id", userRecord.organization_id)
          .eq("booked_showing_id", showing.id);
        if (slotRowId) rel = rel.neq("id", slotRowId);
        const { error: relErr } = await rel;
        if (relErr) console.error("Release old slots failed:", relErr);
      }

      // 4. Block EVERY spanned time across ALL homes (the single agent can't be
      // in two places). For the primary property, materialize+book each tail
      // half-hour (upsert — omitting is_enabled so an owner-off row stays off on
      // conflict) so a tail with no slot row can't be silently double-booked
      // later; for other homes, block their still-open rows. Best-effort — the
      // showing + primary booking are already committed. (buffer_minutes is not
      // applied on reschedule; the spanned guard is what prevents overlap.)
      for (const t of spannedTimes) {
        if (showing.property_id && t !== slotTime) {
          const { error: tailErr } = await supabase
            .from("showing_available_slots")
            .upsert({
              organization_id: userRecord.organization_id,
              property_id: showing.property_id,
              slot_date: rescheduleDate,
              slot_time: t,
              is_booked: true,
              booked_showing_id: showing.id,
              booked_at: new Date().toISOString(),
            }, { onConflict: "organization_id,property_id,slot_date,slot_time" });
          if (tailErr) console.error(`Book spanned tail ${t} failed:`, tailErr);
        }
        let blk = supabase
          .from("showing_available_slots")
          .update({ is_booked: true, booked_showing_id: showing.id, booked_at: new Date().toISOString() })
          .eq("organization_id", userRecord.organization_id)
          .eq("slot_date", rescheduleDate)
          .eq("slot_time", t)
          .eq("is_booked", false);
        if (showing.property_id) blk = blk.neq("property_id", showing.property_id);
        const { error: blkErr } = await blk;
        if (blkErr) console.error(`Block spanned slot ${t} (siblings) failed:`, blkErr);
      }

      // 4b. Re-anchor pending follow-up tasks (confirmation / no-show /
      // post-showing) to the new time.
      await retimePendingShowingTasks(showing.id, newScheduledAt);

      // 5. Send confirmation email to lead — reuse the org's showing_confirmation
      // template (mirrors ScheduleShowingDialog + ShowingsAgenda) so a rescheduled
      // lead gets the same branded, org-customizable email as every other
      // confirmation path instead of hardcoded inline English HTML.
      if (showing.leads?.email) {
        const propertyAddr = showing.properties?.address || "the property";
        const fullAddr = `${propertyAddr}${showing.properties?.unit_number ? ` #${showing.properties.unit_number}` : ""}${showing.properties?.city ? `, ${showing.properties.city}` : ""}`;
        const showingDateStr = format(new Date(newScheduledAt), "EEEE, MMMM d") + " at " + formatTimeInTimezone(newScheduledAt, tz);
        const firstName = showing.leads.full_name?.trim().split(" ")[0] || "there";

        const { data: settingsData } = await supabase
          .from("organization_settings")
          .select("value")
          .eq("organization_id", userRecord.organization_id)
          .eq("key", "email_templates")
          .maybeSingle();
        const templates = (settingsData?.value as unknown as EmailTemplatesMap) || {};
        const templateConfig = templates.showing_confirmation || DEFAULT_CONFIGS.showing_confirmation;

        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", userRecord.organization_id)
          .maybeSingle();

        const html = renderEmailHtml(templateConfig, {
          firstName,
          fullName: showing.leads.full_name || firstName,
          propertyAddress: fullAddr,
          showingDate: showingDateStr,
          orgName: org?.name || "Our Team",
        });

        sendNotificationEmail({
          to: showing.leads.email,
          subject: templateConfig.subject
            .replace("{propertyAddress}", fullAddr)
            .replace("{showingDate}", showingDateStr),
          html,
          notificationType: "showing_rescheduled_confirmation",
          organizationId: userRecord.organization_id,
          relatedEntityId: showing.id,
          relatedEntityType: "showing",
        });
      }

      // 6. Log
      {
        const { error: logErr } = await supabase.from("system_logs").insert({
          organization_id: userRecord.organization_id,
          level: "info",
          category: "general",
          event_type: "showing_reactivated",
          message: `Showing for ${showing.leads?.full_name || "Unknown"} at ${showing.properties?.address || "Unknown"} was rescheduled to ${rescheduleDate} ${rescheduleTime}`,
          related_lead_id: showing.lead_id,
          related_showing_id: showing.id,
          details: {
            old_scheduled_at: showing.scheduled_at,
            new_scheduled_at: newScheduledAt,
            reactivated_by: userRecord.id,
          },
        });
        if (logErr) console.error("System log insert failed:", logErr);
      }

      } catch (postErr) {
        console.error("Post-reschedule bookkeeping failed (reschedule already committed):", postErr);
      }

      toast.success("Showing rescheduled", { description: `${showing.leads?.full_name || "Lead"} has been rescheduled and notified by email.` });
      setRescheduleMode(false);
      setRescheduleChooser(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Reactivate error:", err);
      if (err?.code === "23505") {
        // trg_enforce_showing_agent_slot: a different property took the
        // agent's time at this exact instant (concurrent booking).
        toast.error("That time was just taken", { description: "A different property is booked then — pick another time." });
      } else {
        toast.error(`Failed to reschedule: ${err.message}`);
      }
    } finally {
      setReactivating(false);
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

  // Pencil-edit of an ACTIVE showing's date/time/duration. Moving the showing
  // must do the SAME slot dance as the reschedule path: guard the new time
  // (incl. spanned tails), book the new primary slot atomically, move the
  // showing (rollback on failure), release the old rows, block the new tails —
  // otherwise the old time stays phantom-blocked and the new time unguarded.
  const handleSaveEdit = async () => {
    if (!showing || !userRecord?.organization_id || !editDate || !editTime) return;
    if (!isOnHalfHour(editTime)) {
      toast.error("Showings can only be booked on the hour (:00) or half-hour (:30).");
      return;
    }
    setSaving(true);
    try {
      const tz = getTimezoneForCity(showing.properties?.city);
      const slotTime = `${editTime}:00`;
      const newScheduledAt = buildScheduledAt(editDate, slotTime, tz);
      const durationMinutes = editDuration || 30;
      const spannedTimes = computeSpannedTimes(slotTime, durationMinutes);

      // Did the TIME actually move? Drives both the past-date guard and the
      // confirmation reset below. A duration-only edit leaves the instant (and
      // the existing confirmation) untouched.
      const editMovedTime = new Date(newScheduledAt).getTime() !== new Date(showing.scheduled_at).getTime();

      // Reject a move into the past (mirrors ScheduleShowingDialog) — only when
      // the time actually moves, so correcting a past-due showing's duration
      // still saves. Compared against the property's calendar day/clock.
      if (editMovedTime) {
        const editToday = todayInTimezone(tz);
        if (editDate < editToday) {
          toast.error("That date is in the past", { description: "Pick a future date." });
          setSaving(false);
          return;
        }
        if (editDate === editToday) {
          const [eh, em] = editTime.split(":").map(Number);
          const nowParts = new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
          if (eh * 60 + em + 30 <= nowParts[0] * 60 + nowParts[1]) {
            toast.error("That time has already passed today", { description: "Pick a later time." });
            setSaving(false);
            return;
          }
        }
      }

      // 0. Double-booking guard: refuse if ANY spanned time is already booked
      // by anything other than THIS showing (incl. null-owner manual blocks).
      const { data: conflictRows } = await supabase
        .from("showing_available_slots")
        .select("slot_time, booked_showing_id")
        .eq("organization_id", userRecord.organization_id)
        .eq("slot_date", editDate)
        .in("slot_time", spannedTimes)
        .eq("is_booked", true);
      if ((conflictRows || []).some((r: any) => r.booked_showing_id !== showing.id)) {
        toast.error("That time isn't free", { description: "The agent is already booked then — pick another time." });
        setSaving(false);
        return;
      }
      // 0b. Slot rows can miss another tour's >30-min tail — check the real
      // bookings for interval overlap too.
      if (await agentBusyElsewhere(newScheduledAt, durationMinutes)) {
        toast.error("That time isn't free", { description: "The agent is touring another property then — pick another time." });
        setSaving(false);
        return;
      }

      // 1. Secure the PRIMARY slot FIRST (before touching the showing) —
      // find-or-materialize the row, refuse an owner-off time, then book it
      // ATOMICALLY (only if still free). slotRowId lets the old-slot release
      // below skip the new primary; alreadyOurs marks a slot this showing
      // already holds (edit onto an overlapping time) so rollback never frees it.
      let slotRowId: string | null = null;
      let alreadyOurs = false;
      if (showing.property_id) {
        const { data: existing } = await supabase
          .from("showing_available_slots")
          .select("id, is_booked, is_enabled, booked_showing_id")
          .eq("organization_id", userRecord.organization_id)
          .eq("property_id", showing.property_id)
          .eq("slot_date", editDate)
          .eq("slot_time", slotTime)
          .maybeSingle();
        if (existing && existing.is_enabled === false) {
          toast.error("That time is turned off for this property", { description: "Enable it in the calendar first, or pick another." });
          setSaving(false);
          return;
        }
        alreadyOurs = !!(existing?.is_booked && existing.booked_showing_id === showing.id);
        if (existing?.is_booked && existing.booked_showing_id !== showing.id) {
          toast.error("That time was just taken", { description: "Pick another time." });
          setSaving(false);
          return;
        }
        if (existing) {
          slotRowId = existing.id;
        } else {
          const { data: created, error: createErr } = await supabase
            .from("showing_available_slots")
            .insert({
              organization_id: userRecord.organization_id,
              property_id: showing.property_id,
              slot_date: editDate,
              slot_time: slotTime,
              duration_minutes: durationMinutes,
              is_enabled: true,
              is_booked: false,
            })
            .select("id")
            .single();
          if (createErr || !created) throw createErr || new Error("Could not create the time slot");
          slotRowId = created.id;
        }
        if (!alreadyOurs) {
          const { data: bookedSlot, error: bookErr } = await supabase
            .from("showing_available_slots")
            .update({ is_booked: true, booked_showing_id: showing.id, booked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", slotRowId)
            .eq("is_booked", false) // atomic — only if still free
            .select("id")
            .single();
          if (bookErr || !bookedSlot) {
            toast.error("That time was just taken", { description: "Pick another time." });
            setSaving(false);
            return;
          }
        }
      }

      // 2. Move the showing. If this fails, ROLL BACK the fresh slot booking so
      // we never leave a booked slot with no showing (or vice-versa). When the
      // TIME actually moved, reset status→scheduled + clear confirmed_at (the lead
      // never confirmed the new time; mirrors handleReactivate) so the dialog
      // stops showing a stale "Confirmed" stamp and schedule_showing_confirmations
      // re-requests confirmation. A duration-only edit keeps the confirmation.
      const editUpdate: TablesUpdate<"showings"> = {
        scheduled_at: newScheduledAt,
        duration_minutes: durationMinutes,
      };
      if (editMovedTime) {
        editUpdate.status = "scheduled";
        editUpdate.confirmed_at = null;
      }
      const { error } = await supabase
        .from("showings")
        .update(editUpdate)
        .eq("organization_id", userRecord.organization_id)
        .eq("id", showing.id);
      if (error) {
        if (slotRowId && !alreadyOurs) {
          await supabase
            .from("showing_available_slots")
            .update({ is_booked: false, booked_showing_id: null, booked_at: null })
            .eq("id", slotRowId);
        }
        throw error;
      }

      // The showing + primary slot are committed. Everything below is
      // best-effort bookkeeping — a failure must NOT surface as "Failed".
      try {

      // 3. Release every OTHER slot this showing held (old primary + old
      // spanned + buffer), keeping the just-booked new primary.
      {
        let rel = supabase
          .from("showing_available_slots")
          .update({ is_booked: false, booked_showing_id: null, booked_at: null })
          .eq("organization_id", userRecord.organization_id)
          .eq("booked_showing_id", showing.id);
        if (slotRowId) rel = rel.neq("id", slotRowId);
        const { error: relErr } = await rel;
        if (relErr) console.error("Release old slots failed:", relErr);
      }

      // 4. Block EVERY spanned time across ALL homes. For the primary property,
      // materialize+book each tail half-hour (upsert — omitting is_enabled so an
      // owner-off row stays off on conflict); for other homes, block their
      // still-open rows.
      for (const t of spannedTimes) {
        if (showing.property_id && t !== slotTime) {
          const { error: tailErr } = await supabase
            .from("showing_available_slots")
            .upsert({
              organization_id: userRecord.organization_id,
              property_id: showing.property_id,
              slot_date: editDate,
              slot_time: t,
              is_booked: true,
              booked_showing_id: showing.id,
              booked_at: new Date().toISOString(),
            }, { onConflict: "organization_id,property_id,slot_date,slot_time" });
          if (tailErr) console.error(`Book spanned tail ${t} failed:`, tailErr);
        }
        let blk = supabase
          .from("showing_available_slots")
          .update({ is_booked: true, booked_showing_id: showing.id, booked_at: new Date().toISOString() })
          .eq("organization_id", userRecord.organization_id)
          .eq("slot_date", editDate)
          .eq("slot_time", t)
          .eq("is_booked", false);
        if (showing.property_id) blk = blk.neq("property_id", showing.property_id);
        const { error: blkErr } = await blk;
        if (blkErr) console.error(`Block spanned slot ${t} (siblings) failed:`, blkErr);
      }

      // 5. Re-anchor pending follow-up tasks to the new time.
      await retimePendingShowingTasks(showing.id, newScheduledAt);

      // 6. Log the edit
      {
        const { error: logErr } = await supabase.from("system_logs").insert({
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
        if (logErr) console.error("System log insert failed:", logErr);
      }

      } catch (postErr) {
        console.error("Post-edit bookkeeping failed (edit already committed):", postErr);
      }

      toast.success("Showing updated");
      setEditMode(false);
      // Refresh showing data — mirror the confirmation reset when the time moved.
      setShowing({
        ...showing,
        scheduled_at: newScheduledAt,
        duration_minutes: durationMinutes,
        ...(editMovedTime ? { status: "scheduled", confirmed_at: null } : {}),
      });
      onSuccess?.();
    } catch (err: any) {
      console.error("Save edit error:", err);
      if (err?.code === "23505") {
        // trg_enforce_showing_agent_slot: a different property took the
        // agent's time at this exact instant (concurrent booking).
        toast.error("That time was just taken", { description: "A different property is booked then — pick another time." });
      } else {
        toast.error(`Failed to save: ${err.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  // The "applicant" milestone tag — status-neutral, set from a completed
  // showing. Stamps leads.applied_at + a leasing_activity(application_generated)
  // row; never changes the lead's status.
  const toggleApplied = async () => {
    if (!showing || !showing.leads || !userRecord?.organization_id) return;
    const isApplied = !!showing.leads.applied_at;
    setApplyBusy(true);
    try {
      if (isApplied) {
        await unmarkApplicationGenerated(showing.lead_id);
        setShowing({ ...showing, leads: { ...showing.leads, applied_at: null } });
        toast.success("Application unmarked");
      } else {
        await markApplicationGenerated({
          leadId: showing.lead_id,
          organizationId: userRecord.organization_id,
          showingId: showing.id,
          propertyId: showing.property_id,
        });
        setShowing({ ...showing, leads: { ...showing.leads, applied_at: new Date().toISOString() } });
        toast.success("✅ Application generated", {
          description: "Marked as applicant — visible in the Leasing Tracker.",
        });
      }
      onSuccess?.();
    } catch (err: any) {
      console.error("Applicant tag update failed:", err);
      toast.error("Could not update the applicant tag. Try again.");
    } finally {
      setApplyBusy(false);
    }
  };

  const isActive = showing?.status === "scheduled" || showing?.status === "confirmed";
  const sc = statusConfig[showing?.status || ""] || statusConfig.scheduled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        step={1800}
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
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${showing.properties.address}${showing.properties.city ? `, ${showing.properties.city}` : ""}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#4F46E5] hover:underline"
                  >
                    {showing.properties.address}
                    {showing.properties.unit_number && ` #${showing.properties.unit_number}`}
                    {showing.properties.city && `, ${showing.properties.city}`}
                  </a>
                </div>
              )}

              {/* Lead */}
              {showing.leads && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{showing.leads.full_name || "Unknown"}</span>
                      {showing.leads.has_voucher !== null && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${showing.leads.has_voucher ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          {showing.leads.has_voucher ? "Voucher" : "Self-pay"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <a href={`tel:${showing.leads.phone}`} className="flex items-center gap-1 text-[#4F46E5] hover:underline">
                        <Phone className="h-3 w-3" />
                        {showing.leads.phone}
                      </a>
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

                {/* Applicant milestone — status-neutral tag, feeds the Leasing
                    Tracker. Mark it later, when the prospect actually applies. */}
                <div className="pt-2 mt-1 border-t border-emerald-200">
                  {showing.leads?.applied_at ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Application generated · {format(parseISO(showing.leads.applied_at), "MMM d")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-emerald-700 hover:text-red-600"
                        onClick={toggleApplied}
                        disabled={applyBusy}
                      >
                        {applyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Undo"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={toggleApplied}
                      disabled={applyBusy}
                      className="w-full bg-[#4F46E5] hover:bg-[#4F46E5]/90 gap-1.5"
                    >
                      {applyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                      Mark application generated
                    </Button>
                  )}
                  <p className="mt-1.5 text-[11px] text-emerald-700/80">
                    Applicant milestone — does not change the lead's status.
                  </p>
                </div>
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
                  We'll try to notify {showing.leads?.full_name || "the lead"} by SMS/email with a link to reschedule.
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

            {/* Reschedule date/time picker (agent-assisted — any status) */}
            {rescheduleMode && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-3">
                <p className="text-sm font-medium text-indigo-800">Pick the new date &amp; time</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-indigo-700">Date</Label>
                    <Input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-indigo-700">Time</Label>
                    <Input
                      type="time"
                      step={1800}
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-indigo-600">
                  A confirmation email will be sent to {showing.leads?.full_name || "the lead"}.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
                    onClick={handleReactivate}
                    disabled={reactivating || !rescheduleDate || !rescheduleTime}
                  >
                    {reactivating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Confirm Reschedule
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRescheduleMode(false)}
                    disabled={reactivating}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {/* Reactivate button for cancelled/no-show/rescheduled */}
            {!rescheduleMode && (showing.status === "cancelled" || showing.status === "no_show" || showing.status === "rescheduled") && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#e5e7eb]">
                <Button
                  variant="default"
                  size="sm"
                  className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
                  onClick={enterRescheduleMode}
                  disabled={reactivating}
                >
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Reschedule
                </Button>
              </div>
            )}

            {/* Reschedule chooser (active showings): email a self-serve link, or
                pick the new time now (agent has the renter on the phone). */}
            {isActive && rescheduleChooser && !rescheduleMode && !cancelMode && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                <p className="text-sm font-medium text-indigo-800">How do you want to reschedule?</p>
                <button
                  onClick={() => { setRescheduleChooser(false); enterRescheduleMode(); }}
                  disabled={rescheduling}
                  className="w-full text-left rounded-md border border-indigo-200 bg-white p-3 hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-colors disabled:opacity-60"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <CalendarDays className="h-4 w-4 text-[#4F46E5]" />
                    Reschedule now (I'm helping them)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Pick the new date &amp; time yourself — e.g. you have them on the phone. Books it and emails a confirmation.
                  </p>
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={rescheduling}
                  className="w-full text-left rounded-md border border-indigo-200 bg-white p-3 hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-colors disabled:opacity-60"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {rescheduling ? <Loader2 className="h-4 w-4 animate-spin text-[#4F46E5]" /> : <MessageSquare className="h-4 w-4 text-[#4F46E5]" />}
                    Email the renter a reschedule link
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Frees this time and sends them a link (email + SMS) to pick a new slot themselves.
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setRescheduleChooser(false)}
                  disabled={rescheduling}
                >
                  Back
                </Button>
              </div>
            )}

            {/* Action buttons (only for active showings, hide when in a sub-mode) */}
            {isActive && !cancelMode && !rescheduleChooser && !rescheduleMode && (
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
                  onClick={() => setRescheduleChooser(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-1.5" />
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
