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
  FileText,
} from "lucide-react";
import { format, addDays, parseISO, startOfDay, startOfWeek } from "date-fns";

// ── The single "bookable" definition: a property whose slots may be shown /
// opened / booked. Only 'available' — coming_soon is visible in the public
// catalog (home/detail) but NOT bookable. Changing a property OFF this set
// makes its slots vanish everywhere automatically (read-time gate, no cleanup). ─
const BOOKABLE_STATUSES = ["available"];

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

// A past showing whose outcome report was never filed — surfaced as a chip so
// the agent can file it in one click (they were previously inert dead-ends).
interface MissingReport {
  id: string;
  leadId: string;
  leadName: string;
  address: string;
  date: string; // Cleveland YYYY-MM-DD
  status: string;
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

// Human label for a cancelled/no-show/rescheduled showing
function cancelStatusLabel(status: string) {
  if (status === "rescheduled") return "Rescheduled";
  if (status === "no_show") return "No-show";
  return "Cancelled";
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
  // Open the report form for a specific showing (missing-report chips).
  onOpenReport?: (showingId: string, leadId: string, propertyAddress: string) => void;
  // Bumped by the parent when a report/detail action mutates showings, so the
  // grid + missing-report list refetch without a manual reload.
  reloadSignal?: number;
}

// ── Component ────────────────────────────────────────────────────────
export const ManageSlotsTab: React.FC<ManageSlotsTabProps> = ({
  onTotalsChange,
  onShowingClick,
  onOpenReport,
  reloadSignal = 0,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [weekOffset, setWeekOffset] = useState(0);
  const [slotData, setSlotData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hideEmptyDays, setHideEmptyDays] = useState(false);
  const [missingReports, setMissingReports] = useState<MissingReport[]>([]);

  // Drag-to-select range state (logic lives after allTimes/visibleDays exist)
  const [drag, setDrag] = useState<{ a: { d: number; t: number }; b: { d: number; t: number } } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  // openCities = cities already open somewhere in the range (pre-checked so the
  // dialog can CLOSE them too, not just add — set-state, like the single cell).
  const [rangeSel, setRangeSel] = useState<{ dates: string[]; times: string[]; openCities: string[] } | null>(null);

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

  // ── Missing reports: past showings with no report filed. Each is now
  // actionable (file the report in one click) instead of a bare date chip. ──
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const nowIso = new Date().toISOString();
      // 'no_show' is a RECORDED outcome (the report notes are optional), so a
      // no-show is not "missing a report" — only past showings still awaiting an
      // outcome (scheduled/confirmed) or auto-completed with no write-up
      // (completed + null report, e.g. DoorLoop) qualify. .limit caps the chip
      // list (mirrors the paginated slot query's 1000-row PostgREST guard).
      const { data } = await supabase
        .from("showings")
        .select("id, scheduled_at, status, lead_id, leads(full_name), properties(address)")
        .eq("organization_id", orgId)
        .lt("scheduled_at", nowIso)
        .in("status", ["scheduled", "confirmed", "completed"])
        .is("agent_report", null)
        .order("scheduled_at", { ascending: true })
        .limit(500);
      setMissingReports(
        (data || []).map((s: any) => ({
          id: s.id,
          leadId: s.lead_id,
          leadName: s.leads?.full_name || "Unknown lead",
          address: s.properties?.address || "Unknown property",
          date: new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
          status: s.status,
        })),
      );
    })();
  }, [orgId, weekOffset, reloadSignal]);

  // Group the missing reports by day for the chip row.
  const missingByDate = useMemo(() => {
    const m = new Map<string, MissingReport[]>();
    for (const r of missingReports) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [missingReports]);

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
        .in("status", BOOKABLE_STATUSES);
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

    // 'rescheduled' is intentionally excluded: a rescheduled showing stays in
    // the DB + Leasing Tracker but must NOT paint an orange cell on the agenda
    // (the time was freed for rebooking). Only true dead-ends surface here.
    const { data: cancelledData } = await supabase
      .from("showings")
      .select("id, scheduled_at, status, lead_id, property_id, leads(full_name), properties(address)")
      .eq("organization_id", orgId)
      .in("status", ["cancelled", "no_show"])
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
        is_enabled: s.is_enabled && BOOKABLE_STATUSES.includes(status),
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

  // External reload (report filed / showing rescheduled elsewhere) → refetch
  // the grid. Skips the initial mount (fetchSlots already runs above).
  const didMountReload = useRef(false);
  useEffect(() => {
    if (!didMountReload.current) { didMountReload.current = true; return; }
    fetchSlots();
  }, [reloadSignal]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // The line is confined to TODAY's column only (both a vertical position and
  // a horizontal span, both measured), never the full grid width.
  const gridRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const todayColRef = useRef<HTMLTableCellElement>(null);
  const [nowTop, setNowTop] = useState<number | null>(null);
  const [nowCol, setNowCol] = useState<{ left: number; width: number } | null>(null);
  // Re-measure whenever the grid's box changes — window resize AND
  // container-only changes (e.g. sidebar collapse) that fire no window resize.
  const [measureTick, setMeasureTick] = useState(0);
  useEffect(() => {
    const onResize = () => setMeasureTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    ro.observe(grid);
    return () => ro.disconnect();
  }, [loading]);
  useLayoutEffect(() => {
    if (loading || !visibleDays.some((d) => d.date === todayStr) || allTimes.length === 0) {
      setNowTop(null);
      setNowCol(null);
      return;
    }
    const grid = gridRef.current;
    if (!grid) { setNowTop(null); setNowCol(null); return; }
    const gridRect = grid.getBoundingClientRect();
    const gridTop = gridRect.top - grid.scrollTop;
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

    // Horizontal span = today's column (content-space X, scroll-invariant).
    const colEl = todayColRef.current;
    if (top != null && colEl) {
      const colRect = colEl.getBoundingClientRect();
      const gridLeft = gridRect.left - grid.scrollLeft;
      setNowCol({ left: colRect.left - gridLeft, width: colRect.width });
    } else {
      setNowCol(null);
    }
  }, [now, nowMinutes, loading, visibleDays, allTimes, todayStr, slotData, measureTick]);

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
          const days = visibleDays.slice(dMin, dMax + 1);
          const dates = days.map((x) => x.date);
          const times = allTimes.slice(tMin, tMax + 1);
          // Which cities are already open anywhere in the rectangle → pre-check
          const openCities = new Set<string>();
          for (const day of days) {
            for (const time of times) {
              day.timeSlots.get(time)?.properties.forEach((p) => {
                if (p.property_city) openCities.add(p.property_city);
              });
            }
          }
          setRangeSel({ dates, times, openCities: [...openCities] });
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

  // ── SET the open cities across a rectangular RANGE (dates × times) ──
  // Set-state, like the single cell: checked cities are OPENED everywhere in
  // the range, unchecked cities are CLOSED everywhere. Booked/past cells are
  // never touched. Passing an empty target closes the whole range.
  const applyRange = async (dates: string[], times: string[], cities: string[]) => {
    if (!orgId || dates.length === 0 || times.length === 0) return;
    setBusyKey("range");
    const target = new Set(cities);
    const enableIds = cityNames.filter((c) => target.has(c)).flatMap((c) => citiesWithProps.get(c) || []);
    const disableIds = cityNames.filter((c) => !target.has(c)).flatMap((c) => citiesWithProps.get(c) || []);

    // Booked (date,time) pairs in the range — never open OR close those.
    const { data: bookedRows } = await supabase
      .from("showing_available_slots")
      .select("slot_date, slot_time")
      .eq("organization_id", orgId)
      .in("slot_date", dates)
      .eq("is_booked", true);
    const bookedSet = new Set((bookedRows || []).map((r: any) => `${r.slot_date}|${r.slot_time}`));

    // Actionable (date,time) pairs: not booked, not past.
    const pairs: [string, string][] = [];
    let skipped = 0;
    for (const date of dates) {
      for (const time of times) {
        const pastPair = date < todayStr || (date === todayStr && timeToMinutes(time) + 30 <= nowMinutes);
        if (pastPair || bookedSet.has(`${date}|${time}`)) { skipped++; continue; }
        pairs.push([date, time]);
      }
    }
    if (pairs.length === 0) {
      toast({ title: "Nothing to change", description: "Every cell in that range is booked or in the past." });
      setBusyKey(null); setRangeSel(null); return;
    }

    // OPEN checked cities across the actionable pairs (upsert).
    if (enableIds.length) {
      const rows: any[] = [];
      for (const [date, time] of pairs) {
        for (const property_id of enableIds) {
          rows.push({ organization_id: orgId, property_id, slot_date: date, slot_time: time, is_enabled: true });
        }
      }
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from("showing_available_slots")
          .upsert(rows.slice(i, i + 200), { onConflict: "organization_id,property_id,slot_date,slot_time" });
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
      }
    }
    // CLOSE unchecked cities across the whole rectangle (unbooked rows only).
    if (disableIds.length) {
      const { error } = await supabase
        .from("showing_available_slots")
        .update({ is_enabled: false, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .in("slot_date", dates).in("slot_time", times)
        .eq("is_booked", false).in("property_id", disableIds);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
    }

    toast({
      title: "Range updated",
      description: `${pairs.length} time slots — ${target.size} ${target.size === 1 ? "city" : "cities"} open.${skipped > 0 ? ` (${skipped} booked/past left untouched.)` : ""}`,
    });
    await fetchSlots();
    setBusyKey(null);
    setRangeSel(null);
  };

  return (
    <div className="space-y-3">
      {/* Missing report alerts — each chip opens that day's report-less
          showings; one click files the report (was a dead-end before). */}
      {missingReports.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-red-600 shrink-0">
            Missing reports ({missingReports.length}):
          </span>
          {missingByDate.map(([dateStr, items]) => (
            <Popover key={dateStr}>
              <PopoverTrigger asChild>
                <button className="text-xs px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors font-medium">
                  {format(parseISO(dateStr), "MMM d")} · {items.length}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" side="bottom" align="start">
                <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b">
                  <span className="text-xs font-semibold">{format(parseISO(dateStr), "EEE, MMM d")}</span>
                  <button
                    onClick={() => jumpToDate(dateStr)}
                    className="text-[11px] text-[#4F46E5] hover:underline"
                  >
                    Go to week
                  </button>
                </div>
                <div className="space-y-1">
                  {items.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-red-50/60 border border-red-100"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{r.leadName}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{r.address}</div>
                      </div>
                      {onOpenReport ? (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[#4F46E5] hover:bg-[#4F46E5]/90 shrink-0"
                          onClick={() => onOpenReport(r.id, r.leadId, r.address)}
                        >
                          <FileText className="h-3 w-3 mr-1" /> Report
                        </Button>
                      ) : onShowingClick ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0"
                          onClick={() => onShowingClick(r.id)}
                        >
                          View
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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
                          ref={isToday ? todayColRef : undefined}
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

              {/* NOW-LINE — a red rule at the current time, confined to
                  today's column only (measured position + span) */}
              {nowTop != null && nowCol != null && (
                <NowLine top={nowTop} left={nowCol.left} width={nowCol.width} />
              )}
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

      {/* Drag-selected RANGE → set-state dialog (open checked, close unchecked) */}
      <Dialog open={!!rangeSel} onOpenChange={(o) => { if (!o) setRangeSel(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Cities open for this range</DialogTitle>
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
          {rangeSel && (
            <div className="pt-1 space-y-2">
              <p className="text-[11px] text-muted-foreground font-medium">
                <span className="text-emerald-600">Check = open</span> across the range, uncheck to close.
                {rangeSel.openCities.length === 0 && " (Nothing is open here yet.)"}
              </p>
              <CityPicker
                // key resets the checkbox state when a new range is selected
                key={`${rangeSel.dates[0]}-${rangeSel.times[0]}-${rangeSel.dates.length}x${rangeSel.times.length}`}
                cities={cityNames}
                counts={cityCounts}
                busy={busyKey === "range"}
                initialSelected={rangeSel.openCities.length > 0 ? rangeSel.openCities : cityNames}
                actionLabel="Apply to range"
                onConfirm={(cities) => applyRange(rangeSel.dates, rangeSel.times, cities)}
              />
              {rangeSel.openCities.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  disabled={busyKey === "range"}
                  onClick={() => applyRange(rangeSel.dates, rangeSel.times, [])}
                >
                  <X className="h-3 w-3 mr-1" /> Close all in range
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Now-line overlay: a red rule spanning ONLY today's column (position and
// width measured from the DOM), with a dot at the column's left edge. ──────
const NowLine: React.FC<{ top: number; left: number; width: number }> = ({ top, left, width }) => (
  <div aria-hidden className="pointer-events-none absolute z-10" style={{ top, left, width }}>
    <div className="relative border-t-2 border-red-500">
      <div className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-red-500 shadow" />
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
    if (hasCancelled) return (
      <div className="rounded-md border bg-orange-50 border-orange-200 text-orange-600 px-2 py-1 text-[10px]">
        <div className="line-through truncate">{firstName(cancelled[0].lead_name)}</div>
        <div className="opacity-80">{cancelStatusLabel(cancelled[0].status)}</div>
      </div>
    );
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
            <>
              <div className="font-bold truncate line-through">{firstName(cancelled[0].lead_name)}</div>
              <div className="text-[10px] opacity-80">{cancelStatusLabel(cancelled[0].status)}</div>
            </>
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

