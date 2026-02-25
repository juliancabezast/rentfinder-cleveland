import React, { useState, useEffect } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarIcon, Loader2, X } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EditSlotData {
  date: string; // yyyy-MM-dd
  slots: string[]; // slot times
}

interface EnableSlotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  orgId: string;
  editData?: EditSlotData | null;
}

interface PropertyOption {
  id: string;
  address: string;
  city: string;
}

// Time options from 8:00 AM to 7:00 PM
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 8; h <= 19; h++) {
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  TIME_OPTIONS.push({
    value: `${String(h).padStart(2, "0")}:00:00`,
    label: `${display}:00 ${ampm}`,
  });
  if (h < 19) {
    TIME_OPTIONS.push({
      value: `${String(h).padStart(2, "0")}:30:00`,
      label: `${display}:30 ${ampm}`,
    });
  }
}

const BUFFER_OPTIONS = [
  { value: "20", label: "20 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

export const EnableSlotsDialog: React.FC<EnableSlotsDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  orgId,
  editData,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState("09:00:00");
  const [endTime, setEndTime] = useState("17:00:00");
  const [buffer, setBuffer] = useState("30");
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEditMode = !!editData;

  // Fetch active properties (only "available")
  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      setLoadingProps(true);
      const { data } = await supabase
        .from("properties")
        .select("id, address, city")
        .eq("organization_id", orgId)
        .eq("status", "available")
        .order("address");
      setProperties(data || []);
      setLoadingProps(false);
    })();
  }, [open, orgId]);

  // Set defaults / pre-fill for edit
  useEffect(() => {
    if (!open) return;
    if (editData) {
      setSelectedDate(new Date(editData.date + "T12:00:00"));
      if (editData.slots.length > 0) {
        setStartTime(editData.slots[0]);
        setEndTime(editData.slots[editData.slots.length - 1]);
      }
    } else {
      setSelectedDate(undefined);
      setStartTime("09:00:00");
      setEndTime("17:00:00");
    }
    setBuffer("30");
    setExcludedIds(new Set());
  }, [open, editData]);

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Calculate slot times based on start, end, buffer
  const calculateSlotTimes = (): string[] => {
    const bufferMin = parseInt(buffer);
    const slotDuration = 30;
    const stepMin = slotDuration + bufferMin;

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    const times: string[] = [];
    for (let t = startTotal; t + slotDuration <= endTotal; t += stepMin) {
      const h = Math.floor(t / 60);
      const m = t % 60;
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    }
    return times;
  };

  const previewSlots = selectedDate ? calculateSlotTimes() : [];
  const activeProperties = properties.filter((p) => !excludedIds.has(p.id));
  const totalSlots = previewSlots.length * activeProperties.length;

  const handleSubmit = async () => {
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    if (activeProperties.length === 0) {
      toast.error("No properties available. Uncheck some exclusions.");
      return;
    }
    if (previewSlots.length === 0) {
      toast.error("No slots fit in this time range. Adjust start/end times.");
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // In edit mode, first delete existing unbooked slots for this date
      if (isEditMode) {
        await supabase
          .from("showing_available_slots")
          .delete()
          .eq("organization_id", orgId)
          .eq("slot_date", dateStr)
          .eq("is_booked", false);
      }

      const rows = activeProperties.flatMap((prop) =>
        previewSlots.map((time) => ({
          organization_id: orgId,
          property_id: prop.id,
          slot_date: dateStr,
          slot_time: time,
          is_enabled: true,
        }))
      );

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await supabase
          .from("showing_available_slots")
          .upsert(batch, { onConflict: "organization_id,property_id,slot_date,slot_time" });

        if (error) {
          console.error("Slot upsert error:", error);
          toast.error(`Failed to create slots: ${error.message}`);
          setSubmitting(false);
          return;
        }
      }

      toast.success(
        isEditMode
          ? `Updated slots for ${format(selectedDate, "MMM d")}`
          : `${previewSlots.length} time slots enabled across ${activeProperties.length} properties`
      );
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Enable slots error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${display}:${m} ${ampm}`;
  };

  const endTimeOptions = TIME_OPTIONS.filter((t) => t.value > startTime);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Slots" : "Enable Available Slots"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Modify the time range and buffer for this date."
              : "Choose a date and time range. Slots will be created for all your properties."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Date */}
          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isEditMode}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Pick a date"}
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

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={(v) => {
                setStartTime(v);
                if (endTime <= v) {
                  const idx = TIME_OPTIONS.findIndex((t) => t.value === v);
                  if (idx >= 0 && idx + 2 < TIME_OPTIONS.length) {
                    setEndTime(TIME_OPTIONS[idx + 2].value);
                  }
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.slice(0, -1).map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {endTimeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Buffer */}
          <div className="space-y-2">
            <Label>Buffer Between Showings</Label>
            <Select value={buffer} onValueChange={setBuffer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUFFER_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Exclude Properties — Toggle Badges */}
          {properties.length > 1 && (
            <div className="space-y-2">
              <Label>
                Properties
                <span className="text-muted-foreground font-normal ml-1.5">
                  (tap to exclude)
                </span>
              </Label>
              {loadingProps ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {properties.map((p) => {
                    const isExcluded = excludedIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleExclude(p.id)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                          isExcluded
                            ? "bg-muted text-muted-foreground border-border line-through opacity-50"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                        )}
                      >
                        {isExcluded && <X className="h-3 w-3" />}
                        {p.address}
                      </button>
                    );
                  })}
                </div>
              )}
              {excludedIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {excludedIds.size} excluded — slots will not be created for these
                </p>
              )}
            </div>
          )}

          {/* Preview */}
          {selectedDate && previewSlots.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">Preview</p>
              <p className="text-muted-foreground">
                {previewSlots.length} time slots &times; {activeProperties.length} properties = <span className="font-semibold text-foreground">{totalSlots} total slots</span>
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {previewSlots.map((t) => (
                  <span
                    key={t}
                    className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-medium"
                  >
                    {fmtTime(t)}
                  </span>
                ))}
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
            disabled={submitting || !selectedDate || previewSlots.length === 0}
            className="bg-[#370d4b] hover:bg-[#370d4b]/90 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditMode ? "Updating..." : "Creating..."}
              </>
            ) : isEditMode ? (
              "Update Slots"
            ) : (
              `Enable ${previewSlots.length} Slots`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
