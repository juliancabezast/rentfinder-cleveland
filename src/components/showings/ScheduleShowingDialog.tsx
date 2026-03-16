import React, { useState, useEffect } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarIcon, Search, Loader2, UserPlus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getTimezoneForCity, buildScheduledAt } from "@/lib/cityTimezone";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { sendNotificationEmail } from "@/lib/notificationService";
import {
  renderEmailHtml,
  DEFAULT_CONFIGS,
} from "@/lib/emailTemplateDefaults";
import type { EmailTemplatesMap } from "@/lib/emailTemplateDefaults";

interface ScheduleShowingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preselectedLeadId?: string;
  preselectedLeadName?: string;
}

interface LeadOption {
  id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
}

interface PropertyOption {
  id: string;
  address: string;
  unit_number: string | null;
  rent_price: number;
  city: string | null;
}

interface AgentOption {
  id: string;
  full_name: string;
}

interface AvailableSlot {
  id: string;
  slot_time: string;
  duration_minutes: number;
}

const DURATION_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

export const ScheduleShowingDialog: React.FC<ScheduleShowingDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  preselectedLeadId,
  preselectedLeadName,
}) => {
  const { userRecord } = useAuth();
  const { getSetting } = useOrganizationSettings();

  // Options
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Available dates & slots from DB
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Form state
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("30");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Combobox state
  const [leadOpen, setLeadOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);

  // Inline lead creation
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [creatingLead, setCreatingLead] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Fetch options when dialog opens
  useEffect(() => {
    if (open && userRecord?.organization_id) {
      fetchOptions();
      if (preselectedLeadId) {
        setSelectedLeadId(preselectedLeadId);
      }
    }
  }, [open, userRecord?.organization_id, preselectedLeadId]);

  // Fetch available dates when property changes
  useEffect(() => {
    if (selectedPropertyId && userRecord?.organization_id) {
      fetchAvailableDates();
    } else {
      setAvailableDates(new Set());
      setSelectedDate(undefined);
      setAvailableSlots([]);
      setSelectedSlotId("");
    }
  }, [selectedPropertyId]);

  // Fetch available slots when property + date change
  useEffect(() => {
    if (selectedPropertyId && selectedDate && userRecord?.organization_id) {
      fetchAvailableSlots();
    } else {
      setAvailableSlots([]);
      setSelectedSlotId("");
    }
  }, [selectedPropertyId, selectedDate]);

  const fetchOptions = async () => {
    if (!userRecord?.organization_id) return;

    setLoadingOptions(true);
    try {
      const [leadsRes, propertiesRes, agentsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, full_name, phone, email")
          .eq("organization_id", userRecord.organization_id)
          .order("full_name"),
        supabase
          .from("properties")
          .select("id, address, unit_number, rent_price, city")
          .eq("organization_id", userRecord.organization_id)
          .in("status", ["available", "coming_soon"])
          .order("address"),
        supabase
          .from("users")
          .select("id, full_name")
          .eq("organization_id", userRecord.organization_id)
          .eq("role", "leasing_agent")
          .eq("is_active", true)
          .order("full_name"),
      ]);

      setLeads(leadsRes.data || []);
      setProperties(propertiesRes.data || []);
      setAgents(agentsRes.data || []);
    } catch (error) {
      console.error("Error fetching options:", error);
    } finally {
      setLoadingOptions(false);
    }
  };

  const fetchAvailableDates = async () => {
    if (!userRecord?.organization_id || !selectedPropertyId) return;

    setLoadingDates(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("slot_date")
        .eq("organization_id", userRecord.organization_id)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .gte("slot_date", today)
        .order("slot_date");

      if (error) throw error;
      const dates = new Set((data || []).map((d) => d.slot_date));
      setAvailableDates(dates);
    } catch (error) {
      console.error("Error fetching available dates:", error);
      setAvailableDates(new Set());
    } finally {
      setLoadingDates(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!userRecord?.organization_id || !selectedPropertyId || !selectedDate) return;

    setLoadingSlots(true);
    setSelectedSlotId("");
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("id, slot_time, duration_minutes")
        .eq("organization_id", userRecord.organization_id)
        .eq("slot_date", dateStr)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .order("slot_time");

      if (error) throw error;
      setAvailableSlots(data || []);
    } catch (error) {
      console.error("Error fetching available slots:", error);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleCreateLead = async () => {
    if (!userRecord?.organization_id) return;
    if (!newLeadName.trim() && !newLeadPhone.trim()) {
      toast.error("Name or phone is required");
      return;
    }

    setCreatingLead(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          organization_id: userRecord.organization_id,
          full_name: newLeadName.trim() || null,
          phone: newLeadPhone.trim() || "N/A",
          email: newLeadEmail.trim() || null,
          source: "manual",
          status: "new",
          interested_property_id: selectedPropertyId || null,
        })
        .select("id, full_name, phone, email")
        .single();

      if (error) throw error;

      // Add to leads list and select it
      setLeads((prev) => [data, ...prev]);
      setSelectedLeadId(data.id);
      setShowCreateLead(false);
      setNewLeadName("");
      setNewLeadPhone("");
      setNewLeadEmail("");
      toast.success("Lead created");
    } catch (error) {
      console.error("Error creating lead:", error);
      toast.error("Failed to create lead");
    } finally {
      setCreatingLead(false);
    }
  };

  const resetForm = () => {
    if (!preselectedLeadId) {
      setSelectedLeadId("");
    }
    setSelectedPropertyId("");
    setSelectedDate(undefined);
    setSelectedSlotId("");
    setSelectedDuration("30");
    setSelectedAgentId("");
    setNotes("");
    setAvailableSlots([]);
    setAvailableDates(new Set());
    setShowCreateLead(false);
    setNewLeadName("");
    setNewLeadPhone("");
    setNewLeadEmail("");
  };

  const handleSubmit = async () => {
    if (!userRecord?.organization_id) return;

    if (!selectedLeadId) {
      toast.error("Please select a lead");
      return;
    }
    if (!selectedPropertyId) {
      toast.error("Please select a property");
      return;
    }
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    if (!selectedSlotId) {
      toast.error("Please select an available time slot");
      return;
    }

    const today = startOfDay(new Date());
    if (isBefore(selectedDate, today)) {
      toast.error("Date must be in the future");
      return;
    }

    const slot = availableSlots.find((s) => s.id === selectedSlotId);
    if (!slot) {
      toast.error("Selected slot not found. Please refresh.");
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const slotTime = slot.slot_time;
      const durationMinutes = parseInt(selectedDuration) || slot.duration_minutes || 30;

      // Build timezone-aware scheduled_at using property's city timezone
      const propertyTz = getTimezoneForCity(selectedProperty?.city);
      const scheduledAt = buildScheduledAt(dateStr, slotTime, propertyTz);

      // Atomically mark slot as booked FIRST (prevents race conditions)
      const { data: bookedSlot, error: bookErr } = await supabase
        .from("showing_available_slots")
        .update({
          is_booked: true,
          booked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id)
        .eq("is_booked", false) // Atomic check — only if still available
        .select("id")
        .single();

      if (bookErr || !bookedSlot) {
        toast.error("That slot was just taken. Please pick another time.");
        await fetchAvailableSlots(); // Refresh slots
        setSubmitting(false);
        return;
      }

      // Create showing
      const { data: showingData, error: showingError } = await supabase
        .from("showings")
        .insert({
          organization_id: userRecord.organization_id,
          lead_id: selectedLeadId,
          property_id: selectedPropertyId,
          leasing_agent_id: selectedAgentId || null,
          scheduled_at: scheduledAt,
          duration_minutes: durationMinutes,
          status: "scheduled",
          booked_by: userRecord.id,
          booked_by_name: userRecord.full_name || null,
          booking_source: "admin",
        })
        .select("id")
        .single();

      if (showingError) {
        // Rollback slot booking
        await supabase
          .from("showing_available_slots")
          .update({ is_booked: false, booked_at: null, updated_at: new Date().toISOString() })
          .eq("id", slot.id);
        throw showingError;
      }

      // Link slot to showing
      await supabase
        .from("showing_available_slots")
        .update({ booked_showing_id: showingData.id })
        .eq("id", slot.id);

      // Block ALL properties at this time (single-agent model)
      const bufferUpdate = {
        is_booked: true,
        booked_showing_id: showingData.id,
        booked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Block same time slot on all other properties
      await supabase
        .from("showing_available_slots")
        .update(bufferUpdate)
        .eq("organization_id", userRecord.organization_id)
        .eq("slot_date", dateStr)
        .eq("slot_time", slotTime)
        .eq("is_booked", false);

      // Read buffer setting (default 0 = no buffer)
      const bufferMinutes = Number(getSetting("buffer_minutes", 0));

      if (bufferMinutes > 0) {
        const [bH, bM] = slotTime.split(":").map(Number);

        // Buffer AFTER on ALL properties
        const bufferSlots = Math.ceil(bufferMinutes / 30);
        for (let i = 1; i <= bufferSlots; i++) {
          const afterTotal = bH * 60 + bM + (i * 30);
          const afterTime = `${String(Math.floor(afterTotal / 60)).padStart(2, "0")}:${String(afterTotal % 60).padStart(2, "0")}:00`;
          if (Math.floor(afterTotal / 60) >= 24) break;
          await supabase
            .from("showing_available_slots")
            .update(bufferUpdate)
            .eq("organization_id", userRecord.organization_id)
            .eq("slot_date", dateStr)
            .eq("slot_time", afterTime)
            .eq("is_booked", false);
        }

        // Buffer BEFORE on ALL properties
        const beforeTotal = bH * 60 + bM - 30;
        if (beforeTotal >= 0) {
          const beforeTime = `${String(Math.floor(beforeTotal / 60)).padStart(2, "0")}:${String(beforeTotal % 60).padStart(2, "0")}:00`;
          await supabase
            .from("showing_available_slots")
            .update(bufferUpdate)
            .eq("organization_id", userRecord.organization_id)
            .eq("slot_date", dateStr)
            .eq("slot_time", beforeTime)
            .eq("is_booked", false);
        }
      }

      // Update lead status + boost score +30
      const { data: currentLead } = await supabase
        .from("leads")
        .select("lead_score")
        .eq("id", selectedLeadId)
        .single();

      const previousScore = currentLead?.lead_score ?? 50;
      const newScore = Math.min(previousScore + 30, 100);

      await supabase
        .from("leads")
        .update({
          status: "showing_scheduled",
          lead_score: newScore,
          is_priority: true,
          priority_reason: "Showing requested (+30 pts)",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedLeadId);

      await supabase.from("lead_score_history").insert({
        lead_id: selectedLeadId,
        organization_id: userRecord.organization_id,
        previous_score: previousScore,
        new_score: newScore,
        change_amount: 30,
        reason_code: "showing_requested",
        reason_text: "Showing scheduled — automatic Hot Lead boost",
        triggered_by: "engagement",
        related_showing_id: showingData.id,
        changed_by_user_id: userRecord.id,
      });

      // Schedule Samuel confirmation task (24h before)
      const showingDate = new Date(scheduledAt);
      const confirmationTime = new Date(showingDate.getTime() - 24 * 60 * 60 * 1000);
      const propertyAddr = selectedProperty ? `${selectedProperty.address}${selectedProperty.unit_number ? ` #${selectedProperty.unit_number}` : ''}` : "Property";

      await supabase.from("agent_tasks").insert({
        organization_id: userRecord.organization_id,
        lead_id: selectedLeadId,
        agent_type: "showing_confirmation",
        action_type: "call",
        scheduled_for: confirmationTime.toISOString(),
        max_attempts: 2,
        status: "pending",
        context: {
          showing_id: showingData.id,
          property_id: selectedPropertyId,
          property_address: propertyAddr,
          scheduled_at: scheduledAt,
          source: "admin_manual",
        },
      });

      // Schedule no-show follow-up (1 hour after showing)
      const noShowTime = new Date(showingDate.getTime() + 60 * 60 * 1000);
      await supabase.from("agent_tasks").insert({
        organization_id: userRecord.organization_id,
        lead_id: selectedLeadId,
        agent_type: "no_show_followup",
        action_type: "sms",
        scheduled_for: noShowTime.toISOString(),
        max_attempts: 1,
        status: "pending",
        context: {
          showing_id: showingData.id,
          property_id: selectedPropertyId,
          property_address: propertyAddr,
          scheduled_at: scheduledAt,
          source: "admin_manual",
        },
      });

      // Schedule post-showing follow-up (24h after showing)
      const postShowingTime = new Date(showingDate.getTime() + 24 * 60 * 60 * 1000);
      await supabase.from("agent_tasks").insert({
        organization_id: userRecord.organization_id,
        lead_id: selectedLeadId,
        agent_type: "post_showing",
        action_type: "email",
        scheduled_for: postShowingTime.toISOString(),
        max_attempts: 1,
        status: "pending",
        context: {
          showing_id: showingData.id,
          property_id: selectedPropertyId,
          property_address: propertyAddr,
          scheduled_at: scheduledAt,
          source: "admin_manual",
        },
      });

      // Send immediate confirmation email to lead (if they have email)
      const lead = leads.find((l) => l.id === selectedLeadId);
      if (lead?.email) {
        try {
          // Try to use custom template, fall back to default
          const { data: settingsData } = await supabase
            .from("organization_settings")
            .select("value")
            .eq("organization_id", userRecord.organization_id)
            .eq("key", "email_templates")
            .single();

          const templates = (settingsData?.value as unknown as EmailTemplatesMap) || {};
          const templateConfig = templates.showing_confirmation || DEFAULT_CONFIGS.showing_confirmation;

          const displayDate = format(selectedDate, "EEEE, MMMM d, yyyy");
          const firstName = (lead.full_name || "").split(" ")[0] || "there";

          // Fetch org name for template variables
          const { data: org } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", userRecord.organization_id)
            .single();

          const html = renderEmailHtml(templateConfig, {
            firstName,
            fullName: lead.full_name || "Guest",
            propertyAddress: propertyAddr,
            showingDate: `${displayDate} at ${formatTimeDisplay(slotTime)}`,
            orgName: org?.name || "Our Team",
          });

          sendNotificationEmail({
            to: lead.email,
            subject: templateConfig.subject
              .replace("{propertyAddress}", propertyAddr)
              .replace("{showingDate}", displayDate),
            html,
            notificationType: "showing_confirmation",
            organizationId: userRecord.organization_id,
            relatedEntityId: showingData.id,
            relatedEntityType: "showing",
            queue: true,
          });
        } catch (emailErr) {
          console.error("Confirmation email failed:", emailErr);
        }
      }

      // System log
      await supabase.from("system_logs").insert({
        organization_id: userRecord.organization_id,
        level: "info",
        category: "general",
        event_type: "admin_showing_scheduled",
        message: `Showing scheduled by admin: ${propertyAddr} on ${dateStr} at ${formatTimeDisplay(slotTime)}`,
        details: {
          showing_id: showingData.id,
          lead_id: selectedLeadId,
          property_id: selectedPropertyId,
          scheduled_by: userRecord.id,
          source: "admin_manual",
          slot_id: slot.id,
          email_sent: !!lead?.email,
        },
        related_lead_id: selectedLeadId,
        related_showing_id: showingData.id,
      });

      // ── Telegram notification ──────────────────────────────────────
      try {
        const { data: creds } = await supabase
          .from("organization_credentials")
          .select("telegram_bot_token, telegram_chat_id")
          .eq("organization_id", userRecord.organization_id)
          .single();

        if (creds?.telegram_bot_token && creds?.telegram_chat_id) {
          const displayDateFull = format(selectedDate, "EEEE, MMMM d, yyyy");
          const leadName = lead?.full_name || "—";
          const leadPhone = lead?.phone || "—";
          const leadEmailAddr = lead?.email || "—";
          const rentStr = selectedProperty?.rent_price ? `$${Number(selectedProperty.rent_price).toLocaleString()}/mo` : "";
          const fullAddr = `${propertyAddr}${selectedProperty?.city ? `, ${selectedProperty.city}` : ""}`;
          const mapsQuery = encodeURIComponent(`${selectedProperty?.address || ""}, ${selectedProperty?.city || ""}, ${selectedProperty?.state || ""} ${selectedProperty?.zip_code || ""}`);

          const msg = [
            `🏠 <b>New Showing Scheduled</b>`,
            ``,
            `📍 <b>${fullAddr}</b>${rentStr ? ` — ${rentStr}` : ""}`,
            `📅 ${displayDateFull} at ${formatTimeDisplay(slotTime)}`,
            ``,
            `👤 <b>${leadName}</b>`,
            `📞 ${leadPhone}`,
            `✉️ ${leadEmailAddr}`,
            `🔗 Source: Admin (${userRecord.full_name || "team"})`,
            ``,
            `🗺 <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}">Open in Google Maps</a>`,
          ].join("\n");

          await fetch(`https://api.telegram.org/bot${creds.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: creds.telegram_chat_id,
              text: msg,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          });
        }
      } catch (tgErr) {
        console.warn("Telegram notification failed:", tgErr);
      }

      const displayDate = format(selectedDate, "MMM d, yyyy");
      toast.success(`Showing scheduled for ${displayDate} at ${formatTimeDisplay(slotTime)}`);

      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error scheduling showing:", error);
      toast.error("Failed to schedule showing");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedLead = leads.find((l) => l.id === selectedLeadId);
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
  };

  // Check if a date has available slots
  const isDateAvailable = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return availableDates.has(dateStr);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">Schedule Showing</DialogTitle>
          <DialogDescription className="text-slate-500">
            Select a lead and property, then pick an available date and time
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Lead Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-slate-700">Lead *</Label>
              {!preselectedLeadId && (
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                  onClick={() => setShowCreateLead(!showCreateLead)}
                >
                  <UserPlus className="h-3 w-3" />
                  {showCreateLead ? "Search existing" : "Create new"}
                </button>
              )}
            </div>

            {preselectedLeadId ? (
              <div className="px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
                {preselectedLeadName || "Selected Lead"}
              </div>
            ) : showCreateLead ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Full Name</Label>
                    <Input
                      value={newLeadName}
                      onChange={(e) => setNewLeadName(e.target.value)}
                      placeholder="Jane Doe"
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Phone *</Label>
                    <Input
                      value={newLeadPhone}
                      onChange={(e) => setNewLeadPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Email</Label>
                  <Input
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="mt-1 h-9 text-sm"
                    type="email"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateLead}
                  disabled={creatingLead || (!newLeadName.trim() && !newLeadPhone.trim())}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-sm"
                >
                  {creatingLead ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                  Create & Select Lead
                </Button>
              </div>
            ) : (
              <Popover open={leadOpen} onOpenChange={setLeadOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between h-10 border-slate-200 hover:bg-slate-50 text-sm font-normal",
                      !selectedLead && "text-slate-400"
                    )}
                    disabled={loadingOptions}
                  >
                    {selectedLead
                      ? `${selectedLead.full_name || "Unknown"} — ${selectedLead.phone}`
                      : "Search leads..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type name or phone..." className="text-sm" />
                    <CommandList className="max-h-[40vh] sm:max-h-[200px] overflow-y-auto">
                      <CommandEmpty>No leads found.</CommandEmpty>
                      <CommandGroup>
                        {leads.map((lead) => (
                          <CommandItem
                            key={lead.id}
                            value={`${lead.full_name || ""} ${lead.phone}`}
                            onSelect={() => {
                              setSelectedLeadId(lead.id);
                              setLeadOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-900">
                                {lead.full_name || "Unknown"}
                              </span>
                              <span className="text-xs text-slate-500">
                                {lead.phone}{lead.email ? ` · ${lead.email}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Property Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Property *</Label>
            <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between h-10 border-slate-200 hover:bg-slate-50 text-sm font-normal",
                    !selectedProperty && "text-slate-400"
                  )}
                  disabled={loadingOptions}
                >
                  {selectedProperty
                    ? `${selectedProperty.address}${selectedProperty.unit_number ? ` #${selectedProperty.unit_number}` : ''} — $${selectedProperty.rent_price.toLocaleString()}/mo`
                    : "Search properties..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type address..." className="text-sm" />
                  <CommandList className="max-h-[40vh] sm:max-h-[200px] overflow-y-auto">
                    <CommandEmpty>No properties found.</CommandEmpty>
                    <CommandGroup>
                      {properties.map((property) => (
                        <CommandItem
                          key={property.id}
                          value={`${property.address} ${property.unit_number || ''}`}
                          onSelect={() => {
                            setSelectedPropertyId(property.id);
                            setPropertyOpen(false);
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">
                              {property.address}{property.unit_number ? ` #${property.unit_number}` : ''}
                            </span>
                            <span className="text-xs text-slate-500">
                              ${property.rent_price.toLocaleString()}/mo
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10 border-slate-200 hover:bg-slate-50 text-sm",
                      !selectedDate && "text-slate-400"
                    )}
                    disabled={!selectedPropertyId}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                    {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
                  {loadingDates ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                      <span className="ml-2 text-sm text-slate-500">Loading dates...</span>
                    </div>
                  ) : (
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) =>
                        isBefore(date, startOfDay(new Date())) || !isDateAvailable(date)
                      }
                      initialFocus
                      className="pointer-events-auto"
                    />
                  )}
                </PopoverContent>
              </Popover>
              {selectedPropertyId && !loadingDates && availableDates.size === 0 && (
                <p className="text-xs text-amber-600">No available dates for this property</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Time *</Label>
              {loadingSlots ? (
                <div className="flex items-center gap-2 h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : !selectedPropertyId || !selectedDate ? (
                <div className="h-10 px-3 border border-slate-200 rounded-lg flex items-center text-sm text-slate-400">
                  Select property & date
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="h-10 px-3 border border-amber-200 rounded-lg flex items-center text-sm text-amber-600 bg-amber-50">
                  No slots available
                </div>
              ) : (
                <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
                  <SelectTrigger className="h-10 border-slate-200 text-sm">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlots.map((slot) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {formatTimeDisplay(slot.slot_time)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Duration & Agent */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Duration</Label>
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger className="h-10 border-slate-200 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Agent</Label>
              <Select
                value={selectedAgentId || "none"}
                onValueChange={(val) => setSelectedAgentId(val === "none" ? "" : val)}
              >
                <SelectTrigger className="h-10 border-slate-200 text-sm">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {agents
                    .filter((agent) => agent.id && agent.id.trim() !== "")
                    .map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about the showing..."
              rows={2}
              className="border-slate-200 text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedSlotId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Scheduling...
              </>
            ) : (
              "Schedule Showing"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
