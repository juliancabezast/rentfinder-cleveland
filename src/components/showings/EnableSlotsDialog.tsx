import React, { useState, useEffect, useMemo } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarIcon, Loader2, MapPin } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
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
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";

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
  prefilledDate?: Date;
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


export const EnableSlotsDialog: React.FC<EnableSlotsDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  orgId,
  editData,
  prefilledDate,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState("09:00:00");
  const [endTime, setEndTime] = useState("17:00:00");
  const [buffer, setBuffer] = useState("0");
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { getSetting, updateSetting } = useOrganizationSettings();

  const isEditMode = !!editData;

  // Available cities from properties
  const cities = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) => {
      if (p.city) set.add(p.city);
    });
    return Array.from(set).sort();
  }, [properties]);

  // Properties in ALL selected cities
  const cityProperties = useMemo(
    () => (selectedCities.size > 0 ? properties.filter((p) => selectedCities.has(p.city)) : []),
    [properties, selectedCities]
  );

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  };

  // Fetch properties + pre-fill edit state
  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      setLoadingProps(true);

      const { data: propData } = await supabase
        .from("properties")
        .select("id, address, city")
        .eq("organization_id", orgId)
        .eq("status", "available")
        .order("address");
      const allProps = propData || [];
      setProperties(allProps);

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

          if (editData.slots.length >= 2) {
            const [s1h, s1m] = editData.slots[0].split(":").map(Number);
            const [s2h, s2m] = editData.slots[1].split(":").map(Number);
            const gapMin = (s2h * 60 + s2m) - (s1h * 60 + s1m);
            const inferredBuffer = Math.max(0, gapMin - 30);
            setBuffer(String(inferredBuffer));
          }
        }

        // In edit mode: detect ALL cities that have slots for this date
        const { data: slotData } = await supabase
          .from("showing_available_slots")
          .select("property_id, properties(city)")
          .eq("organization_id", orgId)
          .eq("slot_date", editData.date)
          .eq("is_enabled", true);

        if (slotData && slotData.length > 0) {
          const slotCities = new Set<string>();
          slotData.forEach((s: any) => {
            const c = s.properties?.city;
            if (c) slotCities.add(c);
          });
          setSelectedCities(slotCities);
        }
      } else {
        setSelectedDate(prefilledDate || undefined);
        const savedBuffer = getSetting("buffer_minutes", 0);
        setStartTime("09:00:00");
        setEndTime("17:00:00");
        setBuffer(String(savedBuffer));
        // Auto-select first city if only one exists
        const uniqueCities = new Set<string>();
        allProps.forEach((p) => { if (p.city) uniqueCities.add(p.city); });
        if (uniqueCities.size === 1) {
          setSelectedCities(uniqueCities);
        } else {
          setSelectedCities(new Set());
        }
      }
      setLoadingProps(false);
    })();
  }, [open, orgId, editData]);

  // Calculate slot times
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

  const handleSubmit = async () => {
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }
    if (selectedCities.size === 0) {
      toast.error("Please select at least one city");
      return;
    }
    if (cityProperties.length === 0) {
      toast.error("No available properties in this city");
      return;
    }
    if (previewSlots.length === 0) {
      toast.error("No slots fit in this time range. Adjust start/end times.");
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // In edit mode, disable all unbooked slots for this date first
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

      // Create slots for all properties in the selected city
      const rows = cityProperties.flatMap((prop) =>
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

      // Save buffer preference for next time + for booking logic
      await updateSetting("buffer_minutes", parseInt(buffer) || 0, "showings", "Buffer minutes between showings");

      const cityLabel = [...selectedCities].join(", ");
      toast.success(
        isEditMode
          ? `Updated slots for ${format(selectedDate, "MMM d")} in ${cityLabel}`
          : `${previewSlots.length} slots enabled for ${cityProperties.length} properties in ${cityLabel}`
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
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Slots" : "Enable Showings"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Modify the time range for this date."
              : "Pick a city, date, and hours. All properties in that city get slots."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* City */}
          <div className="space-y-2">
            <Label>City *</Label>
            {loadingProps ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cities.map((city) => {
                  const count = properties.filter((p) => p.city === city).length;
                  const isSelected = selectedCities.has(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggleCity(city)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                        isSelected
                          ? "bg-[#4F46E5] text-white border-[#4F46E5] shadow-sm"
                          : "bg-muted/50 text-foreground border-border hover:border-[#4F46E5]/40 hover:bg-[#4F46E5]/5"
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {city}
                      <span className={cn(
                        "text-xs",
                        isSelected ? "text-white/70" : "text-muted-foreground"
                      )}>
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
                  onSelect={(date) => {
                    setSelectedDate(date);
                    if (date) {
                      const savedBuffer = getSetting("buffer_minutes", 0);
                      setBuffer(String(savedBuffer));
                    }
                  }}
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
            <Label>Buffer Between Showings (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              0 = back-to-back (9:00, 9:30, 10:00…). 5 = small gap between showings.
            </p>
          </div>

          {/* Preview */}
          {selectedDate && selectedCities.size > 0 && previewSlots.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">Preview</p>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{previewSlots.length} available time slots</span> across {cityProperties.length} properties in {[...selectedCities].join(", ")}
              </p>
              <p className="text-xs text-muted-foreground">
                One agent — each time slot can only be booked once
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
            disabled={submitting || !selectedDate || selectedCities.size === 0 || previewSlots.length === 0}
            className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
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
