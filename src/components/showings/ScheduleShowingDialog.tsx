import React, { useState, useEffect } from "react";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { CalendarIcon, Search } from "lucide-react";
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
import type { Tables } from "@/integrations/supabase/types";

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
  rent_price: number;
}

interface AgentOption {
  id: string;
  full_name: string;
}

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00",
];

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

  // Options
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Form state
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
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
          .select("id, address, rent_price")
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

  const resetForm = () => {
    if (!preselectedLeadId) {
      setSelectedLeadId("");
    }
    setSelectedPropertyId("");
    setSelectedDate(undefined);
    setSelectedTime("");
    setSelectedDuration("30");
    setSelectedAgentId("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!userRecord?.organization_id) return;

    // Validation
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
    if (!selectedTime) {
      toast.error("Please select a time");
      return;
    }

    // Check date is in the future
    const today = startOfDay(new Date());
    if (isBefore(selectedDate, today)) {
      toast.error("Date must be in the future");
      return;
    }

    setSubmitting(true);
    try {
      // Combine date and time
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Create showing
      const { data: showingData, error: showingError } = await supabase
        .from("showings")
        .insert({
          organization_id: userRecord.organization_id,
          lead_id: selectedLeadId,
          property_id: selectedPropertyId,
          leasing_agent_id: selectedAgentId || null,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: parseInt(selectedDuration),
          status: "scheduled",
        })
        .select("id")
        .single();

      if (showingError) throw showingError;

      // Update lead status to showing_scheduled
      const { error: leadError } = await supabase
        .from("leads")
        .update({
          status: "showing_scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedLeadId);

      if (leadError) {
        console.error("Error updating lead status:", leadError);
      }

      // Schedule Samuel confirmation task (24h before showing)
      if (showingData?.id) {
        const confirmationTime = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
        const propertyAddr = selectedProperty?.address || "Property";

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
            scheduled_at: scheduledAt.toISOString(),
            source: "admin_manual",
          },
        });

        // System log
        await supabase.from("system_logs").insert({
          organization_id: userRecord.organization_id,
          level: "info",
          category: "general",
          event_type: "admin_showing_scheduled",
          message: `Showing scheduled by admin: ${propertyAddr} on ${format(scheduledAt, "MMM d, yyyy")} at ${format(scheduledAt, "h:mm a")}`,
          details: {
            showing_id: showingData.id,
            lead_id: selectedLeadId,
            property_id: selectedPropertyId,
            scheduled_by: userRecord.id,
            source: "admin_manual",
          },
          related_lead_id: selectedLeadId,
          related_showing_id: showingData.id,
        });
      }

      toast.success(
        `Showing scheduled for ${format(scheduledAt, "MMM d, yyyy")} at ${format(
          scheduledAt,
          "h:mm a"
        )}`
      );

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
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Showing</DialogTitle>
          <DialogDescription>
            Create a new property showing appointment
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
                    ? `${selectedProperty.address} - $${selectedProperty.rent_price}`
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
                          value={property.address}
                          onSelect={() => {
                            setSelectedPropertyId(property.id);
                            setPropertyOpen(false);
                          }}
                        >
                          <span className="font-medium">{property.address}</span>
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
              <Label>Time *</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {formatTimeDisplay(time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            disabled={submitting}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {submitting ? "Scheduling..." : "Schedule Showing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
