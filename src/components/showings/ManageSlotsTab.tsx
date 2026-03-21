import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { EnableSlotsDialog, EditSlotData } from "./EnableSlotsDialog";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  User,
  Home,
  Ban,
  Eye,
  Check,
} from "lucide-react";
import { format, addDays, parseISO, startOfDay } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────
interface SlotProperty {
  property_id: string;
  property_address: string;
  property_city: string;
  is_booked: boolean;
  is_enabled: boolean;
  lead_name: string | null;
  booked_showing_id: string | null;
}

interface TimeSlotGroup {
  time: string;
  properties: SlotProperty[];
  totalCount: number;
  bookedCount: number;
  isBlocked: boolean;
}

interface DayData {
  date: string;
  timeSlots: TimeSlotGroup[];
  hasSlots: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

interface ManageSlotsTabProps {
  externalDialogOpen?: boolean;
  onExternalDialogHandled?: () => void;
  onTotalsChange?: (totals: { available: number; booked: number }) => void;
  onShowingClick?: (showingId: string) => void;
}

// ── Component ────────────────────────────────────────────────────────
export const ManageSlotsTab: React.FC<ManageSlotsTabProps> = ({
  externalDialogOpen,
  onExternalDialogHandled,
  onTotalsChange,
  onShowingClick,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [weekOffset, setWeekOffset] = useState(0);
  const [slotData, setSlotData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<EditSlotData | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | undefined>();
  const [blockingSlot, setBlockingSlot] = useState<string | null>(null);

  const orgId = userRecord?.organization_id;

  // Open dialog when triggered from parent
  useEffect(() => {
    if (externalDialogOpen) {
      setEditData(null);
      setPrefilledDate(undefined);
      setDialogOpen(true);
      onExternalDialogHandled?.();
    }
  }, [externalDialogOpen]);

  // Week dates (7 days starting from today + weekOffset*7)
  const weekDates = useMemo(() => {
    const start = addDays(startOfDay(new Date()), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekOffset]);

  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  // ── Fetch slots for current week with per-property detail ────────
  const fetchSlots = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const startStr = format(weekDates[0], "yyyy-MM-dd");
    const endStr = format(weekDates[6], "yyyy-MM-dd");

    // Query slots with property info and booked showing + lead name
    const { data, error } = await supabase
      .from("showing_available_slots")
      .select(`
        id, slot_date, slot_time, is_booked, is_enabled, property_id,
        properties(address, city),
        booked_showing_id
      `)
      .eq("organization_id", orgId)
      .gte("slot_date", startStr)
      .lte("slot_date", endStr)
      .order("slot_date")
      .order("slot_time");

    // Fetch lead names for booked slots in a separate query
    const bookedShowingIds = (data || [])
      .filter((s: any) => s.booked_showing_id)
      .map((s: any) => s.booked_showing_id);

    let showingInfoMap = new Map<string, { leadName: string; propertyId: string }>();
    if (bookedShowingIds.length > 0) {
      const { data: showingsData } = await supabase
        .from("showings")
        .select("id, property_id, leads(full_name)")
        .in("id", bookedShowingIds);
      (showingsData || []).forEach((s: any) => {
        showingInfoMap.set(s.id, {
          leadName: s.leads?.full_name || "Booked",
          propertyId: s.property_id || "",
        });
      });
    }

    if (error) {
      console.error("Error fetching slots:", error);
      toast({ title: "Error", description: "Failed to load slots.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Build day data for each day in the week
    const dayMap = new Map<string, Map<string, SlotProperty[]>>();

    (data || []).forEach((s: any) => {
      const dateKey = s.slot_date;
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, new Map());
      const timeMap = dayMap.get(dateKey)!;
      if (!timeMap.has(s.slot_time)) timeMap.set(s.slot_time, []);

      const showingInfo = s.booked_showing_id ? showingInfoMap.get(s.booked_showing_id) : null;
      // Only show lead name on the actual property that was booked, not blocked slots
      const isRealBooking = showingInfo && showingInfo.propertyId === s.property_id;
      timeMap.get(s.slot_time)!.push({
        property_id: s.property_id,
        property_address: (s.properties as any)?.address || "Unknown",
        property_city: (s.properties as any)?.city || "",
        is_booked: s.is_booked,
        is_enabled: s.is_enabled,
        lead_name: isRealBooking ? showingInfo.leadName : null,
        booked_showing_id: isRealBooking ? s.booked_showing_id : null,
      });
    });

    const days: DayData[] = weekDates.map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const timeMap = dayMap.get(dateStr);

      if (!timeMap || timeMap.size === 0) {
        return { date: dateStr, timeSlots: [], hasSlots: false };
      }

      const timeSlots: TimeSlotGroup[] = [];
      timeMap.forEach((props, time) => {
        const enabledProps = props.filter((p) => p.is_enabled);
        const allDisabled = enabledProps.length === 0;
        timeSlots.push({
          time,
          properties: props.sort((a, b) => a.property_address.localeCompare(b.property_address)),
          totalCount: props.length,
          bookedCount: enabledProps.filter((p) => p.is_booked && p.lead_name).length,
          isBlocked: allDisabled,
        });
      });

      timeSlots.sort((a, b) => a.time.localeCompare(b.time));

      return { date: dateStr, timeSlots, hasSlots: true };
    });

    setSlotData(days);
    setLoading(false);
  }, [orgId, weekDates]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // ── Summary totals (1 person = 1 slot per time) ─────────────────────
  const totals = useMemo(() => {
    let available = 0;
    let booked = 0;
    slotData.forEach((day) => {
      day.timeSlots.forEach((ts) => {
        if (ts.isBlocked) return; // don't count blocked slots
        if (ts.bookedCount > 0) {
          booked += 1;
        } else {
          available += 1;
        }
      });
    });
    return { available, booked };
  }, [slotData]);

  // Push totals to parent
  useEffect(() => {
    onTotalsChange?.(totals);
  }, [totals.available, totals.booked]);


  // ── Block / unblock a time slot ────────────────────────────────────
  const handleToggleBlock = async (date: string, time: string, block: boolean) => {
    if (!orgId) return;
    const key = `${date}-${time}`;
    setBlockingSlot(key);

    const { error } = await supabase
      .from("showing_available_slots")
      .update({ is_enabled: !block, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("slot_date", date)
      .eq("slot_time", time)
      .eq("is_booked", false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: block ? "Blocked" : "Unblocked", description: `${formatTime(time)} on ${format(parseISO(date), "MMM d")} ${block ? "blocked" : "re-enabled"}.` });
      fetchSlots();
    }
    setBlockingSlot(null);
  };

  // ── All unique times across the week (for row headers) ────────────
  const allTimes = useMemo(() => {
    const timeSet = new Set<string>();
    slotData.forEach((day) => {
      day.timeSlots.forEach((ts) => timeSet.add(ts.time));
    });
    return Array.from(timeSet).sort();
  }, [slotData]);

  // ── Cell color logic (booked / open / blocked) ─────────────────────
  const getCellStyle = (ts: TimeSlotGroup | undefined) => {
    if (!ts) return "bg-slate-50 text-slate-300";
    if (ts.isBlocked) return "bg-red-50 border-red-200 text-red-400";
    if (ts.bookedCount === 0) return "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100";
    return "bg-blue-50 border-blue-200 text-blue-800";
  };

  // Check if a date is in the past
  const isPast = (dateStr: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    return dateStr < today;
  };

  return (
    <div className="space-y-3">
      {/* ── Week navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)} disabled={weekOffset <= 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold text-center">
          {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Weekly grid ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : allTimes.length === 0 && slotData.every((d) => !d.hasSlots) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No slots this week</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Enable Slots" to add available times for showings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                {/* ── Column headers (days) ────────────────────────── */}
                <thead>
                  <tr className="border-b">
                    <th className="w-20 p-2 text-left text-muted-foreground font-medium sticky left-0 bg-white z-10">
                      Time
                    </th>
                    {slotData.map((day) => {
                      const dateObj = parseISO(day.date);
                      const isToday = format(new Date(), "yyyy-MM-dd") === day.date;
                      return (
                        <th
                          key={day.date}
                          className={`p-2 text-center font-medium min-w-[100px] ${
                            isToday ? "bg-[#4F46E5]/5" : ""
                          } ${isPast(day.date) ? "opacity-40" : ""}`}
                        >
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {format(dateObj, "EEE")}
                          </div>
                          <div className={`text-sm font-bold ${isToday ? "text-[#4F46E5]" : ""}`}>
                            {format(dateObj, "d")}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {format(dateObj, "MMM")}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* ── Time rows ─────────────────────────────────────── */}
                <tbody>
                  {allTimes.map((time) => (
                    <tr key={time} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-white z-10">
                        {formatTime(time)}
                      </td>
                      {slotData.map((day) => {
                        const ts = day.timeSlots.find((s) => s.time === time);
                        const past = isPast(day.date);
                        const isToday = format(new Date(), "yyyy-MM-dd") === day.date;

                        if (!ts) {
                          return (
                            <td
                              key={day.date}
                              className={`p-1 text-center ${isToday ? "bg-[#4F46E5]/5" : ""} ${past ? "opacity-40" : ""}`}
                            >
                              {past ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                <button
                                  className="w-full rounded-md border border-dashed border-slate-200 px-2 py-1.5 text-xs text-slate-300 hover:border-[#4F46E5]/40 hover:text-[#4F46E5] hover:bg-[#4F46E5]/5 transition-colors"
                                  onClick={() => {
                                    setPrefilledDate(parseISO(day.date));
                                    setEditData(null);
                                    setDialogOpen(true);
                                  }}
                                  title="Enable slots for this day"
                                >
                                  <Plus className="h-3 w-3 mx-auto" />
                                </button>
                              )}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={day.date}
                            className={`p-1 text-center ${isToday ? "bg-[#4F46E5]/5" : ""} ${past ? "opacity-40" : ""}`}
                          >
                            {(() => {
                              const realBookings = ts.properties.filter((p) => p.is_booked && p.lead_name);
                              const blockedSlots = ts.properties.filter((p) => p.is_booked && !p.lead_name);
                              const isBooked = realBookings.length > 0 || blockedSlots.length > 0;
                              const firstBooked = realBookings[0];

                              return (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${getCellStyle(ts)}`}
                                    >
                                      {ts.isBlocked ? (
                                        <>
                                          <div className="font-bold">Blocked</div>
                                          <div className="text-[10px] opacity-70">
                                            <Ban className="h-2.5 w-2.5 inline" />
                                          </div>
                                        </>
                                      ) : firstBooked ? (
                                        <>
                                          <div className="font-bold truncate">
                                            {firstBooked.lead_name}
                                          </div>
                                          <div className="text-[10px] opacity-70 truncate">
                                            {firstBooked.property_address}
                                          </div>
                                        </>
                                      ) : blockedSlots.length > 0 ? (
                                        <div className="font-bold text-slate-500">Blocked</div>
                                      ) : (
                                        <>
                                          <div className="font-bold">Open</div>
                                          {(() => {
                                            const cities = [...new Set(ts.properties.filter(p => p.is_enabled && p.property_city).map(p => p.property_city))];
                                            return cities.length > 0 ? (
                                              <div className="text-[10px] opacity-70 truncate">
                                                {cities.join(", ")}
                                              </div>
                                            ) : null;
                                          })()}
                                        </>
                                      )}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-3" side="bottom" align="center">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold text-sm">
                                          {formatTime(time)} — {format(parseISO(day.date), "MMM d")}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] ${ts.isBlocked ? "border-red-200 text-red-600" : isBooked ? "border-blue-200 text-blue-700" : "border-emerald-200 text-emerald-700"}`}
                                        >
                                          {ts.isBlocked ? "Blocked" : realBookings.length > 0 ? `${realBookings.length} booked` : blockedSlots.length > 0 ? "Blocked" : "Open"}
                                        </Badge>
                                      </div>
                                      {/* Show real bookings */}
                                      {realBookings.length > 0 && (
                                        <div className="space-y-1.5">
                                          {realBookings.map((p) => (
                                            <div
                                              key={p.property_id}
                                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs bg-blue-50 border border-blue-100"
                                            >
                                              <Home className="h-3 w-3 shrink-0 text-blue-500" />
                                              <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{p.property_address}</div>
                                              </div>
                                              <div className="flex items-center gap-1 text-blue-700 shrink-0">
                                                <User className="h-3 w-3" />
                                                <span className="text-[10px] font-medium truncate max-w-[80px]">
                                                  {p.lead_name}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {/* View / Cancel button for booked showings */}
                                      {!past && realBookings.length > 0 && onShowingClick && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="w-full mt-1 h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const booking = realBookings.find((p) => p.booked_showing_id);
                                            if (booking?.booked_showing_id) onShowingClick(booking.booked_showing_id);
                                          }}
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          View / Cancel Showing
                                        </Button>
                                      )}
                                      {/* Blocked slots (other properties at same time) */}
                                      {blockedSlots.length > 0 && (
                                        <div>
                                          <p className="text-[10px] text-muted-foreground">
                                            {blockedSlots.length} other {blockedSlots.length === 1 ? "property" : "properties"} blocked at this time
                                          </p>
                                        </div>
                                      )}
                                      {/* Available properties */}
                                      {!ts.isBlocked && ts.properties.filter((p) => p.is_enabled && !p.is_booked).length > 0 && (
                                        <div>
                                          <p className="text-[10px] text-muted-foreground mb-1">
                                            {ts.properties.filter((p) => p.is_enabled && !p.is_booked).length} properties available at this time
                                          </p>
                                        </div>
                                      )}
                                      {/* Block / unblock button */}
                                      {!past && realBookings.length === 0 && (
                                        ts.isBlocked ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full mt-1 h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                            disabled={blockingSlot === `${day.date}-${time}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleBlock(day.date, time, false);
                                            }}
                                          >
                                            {blockingSlot === `${day.date}-${time}` ? (
                                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                            ) : (
                                              <Check className="h-3 w-3 mr-1" />
                                            )}
                                            Unblock this time
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full mt-1 h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                            disabled={blockingSlot === `${day.date}-${time}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleBlock(day.date, time, true);
                                            }}
                                          >
                                            {blockingSlot === `${day.date}-${time}` ? (
                                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                            ) : (
                                              <Ban className="h-3 w-3 mr-1" />
                                            )}
                                            Block this time
                                          </Button>
                                        )
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            })()}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
          Open
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-100 border border-blue-200" />
          Booked
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-300">—</span>
          No slot
        </div>
        <div className="ml-auto text-[10px]">
          Click any cell for details
        </div>
      </div>

      {/* ── Dialog ───────────────────────────────────────────────────── */}
      {orgId && (
        <EnableSlotsDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditData(null);
              setPrefilledDate(undefined);
            }
          }}
          onSuccess={fetchSlots}
          orgId={orgId}
          editData={editData}
          prefilledDate={prefilledDate}
        />
      )}
    </div>
  );
};
