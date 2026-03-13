import React, { useState, useEffect } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarIcon, Search, Loader2 } from "lucide-react";
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
}

interface PropertyOption {
  id: string;
  address: string;
  unit_number: string | null;
  rent_price: number;
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
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
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

  // Available slots from DB
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
          .select("id, full_name, phone")
          .eq("organization_id", userRecord.organization_id)
          .order("full_name"),
        supabase
          .from("properties")
          .select("id, address, unit_number, rent_price")
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
        .eq("property_id", selectedPropertyId)
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

      // Build timezone-aware scheduled_at (same as book-public-showing)
      const orgTz = "America/New_York";
      const localDt = new Date(`${dateStr}T12:00:00Z`);
      const localStr = localDt.toLocaleString("en-US", { timeZone: orgTz });
      const localParsed = new Date(localStr);
      const offsetMs = localDt.getTime() - localParsed.getTime();
      const offsetHours = Math.round(offsetMs / 3600000);
      const offsetSign = offsetHours >= 0 ? "+" : "-";
      const offsetAbs = String(Math.abs(offsetHours)).padStart(2, "0");
      const tzOffset = `${offsetSign}${offsetAbs}:00`;
      const scheduledAt = `${dateStr}T${slotTime}${tzOffset}`;

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
        },
        related_lead_id: selectedLeadId,
        related_showing_id: showingData.id,
      });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Showing</DialogTitle>
          <DialogDescription>
            Create a new property showing from available slots
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Lead Selection */}
          <div className="space-y-2">
            <Label>Lead *</Label>
            {preselectedLeadId ? (
              <div className="px-3 py-2 rounded-md border bg-muted/50 text-sm">
                {preselectedLeadName || "Selected Lead"}
              </div>
            ) : (
              <Popover open={leadOpen} onOpenChange={setLeadOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                    disabled={loadingOptions}
                  >
                    {selectedLead
                      ? `${selectedLead.full_name || "Unknown"} - ${selectedLead.phone}`
                      : "Select lead..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search leads..." />
                    <CommandList>
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
                          >
                            <span className="font-medium">
                              {lead.full_name || "Unknown"}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {lead.phone}
                            </span>
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
            <Label>Property *</Label>
            <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={loadingOptions}
                >
                  {selectedProperty
                    ? `${selectedProperty.address}${selectedProperty.unit_number ? ` #${selectedProperty.unit_number}` : ''} - $${selectedProperty.rent_price}`
                    : "Select property..."}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search properties..." />
                  <CommandList>
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
                        >
                          <span className="font-medium">{property.address}{property.unit_number ? ` #${property.unit_number}` : ''}</span>
                          <span className="ml-2 text-muted-foreground">
                            ${property.rent_price.toLocaleString()}/mo
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Time Slot *</Label>
              {loadingSlots ? (
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading slots...
                </div>
              ) : !selectedPropertyId || !selectedDate ? (
                <div className="h-10 px-3 border rounded-md flex items-center text-sm text-muted-foreground">
                  Select property & date first
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="h-10 px-3 border rounded-md flex items-center text-sm text-amber-600 bg-amber-50">
                  No available slots for this date
                </div>
              ) : (
                <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
                  <SelectTrigger>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger>
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
              <Label>Leasing Agent</Label>
              <Select
                value={selectedAgentId || "none"}
                onValueChange={(val) => setSelectedAgentId(val === "none" ? "" : val)}
              >
                <SelectTrigger>
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
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about the showing..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedSlotId}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {submitting ? "Scheduling..." : "Schedule Showing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
