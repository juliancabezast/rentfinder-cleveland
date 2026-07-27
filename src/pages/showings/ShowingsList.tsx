import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Plus,
  Settings2,
  Phone,
  Loader2,
  Link2,
  Clock,
  Image,
  ExternalLink,
  FileText,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { format, addDays, parseISO, startOfWeek } from "date-fns";
import { ScheduleShowingDialog } from "@/components/showings/ScheduleShowingDialog";
import { ShowingReportDialog } from "@/components/showings/ShowingReportDialog";
import { ManageSlotsTab } from "@/components/showings/ManageSlotsTab";
import { BookingPageTab } from "@/components/showings/BookingPageTab";
import { ShowingDetailDialog } from "@/components/showings/ShowingDetailDialog";
import { ShowingsAgenda } from "@/components/showings/ShowingsAgenda";

// Matches the grid's slot-visibility gate in ManageSlotsTab (bookable =
// 'available' only) so the header chip and the grid agree on what's open.
const BOOKABLE_STATUSES = ["available"];

const ShowingsList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  // Tab state from URL
  const rawTab = searchParams.get("tab") || "slots";
  // "route" moved to Telegram; "landing" renamed to "booking"
  const activeTab = rawTab === "route" ? "slots" : rawTab === "landing" ? "booking" : rawTab;
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Dialog states
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedShowingForReport, setSelectedShowingForReport] = useState<{
    id: string;
    leadId: string;
    propertyAddress?: string;
  } | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedShowingId, setSelectedShowingId] = useState<string | null>(null);
  const [slotTotals, setSlotTotals] = useState({ available: 0, booked: 0 });
  // Bumped whenever a showing is mutated (report filed, rescheduled, cancelled,
  // newly scheduled) so the calendar grid + missing-report chips refetch.
  const [calendarReload, setCalendarReload] = useState(0);
  const bumpCalendar = () => setCalendarReload((n) => n + 1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Mount only the ACTIVE view variant. The previous CSS-only hiding
  // (lg:hidden / hidden lg:block) mounted BOTH the mobile Agenda and the
  // desktop grid on every viewport, so phones ran the page's heaviest fetches
  // (the paginated week slot query + 4 side queries) for an invisible grid,
  // and desktop's Agenda toggle double-fetched the same day.
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Header "available · booked" chip — the SINGLE source of truth (the grid no
  // longer overwrites it, so the numbers can't flip between two definitions).
  // Window = the current Cleveland Mon–Sun week (the grid's default week).
  // PAGINATED: a bulk "Open all day" writes 1,000+ slot rows, and PostgREST
  // silently truncates unpaginated queries at 1,000. Counts one time-slot per
  // (date, time) group: booked if any real booking exists, otherwise available
  // if any enabled slot on a still-listable property exists — mirroring the
  // grid's definitions in ManageSlotsTab.
  const fetchSlotTotals = useMemo(() => async () => {
    if (!userRecord?.organization_id) return;
    const todayCleveland = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const monday = startOfWeek(parseISO(todayCleveland), { weekStartsOn: 1 });
    const start = format(monday, "yyyy-MM-dd");
    const end = format(addDays(monday, 6), "yyyy-MM-dd");
    const PAGE = 1000;
    const rows: any[] = [];
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("slot_date, slot_time, is_booked, is_enabled, booked_showing_id, properties(status)")
        .eq("organization_id", userRecord.organization_id!)
        .gte("slot_date", start)
        .lte("slot_date", end)
        .order("slot_date")
        .order("slot_time")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    const groups = new Map<string, { booked: boolean; open: boolean }>();
    for (const s of rows) {
      const key = `${s.slot_date}|${s.slot_time}`;
      const g = groups.get(key) || { booked: false, open: false };
      if (s.is_booked && s.booked_showing_id) g.booked = true;
      if (!s.is_booked && s.is_enabled && BOOKABLE_STATUSES.includes((s.properties as any)?.status)) g.open = true;
      groups.set(key, g);
    }

    // Fold in ACTIVE showings whose (Cleveland date, time) has no booked slot
    // row (edit-time desync, external/Telegram bookings) — the grid already
    // paints these (ManageSlotsTab's bookedMap merge), so without this the chip
    // undercounts booked and can even count that time as available, disagreeing
    // with the grid it claims to single-source. Bounded to the week window.
    {
      const orgTz = "America/New_York";
      const clevelandBoundaryUTC = (dateStr: string, endOfDay: boolean) => {
        const asUTC = new Date(`${dateStr}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
        const offset =
          new Date(asUTC.toLocaleString("en-US", { timeZone: orgTz })).getTime() -
          new Date(asUTC.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
        return new Date(asUTC.getTime() - offset).toISOString();
      };
      const { data: activeShowings } = await supabase
        .from("showings")
        .select("scheduled_at")
        .eq("organization_id", userRecord.organization_id!)
        .in("status", ["scheduled", "confirmed", "completed"])
        .gte("scheduled_at", clevelandBoundaryUTC(start, false))
        .lte("scheduled_at", clevelandBoundaryUTC(end, true));
      for (const s of activeShowings || []) {
        const d = new Date(s.scheduled_at);
        const dateKey = d.toLocaleDateString("en-CA", { timeZone: orgTz });
        const timeKey = d.toLocaleString("en-GB", { timeZone: orgTz, hour: "2-digit", minute: "2-digit", hour12: false }) + ":00";
        const key = `${dateKey}|${timeKey}`;
        const g = groups.get(key) || { booked: false, open: false };
        g.booked = true; // booked wins over open (matches the grid)
        groups.set(key, g);
      }
    }

    let available = 0, booked = 0;
    groups.forEach((g) => {
      if (g.booked) booked++;
      else if (g.open) available++;
    });
    setSlotTotals({ available, booked });
  }, [userRecord?.organization_id]);

  // Refresh on mount AND after every showing mutation (calendarReload) — the
  // chip used to go stale on mobile/Agenda where the grid never reported.
  useEffect(() => { fetchSlotTotals(); }, [fetchSlotTotals, calendarReload]);

  // Organization settings
  const { getSetting, updateSetting, loading: settingsLoading } = useOrganizationSettings();

  // Lead time config
  const [leadTimeMinutes, setLeadTimeMinutes] = useState<number>(60);
  const [leadTimeSaving, setLeadTimeSaving] = useState(false);
  const [leadTimeLoaded, setLeadTimeLoaded] = useState(false);

  // Hydrate the dialog's lead-time value ONLY once org settings have finished
  // loading. useOrganizationSettings starts with settings={} and populates
  // async, so reading getSetting before that always returns the 60 default and
  // would latch it — then a Save silently reverts the owner's stored value
  // (e.g. 180) to 60. Gating on settingsLoading (mirrors BookingPageTab) fixes
  // it. (When there's no org context the hook resolves loading=false and 60 is
  // the correct fallback anyway.)
  useEffect(() => {
    if (settingsLoading || leadTimeLoaded) return;
    const saved = getSetting("showing_lead_time_minutes", 60);
    setLeadTimeMinutes(typeof saved === "number" ? saved : 60);
    setLeadTimeLoaded(true);
  }, [getSetting, leadTimeLoaded, settingsLoading]);

  const saveLeadTime = async () => {
    setLeadTimeSaving(true);
    try {
      await updateSetting("showing_lead_time_minutes", leadTimeMinutes, "showings", "Minimum minutes before current time for same-day bookings");
      toast({ title: "Saved", description: "Lead time updated." });
    } catch (err: any) {
      // updateSetting throws on network/RLS errors and on an RLS no-op write.
      // Without this catch the Save button would spin forever with no feedback.
      console.error("Lead time save failed:", err);
      toast({ title: "Save failed", description: err?.message || "Could not save the lead time.", variant: "destructive" });
    } finally {
      setLeadTimeSaving(false);
    }
  };

  // Call Now button config
  const [callNowEnabled, setCallNowEnabled] = useState(false);
  const [callNowPhone, setCallNowPhone] = useState("");
  const [callNowLabel, setCallNowLabel] = useState("Call Now");
  const [callNowLoading, setCallNowLoading] = useState(true);
  const [callNowSaving, setCallNowSaving] = useState(false);

  // Fetch Call Now config
  useEffect(() => {
    if (!userRecord?.organization_id) return;
    (async () => {
      setCallNowLoading(true);
      const { data } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", userRecord.organization_id!)
        .eq("key", "call_now_button")
        .single();
      if (data?.value) {
        const val = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        setCallNowEnabled(val.enabled ?? false);
        setCallNowPhone(val.phone ?? "");
        setCallNowLabel(val.label ?? "Call Now");
      }
      setCallNowLoading(false);
    })();
  }, [userRecord?.organization_id]);

  const saveCallNowConfig = async () => {
    if (!userRecord?.organization_id) return;
    setCallNowSaving(true);
    const value = { enabled: callNowEnabled, phone: callNowPhone, label: callNowLabel };
    try {
      // Destructure { error } AND chain .select() so a network/DB failure or an
      // RLS-blocked no-op surfaces instead of firing a lying "Saved" toast
      // (supabase-js resolves — never throws — so an unchecked upsert is silent).
      const { data, error } = await supabase
        .from("organization_settings")
        .upsert({
          organization_id: userRecord.organization_id!,
          key: "call_now_button",
          value: value as unknown as string, // JSONB column accepts object
          category: "showings",
        }, { onConflict: "organization_id,key" })
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Settings write returned no row — RLS may be blocking this change.");
      toast({ title: "Saved", description: "Call Now button settings updated." });
    } catch (err: any) {
      console.error("Call Now save failed:", err);
      toast({ title: "Save failed", description: err?.message || "Could not save Call Now settings.", variant: "destructive" });
    } finally {
      setCallNowSaving(false);
    }
  };

  // Showing Schedule tab: mobile shows the action-first day Agenda; desktop can
  // toggle between the Agenda and the availability grid (default = grid).
  const [desktopView, setDesktopView] = useState<"grid" | "agenda">("grid");
  // Portal target: ManageSlotsTab renders its "Missing reports" bar into this
  // header node so the tabs, the view toggle, and that bar all sit on one row.
  const [mrSlot, setMrSlot] = useState<HTMLElement | null>(null);
  const openReport = (showingId: string, leadId: string, propertyAddress?: string) => {
    setSelectedShowingForReport({ id: showingId, leadId, propertyAddress });
    setReportDialogOpen(true);
  };
  const openDetail = (showingId: string) => {
    setSelectedShowingId(showingId);
    setDetailDialogOpen(true);
  };

  // ── Missing-reports queue for the surfaces ManageSlotsTab does NOT cover ──
  // The availability grid renders its own "Missing reports" bar (portaled into
  // the header), but it is UNMOUNTED on mobile and on the desktop Agenda toggle
  // — so a phone-only agent (the Agenda's primary audience) never saw the
  // past-unreported backlog and it silently regrew. Lift a compact, actionable
  // copy here for exactly those surfaces; the desktop grid keeps its own bar,
  // so the query never double-runs (only one surface is active at a time).
  const showLiftedMissingReports = activeTab === "slots" && (!isDesktop || desktopView === "agenda");
  const [liftedMissingReports, setLiftedMissingReports] = useState<
    { id: string; leadId: string; leadName: string; address: string; date: string; status: string }[]
  >([]);
  const [liftedReportingId, setLiftedReportingId] = useState<string | null>(null);

  const loadLiftedMissingReports = useCallback(async () => {
    const orgId = userRecord?.organization_id;
    if (!orgId || !showLiftedMissingReports) {
      setLiftedMissingReports([]);
      return;
    }
    // Mirrors ManageSlotsTab.loadMissingReports: past showings still awaiting an
    // outcome (scheduled/confirmed) or auto-completed with no write-up. 'no_show'
    // is a recorded outcome so it's excluded. .limit mirrors the 1000-row cap.
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("showings")
      .select("id, scheduled_at, status, lead_id, leads(full_name), properties(address)")
      .eq("organization_id", orgId)
      .lt("scheduled_at", nowIso)
      .in("status", ["scheduled", "confirmed", "completed"])
      .is("agent_report", null)
      .order("scheduled_at", { ascending: true })
      .limit(500);
    setLiftedMissingReports(
      (data || []).map((s: any) => ({
        id: s.id,
        leadId: s.lead_id,
        leadName: s.leads?.full_name || "Unknown lead",
        address: s.properties?.address || "Unknown property",
        date: new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
        status: s.status,
      })),
    );
  }, [userRecord?.organization_id, showLiftedMissingReports]);
  useEffect(() => { loadLiftedMissingReports(); }, [loadLiftedMissingReports, calendarReload]);

  const liftedMissingByDate = useMemo(() => {
    const m = new Map<string, typeof liftedMissingReports>();
    for (const r of liftedMissingReports) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [liftedMissingReports]);

  // One-click outcome report — mirrors ManageSlotsTab.quickReport, then bumps
  // calendarReload so this bar, the Agenda, and the chip all refresh.
  const liftedQuickReport = useCallback(async (showingId: string, attended: boolean) => {
    const orgId = userRecord?.organization_id;
    if (!orgId) return;
    setLiftedReportingId(showingId);
    try {
      const nowIso = new Date().toISOString();
      const upd: Record<string, any> = attended
        ? { status: "completed", completed_at: nowIso, followed_up_at: nowIso }
        : { status: "no_show", followed_up_at: nowIso };
      const { data: cur } = await supabase
        .from("showings").select("agent_report")
        .eq("organization_id", orgId).eq("id", showingId).maybeSingle();
      if (!cur?.agent_report) {
        upd.agent_report = attended ? "Asistió ✅ (reporte rápido)" : "No asistió 👻 (reporte rápido)";
      }
      const { error } = await supabase
        .from("showings").update(upd).eq("organization_id", orgId).eq("id", showingId);
      if (error) throw error;
      toast({ title: attended ? "✅ Asistió" : "👻 No asistió", description: "Reporte guardado." });
      bumpCalendar();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo guardar el reporte.", variant: "destructive" });
    } finally {
      setLiftedReportingId(null);
    }
  }, [userRecord?.organization_id, toast]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Showings
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {permissions.canEditProperty && (
            <>
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-emerald-700">{slotTotals.available}</span> available
                {" · "}
                <span className="font-medium text-blue-700">{slotTotals.booked}</span> booked
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                title="Copy the public booking-page link"
                onClick={() => {
                  const url = `${window.location.origin}/p/book-showing`;
                  navigator.clipboard.writeText(url);
                  toast({ title: "Booking link copied!", description: url });
                }}
              >
                <Link2 className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Copy Booking Link</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                title="Open the public Leasing Tracker page"
                onClick={() =>
                  window.open(
                    `${window.location.origin}/leasingtracker`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <ExternalLink className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Leasing Tracker</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                title="Booking settings (lead time · Call Now button)"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </>
          )}
          {permissions.canScheduleShowing && (
            <Button
              size="sm"
              onClick={() => setScheduleDialogOpen(true)}
              className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white h-8"
            >
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Schedule Showing</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        {/* One header row: the tabs, the desktop view toggle, and (portaled in
            by ManageSlotsTab) the "Missing reports" bar — instead of 3 stacked rows. */}
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="inline-flex w-full sm:w-auto h-auto">
            <TabsTrigger value="slots" className="flex-1 sm:flex-initial gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>Showing Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="booking" className="flex-1 sm:flex-initial gap-2">
              <Image className="h-4 w-4" />
              <span>Booking Page</span>
            </TabsTrigger>
          </TabsList>

          {/* Desktop-only view toggle, only meaningful on the Showing Schedule tab. */}
          {activeTab === "slots" && (
            <div className="hidden lg:inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                onClick={() => setDesktopView("grid")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${desktopView === "grid" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                📅 Availability
              </button>
              <button
                onClick={() => setDesktopView("agenda")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${desktopView === "agenda" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                📋 Agenda
              </button>
            </div>
          )}

          {/* Portal target for ManageSlotsTab's "Missing reports" bar (desktop). */}
          <div ref={setMrSlot} className="hidden lg:flex items-center gap-2 flex-wrap" />
        </div>

        <TabsContent value="slots" className="space-y-6">
          {/* Missing-reports bar for the surfaces the grid's own (portaled) bar
              can't reach — mobile + the desktop Agenda toggle. Chips open the
              day's report-less showings for a one-click outcome or full report. */}
          {showLiftedMissingReports && liftedMissingReports.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap rounded-lg border border-red-200 bg-red-50/60 px-3 py-2">
              <span className="text-xs font-medium text-red-600 shrink-0">
                Missing reports ({liftedMissingReports.length}):
              </span>
              {liftedMissingByDate.map(([dateStr, items]) => (
                <Popover key={dateStr}>
                  <PopoverTrigger asChild>
                    <button className="text-xs px-2 py-1 rounded-md bg-white border border-red-200 text-red-700 hover:bg-red-100 transition-colors font-medium">
                      {format(parseISO(dateStr), "MMM d")} · {items.length}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" side="bottom" align="start">
                    <div className="px-1 pb-2 mb-1 border-b">
                      <span className="text-xs font-semibold">{format(parseISO(dateStr), "EEE, MMM d")}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((r) => {
                        const busyThis = liftedReportingId === r.id;
                        return (
                          <div key={r.id} className="rounded-md px-2 py-1.5 bg-red-50/60 border border-red-100 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">{r.leadName}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{r.address}</div>
                              </div>
                              <button onClick={() => openDetail(r.id)} className="text-slate-500 hover:text-[#4F46E5] shrink-0" title="Ver showing" aria-label="Ver showing"><Eye className="h-3.5 w-3.5" /></button>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" disabled={busyThis} onClick={() => liftedQuickReport(r.id, true)} className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                                {busyThis ? <Loader2 className="h-3 w-3 animate-spin" /> : "✅ Fue"}
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyThis} onClick={() => liftedQuickReport(r.id, false)} className="flex-1 h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50">
                                👻 No fue
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyThis} onClick={() => openReport(r.id, r.leadId, r.address)} className="h-7 text-xs shrink-0" title="Reporte completo">
                                <FileText className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          )}

          {/* Only the active variant mounts (JS media query, not CSS hiding):
              phone → the action-first day Agenda; desktop → Agenda or the
              availability grid per the header toggle. */}
          {!isDesktop ? (
            <ShowingsAgenda
              reloadSignal={calendarReload}
              onReload={bumpCalendar}
              onOpenReport={openReport}
              onShowingClick={openDetail}
            />
          ) : desktopView === "agenda" ? (
            <div className="space-y-3">
              <ShowingsAgenda
                reloadSignal={calendarReload}
                onReload={bumpCalendar}
                onOpenReport={openReport}
                onShowingClick={openDetail}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <ManageSlotsTab
                reloadSignal={calendarReload}
                onOpenReport={openReport}
                onShowingClick={openDetail}
                headerSlot={mrSlot}
              />
            </div>
          )}
        </TabsContent>


        <TabsContent value="booking">
          <BookingPageTab />
        </TabsContent>
      </Tabs>

      {/* Schedule Showing Dialog */}
      <ScheduleShowingDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onSuccess={bumpCalendar}
      />

      {/* Showing Report Dialog */}
      {selectedShowingForReport && (
        <ShowingReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          showingId={selectedShowingForReport.id}
          leadId={selectedShowingForReport.leadId}
          propertyAddress={selectedShowingForReport.propertyAddress}
          onSuccess={bumpCalendar}
        />
      )}

      {/* Showing Detail Dialog */}
      <ShowingDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        showingId={selectedShowingId}
        onSuccess={bumpCalendar}
        onOpenReport={(showingId, leadId, propertyAddress) => {
          setSelectedShowingForReport({ id: showingId, leadId, propertyAddress });
          setReportDialogOpen(true);
        }}
      />

      {/* Booking settings — compact popup (lead time · Call Now button) */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-indigo-600" />
              Booking settings
            </DialogTitle>
            <DialogDescription>
              Lead time and the public booking page's Call Now button.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* Minimum lead time */}
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">Minimum booking lead time</h3>
                  <p className="text-xs text-muted-foreground">
                    Slots closer than this to the current time are hidden on the booking page.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-[42px]">
                <Select
                  value={String(leadTimeMinutes)}
                  onValueChange={(v) => setLeadTimeMinutes(parseInt(v))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No minimum</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                    <SelectItem value="180">3 hours</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="480">8 hours</SelectItem>
                    <SelectItem value="1440">24 hours</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={saveLeadTime}
                  disabled={leadTimeSaving}
                  className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
                >
                  {leadTimeSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Call Now button */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <Phone className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">Call Now button</h3>
                  <p className="text-xs text-muted-foreground">
                    Floating button on the public booking page.
                  </p>
                </div>
                {callNowLoading ? (
                  <Skeleton className="h-6 w-10 rounded-full" />
                ) : (
                  <Switch
                    checked={callNowEnabled}
                    onCheckedChange={(checked) => setCallNowEnabled(checked)}
                  />
                )}
              </div>

              {!callNowLoading && (
                <div className="space-y-3 pl-[42px]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="call-now-phone" className="text-xs">Phone number</Label>
                      <Input
                        id="call-now-phone"
                        placeholder="+1 (216) 555-0123"
                        value={callNowPhone}
                        onChange={(e) => setCallNowPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="call-now-label" className="text-xs">Button label</Label>
                      <Input
                        id="call-now-label"
                        placeholder="Call Now"
                        value={callNowLabel}
                        onChange={(e) => setCallNowLabel(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={saveCallNowConfig}
                    disabled={callNowSaving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {callNowSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShowingsList;
