import React, { useState, useEffect, useMemo } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarIcon, Loader2, X, MapPin } from "lucide-react";
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

  // Fetch active properties + pre-fill edit state
  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      setLoadingProps(true);

      // Fetch all available properties
      const { data: propData } = await supabase
        .from("properties")
        .select("id, address, city")
        .eq("organization_id", orgId)
        .eq("status", "available")
        .order("address");
      const allProps = propData || [];
      setProperties(allProps);

      // Set time defaults
      if (editData) {
        setSelectedDate(new Date(editData.date + "T12:00:00"));
        if (editData.slots.length > 0) {
          setStartTime(editData.slots[0]);
          const lastSlot = editData.slots[editData.slots.length - 1];
          const [lh, lm] = lastSlot.split(":").map(Number);
          const endMin = lh * 60 + lm + 30;
          const eH = Math.floor(endMin / 60);
          const eM = endMin % 60;
          const computedEnd = `${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}:00`;
          const match = TIME_OPTIONS.find((t) => t.value >= computedEnd);
          setEndTime(match ? match.value : TIME_OPTIONS[TIME_OPTIONS.length - 1].value);
        }

        // In edit mode: fetch which properties actually have ENABLED slots for this date
        // and pre-exclude properties that DON'T have slots
        const { data: slotData } = await supabase
          .from("showing_available_slots")
          .select("property_id")
          .eq("organization_id", orgId)
          .eq("slot_date", editData.date)
          .eq("is_enabled", true)
          .eq("is_booked", false);

        const propsWithSlots = new Set((slotData || []).map((s) => s.property_id));
        const excluded = new Set<string>();
        allProps.forEach((p) => {
          if (!propsWithSlots.has(p.id)) excluded.add(p.id);
        });
        setExcludedIds(excluded);
      } else {
        setSelectedDate(undefined);
        setStartTime("09:00:00");
        setEndTime("17:00:00");
        setExcludedIds(new Set());
      }

      setBuffer("30");
      setLoadingProps(false);
    })();
  }, [open, orgId, editData]);

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group properties by city
  const cityGroups = useMemo(() => {
    const map = new Map<string, PropertyOption[]>();
    properties.forEach((p) => {
      const city = p.city || "Other";
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(p);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [properties]);

  const toggleCity = (city: string) => {
    const cityProps = cityGroups.find(([c]) => c === city)?.[1] || [];
    const cityIds = cityProps.map((p) => p.id);
    const allExcluded = cityIds.every((id) => excludedIds.has(id));
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (allExcluded) {
        cityIds.forEach((id) => next.delete(id));
      } else {
        cityIds.forEach((id) => next.add(id));
      }
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

      // In edit mode, first DISABLE all unbooked slots for this date
      // (using UPDATE instead of DELETE to avoid RLS policy issues)
      if (isEditMode) {
        const { error: disableErr } = await supabase
          .from("showing_available_slots")
          .update({ is_enabled: false, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId)
          .eq("slot_date", dateStr)
          .eq("is_booked", false);

        if (disableErr) {
          console.error("Disable slots error:", disableErr);
          toast.error(`Failed to update slots: ${disableErr.message}`);
          setSubmitting(false);
          return;
        }
      }

      // Create/update slots for active properties only (sets is_enabled = true)
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

          {/* Exclude Properties — Grouped by City */}
          {properties.length > 0 && (
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
                <div className="space-y-3">
                  {cityGroups.map(([city, cityProps]) => {
                    const cityIds = cityProps.map((p) => p.id);
                    const allExcluded = cityIds.every((id) => excludedIds.has(id));
                    const someExcluded = cityIds.some((id) => excludedIds.has(id));
                    const activeCount = cityIds.filter((id) => !excludedIds.has(id)).length;

                    return (
                      <div key={city} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => toggleCity(city)}
                          className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            allExcluded
                              ? "text-muted-foreground"
                              : "text-[#370d4b]"
                          )}
                        >
                          <MapPin className="h-3 w-3" />
                          {city}
                          <span className="font-normal text-muted-foreground">
                            ({activeCount}/{cityProps.length})
                          </span>
                          {allExcluded && (
                            <span className="text-[10px] text-muted-foreground font-normal ml-0.5">— tap to enable</span>
                          )}
                          {!allExcluded && someExcluded && (
                            <span className="text-[10px] text-muted-foreground font-normal ml-0.5">— tap to disable all</span>
                          )}
                          {!someExcluded && cityProps.length > 1 && (
                            <span className="text-[10px] text-muted-foreground font-normal ml-0.5">— tap to disable all</span>
                          )}
                        </button>
                        <div className="flex flex-wrap gap-1.5 pl-4">
                          {cityProps.map((p) => {
                            const isExcluded = excludedIds.has(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => toggleExclude(p.id)}
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all border",
                                  isExcluded
                                    ? "bg-muted text-muted-foreground border-border line-through opacity-50"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                )}
                              >
                                {isExcluded && <X className="h-2.5 w-2.5" />}
                                {p.address}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {excludedIds.size > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
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
