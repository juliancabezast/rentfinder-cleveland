import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  User,
  Home,
  Eye,
  EyeOff,
  Check,
  X,
} from "lucide-react";
import { format, addDays, parseISO, startOfDay, startOfWeek } from "date-fns";

// ── The single "listable" definition: a property whose slots may be shown /
// opened / booked. Changing a property OFF this set makes its slots vanish
// everywhere automatically (read-time gate, no cleanup needed). ────────────
const LISTABLE_STATUSES = ["available", "coming_soon"];

// Standard half-hour ladder the grid ALWAYS renders (even on an empty week),
// so every future cell is clickable — no "Enable Slots" bootstrap needed.
const LADDER_START_H = 9;
const LADDER_END_H = 18; // exclusive of the final :30 past this
function buildLadder(): string[] {
  const out: string[] = [];
  for (let h = LADDER_START_H; h <= LADDER_END_H; h++) {
    out.push(`${String(h).padStart(2, "0")}:00:00`);
    if (h < LADDER_END_H) out.push(`${String(h).padStart(2, "0")}:30:00`);
  }
  return out;
}
const LADDER = buildLadder();

// ── Types ────────────────────────────────────────────────────────────
interface SlotProperty {
  property_id: string;
  property_address: string;
  property_city: string;
  is_booked: boolean;
  is_enabled: boolean;
  lead_name: string | null;
  booked_showing_id: string | null;
  showing_status: string | null;
}

interface CancelledShowing {
  id: string;
  lead_name: string;
  property_address: string;
  status: string;
  lead_id: string;
}

interface BookingInfo {
  showingId: string | null;
  leadName: string;
  address: string;
  status: string | null;
}

interface TimeSlotGroup {
  time: string;
  properties: SlotProperty[]; // listable, unbooked, enabled — the "open" pool
  bookings: BookingInfo[];    // real bookings at this time (lead + property)
  bookedCount: number;
  cancelledShowings: CancelledShowing[];
}

interface DayData {
  date: string;
  timeSlots: Map<string, TimeSlotGroup>; // time -> group
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

// Minutes-since-midnight for a "HH:MM[:SS]" time
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// First name only (cells are tiny; full name lives in the popover)
function firstName(name: string) {
  return (name || "").trim().split(/\s+/)[0] || name;
}

// City open/close popover (checkbox list). Extracted to keep hooks stable.
const CityPicker: React.FC<{
  cities: string[];
  counts: Map<string, number>;
  busy: boolean;
  defaultAll?: boolean;
  initialSelected?: string[];
  actionLabel: string;
  onConfirm: (cities: string[]) => void;
}> = ({ cities, counts, busy, defaultAll, initialSelected, actionLabel, onConfirm }) => {
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(initialSelected ?? (defaultAll ? cities : [])),
  );
  const allChecked = selected.size === cities.length && cities.length > 0;
  return (
    <div className="space-y-1.5">
      {cities.length > 1 && (
        <label className="flex items-center gap-2 text-xs cursor-pointer font-medium pb-1 border-b">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setSelected(e.target.checked ? new Set(cities) : new Set())}
            className="rounded border-slate-300"
          />
          All cities
        </label>
      )}
      {cities.map((city) => (
        <label key={city} className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(city)}
            onChange={(e) => {
              const next = new Set(selected);
              e.target.checked ? next.add(city) : next.delete(city);
              setSelected(next);
            }}
            className="rounded border-slate-300"
          />
          {city} <span className="text-muted-foreground">({counts.get(city) || 0})</span>
        </label>
      ))}
      <Button
        size="sm"
        className="w-full h-7 text-xs bg-[#4F46E5] hover:bg-[#4F46E5]/90 mt-1"
        disabled={selected.size === 0 || busy}
        onClick={() => onConfirm([...selected])}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
        {actionLabel}
      </Button>
    </div>
  );
};

interface ManageSlotsTabProps {
  onTotalsChange?: (totals: { available: number; booked: number }) => void;
  onShowingClick?: (showingId: string) => void;
}

// ── Component ────────────────────────────────────────────────────────
export const ManageSlotsTab: React.FC<ManageSlotsTabProps> = ({
  onTotalsChange,
  onShowingClick,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [weekOffset, setWeekOffset] = useState(0);
  const [slotData, setSlotData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hideEmptyDays, setHideEmptyDays] = useState(false);
  const [missingReportDates, setMissingReportDates] = useState<string[]>([]);

  // Drag-to-select range state (logic lives after allTimes/visibleDays exist)
  const [drag, setDrag] = useState<{ a: { d: number; t: number }; b: { d: number; t: number } } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const [rangeSel, setRangeSel] = useState<{ dates: string[]; times: string[] } | null>(null);

  // A ticking "now" so the red line moves without a full refetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const orgId = userRecord?.organization_id;

  // Today's date string in Cleveland tz (for now-line + past checks)
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const nowMinutes = (() => {
    const parts = now.toLocaleString("en-GB", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
    }).split(":").map(Number);
    return parts[0] * 60 + parts[1];
  })();

  // ── Missing report dates (unchanged behaviour) ──────────────────────
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("showings")
        .select("scheduled_at, status, agent_report")
        .eq("organization_id", orgId)
        .lt("scheduled_at", nowIso)
        .in("status", ["scheduled", "confirmed", "completed", "no_show"])
        .is("agent_report", null)
        .order("scheduled_at", { ascending: true });
      if (data && data.length > 0) {
        const dates = new Set<string>();
        for (const s of data) {
          dates.add(new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
        }
        setMissingReportDates([...dates].sort());
      } else {
        setMissingReportDates([]);
      }
    })();
  }, [orgId, weekOffset]);

  const jumpToDate = (dateStr: string) => {
    const targetMon = startOfWeek(parseISO(dateStr), { weekStartsOn: 1 });
    const todayMon = startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 });
    const diffDays = Math.round((targetMon.getTime() - todayMon.getTime()) / (1000 * 60 * 60 * 24));
    setWeekOffset(Math.round(diffDays / 7));
  };

  // ── Listable properties grouped by city (the "open a city" pool) ────
  const [citiesWithProps, setCitiesWithProps] = useState<Map<string, string[]>>(new Map());
  const cityNames = useMemo(() => [...citiesWithProps.keys()].sort(), [citiesWithProps]);
  const cityCounts = useMemo(
    () => new Map([...citiesWithProps.entries()].map(([c, ids]) => [c, ids.length])),
    [citiesWithProps],
  );
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, city, status")
        .eq("organization_id", orgId)
        .in("status", LISTABLE_STATUSES);
      const map = new Map<string, string[]>();
      for (const p of (data || []) as { id: string; city: string | null }[]) {
        const city = p.city || "Other";
        if (!map.has(city)) map.set(city, []);
        map.get(city)!.push(p.id);
      }
      setCitiesWithProps(map);
    })();
  }, [orgId]);

  // ── Week dates (weeks start on MONDAY) ──────────────────────────────
  const weekDates = useMemo(() => {
    const monday = addDays(startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  // ── Fetch slots for the visible week (status-gated) ─────────────────
  const fetchSlots = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const startStr = format(weekDates[0], "yyyy-MM-dd");
    const endStr = format(weekDates[6], "yyyy-MM-dd");

    // Slots + property status. Enabled/unbooked slots are only "open" when the
    // property is still listable; booked slots always render (history).
    // PAGINATED: a full-city "Open all day" writes 56×19 ≈ 1,064 rows for ONE
    // day, so a multi-day week easily exceeds PostgREST's 1000-row cap. Without
    // this loop, later days silently drop → cells mispaint and a dropped booked
    // cell would offer the Open action (double-booking). Page until short.
    const PAGE = 1000;
    const data: any[] = [];
    for (let from = 0; from < 20000; from += PAGE) {
      const { data: page, error } = await supabase
        .from("showing_available_slots")
        .select(`
          id, slot_date, slot_time, is_booked, is_enabled, property_id,
          properties(address, city, status),
          booked_showing_id
        `)
        .eq("organization_id", orgId)
        .gte("slot_date", startStr)
        .lte("slot_date", endStr)
        .order("slot_date")
        .order("slot_time")
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("Error fetching slots:", error);
        toast({ title: "Error", description: "Failed to load slots.", variant: "destructive" });
        setLoading(false);
        return;
      }
      data.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }

    const bookedShowingIds = [...new Set(
      (data || []).filter((s: any) => s.booked_showing_id).map((s: any) => s.booked_showing_id),
    )];

    const showingInfoMap = new Map<string, { leadName: string; propertyId: string; status: string }>();
    if (bookedShowingIds.length > 0) {
      const { data: showingsData } = await supabase
        .from("showings")
        .select("id, status, property_id, leads(full_name)")
        .in("id", bookedShowingIds);
      (showingsData || []).forEach((s: any) => {
        showingInfoMap.set(s.id, {
          leadName: s.leads?.full_name || "Booked",
          propertyId: s.property_id || "",
          status: s.status || "scheduled",
        });
      });
    }

    // Cleveland-aware window for showing timestamps (evening rows on the edge day)
    const orgTz = "America/New_York";
    const clevelandBoundaryUTC = (dateStr: string, endOfDay: boolean) => {
      const asUTC = new Date(`${dateStr}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
      const offset =
        new Date(asUTC.toLocaleString("en-US", { timeZone: orgTz })).getTime() -
        new Date(asUTC.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
      return new Date(asUTC.getTime() - offset).toISOString();
    };
    const startInstant = clevelandBoundaryUTC(startStr, false);
    const endInstant = clevelandBoundaryUTC(endStr, true);

    const { data: cancelledData } = await supabase
      .from("showings")
      .select("id, scheduled_at, status, lead_id, property_id, leads(full_name), properties(address)")
      .eq("organization_id", orgId)
      .in("status", ["cancelled", "no_show", "rescheduled"])
      .gte("scheduled_at", startInstant)
      .lte("scheduled_at", endInstant);

    const cancelledMap = new Map<string, Map<string, CancelledShowing[]>>();
    (cancelledData || []).forEach((s: any) => {
      const d = new Date(s.scheduled_at);
      const dateKey = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const h = d.toLocaleString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
      const timeKey = h + ":00";
      if (!cancelledMap.has(dateKey)) cancelledMap.set(dateKey, new Map());
      const tm = cancelledMap.get(dateKey)!;
      if (!tm.has(timeKey)) tm.set(timeKey, []);
      tm.get(timeKey)!.push({
        id: s.id,
        lead_name: s.leads?.full_name || "Unknown",
        property_address: s.properties?.address || "Unknown",
        status: s.status,
        lead_id: s.lead_id,
      });
    });

    // Group by date -> time
    const dayMap = new Map<string, Map<string, SlotProperty[]>>();
    (data || []).forEach((s: any) => {
      const dateKey = s.slot_date;
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, new Map());
      const timeMap = dayMap.get(dateKey)!;
      if (!timeMap.has(s.slot_time)) timeMap.set(s.slot_time, []);
      const info = s.booked_showing_id ? showingInfoMap.get(s.booked_showing_id) : null;
      const isRealBooking = info && info.propertyId === s.property_id;
      const status = (s.properties as any)?.status || "";
      timeMap.get(s.slot_time)!.push({
        property_id: s.property_id,
        property_address: (s.properties as any)?.address || "Unknown",
        property_city: (s.properties as any)?.city || "",
        is_booked: s.is_booked,
        // status gate: an enabled slot on a de-listed property is NOT open
        is_enabled: s.is_enabled && LISTABLE_STATUSES.includes(status),
        lead_name: isRealBooking ? info!.leadName : null,
        booked_showing_id: isRealBooking ? s.booked_showing_id : null,
        showing_status: isRealBooking ? info!.status : null,
      });
    });

    const days: DayData[] = weekDates.map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const timeMap = dayMap.get(dateStr);
      const dayCancelled = cancelledMap.get(dateStr);
      const timeSlots = new Map<string, TimeSlotGroup>();
      if (timeMap) {
        timeMap.forEach((props, time) => {
          const openPool = props.filter((p) => p.is_enabled && !p.is_booked);
          const bookings: BookingInfo[] = props
            .filter((p) => p.is_booked && p.lead_name)
            .map((p) => ({
              showingId: p.booked_showing_id,
              leadName: p.lead_name!,
              address: p.property_address,
              status: p.showing_status,
            }));
          timeSlots.set(time, {
            time,
            properties: openPool,
            bookings,
            bookedCount: bookings.length,
            cancelledShowings: dayCancelled?.get(time) || [],
          });
        });
      }
      // Fold cancelled-only times (no slot row) so they still surface
      dayCancelled?.forEach((cs, time) => {
        if (!timeSlots.has(time)) {
          timeSlots.set(time, { time, properties: [], bookings: [], bookedCount: 0, cancelledShowings: cs });
        }
      });
      return { date: dateStr, timeSlots };
    });

    setSlotData(days);
    setLoading(false);
  }, [orgId, weekDates]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // ── Totals ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let available = 0, booked = 0;
    slotData.forEach((day) => {
      day.timeSlots.forEach((ts) => {
        if (ts.bookedCount > 0) booked += 1;
        else if (ts.properties.length > 0) available += 1;
      });
    });
    return { available, booked };
  }, [slotData]);
  useEffect(() => { onTotalsChange?.(totals); }, [totals.available, totals.booked]);

  // A booking is agent-time-scoped: one showing blocks that time across ALL
  // homes. So a time is "taken" if ANY booked row exists for that date+time —
  // re-opening it would insert fresh bookable rows on the other homes and let
  // a second renter double-book the agent (review CRITICAL).
  const timeHasBooking = async (date: string, time: string): Promise<boolean> => {
    if (!orgId) return false;
    const { count } = await supabase
      .from("showing_available_slots")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("slot_date", date).eq("slot_time", time).eq("is_booked", true);
    return (count || 0) > 0;
  };

  // ── OPEN a slot (date+time) for the chosen cities ───────────────────
  const openSlot = async (date: string, time: string, cities: string[]) => {
    if (!orgId || cities.length === 0) return;
    const key = `${date}-${time}`;
    setBusyKey(key);
    if (await timeHasBooking(date, time)) {
      toast({ title: "Already booked", description: `${formatTime(time)} · ${format(parseISO(date), "MMM d")} has a booking — can't reopen it.`, variant: "destructive" });
      await fetchSlots();
      setBusyKey(null);
      return;
    }
    const propIds = cities.flatMap((c) => citiesWithProps.get(c) || []);
    const rows = propIds.map((property_id) => ({
      organization_id: orgId,
      property_id,
      slot_date: date,
      slot_time: time,
      is_enabled: true,
    }));
    const { error } = await supabase
      .from("showing_available_slots")
      .upsert(rows, { onConflict: "organization_id,property_id,slot_date,slot_time" });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Opened", description: `${formatTime(time)} · ${format(parseISO(date), "MMM d")} — ${propIds.length} homes.` });
      await fetchSlots();
    }
    setBusyKey(null);
  };

  // ── CLOSE a slot (date+time), all unbooked rows ─────────────────────
  const closeSlot = async (date: string, time: string) => {
    if (!orgId) return;
    const key = `${date}-${time}`;
    setBusyKey(key);
    const { error } = await supabase
      .from("showing_available_slots")
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("slot_date", date)
      .eq("slot_time", time)
      .eq("is_booked", false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Closed", description: `${formatTime(time)} · ${format(parseISO(date), "MMM d")} closed.` });
      await fetchSlots();
    }
    setBusyKey(null);
  };

  // ── SET the exact set of open cities for a time (per-city on/off) ────
  // Used by the open-cell popover so a checkbox tells the TRUTH: checked =
  // that city is open here. Applying opens the newly-checked cities and
  // closes the newly-unchecked ones — the per-city control the old "add"
  // picker hid (a de-checked already-open city read as "off" but stayed on).
  const setSlotCities = async (date: string, time: string, targetCities: string[]) => {
    if (!orgId) return;
    const key = `${date}-${time}`;
    setBusyKey(key);
    if (await timeHasBooking(date, time)) {
      toast({ title: "Already booked", description: `${formatTime(time)} · ${format(parseISO(date), "MMM d")} has a booking — can't change it.`, variant: "destructive" });
      await fetchSlots(); setBusyKey(null); return;
    }
    const target = new Set(targetCities);
    const enableIds: string[] = [];
    const disableIds: string[] = [];
    for (const c of cityNames) {
      const ids = citiesWithProps.get(c) || [];
      (target.has(c) ? enableIds : disableIds).push(...ids);
    }
    // Open the checked cities (upsert), close the unchecked ones (unbooked).
    if (enableIds.length) {
      const rows = enableIds.map((property_id) => ({
        organization_id: orgId, property_id, slot_date: date, slot_time: time, is_enabled: true,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from("showing_available_slots")
          .upsert(rows.slice(i, i + 200), { onConflict: "organization_id,property_id,slot_date,slot_time" });
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
      }
    }
    if (disableIds.length) {
      const { error } = await supabase
        .from("showing_available_slots")
        .update({ is_enabled: false, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId).eq("slot_date", date).eq("slot_time", time)
        .eq("is_booked", false).in("property_id", disableIds);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
    }
    toast({ title: "Updated", description: `${formatTime(time)} · ${format(parseISO(date), "MMM d")} — ${target.size} ${target.size === 1 ? "city" : "cities"} open.` });
    await fetchSlots();
    setBusyKey(null);
  };

  // ── Bulk: open a whole DAY (all ladder times) for cities ────────────
  const openDay = async (date: string, cities: string[]) => {
    if (!orgId || cities.length === 0) return;
    const key = `day-${date}`;
    setBusyKey(key);
    // Exclude times that already have a booking (would double-book, review
    // CRITICAL) and times already in the past for today.
    const { data: bookedRows } = await supabase
      .from("showing_available_slots")
      .select("slot_time")
      .eq("organization_id", orgId).eq("slot_date", date).eq("is_booked", true);
    const bookedTimes = new Set((bookedRows || []).map((r: any) => r.slot_time));
    const times = LADDER.filter(
      (t) => !bookedTimes.has(t) && !(date === todayStr && timeToMinutes(t) + 30 <= nowMinutes),
    );
    if (times.length === 0) {
      toast({ title: "Nothing to open", description: "All times this day are already booked or past." });
      setBusyKey(null);
      return;
    }
    const propIds = cities.flatMap((c) => citiesWithProps.get(c) || []);
    const rows = propIds.flatMap((property_id) =>
      times.map((slot_time) => ({
        organization_id: orgId, property_id, slot_date: date, slot_time, is_enabled: true,
      })),
    );
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from("showing_available_slots")
        .upsert(rows.slice(i, i + 200), { onConflict: "organization_id,property_id,slot_date,slot_time" });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
    }
    const skipped = LADDER.length - times.length;
    toast({
      title: "Day opened",
      description: `${format(parseISO(date), "EEE MMM d")} — ${times.length} times × ${propIds.length} homes.${skipped > 0 ? ` (${skipped} already-booked/past time${skipped === 1 ? "" : "s"} left untouched.)` : ""}`,
    });
    await fetchSlots();
    setBusyKey(null);
  };

  // ── Bulk: close a whole DAY (all unbooked) ──────────────────────────
  const closeDay = async (date: string) => {
    if (!orgId) return;
    const key = `day-${date}`;
    setBusyKey(key);
    const { error } = await supabase
      .from("showing_available_slots")
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("slot_date", date)
      .eq("is_booked", false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Day closed", description: `${format(parseISO(date), "EEE MMM d")} closed.` }); await fetchSlots(); }
    setBusyKey(null);
  };

  // ── Grid rows: the fixed ladder ∪ any existing off-ladder times ─────
  const allTimes = useMemo(() => {
    const set = new Set<string>(LADDER);
    slotData.forEach((day) => day.timeSlots.forEach((_, t) => set.add(t)));
    return [...set].sort();
  }, [slotData]);

  // Which days to render
  const dayHasContent = (d: DayData) =>
    [...d.timeSlots.values()].some((ts) => ts.properties.length > 0 || ts.bookedCount > 0 || ts.cancelledShowings.length > 0);
  const visibleDays = useMemo(() => {
    if (!hideEmptyDays) return slotData;
    return slotData.filter(dayHasContent);
  }, [slotData, hideEmptyDays]);

  const isPast = (dateStr: string) => dateStr < todayStr;
  const isPastCell = (dateStr: string, time: string) =>
    dateStr < todayStr || (dateStr === todayStr && timeToMinutes(time) + 30 <= nowMinutes);

  // ── Now-line: measured from the real DOM (row heights vary, off-ladder
  // times create gaps — arithmetic on a fixed header/row height mispaints).
  const gridRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [nowTop, setNowTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (loading || !visibleDays.some((d) => d.date === todayStr) || allTimes.length === 0) {
      setNowTop(null);
      return;
    }
    const grid = gridRef.current;
    if (!grid) { setNowTop(null); return; }
    const gridTop = grid.getBoundingClientRect().top - grid.scrollTop;
    let top: number | null = null;
    for (let i = 0; i < allTimes.length; i++) {
      const tMin = timeToMinutes(allTimes[i]);
      const nextMin = i + 1 < allTimes.length ? timeToMinutes(allTimes[i + 1]) : tMin + 30;
      if (nowMinutes >= tMin && nowMinutes < nextMin) {
        const rowEl = rowRefs.current.get(allTimes[i]);
        if (rowEl) {
          const rect = rowEl.getBoundingClientRect();
          const frac = (nowMinutes - tMin) / (nextMin - tMin);
          top = rect.top - gridTop + rect.height * frac;
        }
        break;
      }
    }
    setNowTop(top);
  }, [now, nowMinutes, loading, visibleDays, allTimes, todayStr, slotData]);

  // ── Drag-to-select a rectangular range of cells, then open in one shot ──
  // Press on a future cell, drag to another, release → a dialog asks which
  // cities to open across the whole day×time rectangle (booked/past excluded).
  const beginDrag = (d: number, t: number) => {
    draggingRef.current = true;
    movedRef.current = false;
    setDrag({ a: { d, t }, b: { d, t } });
  };
  const extendDrag = (d: number, t: number) => {
    if (!draggingRef.current) return;
    setDrag((prev) => {
      if (!prev || (prev.b.d === d && prev.b.t === t)) return prev;
      movedRef.current = true;
      return { ...prev, b: { d, t } };
    });
  };
  const inDrag = (d: number, t: number) => {
    if (!drag) return false;
    const dMin = Math.min(drag.a.d, drag.b.d), dMax = Math.max(drag.a.d, drag.b.d);
    const tMin = Math.min(drag.a.t, drag.b.t), tMax = Math.max(drag.a.t, drag.b.t);
    return d >= dMin && d <= dMax && t >= tMin && t <= tMax;
  };
  // Global pointerup ends the drag; a real drag (moved) opens the range dialog.
  useEffect(() => {
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDrag((cur) => {
        if (cur && movedRef.current) {
          const dMin = Math.min(cur.a.d, cur.b.d), dMax = Math.max(cur.a.d, cur.b.d);
          const tMin = Math.min(cur.a.t, cur.b.t), tMax = Math.max(cur.a.t, cur.b.t);
          setRangeSel({
            dates: visibleDays.slice(dMin, dMax + 1).map((x) => x.date),
            times: allTimes.slice(tMin, tMax + 1),
          });
        }
        return null; // clear highlight
      });
      // keep movedRef true through the trailing click (so the cell popover is
      // swallowed), then reset on the next tick
      setTimeout(() => { movedRef.current = false; }, 0);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [visibleDays, allTimes]);

  // ── Open a rectangular RANGE (dates × times) for the chosen cities ──
  const openRange = async (dates: string[], times: string[], cities: string[]) => {
    if (!orgId || cities.length === 0 || dates.length === 0 || times.length === 0) return;
    setBusyKey("range");
    const propIds = cities.flatMap((c) => citiesWithProps.get(c) || []);
    // Booked (date,time) pairs across the range — never re-open those.
    const { data: bookedRows } = await supabase
      .from("showing_available_slots")
      .select("slot_date, slot_time")
      .eq("organization_id", orgId)
      .in("slot_date", dates)
      .eq("is_booked", true);
    const bookedSet = new Set((bookedRows || []).map((r: any) => `${r.slot_date}|${r.slot_time}`));

    const rows: any[] = [];
    let skipped = 0;
    for (const date of dates) {
      for (const time of times) {
        const isPastPair = date < todayStr || (date === todayStr && timeToMinutes(time) + 30 <= nowMinutes);
        if (isPastPair || bookedSet.has(`${date}|${time}`)) { skipped++; continue; }
        for (const property_id of propIds) {
          rows.push({ organization_id: orgId, property_id, slot_date: date, slot_time: time, is_enabled: true });
        }
      }
    }
    if (rows.length === 0) {
      toast({ title: "Nothing to open", description: "Every cell in that range is booked or in the past." });
      setBusyKey(null); setRangeSel(null); return;
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from("showing_available_slots")
        .upsert(rows.slice(i, i + 200), { onConflict: "organization_id,property_id,slot_date,slot_time" });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
    }
    const cellCount = dates.length * times.length - skipped;
    toast({ title: "Range opened", description: `${cellCount} time slots × ${propIds.length} homes.${skipped > 0 ? ` (${skipped} already-booked/past time${skipped === 1 ? "" : "s"} left untouched.)` : ""}` });
    await fetchSlots();
    setBusyKey(null);
    setRangeSel(null);
  };

  return (
    <div className="space-y-3">
      {/* Missing report alerts */}
      {missingReportDates.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-red-600 shrink-0">Missing reports:</span>
          {missingReportDates.map((dateStr) => (
            <button
              key={dateStr}
              onClick={() => jumpToDate(dateStr)}
              className="text-xs px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
            >
              {format(parseISO(dateStr), "MMM d")}
            </button>
          ))}
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center justify-center gap-2 flex-1">
          <span className="text-sm font-semibold">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[11px] px-2 py-0.5 rounded-md text-[#4F46E5] bg-[#4F46E5]/10 hover:bg-[#4F46E5]/20 transition-colors"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setHideEmptyDays((v) => !v)}
            title={hideEmptyDays ? "Show all days" : "Hide empty days"}
            className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${hideEmptyDays ? "text-[#4F46E5] bg-[#4F46E5]/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {hideEmptyDays ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekly grid */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : cityNames.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No listable properties</p>
            <p className="text-sm text-muted-foreground mt-1">
              Set a property to <b>Available</b> or <b>Coming soon</b> to open showing times for it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative overflow-x-auto" ref={gridRef}>
              <table className="w-full min-w-[640px] text-xs border-separate border-spacing-0 select-none">
                {/* Column headers (days) — click to open/close a whole day */}
                <thead>
                  <tr>
                    <th className="w-16 p-2 text-left text-muted-foreground font-medium sticky left-0 bg-white z-20">
                      Time
                    </th>
                    {visibleDays.map((day) => {
                      const dateObj = parseISO(day.date);
                      const isToday = todayStr === day.date;
                      const past = isPast(day.date);
                      const dayBusy = busyKey === `day-${day.date}`;
                      return (
                        <th
                          key={day.date}
                          className={`p-1.5 text-center font-medium min-w-[92px] ${isToday ? "bg-[#4F46E5]/5" : ""} ${past ? "opacity-40" : ""}`}
                        >
                          <div className="text-[10px] text-muted-foreground uppercase">{format(dateObj, "EEE")}</div>
                          <div className={`text-sm font-bold ${isToday ? "text-[#4F46E5]" : ""}`}>{format(dateObj, "d")}</div>
                          <div className="text-[10px] text-muted-foreground">{format(dateObj, "MMM")}</div>
                          {!past && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="mt-1 w-full rounded-md border border-dashed border-slate-200 py-0.5 text-[10px] text-slate-400 hover:border-[#4F46E5]/40 hover:text-[#4F46E5] hover:bg-[#4F46E5]/5 transition-colors">
                                  {dayBusy ? <Loader2 className="h-3 w-3 mx-auto animate-spin" /> : "Open / close day"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-3" side="bottom" align="center">
                                <p className="text-xs font-semibold mb-2">{format(dateObj, "EEE, MMM d")}</p>
                                <CityPicker
                                  cities={cityNames}
                                  counts={cityCounts}
                                  busy={dayBusy}
                                  defaultAll
                                  actionLabel="Open all day"
                                  onConfirm={(cities) => openDay(day.date, cities)}
                                />
                                {dayHasContent(day) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-7 text-xs mt-2 text-red-600 border-red-200 hover:bg-red-50"
                                    disabled={dayBusy}
                                    onClick={() => closeDay(day.date)}
                                  >
                                    <X className="h-3 w-3 mr-1" /> Close whole day
                                  </Button>
                                )}
                              </PopoverContent>
                            </Popover>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Time rows */}
                <tbody className="relative">
                  {allTimes.map((time, tIdx) => (
                    <tr
                      key={time}
                      ref={(el) => {
                        if (el) rowRefs.current.set(time, el);
                        else rowRefs.current.delete(time);
                      }}
                    >
                      <td className="p-2 font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-white z-20">
                        {formatTime(time)}
                      </td>
                      {visibleDays.map((day, dIdx) => {
                        const ts = day.timeSlots.get(time);
                        const isToday = todayStr === day.date;
                        const past = isPastCell(day.date, time);
                        const cellBusy = busyKey === `${day.date}-${time}`;

                        return (
                          <td
                            key={day.date}
                            onPointerEnter={() => extendDrag(dIdx, tIdx)}
                            className={`p-1 text-center align-middle ${isToday ? "bg-[#4F46E5]/5" : ""} ${past ? "opacity-40" : ""} ${inDrag(dIdx, tIdx) ? "bg-[#4F46E5]/15" : ""}`}
                          >
                            <SlotCell
                              day={day}
                              time={time}
                              ts={ts}
                              past={past}
                              cellBusy={cellBusy}
                              cityNames={cityNames}
                              cityCounts={cityCounts}
                              dayIdx={dIdx}
                              timeIdx={tIdx}
                              highlighted={inDrag(dIdx, tIdx)}
                              movedRef={movedRef}
                              onDragBegin={beginDrag}
                              onOpen={(cities) => openSlot(day.date, time, cities)}
                              onSetCities={(cities) => setSlotCities(day.date, time, cities)}
                              onClose={() => closeSlot(day.date, time)}
                              onShowingClick={onShowingClick}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* NOW-LINE — a red rule at the current time (measured position) */}
              {nowTop != null && <NowLine top={nowTop} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Open</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-200" /> Booked</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Completed</div>
        <div className="flex items-center gap-1.5"><span className="inline-block w-3 border-t-2 border-red-500" /> Now</div>
        <div className="ml-auto text-[10px]">Click a cell — or drag across a range — to open</div>
      </div>

      {/* Drag-selected RANGE → open dialog */}
      <Dialog open={!!rangeSel} onOpenChange={(o) => { if (!o) setRangeSel(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Open a range of times</DialogTitle>
            <DialogDescription>
              {rangeSel && (() => {
                const d0 = rangeSel.dates[0], d1 = rangeSel.dates[rangeSel.dates.length - 1];
                const t0 = rangeSel.times[0], t1 = rangeSel.times[rangeSel.times.length - 1];
                const dayLabel = d0 === d1
                  ? format(parseISO(d0), "EEE, MMM d")
                  : `${format(parseISO(d0), "EEE MMM d")} – ${format(parseISO(d1), "EEE MMM d")}`;
                const timeLabel = t0 === t1 ? formatTime(t0) : `${formatTime(t0)} – ${formatTime(t1)}`;
                return <>{dayLabel} · {timeLabel} — {rangeSel.dates.length * rangeSel.times.length} time slots</>;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-1">
            <p className="text-[11px] text-muted-foreground font-medium mb-2">Open these times for…</p>
            {rangeSel && (
              <CityPicker
                cities={cityNames}
                counts={cityCounts}
                busy={busyKey === "range"}
                defaultAll
                actionLabel="Open range"
                onConfirm={(cities) => openRange(rangeSel.dates, rangeSel.times, cities)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Now-line overlay (absolute px position measured from the DOM) ──────
const NowLine: React.FC<{ top: number }> = ({ top }) => (
  <div aria-hidden className="pointer-events-none absolute left-0 right-0 z-10" style={{ top }}>
    <div className="relative">
      <div className="absolute left-14 right-0 border-t-2 border-red-500/70" />
      <div className="absolute left-12 -top-[5px] h-2.5 w-2.5 rounded-full bg-red-500 shadow" />
    </div>
  </div>
);

// ── A single calendar cell: open / booked / cancelled / closed / add ──
const SlotCell: React.FC<{
  day: DayData;
  time: string;
  ts: TimeSlotGroup | undefined;
  past: boolean;
  cellBusy: boolean;
  cityNames: string[];
  cityCounts: Map<string, number>;
  dayIdx: number;
  timeIdx: number;
  highlighted: boolean;
  movedRef: React.MutableRefObject<boolean>;
  onDragBegin: (d: number, t: number) => void;
  onOpen: (cities: string[]) => void;
  onSetCities: (cities: string[]) => void;
  onClose: () => void;
  onShowingClick?: (id: string) => void;
}> = ({ day, time, ts, past, cellBusy, cityNames, cityCounts, dayIdx, timeIdx, highlighted, movedRef, onDragBegin, onOpen, onSetCities, onClose, onShowingClick }) => {
  const openCount = ts?.properties.length || 0;
  const bookedCount = ts?.bookedCount || 0;
  const cancelled = ts?.cancelledShowings || [];
  const hasCancelled = cancelled.length > 0;

  // Booked cell: we need the lead name — pull from the day's raw group. The
  // open `properties` array excludes booked rows, so re-scan is unnecessary;
  // booked info is surfaced through a separate lookup on click. For the label
  // we show a compact "Booked" state (name shown in the popover).
  const isBooked = bookedCount > 0;
  const isOpen = openCount > 0;

  const bookings = ts?.bookings || [];

  // Past cells are read-only
  if (past) {
    if (isBooked) return (
      <div className="rounded-md border bg-green-50 border-green-200 text-green-700 px-2 py-1 text-[10px]">
        <div className="font-bold truncate">{firstName(bookings[0]?.leadName || "Done")}</div>
        {bookings[0]?.address && <div className="opacity-70 truncate">{bookings[0].address}</div>}
      </div>
    );
    if (hasCancelled) return <div className="rounded-md border bg-orange-50 border-orange-200 text-orange-500 px-2 py-1.5 text-[10px] line-through">{firstName(cancelled[0].lead_name)}</div>;
    return <span className="text-slate-300">—</span>;
  }

  // Cell style
  let cellStyle = "bg-slate-50/60 text-slate-300 border-dashed border-slate-200 hover:border-[#4F46E5]/40 hover:text-[#4F46E5] hover:bg-[#4F46E5]/5";
  if (isBooked) cellStyle = "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100";
  else if (hasCancelled) cellStyle = "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100";
  else if (isOpen) cellStyle = "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${cellStyle} ${highlighted ? "ring-2 ring-[#4F46E5] ring-offset-1" : ""}`}
          // Mouse drag to select a range (only when startable: future, not booked)
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button === 0 && !isBooked) onDragBegin(dayIdx, timeIdx);
          }}
          // Swallow the click that ends a drag so this cell's popover doesn't open
          onClick={(e) => {
            if (movedRef.current) { e.preventDefault(); e.stopPropagation(); }
          }}
        >
          {cellBusy ? (
            <Loader2 className="h-3 w-3 mx-auto animate-spin" />
          ) : isBooked ? (
            <>
              <div className="font-bold truncate">{firstName(bookings[0]?.leadName || "Booked")}</div>
              <div className="text-[10px] opacity-70 truncate">
                {bookedCount > 1 ? `+${bookedCount - 1} more · ${bookings[0]?.address || ""}` : (bookings[0]?.address || "Booked")}
              </div>
            </>
          ) : hasCancelled ? (
            <div className="font-bold truncate line-through">{firstName(cancelled[0].lead_name)}</div>
          ) : isOpen ? (
            <>
              <div className="font-bold">Open</div>
              {(() => {
                const cities = [...new Set(ts!.properties.map((p) => p.property_city).filter(Boolean))];
                return cities.length > 0 ? <div className="text-[10px] opacity-70 truncate">{cities.join(", ")}</div> : null;
              })()}
            </>
          ) : (
            <Plus className="h-3 w-3 mx-auto" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="bottom" align="center">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{formatTime(time)} · {format(parseISO(day.date), "MMM d")}</span>
            <Badge variant="outline" className={`text-[10px] ${isBooked ? "border-blue-200 text-blue-700" : isOpen ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
              {isBooked ? `${bookedCount} booked` : isOpen ? "Open" : "Closed"}
            </Badge>
          </div>

          {/* Booked showings — view/cancel (lead + property from the grid) */}
          {isBooked && (
            <div className="space-y-1.5">
              {bookings.map((b, i) => (
                <button
                  key={b.showingId || i}
                  onClick={() => b.showingId && onShowingClick?.(b.showingId)}
                  disabled={!b.showingId || !onShowingClick}
                  className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors text-left disabled:cursor-default"
                >
                  <Home className="h-3 w-3 shrink-0 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.address || "Booked"}</div>
                  </div>
                  <span className="flex items-center gap-1 text-blue-700 shrink-0">
                    <User className="h-3 w-3" />
                    <span className="text-[10px] font-medium truncate max-w-[90px]">{b.leadName}</span>
                    {b.showingId && onShowingClick && <Eye className="h-3 w-3" />}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Cancelled / no-show / rescheduled */}
          {hasCancelled && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground font-medium">
                {cancelled.length === 1 ? "Cancelled / missed" : `${cancelled.length} cancelled / missed`}
              </p>
              {cancelled.map((cs) => (
                <div key={cs.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs bg-orange-50 border border-orange-100">
                  <User className="h-3 w-3 shrink-0 text-orange-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate line-through">{cs.lead_name}</div>
                    <div className="text-[10px] text-orange-600">{cs.property_address}</div>
                  </div>
                  {onShowingClick && (
                    <button onClick={() => onShowingClick(cs.id)} className="text-orange-600 hover:text-orange-800"><Eye className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Open pool summary */}
          {isOpen && (
            <p className="text-[10px] text-muted-foreground">
              {openCount} {openCount === 1 ? "home" : "homes"} available at this time
            </p>
          )}

          {/* Controls: per-city on/off (checkbox tells the truth: checked =
              currently open) + close-all. */}
          {isOpen ? (
            <>
              <div className="pt-1 border-t">
                <p className="text-[10px] text-muted-foreground font-medium mb-1.5">
                  Cities open here — <span className="text-emerald-600">check = open</span>, uncheck to close
                </p>
                <CityPicker
                  cities={cityNames}
                  counts={cityCounts}
                  busy={cellBusy}
                  initialSelected={[...new Set(ts!.properties.map((p) => p.property_city).filter(Boolean))]}
                  actionLabel="Update"
                  onConfirm={onSetCities}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                disabled={cellBusy}
                onClick={onClose}
              >
                {cellBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                Close this time (all cities)
              </Button>
            </>
          ) : !isBooked ? (
            <div className="pt-1 border-t">
              <p className="text-[10px] text-muted-foreground font-medium mb-1.5">Open this time for…</p>
              <CityPicker
                cities={cityNames}
                counts={cityCounts}
                busy={cellBusy}
                defaultAll
                actionLabel="Open"
                onConfirm={onOpen}
              />
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
};

