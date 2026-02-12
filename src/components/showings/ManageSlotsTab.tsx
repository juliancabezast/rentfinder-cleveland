import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Briefcase,
  CalendarDays,
  Loader2,
} from "lucide-react";
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addWeeks,
  subWeeks,
} from "date-fns";

type SlotRow =
  import("@/integrations/supabase/types").Database["public"]["Tables"]["showing_available_slots"]["Row"];

interface PropertyOption {
  id: string;
  address: string;
  city: string;
  status: string;
}

// Time slots from 8:00 AM to 7:00 PM in 30-min increments
const TIME_SLOTS: string[] = [];
for (let h = 8; h <= 18; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00:00`);
  if (h < 19) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30:00`);
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function slotKey(date: string, time: string) {
  return `${date}__${time}`;
}

export const ManageSlotsTab: React.FC = () => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertiesLoading, setPropertiesLoading] = useState(true);

  const orgId = userRecord?.organization_id;

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Build lookup map: "date__time" -> slot
  const slotMap = useMemo(() => {
    const map = new Map<string, SlotRow>();
    slots.forEach((s) => map.set(slotKey(s.slot_date, s.slot_time), s));
    return map;
  }, [slots]);

  // Build set of buffer slots (slot after a booked slot)
  const bufferSet = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => {
      if (s.is_booked) {
        // Find next 30-min slot on same date
        const idx = TIME_SLOTS.indexOf(s.slot_time);
        if (idx >= 0 && idx < TIME_SLOTS.length - 1) {
          set.add(slotKey(s.slot_date, TIME_SLOTS[idx + 1]));
        }
      }
    });
    return set;
  }, [slots]);

  // Fetch properties
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setPropertiesLoading(true);
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, status")
        .eq("organization_id", orgId)
        .in("status", ["available", "coming_soon"])
        .order("address");
      if (error) {
        console.error("Error fetching properties:", error);
      } else {
        setProperties(data || []);
        if (data && data.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(data[0].id);
        }
      }
      setPropertiesLoading(false);
    })();
  }, [orgId]);

  // Fetch slots when property or week changes
  const fetchSlots = useCallback(async () => {
    if (!selectedPropertyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("showing_available_slots")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .gte("slot_date", format(weekStart, "yyyy-MM-dd"))
      .lte("slot_date", format(weekEnd, "yyyy-MM-dd"));

    if (error) {
      console.error("Error fetching slots:", error);
      toast({ title: "Error", description: "Failed to load slots.", variant: "destructive" });
    } else {
      setSlots(data || []);
    }
    setLoading(false);
  }, [selectedPropertyId, weekStart, weekEnd]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Toggle a single slot
  const toggleSlot = async (date: string, time: string) => {
    if (!orgId || !selectedPropertyId) return;
    const key = slotKey(date, time);
    const existing = slotMap.get(key);

    // If booked or is buffer, don't allow toggle
    if (existing?.is_booked || bufferSet.has(key)) return;

    setSaving(true);
    if (existing) {
      // Toggle is_enabled
      const { error } = await supabase
        .from("showing_available_slots")
        .update({ is_enabled: !existing.is_enabled, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) {
        toast({ title: "Error", description: "Failed to update slot.", variant: "destructive" });
      }
    } else {
      // Insert new enabled slot
      const { error } = await supabase.from("showing_available_slots").insert({
        organization_id: orgId,
        property_id: selectedPropertyId,
        slot_date: date,
        slot_time: time,
        is_enabled: true,
        created_by: userRecord?.id,
      });
      if (error) {
        toast({ title: "Error", description: "Failed to create slot.", variant: "destructive" });
      }
    }
    setSaving(false);
    fetchSlots();
  };

  // Bulk enable: Mon-Fri 9:00-17:00
  const enableWeekdayBusiness = async () => {
    if (!orgId || !selectedPropertyId) return;
    setSaving(true);
    const rows: Array<{
      organization_id: string;
      property_id: string;
      slot_date: string;
      slot_time: string;
      is_enabled: boolean;
      created_by: string | undefined;
    }> = [];

    weekDays.forEach((day) => {
      const dow = day.getDay();
      if (dow === 0 || dow === 6) return; // Skip weekends
      TIME_SLOTS.forEach((time) => {
        const [h] = time.split(":");
        const hour = parseInt(h, 10);
        if (hour >= 9 && hour < 17) {
          const dateStr = format(day, "yyyy-MM-dd");
          const key = slotKey(dateStr, time);
          const existing = slotMap.get(key);
          if (!existing?.is_booked && !bufferSet.has(key)) {
            rows.push({
              organization_id: orgId,
              property_id: selectedPropertyId,
              slot_date: dateStr,
              slot_time: time,
              is_enabled: true,
              created_by: userRecord?.id,
            });
          }
        }
      });
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("showing_available_slots")
        .upsert(rows, { onConflict: "organization_id,property_id,slot_date,slot_time" });
      if (error) {
        toast({ title: "Error", description: "Failed to enable slots.", variant: "destructive" });
      } else {
        toast({ title: "Slots enabled", description: `${rows.length} Mon-Fri business hour slots enabled.` });
      }
    }
    setSaving(false);
    fetchSlots();
  };

  // Enable all slots in the week
  const enableAllDay = async () => {
    if (!orgId || !selectedPropertyId) return;
    setSaving(true);
    const rows: Array<{
      organization_id: string;
      property_id: string;
      slot_date: string;
      slot_time: string;
      is_enabled: boolean;
      created_by: string | undefined;
    }> = [];

    weekDays.forEach((day) => {
      TIME_SLOTS.forEach((time) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const key = slotKey(dateStr, time);
        const existing = slotMap.get(key);
        if (!existing?.is_booked && !bufferSet.has(key)) {
          rows.push({
            organization_id: orgId,
            property_id: selectedPropertyId,
            slot_date: dateStr,
            slot_time: time,
            is_enabled: true,
            created_by: userRecord?.id,
          });
        }
      });
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("showing_available_slots")
        .upsert(rows, { onConflict: "organization_id,property_id,slot_date,slot_time" });
      if (error) {
        toast({ title: "Error", description: "Failed to enable slots.", variant: "destructive" });
      } else {
        toast({ title: "All slots enabled", description: `${rows.length} slots enabled for the week.` });
      }
    }
    setSaving(false);
    fetchSlots();
  };

  // Copy current week's enabled slots to next week
  const copyToNextWeek = async () => {
    if (!orgId || !selectedPropertyId) return;
    setSaving(true);

    const enabledSlots = slots.filter((s) => s.is_enabled);
    if (enabledSlots.length === 0) {
      toast({ title: "No slots to copy", description: "Enable some slots first.", variant: "destructive" });
      setSaving(false);
      return;
    }

    const rows = enabledSlots.map((s) => {
      const originalDate = new Date(s.slot_date + "T00:00:00");
      const nextWeekDate = addDays(originalDate, 7);
      return {
        organization_id: orgId,
        property_id: selectedPropertyId,
        slot_date: format(nextWeekDate, "yyyy-MM-dd"),
        slot_time: s.slot_time,
        is_enabled: true,
        created_by: userRecord?.id,
      };
    });

    const { error } = await supabase
      .from("showing_available_slots")
      .upsert(rows, { onConflict: "organization_id,property_id,slot_date,slot_time" });
    if (error) {
      toast({ title: "Error", description: "Failed to copy slots.", variant: "destructive" });
    } else {
      toast({
        title: "Copied to next week",
        description: `${rows.length} slots copied to ${format(addWeeks(weekStart, 1), "MMM d")} - ${format(addWeeks(weekEnd, 1), "MMM d")}.`,
      });
    }
    setSaving(false);
  };

  // Get cell styling based on slot state
  const getCellStyle = (date: string, time: string) => {
    const key = slotKey(date, time);
    const existing = slotMap.get(key);
    const isBuffer = bufferSet.has(key);

    if (existing?.is_booked) {
      return {
        className: "bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 cursor-not-allowed",
        label: "Booked",
        clickable: false,
      };
    }
    if (isBuffer) {
      return {
        className: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 cursor-not-allowed",
        label: "Buffer",
        clickable: false,
      };
    }
    if (existing?.is_enabled) {
      return {
        className:
          "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 hover:bg-emerald-200 cursor-pointer",
        label: "Available",
        clickable: true,
      };
    }
    return {
      className: "bg-muted border-border hover:bg-muted/80 cursor-pointer",
      label: "",
      clickable: true,
    };
  };

  // Count stats
  const stats = useMemo(() => {
    let available = 0;
    let booked = 0;
    let buffers = 0;
    slots.forEach((s) => {
      if (s.is_booked) booked++;
      else if (s.is_enabled) available++;
    });
    buffers = bufferSet.size;
    return { available, booked, buffers };
  }, [slots, bufferSet]);

  if (propertiesLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (properties.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center py-8">
            No available properties found. Add properties with status "available" or "coming soon" first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <Card variant="glass">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Property selector */}
            <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
              <SelectTrigger className="w-full lg:w-80 min-h-[44px]">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.address}, {p.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Week navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[180px] text-center">
                {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Bulk actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={enableWeekdayBusiness}
                disabled={saving}
              >
                <Briefcase className="h-4 w-4 mr-1" />
                Mon-Fri 9-5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={enableAllDay}
                disabled={saving}
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                Enable All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToNextWeek}
                disabled={saving}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy → Next Week
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex gap-4 flex-wrap">
        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
          {stats.available} Available
        </Badge>
        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
          {stats.booked} Booked
        </Badge>
        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
          {stats.buffers} Buffer
        </Badge>
      </div>

      {/* Weekly grid */}
      <Card variant="glass">
        <CardContent className="p-2 sm:p-4 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="min-w-[700px]">
              {/* Header row: day names */}
              <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 mb-1">
                <div className="text-xs font-medium text-muted-foreground flex items-center justify-center">
                  <Clock className="h-3 w-3 mr-1" />
                  Time
                </div>
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`text-center text-xs font-medium p-1.5 rounded-md ${
                      isSameDay(day, new Date())
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    <div>{format(day, "EEE")}</div>
                    <div className="text-sm font-semibold">{format(day, "d")}</div>
                  </div>
                ))}
              </div>

              {/* Time rows */}
              {TIME_SLOTS.map((time) => (
                <div key={time} className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 mb-1">
                  <div className="text-xs text-muted-foreground flex items-center justify-end pr-2 font-mono">
                    {formatTime(time)}
                  </div>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const cell = getCellStyle(dateStr, time);
                    return (
                      <button
                        key={`${dateStr}-${time}`}
                        className={`h-8 rounded border text-[10px] font-medium transition-colors ${cell.className}`}
                        disabled={!cell.clickable || saving}
                        onClick={() => cell.clickable && toggleSlot(dateStr, time)}
                        title={
                          cell.label
                            ? `${cell.label} — ${formatTime(time)}`
                            : `Click to enable — ${formatTime(time)}`
                        }
                      >
                        {cell.label === "Booked" && "●"}
                        {cell.label === "Buffer" && "○"}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded border bg-muted" />
          <span>Not enabled (click to enable)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded border border-emerald-300 bg-emerald-100" />
          <span>Available (click to disable)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded border border-blue-300 bg-blue-100 flex items-center justify-center text-[8px]">
            ●
          </div>
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded border border-blue-200 bg-blue-50 flex items-center justify-center text-[8px]">
            ○
          </div>
          <span>20-min buffer</span>
        </div>
      </div>
    </div>
  );
};
