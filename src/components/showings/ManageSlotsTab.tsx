import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
import { format, addDays, parseISO, startOfWeek } from "date-fns";
import { buildScheduledAt, formatTimeInTimezone, getTimezoneForCity } from "@/lib/cityTimezone";
import { sendNotificationEmail } from "@/lib/notificationService";
import { quickReportText } from "@/lib/showingReports";
import { marketTone, splitSurface, TONED_MARKETS } from "@/lib/marketColors";
import type { TablesUpdate } from "@/integrations/supabase/types";

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
  property_city: string;
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
  city: string;
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

// Compact city tag for the grid cell (cells are ~90px wide):
// "Cleveland" → CLE · "East Cleveland" → E·CLE · "Milwaukee" → MIL
function shortCity(city: string) {
  const parts = (city || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1].slice(0, 3).toUpperCase();
  const prefix = parts.slice(0, -1).map((w) => w[0].toUpperCase()).join("·");
  return prefix ? `${prefix}·${last}` : last;
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
  onShowingClick?: (showingId: string) => void;
  // Open the report form for a specific showing (missing-report chips).
  onOpenReport?: (showingId: string, leadId: string, propertyAddress: string) => void;
  // Bumped by the parent when a report/detail action mutates showings, so the
  // grid + missing-report list refetch without a manual reload.
  reloadSignal?: number;
  // Optional DOM node the parent exposes so the "Missing reports" bar can be
  // PORTALED into the shared header row (tabs + view toggle + this bar on one
  // line). When null, the bar renders inline above the week nav (fallback).
  headerSlot?: HTMLElement | null;
}

// ── Component ────────────────────────────────────────────────────────
export const ManageSlotsTab: React.FC<ManageSlotsTabProps> = ({
  onShowingClick,
  onOpenReport,
  reloadSignal = 0,
  headerSlot = null,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [weekOffset, setWeekOffset] = useState(0);
  const [slotData, setSlotData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hideEmptyDays, setHideEmptyDays] = useState(false);
  const [missingReports, setMissingReports] = useState<MissingReport[]>([]);
  // Which showing is mid quick-report (spinner + disable its buttons), by id.
  const [reportingId, setReportingId] = useState<string | null>(null);

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
  const loadMissingReports = useCallback(async () => {
    if (!orgId) return;
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
  }, [orgId]);
  useEffect(() => { loadMissingReports(); }, [loadMissingReports, weekOffset, reloadSignal]);

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
    // Anchor to CLEVELAND's today (todayStr), not the browser's — a viewer in
    // another timezone would otherwise land on the wrong week near midnight.
    const todayMon = startOfWeek(parseISO(todayStr), { weekStartsOn: 1 });
    const diffDays = Math.round((targetMon.getTime() - todayMon.getTime()) / (1000 * 60 * 60 * 24));
    setWeekOffset(Math.round(diffDays / 7));
  };

  // ── Listable properties grouped by city (the "open a city" pool) ────
  const [citiesWithProps, setCitiesWithProps] = useState<Map<string, string[]>>(new Map());
  // City → market. A market is the set of cities ONE person covers (Cleveland +
  // East Cleveland are one). Bookings are exclusive inside a market and
  // independent across markets, so this is what decides whether a time is free.
  const [cityMarket, setCityMarket] = useState<Map<string, string>>(new Map());
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
        .select("id, city, market, status")
        .eq("organization_id", orgId)
        .in("status", BOOKABLE_STATUSES);
      const map = new Map<string, string[]>();
      const markets = new Map<string, string>();
      for (const p of (data || []) as { id: string; city: string | null; market: string | null }[]) {
        const city = p.city || "Other";
        if (!map.has(city)) map.set(city, []);
        map.get(city)!.push(p.id);
        markets.set(city, p.market || city);
      }
      setCitiesWithProps(map);
      setCityMarket(markets);
    })();
  }, [orgId]);

  // ── Week dates (weeks start on MONDAY) ──────────────────────────────
  // Derived from CLEVELAND's today (todayStr) so the week/day boundaries agree
  // with the Cleveland-anchored past/today checks below — a viewer in another
  // timezone otherwise sees the columns shift a day near midnight.
  const weekDates = useMemo(() => {
    const monday = addDays(startOfWeek(parseISO(todayStr), { weekStartsOn: 1 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset, todayStr]);
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
        .eq("organization_id", orgId)
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
      .select("id, scheduled_at, status, lead_id, property_id, leads(full_name), properties(address, city)")
      .eq("organization_id", orgId)
      .in("status", ["cancelled", "no_show"])
      .gte("scheduled_at", startInstant)
      .lte("scheduled_at", endInstant);

    const cancelledMap = new Map<string, Map<string, CancelledShowing[]>>();
    (cancelledData || []).forEach((s: any) => {
      const d = new Date(s.scheduled_at);
      // The ladder is a naive slot_time each city reads on its OWN clock, so a
      // Milwaukee (Central) showing keyed to Cleveland landed a row off.
      const tz = getTimezoneForCity(s.properties?.city || null);
      const dateKey = d.toLocaleDateString("en-CA", { timeZone: tz });
      const h = d.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      const timeKey = h + ":00";
      if (!cancelledMap.has(dateKey)) cancelledMap.set(dateKey, new Map());
      const tm = cancelledMap.get(dateKey)!;
      if (!tm.has(timeKey)) tm.set(timeKey, []);
      tm.get(timeKey)!.push({
        id: s.id,
        lead_name: s.leads?.full_name || "Unknown",
        property_address: s.properties?.address || "Unknown",
        property_city: s.properties?.city || "",
        status: s.status,
        lead_id: s.lead_id,
      });
    });

    // Active showings in the window, grouped by (Cleveland date, time). A slot row
    // carries only ONE booked_showing_id per (property, time), so a group tour's
    // 2nd+ attendee (same property + time — now allowed by the milestone guard swap)
    // has no slot pointing at it. Source group members from the showings table and
    // MERGE any a slot didn't surface (below) — additive, so the normal single
    // booking path is untouched.
    const bookedMap = new Map<string, Map<string, BookingInfo[]>>();
    {
      const { data: activeData } = await supabase
        .from("showings")
        .select("id, scheduled_at, status, property_id, leads(full_name), properties(address, city)")
        .eq("organization_id", orgId)
        .in("status", ["scheduled", "confirmed", "completed"])
        .gte("scheduled_at", startInstant)
        .lte("scheduled_at", endInstant);
      (activeData || []).forEach((s: any) => {
        const d = new Date(s.scheduled_at);
        const tz = getTimezoneForCity(s.properties?.city || null);
        const dateKey = d.toLocaleDateString("en-CA", { timeZone: tz });
        const h = d.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
        const timeKey = h + ":00";
        if (!bookedMap.has(dateKey)) bookedMap.set(dateKey, new Map());
        const tm = bookedMap.get(dateKey)!;
        if (!tm.has(timeKey)) tm.set(timeKey, []);
        tm.get(timeKey)!.push({
          showingId: s.id,
          leadName: s.leads?.full_name || "Booked",
          address: s.properties?.address || "Booked",
          city: s.properties?.city || "",
          status: s.status,
        });
      });
    }

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
      const dayBooked = bookedMap.get(dateStr);
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
              city: p.property_city,
              status: p.showing_status,
            }));
          // Merge in group-tour attendees (same property + time) not pointed at by
          // any slot row — additive, deduped by showingId.
          {
            const shown = new Set(bookings.map((b) => b.showingId).filter(Boolean));
            for (const extra of dayBooked?.get(time) || []) {
              if (extra.showingId && !shown.has(extra.showingId)) { bookings.push(extra); shown.add(extra.showingId); }
            }
          }
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
      // Fold booked-only times too: an ACTIVE showing whose (date,time) has no
      // slot row at all (edit-time desync, external/Telegram bookings) must
      // still paint — otherwise the cell renders as an empty "+" and the agent
      // can miss the appointment. Deduped by showingId (idempotent with the
      // group-tour merge above).
      dayBooked?.forEach((bk, time) => {
        const g = timeSlots.get(time);
        if (!g) {
          timeSlots.set(time, {
            time, properties: [], bookings: [...bk], bookedCount: bk.length,
            cancelledShowings: dayCancelled?.get(time) || [],
          });
          return;
        }
        const shown = new Set(g.bookings.map((b) => b.showingId).filter(Boolean));
        for (const extra of bk) {
          if (extra.showingId && !shown.has(extra.showingId)) {
            g.bookings.push(extra);
            shown.add(extra.showingId);
          }
        }
        g.bookedCount = g.bookings.length;
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

  // ── One-click outcome report on a PAST showing (attended vs no-show) ──
  // Mirrors the Telegram handleAttendance mutation exactly: attended →
  // completed (+completed_at); no-show → no_show. Both set followed_up_at
  // (parity with Telegram) and, when no write-up exists yet, a tiny
  // agent_report marker so the "Missing reports" chip — which keys off
  // agent_report IS NULL — clears. DB triggers own the rest:
  // update_lead_status_on_showing flips the lead to 'showed'.
  const quickReport = useCallback(async (showingId: string, attended: boolean) => {
    if (!orgId) return;
    setReportingId(showingId);
    try {
      const nowIso = new Date().toISOString();
      const upd: TablesUpdate<"showings"> = attended
        ? { status: "completed", completed_at: nowIso, followed_up_at: nowIso }
        : { status: "no_show", followed_up_at: nowIso };
      const { data: cur } = await supabase
        .from("showings").select("agent_report")
        .eq("organization_id", orgId).eq("id", showingId).maybeSingle();
      if (!cur?.agent_report) {
        upd.agent_report = quickReportText(attended);
      }
      const { error } = await supabase
        .from("showings").update(upd).eq("organization_id", orgId).eq("id", showingId);
      if (error) throw error;
      toast({ title: attended ? "✅ Asistió" : "👻 No asistió", description: "Reporte guardado." });
      await Promise.all([fetchSlots(), loadMissingReports()]);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo guardar el reporte.", variant: "destructive" });
    } finally {
      setReportingId(null);
    }
  }, [orgId, toast, fetchSlots, loadMissingReports]);

  // When a showing MOVES, its pending Samuel follow-up tasks were scheduled
  // off the OLD time — re-anchor them to the new one so the lead isn't
  // reminded about (or chased after) a time that no longer exists. Mirrors
  // ShowingDetailDialog.retimePendingShowingTasks. Best-effort; note that
  // agent_tasks has NO updated_at column.
  const retimePendingShowingTasks = useCallback(async (showingIdToMove: string, newScheduledAt: string) => {
    if (!orgId) return;
    const OFFSETS_MS: Record<string, number> = {
      showing_confirmation: -24 * 60 * 60 * 1000,
      no_show_followup: 60 * 60 * 1000,
      post_showing: 24 * 60 * 60 * 1000,
    };
    const { data: tasks, error } = await supabase
      .from("agent_tasks")
      .select("id, agent_type, context")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .eq("context->>showing_id", showingIdToMove);
    if (error) {
      console.error("Fetch pending showing tasks failed:", error);
      return;
    }
    const base = new Date(newScheduledAt).getTime();
    for (const t of tasks || []) {
      const offset = OFFSETS_MS[t.agent_type as string];
      if (offset === undefined) continue;
      const newFor = new Date(base + offset);
      if (t.agent_type === "showing_confirmation" && newFor.getTime() <= Date.now()) {
        // A 24h-before confirmation that would fire immediately is noise — the
        // reschedule confirmation email already covers it. Drop it.
        const { error: cancelErr } = await supabase
          .from("agent_tasks")
          .update({ status: "cancelled" })
          .eq("id", t.id)
          .eq("status", "pending");
        if (cancelErr) console.error("Cancel stale confirmation task failed:", cancelErr);
        continue;
      }
      const { error: updErr } = await supabase
        .from("agent_tasks")
        .update({
          scheduled_for: newFor.toISOString(),
          context: { ...((t.context as Record<string, unknown>) || {}), scheduled_at: newScheduledAt },
        })
        .eq("id", t.id)
        .eq("status", "pending");
      if (updErr) console.error(`Retime task ${t.id} failed:`, updErr);
    }
  }, [orgId]);

  // ── Drag-and-drop reschedule (desktop only) ──
  // Drag a booked chip onto a future cell to move it. Time is stored as
  // showings.scheduled_at (Cleveland tz); slot rows only MIRROR it (sync trigger
  // fires on status changes, not scheduled_at) so we move the slot booking by
  // hand. MIRRORS ShowingDetailDialog's reschedule flow: spanned-tail guard →
  // secure the new primary slot atomically → move the showing (rollback the
  // slot on failure) → release old slots → book tails + block sibling homes.
  // The DB guard (trg_enforce_showing_agent_slot) only validates the exact
  // primary instant, so the spanned pre-check is load-bearing for 45/60-min tours.
  const rescheduleShowing = useCallback(async (showingId: string, newDate: string, newTime: string) => {
    if (!orgId || !showingId) return;
    try {
      const { data: sh } = await supabase
        .from("showings")
        .select("property_id, scheduled_at, duration_minutes, leads(full_name, email), properties(address, unit_number, city)")
        .eq("organization_id", orgId).eq("id", showingId).maybeSingle();
      if (!sh?.property_id) { toast({ title: "Error", description: "No encontré ese showing.", variant: "destructive" }); return; }
      const propertyId = sh.property_id as string;
      const newScheduledAt = buildScheduledAt(newDate, newTime, "America/New_York");
      if (sh.scheduled_at === newScheduledAt) return; // dropped on its own cell → no-op

      // Half-hour times the showing spans (a 45/60-min tour occupies tail
      // blocks too — the single agent can't be in two places).
      const durationMinutes = (sh as any).duration_minutes || 30;
      const slotsSpanned = Math.max(1, Math.ceil(durationMinutes / 30));
      const spannedTimes: string[] = [];
      {
        const [sH, sM] = newTime.split(":").map(Number);
        for (let i = 0; i < slotsSpanned; i++) {
          const total = sH * 60 + sM + i * 30;
          if (Math.floor(total / 60) >= 24) break;
          spannedTimes.push(
            `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`,
          );
        }
      }

      // 0. Double-booking guard: refuse if ANY spanned time is already booked
      // by anything other than THIS showing — including a null-owner manual
      // block (is_booked=true, booked_showing_id=NULL). Scoped to this
      // showing's market: another city has its own person and doesn't clash.
      const mktIds = await marketPropertyIdsFor(propertyId);
      const { data: conflictRows, error: confErr } = await supabase
        .from("showing_available_slots")
        .select("slot_time, booked_showing_id")
        .eq("organization_id", orgId)
        .eq("slot_date", newDate)
        .in("slot_time", spannedTimes)
        .in("property_id", mktIds)
        .eq("is_booked", true);
      if (confErr) throw confErr;
      if ((conflictRows || []).some((r: any) => r.booked_showing_id !== showingId)) {
        toast({ title: "Ocupado", description: "El agente ya tiene un showing en ese horario.", variant: "destructive" });
        return;
      }

      // 0b. The slot-row check above can miss another property's >30-min tour
      // tail (no slot row exists to be flagged) — the single agent can't be in
      // two places, so check the REAL active bookings for interval overlap too.
      // Mirrors ShowingDetailDialog.agentBusyElsewhere (the DB trigger only
      // hard-blocks the exact-instant conflict). Fail-open on query error.
      {
        const newStart = new Date(newScheduledAt).getTime();
        const newEnd = newStart + durationMinutes * 60 * 1000;
        const { data: nearby, error: overlapErr } = await supabase
          .from("showings")
          .select("id, scheduled_at, duration_minutes, property_id")
          .eq("organization_id", orgId)
          .in("status", ["scheduled", "confirmed"])
          .gte("scheduled_at", new Date(newStart - 3 * 60 * 60 * 1000).toISOString())
          .lt("scheduled_at", new Date(newEnd).toISOString())
          .neq("id", showingId);
        const busyElsewhere = !overlapErr && (nearby || []).some((s: any) => {
          if (s.property_id === propertyId) return false; // same address → group tour, OK
          const sStart = new Date(s.scheduled_at).getTime();
          const sEnd = sStart + (s.duration_minutes || 30) * 60 * 1000;
          return sStart < newEnd && newStart < sEnd;
        });
        if (busyElsewhere) {
          toast({ title: "Ocupado", description: "El agente está en otra propiedad a esa hora.", variant: "destructive" });
          return;
        }
      }

      // 1. Secure the PRIMARY slot first: find-or-materialize the row for this
      // property + date + time, then book it ATOMICALLY (only if still free) so
      // a concurrent booking is never clobbered. alreadyOurs = rescheduling
      // onto a time this showing currently holds (overlapping move).
      let slotRowId: string | null = null;
      let alreadyOurs = false;
      {
        const { data: existing, error: exErr } = await supabase
          .from("showing_available_slots")
          .select("id, is_booked, booked_showing_id")
          .eq("organization_id", orgId).eq("property_id", propertyId)
          .eq("slot_date", newDate).eq("slot_time", newTime).maybeSingle();
        if (exErr) throw exErr;
        alreadyOurs = !!(existing?.is_booked && existing.booked_showing_id === showingId);
        if (existing?.is_booked && existing.booked_showing_id !== showingId) {
          toast({ title: "Ocupado", description: "Ese horario acaba de ocuparse.", variant: "destructive" });
          await fetchSlots();
          return;
        }
        if (existing) {
          slotRowId = existing.id;
        } else {
          const { data: created, error: createErr } = await supabase
            .from("showing_available_slots")
            .insert({
              organization_id: orgId, property_id: propertyId, slot_date: newDate, slot_time: newTime,
              duration_minutes: durationMinutes, is_enabled: true, is_booked: false,
            })
            .select("id").single();
          if (createErr || !created) throw createErr || new Error("No se pudo crear el horario.");
          slotRowId = created.id;
        }
        if (!alreadyOurs) {
          const nowIso = new Date().toISOString();
          const { data: bookedSlot, error: bookErr } = await supabase
            .from("showing_available_slots")
            .update({ is_booked: true, booked_showing_id: showingId, booked_at: nowIso, updated_at: nowIso })
            .eq("id", slotRowId)
            .eq("is_booked", false) // atomic — only if still free
            .select("id").single();
          if (bookErr || !bookedSlot) {
            toast({ title: "Ocupado", description: "Ese horario acaba de ocuparse.", variant: "destructive" });
            await fetchSlots();
            return;
          }
        }
      }

      // 2. Move the showing (guard validates different-property conflict → 23505).
      // On failure, roll back ONLY a slot we freshly booked — never one the
      // still-active showing already held.
      const { error: updErr } = await supabase
        .from("showings").update({ scheduled_at: newScheduledAt, status: "scheduled", confirmed_at: null })
        .eq("organization_id", orgId).eq("id", showingId);
      if (updErr) {
        if (slotRowId && !alreadyOurs) {
          await supabase.from("showing_available_slots")
            .update({ is_booked: false, booked_showing_id: null, booked_at: null })
            .eq("id", slotRowId);
        }
        if ((updErr as any).code === "23505") {
          toast({ title: "Ocupado", description: "Ese horario ya está tomado por otra propiedad.", variant: "destructive" });
        } else {
          toast({ title: "Error", description: (updErr as any).message || "No se pudo reagendar.", variant: "destructive" });
        }
        await fetchSlots();
        return;
      }

      // Showing + primary slot are committed. Steps 3-4 are best-effort
      // bookkeeping (logged, never surfaced as failure — mirrors the dialog).
      // 3. Release every OTHER slot this showing held (old primary + tails),
      // keeping the just-booked new primary.
      {
        let rel = supabase.from("showing_available_slots")
          .update({ is_booked: false, booked_showing_id: null, booked_at: null })
          .eq("organization_id", orgId).eq("booked_showing_id", showingId);
        if (slotRowId) rel = rel.neq("id", slotRowId);
        const { error: relErr } = await rel;
        if (relErr) console.error("Release old slots failed:", relErr);
      }
      // 4. Block EVERY spanned time: materialize+book each tail half-hour for
      // the primary property, and block still-open rows on the OTHER homes in
      // the SAME market (one showing blocks that agent, not the whole portfolio).
      for (const t of spannedTimes) {
        if (t !== newTime) {
          const { error: tailErr } = await supabase
            .from("showing_available_slots")
            .upsert({
              organization_id: orgId, property_id: propertyId, slot_date: newDate, slot_time: t,
              is_booked: true, booked_showing_id: showingId, booked_at: new Date().toISOString(),
            }, { onConflict: "organization_id,property_id,slot_date,slot_time" });
          if (tailErr) console.error(`Book spanned tail ${t} failed:`, tailErr);
        }
        const { error: blkErr } = await supabase
          .from("showing_available_slots")
          .update({ is_booked: true, booked_showing_id: showingId, booked_at: new Date().toISOString() })
          .eq("organization_id", orgId).eq("slot_date", newDate).eq("slot_time", t)
          .eq("is_booked", false).in("property_id", mktIds).neq("property_id", propertyId);
        if (blkErr) console.error(`Block spanned slot ${t} (siblings) failed:`, blkErr);
      }

      // 5. Re-anchor pending follow-up tasks to the new time and email the lead
      // the NEW date/time — mirrors ShowingDetailDialog's reschedule steps 4b/5.
      // Best-effort: the showing + primary slot are already committed, so a
      // failure here must never surface as "Failed" or block the success toast.
      try {
        await retimePendingShowingTasks(showingId, newScheduledAt);
        const lead = (sh as any).leads;
        if (lead?.email) {
          const prop = (sh as any).properties;
          // rescheduleShowing builds newScheduledAt in America/New_York (the
          // Cleveland-anchored grid), so display it in that same tz — otherwise
          // the email could quote a wall-clock shifted from the dropped cell.
          const tz = "America/New_York";
          const propertyAddr = prop?.address || "the property";
          const showingDateStr =
            format(new Date(newScheduledAt), "EEEE, MMMM d") + " at " + formatTimeInTimezone(newScheduledAt, tz);
          const leadName = (lead.full_name as string | null)?.split(" ")[0] || "there";
          sendNotificationEmail({
            to: lead.email,
            subject: `Showing Confirmed — ${propertyAddr}`,
            html: `<div style="margin-bottom:24px"><h2 style="margin:0;color:#1a1a1a;font-size:22px;font-weight:700">Hi ${leadName},</h2><p style="margin:12px 0 0 0;color:#666;font-size:16px;line-height:1.5">Your showing has been rescheduled! Here are your new details:</p></div><div style="background:#f8f8f8;border-left:4px solid #4F46E5;padding:16px 20px;border-radius:4px;margin:16px 0"><p style="margin:0;color:#1a1a1a;font-size:15px;font-weight:600">${showingDateStr}</p><p style="margin:8px 0 0 0;color:#666;font-size:14px">${propertyAddr}${prop?.unit_number ? " #" + prop.unit_number : ""}${prop?.city ? ", " + prop.city : ""}</p></div><p style="margin:16px 0;color:#666;font-size:14px">Please bring a valid photo ID and proof of income. We look forward to seeing you!</p>`,
            notificationType: "showing_rescheduled_confirmation",
            organizationId: orgId,
            relatedEntityId: showingId,
            relatedEntityType: "showing",
          });
        }
      } catch (postErr) {
        console.error("Post-reschedule notify failed (reschedule already committed):", postErr);
      }

      toast({ title: "Reagendado ✅", description: `Movido a ${formatTime(newTime)}` });
      await fetchSlots();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo reagendar.", variant: "destructive" });
      await fetchSlots();
    }
  }, [orgId, toast, fetchSlots, retimePendingShowingTasks]);

  // (Header "available · booked" totals are now single-sourced in ShowingsList's
  // fetchSlotTotals — this grid no longer writes them, so the chip can't flip
  // between two disagreeing definitions/windows as the grid mounts/navigates.)

  // A booking is agent-time-scoped WITHIN A MARKET: one showing blocks that
  // time across every home the same person covers, and only those. So a time
  // is "taken" per market — re-opening a market that already has a booking
  // would let a second renter double-book that agent (review CRITICAL), while
  // another market at the same hour has its own person and stays free.
  const bookedMarkets = async (date: string, time: string): Promise<Set<string>> => {
    const taken = new Set<string>();
    if (!orgId) return taken;
    const { data } = await supabase
      .from("showing_available_slots")
      .select("property_id, properties!inner(market)")
      .eq("organization_id", orgId).eq("slot_date", date).eq("slot_time", time).eq("is_booked", true);
    for (const row of (data || []) as { properties: { market: string | null } | null }[]) {
      if (row.properties?.market) taken.add(row.properties.market);
    }
    return taken;
  };

  // The subset of `cities` whose market already has a booking at date+time.
  const blockedCities = (cities: string[], taken: Set<string>) =>
    cities.filter((c) => taken.has(cityMarket.get(c) || c));

  // Every property the same agent covers as `propertyId` (its market).
  const marketPropertyIdsFor = async (propertyId: string): Promise<string[]> => {
    if (!orgId) return [propertyId];
    const { data: prop } = await supabase
      .from("properties").select("market").eq("id", propertyId).maybeSingle();
    const market = prop?.market ?? null;
    if (!market) return [propertyId];
    const { data: rows } = await supabase
      .from("properties").select("id").eq("organization_id", orgId).eq("market", market);
    return rows?.length ? rows.map((r: { id: string }) => r.id) : [propertyId];
  };

  // Booked (market|date|time) keys across a set of dates. Used by the bulk
  // paths so a Milwaukee booking no longer blocks a Cleveland day/range.
  const bookedMarketKeys = async (dates: string[]): Promise<Set<string>> => {
    const out = new Set<string>();
    if (!orgId || dates.length === 0) return out;
    const { data } = await supabase
      .from("showing_available_slots")
      .select("slot_date, slot_time, properties!inner(market)")
      .eq("organization_id", orgId)
      .in("slot_date", dates)
      .eq("is_booked", true);
    for (const r of (data || []) as { slot_date: string; slot_time: string; properties: { market: string | null } | null }[]) {
      if (r.properties?.market) out.add(`${r.properties.market}|${r.slot_date}|${r.slot_time}`);
    }
    return out;
  };

  // ── OPEN a slot (date+time) for the chosen cities ───────────────────
  const openSlot = async (date: string, time: string, cities: string[]) => {
    if (!orgId || cities.length === 0) return;
    const key = `${date}-${time}`;
    setBusyKey(key);
    const taken = await bookedMarkets(date, time);
    const blocked = blockedCities(cities, taken);
    const allowed = cities.filter((c) => !blocked.includes(c));
    if (allowed.length === 0) {
      toast({ title: "Already booked", description: `${formatTime(time)} · ${format(parseISO(date), "MMM d")} already has a booking in ${blocked.join(", ")} — that agent can't take another home.`, variant: "destructive" });
      await fetchSlots();
      setBusyKey(null);
      return;
    }
    if (blocked.length) {
      toast({ title: "Partly booked", description: `${blocked.join(", ")} already has a booking at ${formatTime(time)} — opening the rest.` });
    }
    const propIds = allowed.flatMap((c) => citiesWithProps.get(c) || []);
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
    // Only OPENING is restricted: a market that already has a booking can't
    // take a second home at that hour. Closing is always allowed (the update
    // below never touches booked rows), and other markets are unaffected.
    const taken = await bookedMarkets(date, time);
    const blocked = blockedCities(targetCities, taken);
    const target = new Set(targetCities.filter((c) => !blocked.includes(c)));
    if (blocked.length) {
      toast({ title: "Already booked", description: `${blocked.join(", ")} has a booking at ${formatTime(time)} — left as is.` });
    }
    const enableIds: string[] = [];
    const disableIds: string[] = [];
    for (const c of cityNames) {
      const ids = citiesWithProps.get(c) || [];
      // Never disable a market that is booked here — its rows are is_booked
      // anyway, and touching them would fight the booking.
      if (!target.has(c) && taken.has(cityMarket.get(c) || c)) continue;
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
    // Exclude times already booked FOR THAT CITY'S MARKET (would double-book
    // that agent, review CRITICAL) and times already in the past for today.
    // A booking in another market leaves this city's day untouched.
    const bookedKeys = await bookedMarketKeys([date]);
    const notPast = (t: string) => !(date === todayStr && timeToMinutes(t) + 30 <= nowMinutes);
    const rows: { organization_id: string; property_id: string; slot_date: string; slot_time: string; is_enabled: boolean }[] = [];
    const openedTimes = new Set<string>();
    let skippedPairs = 0;
    for (const c of cities) {
      const market = cityMarket.get(c) || c;
      const times = LADDER.filter((t) => notPast(t) && !bookedKeys.has(`${market}|${date}|${t}`));
      skippedPairs += LADDER.length - times.length;
      for (const property_id of citiesWithProps.get(c) || []) {
        for (const slot_time of times) {
          rows.push({ organization_id: orgId, property_id, slot_date: date, slot_time, is_enabled: true });
          openedTimes.add(slot_time);
        }
      }
    }
    if (rows.length === 0) {
      toast({ title: "Nothing to open", description: "All times this day are already booked or past." });
      setBusyKey(null);
      return;
    }
    const propIds = cities.flatMap((c) => citiesWithProps.get(c) || []);
    const times = [...openedTimes];
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from("showing_available_slots")
        .upsert(rows.slice(i, i + 200), { onConflict: "organization_id,property_id,slot_date,slot_time" });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setBusyKey(null); return; }
    }
    toast({
      title: "Day opened",
      description: `${format(parseISO(date), "EEE MMM d")} — ${times.length} times × ${propIds.length} homes.${skippedPairs > 0 ? ` (${skippedPairs} already-booked/past slot${skippedPairs === 1 ? "" : "s"} left untouched.)` : ""}`,
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
    const enableCities = cityNames.filter((c) => target.has(c));
    const disableIds = cityNames.filter((c) => !target.has(c)).flatMap((c) => citiesWithProps.get(c) || []);

    // Booked (market|date|time) keys in the range — never open those. A booking
    // in one market leaves the same date+time open in every other market.
    const bookedKeys = await bookedMarketKeys(dates);

    const isPastPair = (date: string, time: string) =>
      date < todayStr || (date === todayStr && timeToMinutes(time) + 30 <= nowMinutes);

    // Actionable (city,date,time) triples: that city's market is free, not past.
    const rows: { organization_id: string; property_id: string; slot_date: string; slot_time: string; is_enabled: boolean }[] = [];
    const touched = new Set<string>();
    let skipped = 0;
    for (const c of enableCities) {
      const market = cityMarket.get(c) || c;
      const ids = citiesWithProps.get(c) || [];
      for (const date of dates) {
        for (const time of times) {
          if (isPastPair(date, time) || bookedKeys.has(`${market}|${date}|${time}`)) { skipped++; continue; }
          touched.add(`${date}|${time}`);
          for (const property_id of ids) {
            rows.push({ organization_id: orgId, property_id, slot_date: date, slot_time: time, is_enabled: true });
          }
        }
      }
    }
    if (rows.length === 0 && disableIds.length === 0) {
      toast({ title: "Nothing to change", description: "Every cell in that range is booked or in the past." });
      setBusyKey(null); setRangeSel(null); return;
    }

    // OPEN checked cities across their actionable triples (upsert).
    if (rows.length) {
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
      description: `${touched.size} time slots — ${target.size} ${target.size === 1 ? "city" : "cities"} open.${skipped > 0 ? ` (${skipped} booked/past left untouched.)` : ""}`,
    });
    await fetchSlots();
    setBusyKey(null);
    setRangeSel(null);
  };

  // Missing report alerts — each chip opens that day's report-less showings;
  // one click files the report (was a dead-end before). On desktop this bar is
  // PORTALED into the shared header row (headerSlot) so tabs + view toggle +
  // this bar sit on ONE line; with no slot it renders inline (fallback).
  const missingReportsBar = missingReports.length > 0 ? (
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
                  {items.map((r) => {
                    const busyThis = reportingId === r.id;
                    return (
                    <div
                      key={r.id}
                      className="rounded-md px-2 py-1.5 bg-red-50/60 border border-red-100 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{r.leadName}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{r.address}</div>
                        </div>
                        {onShowingClick && (
                          <button onClick={() => onShowingClick(r.id)} className="text-slate-500 hover:text-[#4F46E5] shrink-0" title="Ver showing" aria-label="Ver showing"><Eye className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" disabled={busyThis} onClick={() => quickReport(r.id, true)} className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                          {busyThis ? <Loader2 className="h-3 w-3 animate-spin" /> : "✅ Fue"}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyThis} onClick={() => quickReport(r.id, false)} className="flex-1 h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50">
                          👻 No fue
                        </Button>
                        {onOpenReport && (
                          <Button size="sm" variant="outline" disabled={busyThis} onClick={() => onOpenReport(r.id, r.leadId, r.address)} className="h-7 text-xs shrink-0" title="Reporte completo">
                            <FileText className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ))}
        </div>
  ) : null;

  return (
    <div className="space-y-3">
      {headerSlot && missingReportsBar
        ? createPortal(missingReportsBar, headerSlot)
        : missingReportsBar}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
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
            aria-label={hideEmptyDays ? "Show all days" : "Hide empty days"}
            className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${hideEmptyDays ? "text-[#4F46E5] bg-[#4F46E5]/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {hideEmptyDays ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekly grid */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : cityNames.length === 0 ? (
        <Card variant="glass">
          <CardContent className="py-12 text-center">
            <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No listable properties</p>
            <p className="text-sm text-muted-foreground mt-1">
              Set a property to <b>Available</b> to open showing times for it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* ── Availability week grid. Desktop-grid view only: the parent
            (ShowingsList) mounts ManageSlotsTab solely when isDesktop && the
            "Availability" toggle is active; mobile + the Agenda toggle render
            ShowingsAgenda instead. The old lg:hidden phone day-view was dead
            once that JS mount-gate replaced the CSS-only hiding. ─────────── */}
        <Card variant="glass" className="overflow-hidden">
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
                          className={`p-1.5 text-center font-medium min-w-[92px] ${isToday ? "bg-[#4F46E5]/5" : ""} ${past ? "opacity-70" : ""}`}
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
                            onDragOver={(e) => { if (!past) e.preventDefault(); }}
                            onDrop={(e) => {
                              if (past) return;
                              const id = e.dataTransfer.getData("text/plain");
                              if (id) rescheduleShowing(id, day.date, time);
                            }}
                            /* past keeps a dim treatment but stays READABLE —
                               opacity-40 rendered last week's names at ~15-20%
                               apparent opacity (illegible as a weekly record) */
                            className={`p-1 text-center align-middle ${isToday ? "bg-[#4F46E5]/5" : ""} ${past ? "opacity-75" : ""} ${inDrag(dIdx, tIdx) ? "bg-[#4F46E5]/15" : ""}`}
                          >
                            <SlotCell
                              day={day}
                              time={time}
                              ts={ts}
                              past={past}
                              cellBusy={cellBusy}
                              cityNames={cityNames}
                              cityCounts={cityCounts}
                              cityMarket={cityMarket}
                              dayIdx={dIdx}
                              timeIdx={tIdx}
                              highlighted={inDrag(dIdx, tIdx)}
                              movedRef={movedRef}
                              onDragBegin={beginDrag}
                              onOpen={(cities) => openSlot(day.date, time, cities)}
                              onSetCities={(cities) => setSlotCities(day.date, time, cities)}
                              onClose={() => closeSlot(day.date, time)}
                              onShowingClick={onShowingClick}
                              onQuickReport={quickReport}
                              reportingId={reportingId}
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
        </>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Open</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Completed</div>
        <div className="flex items-center gap-1.5"><span className="inline-block w-3 border-t-2 border-red-500" /> Now</div>
        <span className="text-slate-300">|</span>
        <span>Booked:</span>
        {TONED_MARKETS.map((m) => (
          <div key={m.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${m.tone.swatch}`} /> {m.label}
          </div>
        ))}
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
  cityMarket: Map<string, string>;
  dayIdx: number;
  timeIdx: number;
  highlighted: boolean;
  movedRef: React.MutableRefObject<boolean>;
  onDragBegin: (d: number, t: number) => void;
  onOpen: (cities: string[]) => void;
  onSetCities: (cities: string[]) => void;
  onClose: () => void;
  onShowingClick?: (id: string) => void;
  onQuickReport?: (showingId: string, attended: boolean) => void;
  reportingId?: string | null;
}> = ({ day, time, ts, past, cellBusy, cityNames, cityCounts, cityMarket, dayIdx, timeIdx, highlighted, movedRef, onDragBegin, onOpen, onSetCities, onClose, onShowingClick, onQuickReport, reportingId }) => {
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

  // ── Per-city state of this cell ──────────────────────────────────────
  // A cell is no longer one thing: the same 4pm can be BOOKED in Milwaukee and
  // OPEN in Cleveland, because a different person shows in each. Exclusivity
  // runs per market, so only the cities sharing a market with a booking here
  // are off-limits; the rest stay yours to open or close.
  const marketOf = (c: string) => cityMarket.get(c) || c;
  const openCitySet = new Set((ts?.properties || []).map((p) => p.property_city).filter(Boolean));
  const bookedCities = [...new Set(bookings.map((b) => b.city).filter(Boolean))];
  const bookedMarketSet = new Set(bookedCities.map(marketOf));
  // One entry per booked MARKET (not per city), so Cleveland + East Cleveland
  // at the same hour stay one blue band rather than two.
  const bookedMarketList = [...bookedMarketSet];
  const bookedTones = bookedMarketList.map((m) => marketTone(m));
  // Booked in two cities at once — split the cell so each market gets its side.
  const splitBg = splitSurface(bookedTones);
  const toggleableCities = cityNames.filter((c) => !bookedMarketSet.has(marketOf(c)));
  const lockedCities = cityNames.filter((c) => bookedMarketSet.has(marketOf(c)));
  const openToggleable = toggleableCities.filter((c) => openCitySet.has(c));
  // Cities that are open while this cell also holds a booking elsewhere — the
  // case the old single-state cell could not show at all.
  const openElsewhere = [...openCitySet].filter((c) => !bookedMarketSet.has(marketOf(c)));

  // Past cells: a booked one is CLICKABLE to file a one-click outcome report
  // (✅ Fue / 👻 No fue); cancelled/empty stay read-only.
  if (past) {
    if (isBooked) return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="w-full rounded-md border bg-green-50 border-green-200 text-green-700 px-2 py-1 text-[10px] text-left hover:bg-green-100 transition-colors">
            <div className="font-bold truncate">
              {firstName(bookings[0]?.leadName || "Done")}
              {bookedCities.length > 0 && (
                <span className={`ml-1 px-1 py-px rounded border text-[9px] font-semibold align-middle ${marketTone(bookedCities[0]).tag}`}>
                  {shortCity(bookedCities[0])}
                </span>
              )}
            </div>
            <div className="opacity-70 truncate">
              {bookedCount > 1 ? `+${bookedCount - 1} more · ${bookings[0]?.address || ""}` : (bookings[0]?.address || "")}
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" side="bottom" align="center">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{formatTime(time)} · {format(parseISO(day.date), "MMM d")}</span>
              <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">Pasado</Badge>
            </div>
            {bookings.map((b, i) => {
              const done = b.status === "completed";
              const busyThis = !!b.showingId && reportingId === b.showingId;
              return (
                <div key={b.showingId || i} className="rounded-md border border-slate-100 bg-slate-50/70 px-2 py-1.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Home className="h-3 w-3 shrink-0 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{b.leadName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{b.address}</div>
                    </div>
                    {b.showingId && onShowingClick && (
                      <button onClick={() => onShowingClick(b.showingId!)} className="text-slate-500 hover:text-[#4F46E5] shrink-0" title="Ver showing" aria-label="Ver showing"><Eye className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  {done ? (
                    <div className="text-[10px] text-green-700 font-medium flex items-center gap-1"><Check className="h-3 w-3" /> Asistió — reportado</div>
                  ) : b.showingId && onQuickReport ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" disabled={busyThis} onClick={() => onQuickReport(b.showingId!, true)}
                        className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                        {busyThis ? <Loader2 className="h-3 w-3 animate-spin" /> : "✅ Fue"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyThis} onClick={() => onQuickReport(b.showingId!, false)}
                        className="flex-1 h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50">
                        👻 No fue
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
    if (hasCancelled) return (
      <div className="rounded-md border bg-orange-50 border-orange-200 text-orange-600 px-2 py-1 text-[10px]">
        <div className="line-through truncate">{firstName(cancelled[0].lead_name)}</div>
        <div className="opacity-80">{cancelStatusLabel(cancelled[0].status)}</div>
      </div>
    );
    return <span className="text-slate-400">—</span>;
  }

  // Cell style. A booked cell is painted by its CITY (Cleveland blue, Milwaukee
  // purple) so the day reads as a route at a glance; open/cancelled/closed keep
  // their state colours, because there the city is a list, not one thing.
  let cellStyle = "bg-slate-50/60 text-slate-300 border-dashed border-slate-200 hover:border-[#4F46E5]/40 hover:text-[#4F46E5] hover:bg-[#4F46E5]/5";
  // Two markets booked at the same time → no single colour is true, so the
  // surface is split (below) and the frame goes neutral. One market → its own.
  if (isBooked) cellStyle = splitBg ? "border-slate-300 text-slate-800" : marketTone(bookedCities[0]).cell;
  else if (hasCancelled) cellStyle = "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100";
  else if (isOpen) cellStyle = "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${cellStyle} ${highlighted ? "ring-2 ring-[#4F46E5] ring-offset-1" : ""} ${isBooked && bookings[0]?.showingId ? "cursor-grab active:cursor-grabbing" : ""}`}
          style={splitBg ? { background: splitBg } : undefined}
          // Drag a booked chip to a new cell to reschedule (desktop HTML5 DnD).
          draggable={isBooked && !!bookings[0]?.showingId}
          onDragStart={(e) => {
            if (isBooked && bookings[0]?.showingId) {
              e.dataTransfer.setData("text/plain", bookings[0].showingId);
              e.dataTransfer.effectAllowed = "move";
            }
          }}
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
              <div className="font-bold truncate">
                {firstName(bookings[0]?.leadName || "Booked")}
                {bookedCities.map((c) => (
                  <span key={c} className={`ml-1 px-1 py-px rounded border text-[9px] font-semibold align-middle ${marketTone(c).tag}`}>
                    {shortCity(c)}
                  </span>
                ))}
              </div>
              <div className="text-[10px] opacity-70 truncate">
                {bookedCount > 1 ? `+${bookedCount - 1} more · ${bookings[0]?.address || ""}` : (bookings[0]?.address || "Booked")}
              </div>
              {openElsewhere.length > 0 && (
                <div className="flex flex-wrap justify-center items-center gap-0.5">
                  <span className="text-[9px] font-semibold text-emerald-700">+</span>
                  {openElsewhere.map((c) => (
                    <span key={c} className={`px-1 rounded border text-[9px] font-semibold ${marketTone(c).tag}`}>
                      {shortCity(c)}
                    </span>
                  ))}
                  <span className="text-[9px] text-emerald-700">open</span>
                </div>
              )}
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
                if (cities.length === 0) return null;
                return (
                  <div className="flex flex-wrap justify-center gap-0.5">
                    {cities.map((c) => (
                      <span key={c} className={`px-1 rounded border text-[9px] font-semibold ${marketTone(c).tag}`}>
                        {shortCity(c)}
                      </span>
                    ))}
                  </div>
                );
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
                    <button onClick={() => onShowingClick(cs.id)} className="text-orange-600 hover:text-orange-800" title="Ver showing" aria-label="Ver showing"><Eye className="h-3.5 w-3.5" /></button>
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
              currently open). A BOOKED cell gets them too — the booking only
              takes its own market, so every other city here is still yours to
              open or close. Cities sharing a market with the booking are
              listed as locked instead of silently disappearing. */}
          {lockedCities.length > 0 && (
            <p className="text-[10px] text-muted-foreground pt-1 border-t">
              <span className="font-medium">{lockedCities.join(", ")}</span> — booked at this time, that agent is taken.
            </p>
          )}

          {toggleableCities.length > 0 && (
            <div className="pt-1 border-t">
              <p className="text-[10px] text-muted-foreground font-medium mb-1.5">
                {isBooked ? "Other cities at this time" : "Cities open here"} — <span className="text-emerald-600">check = open</span>, uncheck to close
              </p>
              <CityPicker
                key={`${openToggleable.join("|")}::${toggleableCities.join("|")}`}
                cities={toggleableCities}
                counts={cityCounts}
                busy={cellBusy}
                defaultAll={openToggleable.length === 0 && !isBooked}
                initialSelected={openToggleable.length > 0 || isBooked ? openToggleable : undefined}
                actionLabel={openToggleable.length === 0 ? "Open" : "Update"}
                onConfirm={openToggleable.length === 0 && !isBooked ? onOpen : onSetCities}
              />
            </div>
          )}

          {isOpen && (
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
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

