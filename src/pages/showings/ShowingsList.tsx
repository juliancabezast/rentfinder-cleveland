import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  MapPin,
  User,
  CalendarDays,
  Plus,
  FileText,
  Map as MapIcon,
  Settings2,
  DollarSign,
  TrendingUp,
  Phone,
  Loader2,
  Link2,
  Clock,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, addDays, parseISO, isToday, isTomorrow } from "date-fns";
import { getTimezoneForCity, formatTimeInTimezone } from "@/lib/cityTimezone";
import { ScheduleShowingDialog } from "@/components/showings/ScheduleShowingDialog";
import { ShowingReportDialog } from "@/components/showings/ShowingReportDialog";
import { MyRouteTab } from "@/components/showings/MyRouteTab";
import { ManageSlotsTab } from "@/components/showings/ManageSlotsTab";
import { ShowingDetailDialog } from "@/components/showings/ShowingDetailDialog";

interface ShowingWithDetails {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  lead_id: string;
  property_id?: string;
  property_address?: string;
  property_unit?: string | null;
  property_city?: string;
  property_state?: string | null;
  property_zip?: string | null;
  rent_price?: number | null;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string | null;
  booking_source?: string;
  booked_by_name?: string | null;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active (Scheduled + Confirmed)" },
  { value: "all", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
  { value: "missing_report", label: "Missing Report" },
];

const DATE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "3days", label: "Next 3 Days" },
  { value: "week", label: "This Week" },
  { value: "15days", label: "Next 15 Days" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  completed: "bg-muted text-muted-foreground",
  no_show: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground line-through",
  rescheduled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

// ── Day label helper ─────────────────────────────────────────────────
function getDayLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return `Today — ${format(date, "EEEE, MMMM d")}`;
  if (isTomorrow(date)) return `Tomorrow — ${format(date, "EEEE, MMMM d")}`;
  return format(date, "EEEE, MMMM d");
}

const ShowingsList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [showings, setShowings] = useState<ShowingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [dateFilter, setDateFilter] = useState("week");

  // Tab state from URL
  const activeTab = searchParams.get("tab") || "showings";
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Dialog states
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [enableSlotsOpen, setEnableSlotsOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedShowingForReport, setSelectedShowingForReport] = useState<{
    id: string;
    leadId: string;
    propertyAddress?: string;
  } | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedShowingId, setSelectedShowingId] = useState<string | null>(null);
  const [slotTotals, setSlotTotals] = useState({ available: 0, booked: 0 });

  // Fetch slot totals for current week (available across all tabs)
  const fetchSlotTotals = useMemo(() => async () => {
    if (!userRecord?.organization_id) return;
    const today = format(startOfDay(new Date()), "yyyy-MM-dd");
    const weekEnd = format(addDays(startOfDay(new Date()), 6), "yyyy-MM-dd");
    const { data } = await supabase
      .from("showing_available_slots")
      .select("slot_date, slot_time, is_booked, is_enabled, booked_showing_id")
      .eq("organization_id", userRecord.organization_id!)
      .gte("slot_date", today)
      .lte("slot_date", weekEnd);
    if (data) {
      // Group by date+time to count time slots (not individual property slots)
      const groups = new Map<string, { hasBooking: boolean; allDisabled: boolean }>();
      for (const s of data as any[]) {
        const key = `${s.slot_date}-${s.slot_time}`;
        const g = groups.get(key) || { hasBooking: false, allDisabled: true };
        if (s.is_enabled) g.allDisabled = false;
        if (s.is_booked && s.booked_showing_id && s.is_enabled) g.hasBooking = true;
        groups.set(key, g);
      }
      let available = 0, booked = 0;
      groups.forEach((g) => {
        if (g.allDisabled) return;
        if (g.hasBooking) booked++; else available++;
      });
      setSlotTotals({ available, booked });
    }
  }, [userRecord?.organization_id]);

  useEffect(() => { fetchSlotTotals(); }, [fetchSlotTotals]);

  // All-time metrics (independent of filters)
  const [allTimeMetrics, setAllTimeMetrics] = useState({ totalScheduled: 0, potentialRent: 0, completionRate: 0 });

  // Organization settings
  const { getSetting, updateSetting } = useOrganizationSettings();

  // Lead time config
  const [leadTimeMinutes, setLeadTimeMinutes] = useState<number>(60);
  const [leadTimeSaving, setLeadTimeSaving] = useState(false);
  const [leadTimeLoaded, setLeadTimeLoaded] = useState(false);

  useEffect(() => {
    if (leadTimeLoaded) return;
    const saved = getSetting("showing_lead_time_minutes", 60);
    setLeadTimeMinutes(typeof saved === "number" ? saved : 60);
    setLeadTimeLoaded(true);
  }, [getSetting, leadTimeLoaded]);

  const saveLeadTime = async () => {
    setLeadTimeSaving(true);
    await updateSetting("showing_lead_time_minutes", leadTimeMinutes, "showings", "Minimum minutes before current time for same-day bookings");
    toast({ title: "Saved", description: "Lead time updated." });
    setLeadTimeSaving(false);
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
    await supabase
      .from("organization_settings")
      .upsert({
        organization_id: userRecord.organization_id!,
        key: "call_now_button",
        value: value as unknown as string, // JSONB column accepts object
        category: "showings",
      }, { onConflict: "organization_id,key" });
    setCallNowSaving(false);
    toast({ title: "Saved", description: "Call Now button settings updated." });
  };

  // Fetch all-time metrics (independent of filters)
  useEffect(() => {
    if (!userRecord?.organization_id) return;
    (async () => {
      const { data } = await supabase
        .from("showings")
        .select("id, status, property_id, properties(rent_price)")
        .eq("organization_id", userRecord.organization_id!);
      if (data) {
        const total = data.length;
        const completed = data.filter((s: any) => s.status === "completed").length;
        const propRentMap = new Map<string, number>();
        data.forEach((s: any) => {
          if (s.property_id && s.properties?.rent_price && !propRentMap.has(s.property_id)) {
            propRentMap.set(s.property_id, s.properties.rent_price);
          }
        });
        setAllTimeMetrics({
          totalScheduled: total,
          potentialRent: Array.from(propRentMap.values()).reduce((sum, r) => sum + r, 0),
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        });
      }
    })();
  }, [userRecord?.organization_id]);

  const fetchShowings = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("showings")
        .select(
          `
          id, scheduled_at, status, duration_minutes, lead_id, property_id,
          booking_source, booked_by_name,
          properties(address, unit_number, city, state, zip_code, rent_price),
          leads(full_name, phone, email)
        `
        )
        .eq("organization_id", userRecord.organization_id)
        .order("scheduled_at", { ascending: true });

      // Date filter
      const now = new Date();
      if (dateFilter === "today") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(now).toISOString());
      } else if (dateFilter === "tomorrow") {
        const tomorrow = addDays(now, 1);
        query = query
          .gte("scheduled_at", startOfDay(tomorrow).toISOString())
          .lte("scheduled_at", endOfDay(tomorrow).toISOString());
      } else if (dateFilter === "3days") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(addDays(now, 3)).toISOString());
      } else if (dateFilter === "week") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(addDays(now, 7)).toISOString());
      } else if (dateFilter === "15days") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(addDays(now, 15)).toISOString());
      } else if (dateFilter === "month") {
        query = query
          .gte("scheduled_at", startOfMonth(now).toISOString())
          .lte("scheduled_at", endOfMonth(now).toISOString());
      }

      // Status filter
      if (statusFilter === "active") {
        query = query.in("status", ["scheduled", "confirmed"]);
      } else if (statusFilter === "missing_report") {
        query = query.in("status", ["completed", "no_show"]).is("agent_report", null);
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setShowings(
        (data || []).map((s: any) => ({
          id: s.id,
          scheduled_at: s.scheduled_at,
          status: s.status,
          duration_minutes: s.duration_minutes,
          lead_id: s.lead_id,
          property_id: s.property_id,
          property_address: s.properties?.address,
          property_unit: s.properties?.unit_number || null,
          property_city: s.properties?.city,
          property_state: s.properties?.state || null,
          property_zip: s.properties?.zip_code || null,
          rent_price: s.properties?.rent_price,
          lead_name: s.leads?.full_name,
          lead_phone: s.leads?.phone,
          lead_email: s.leads?.email || null,
          booking_source: s.booking_source || "admin",
          booked_by_name: s.booked_by_name || null,
        }))
      );
    } catch (error) {
      console.error("Error fetching showings:", error);
      toast({
        title: "Error",
        description: "Failed to load showings.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShowings();
  }, [userRecord?.organization_id, statusFilter, dateFilter]);

  // (metrics are now computed in allTimeMetrics via separate useEffect)

  // ── Group showings by day ──────────────────────────────────────────
  const groupedByDay = useMemo(() => {
    const groups: { dateKey: string; label: string; showings: ShowingWithDetails[] }[] = [];
    const dayMap = new Map<string, ShowingWithDetails[]>();

    showings.forEach((s) => {
      const dayKey = format(parseISO(s.scheduled_at), "yyyy-MM-dd");
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(s);
    });

    dayMap.forEach((items, dateKey) => {
      groups.push({
        dateKey,
        label: getDayLabel(dateKey),
        showings: items,
      });
    });

    groups.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return groups;
  }, [showings]);

  const handleOpenReport = (e: React.MouseEvent, showing: ShowingWithDetails) => {
    e.stopPropagation();
    setSelectedShowingForReport({
      id: showing.id,
      leadId: showing.lead_id,
      propertyAddress: showing.property_address,
    });
    setReportDialogOpen(true);
  };

  const ShowingCardSkeleton = () => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </CardContent>
    </Card>
  );

  const canSubmitReport = (status: string) =>
    status === "scheduled" || status === "confirmed" || status === "rescheduled";

  // ── Download agenda ──────────────────────────────────────────────────
  const downloadAgenda = () => {
    if (groupedByDay.length === 0) return;

    const lines: string[] = [];
    lines.push("═══════════════════════════════════════════════════");
    lines.push("  SHOWING AGENDA");
    lines.push(`  Generated: ${format(new Date(), "EEEE, MMMM d, yyyy 'at' h:mm a")}`);
    lines.push("═══════════════════════════════════════════════════");
    lines.push("");

    for (const group of groupedByDay) {
      lines.push(`━━━ ${group.label} ━━━`);
      lines.push("");

      group.showings.forEach((s, i) => {
        const tz = getTimezoneForCity(s.property_city);
        const time = formatTimeInTimezone(s.scheduled_at, tz);
        const duration = s.duration_minutes ? `${s.duration_minutes} min` : "30 min";
        const unit = s.property_unit ? ` #${s.property_unit}` : "";
        const fullAddress = [
          `${s.property_address || ""}${unit}`,
          s.property_city,
          s.property_state,
          s.property_zip,
        ].filter(Boolean).join(", ");
        const mapsQuery = encodeURIComponent(fullAddress);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

        lines.push(`  ${i + 1}. ${time} (${duration}) — ${s.status.replace("_", " ").toUpperCase()}`);
        lines.push(`     Property: ${fullAddress}`);
        if (s.rent_price) lines.push(`     Rent: $${s.rent_price.toLocaleString()}/mo`);
        lines.push(`     Lead: ${s.lead_name || "—"}`);
        if (s.lead_phone) lines.push(`     Phone: ${s.lead_phone}`);
        if (s.lead_email) lines.push(`     Email: ${s.lead_email}`);
        lines.push(`     Maps: ${mapsUrl}`);
        lines.push("");
      });
    }

    lines.push("═══════════════════════════════════════════════════");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateLabel = groupedByDay.length === 1
      ? format(parseISO(groupedByDay[0].dateKey), "yyyy-MM-dd")
      : `${format(parseISO(groupedByDay[0].dateKey), "MMM-d")}_to_${format(parseISO(groupedByDay[groupedByDay.length - 1].dateKey), "MMM-d")}`;
    a.download = `showings-agenda-${dateLabel}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header + Tabs — single compact block */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Showings
        </h1>
        <div className="flex items-center gap-2">
          {permissions.canEditProperty && (
            <>
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
                {slotTotals.available} Available
              </Badge>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                {slotTotals.booked} Booked
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="Copy booking link"
                onClick={() => {
                  const url = `${window.location.origin}/p/book-showing`;
                  navigator.clipboard.writeText(url);
                  toast({ title: "Booking link copied!", description: url });
                }}
              >
                <Link2 className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setEnableSlotsOpen(true)}
                className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Enable Slots
              </Button>
            </>
          )}
          {activeTab === "showings" && showings.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Download agenda"
              onClick={downloadAgenda}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button
            onClick={() => setScheduleDialogOpen(true)}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
          >
            <Plus className="h-4 w-4 mr-2" />
            Schedule Showing
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="inline-flex w-full sm:w-auto h-auto">
          <TabsTrigger value="showings" className="flex-1 sm:flex-initial gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>Showings</span>
          </TabsTrigger>
          {permissions.canViewOwnRoute && (
            <TabsTrigger value="route" className="flex-1 sm:flex-initial gap-2">
              <MapIcon className="h-4 w-4" />
              <span>My Route</span>
            </TabsTrigger>
          )}
          {permissions.canEditProperty && (
            <TabsTrigger value="slots" className="flex-1 sm:flex-initial gap-2">
              <Settings2 className="h-4 w-4" />
              <span>Manage Slots</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="showings" className="space-y-4">
          {/* ── KPI Bubbles (all-time) ────────────────────────────────── */}
          {!loading && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <CalendarDays className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-indigo-700">{allTimeMetrics.totalScheduled}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Total Scheduled</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-amber-700">
                      ${allTimeMetrics.potentialRent.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Rent Potential/mo</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-teal-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-teal-700">{allTimeMetrics.completionRate}%</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Completion Rate</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Filters ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40 h-9">
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-52 h-9">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!loading && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {showings.length} result{showings.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* ── Showings grouped by day ──────────────────────────────── */}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <ShowingCardSkeleton key={i} />
              ))}
            </div>
          ) : showings.length === 0 ? (
            <Card variant="glass">
              <CardContent className="p-0">
                <EmptyState
                  icon={CalendarDays}
                  title="No showings found"
                  description={
                    statusFilter !== "active" || dateFilter !== "all"
                      ? "No showings match your filters. Try adjusting date range or status."
                      : "Showings will appear here when leads schedule property tours."
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* ── Day jump strip ────────────────────────────────── */}
              {groupedByDay.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {groupedByDay.map((group) => {
                    const dateObj = parseISO(group.dateKey);
                    const todayDate = isToday(dateObj);
                    return (
                      <button
                        key={group.dateKey}
                        onClick={() => {
                          document.getElementById(`day-${group.dateKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={`flex flex-col items-center px-3 py-1.5 rounded-lg border transition-colors shrink-0 min-h-[44px] ${
                          todayDate
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white hover:bg-indigo-50 border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        <span className={`text-[10px] uppercase font-medium ${todayDate ? "text-indigo-100" : "text-muted-foreground"}`}>
                          {format(dateObj, "EEE")}
                        </span>
                        <span className={`text-lg font-bold leading-tight ${todayDate ? "" : "text-slate-800"}`}>
                          {format(dateObj, "d")}
                        </span>
                        <span className={`text-[10px] ${todayDate ? "text-indigo-200" : "text-muted-foreground"}`}>
                          {group.showings.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Day groups ────────────────────────────────────── */}
              <div className="space-y-8">
                {groupedByDay.map((group) => {
                  const dateObj = parseISO(group.dateKey);
                  const todayDate = isToday(dateObj);
                  return (
                    <div key={group.dateKey} id={`day-${group.dateKey}`} className="scroll-mt-4">
                      {/* Day header */}
                      <div className={`flex items-center gap-3 mb-4 pb-2 border-b ${todayDate ? "border-indigo-200" : "border-slate-200"}`}>
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                          todayDate ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700"
                        }`}>
                          <span className="text-lg font-bold">
                            {format(dateObj, "d")}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-foreground">
                          {group.label}
                        </h3>
                        <Badge variant="outline" className="text-xs ml-auto px-2.5 py-0.5">
                          {group.showings.length} showing{group.showings.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>

                      {/* Showing cards for this day */}
                      <div className="space-y-2.5 pl-3 border-l-2 border-indigo-100 ml-5">
                        {group.showings.map((showing, index) => (
                          <Card
                            key={showing.id}
                            variant="glass"
                            className="hover:shadow-modern-lg transition-all duration-300 cursor-pointer animate-fade-up"
                            style={{
                              animationDelay: `${Math.min(index * 0.04, 0.2)}s`,
                              animationFillMode: "both",
                            }}
                            onClick={() => {
                              setSelectedShowingId(showing.id);
                              setDetailDialogOpen(true);
                            }}
                          >
                            <CardContent className="p-4 sm:p-5">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                {/* Time */}
                                <div className="flex items-center gap-2 sm:w-28 shrink-0">
                                  <div className="text-right">
                                    <p className="font-bold text-base">
                                      {formatTimeInTimezone(showing.scheduled_at, getTimezoneForCity(showing.property_city))}
                                    </p>
                                    {showing.duration_minutes && (
                                      <p className="text-xs text-muted-foreground">
                                        {showing.duration_minutes} min
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                  {showing.property_address && (
                                    <p className="font-semibold text-base flex items-center gap-1.5 truncate">
                                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                      {showing.property_address}
                                      {showing.property_city && `, ${showing.property_city}`}
                                      {showing.rent_price && (
                                        <span className="text-emerald-600 text-sm font-medium ml-1">
                                          ${showing.rent_price.toLocaleString()}/mo
                                        </span>
                                      )}
                                    </p>
                                  )}
                                  {showing.lead_name && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                                      <User className="h-3.5 w-3.5" />
                                      {showing.lead_name}
                                      {showing.lead_phone && ` · ${showing.lead_phone}`}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-1">
                                    {showing.booking_source === "public_link" ? (
                                      <>
                                        <Link2 className="h-3 w-3" />
                                        Booked via public link
                                      </>
                                    ) : showing.booked_by_name ? (
                                      <>
                                        <User className="h-3 w-3" />
                                        Scheduled by {showing.booked_by_name}
                                      </>
                                    ) : (
                                      <>
                                        <User className="h-3 w-3" />
                                        Scheduled by team
                                      </>
                                    )}
                                  </p>
                                </div>

                                {/* Actions + Status */}
                                <div className="flex items-center gap-2.5">
                                  {canSubmitReport(showing.status) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 text-sm px-3"
                                      onClick={(e) => handleOpenReport(e, showing)}
                                    >
                                      <FileText className="h-4 w-4 mr-1.5" />
                                      Report
                                    </Button>
                                  )}
                                  <Badge
                                    className={`text-xs px-2.5 py-1 ${
                                      statusColors[showing.status] || "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {showing.status.replace("_", " ")}
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {permissions.canViewOwnRoute && (
          <TabsContent value="route">
            <MyRouteTab onRefresh={fetchShowings} />
          </TabsContent>
        )}

        {permissions.canEditProperty && (
          <TabsContent value="slots" className="space-y-6">
            <ManageSlotsTab
              externalDialogOpen={enableSlotsOpen}
              onExternalDialogHandled={() => setEnableSlotsOpen(false)}
              onTotalsChange={setSlotTotals}
              onShowingClick={(showingId) => {
                setSelectedShowingId(showingId);
                setDetailDialogOpen(true);
              }}
            />

            {/* Minimum Lead Time Config */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">Minimum Booking Lead Time</h3>
                    <p className="text-xs text-muted-foreground">
                      How many minutes before a time slot must the lead book? Slots closer than this to the current time won't be shown.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Select
                    value={String(leadTimeMinutes)}
                    onValueChange={(v) => setLeadTimeMinutes(parseInt(v))}
                  >
                    <SelectTrigger className="w-48">
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
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {leadTimeSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Call Now Button Config */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Phone className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">Call Now Button</h3>
                    <p className="text-xs text-muted-foreground">
                      Floating button on the public booking page
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="call-now-phone" className="text-xs">Phone Number</Label>
                      <Input
                        id="call-now-phone"
                        placeholder="+1 (221) 220-29323"
                        value={callNowPhone}
                        onChange={(e) => setCallNowPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="call-now-label" className="text-xs">Button Label</Label>
                      <Input
                        id="call-now-label"
                        placeholder="Call Now"
                        value={callNowLabel}
                        onChange={(e) => setCallNowLabel(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {!callNowLoading && (
                  <Button
                    size="sm"
                    onClick={saveCallNowConfig}
                    disabled={callNowSaving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {callNowSaving ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : null}
                    Save
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Schedule Showing Dialog */}
      <ScheduleShowingDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onSuccess={fetchShowings}
      />

      {/* Showing Report Dialog */}
      {selectedShowingForReport && (
        <ShowingReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          showingId={selectedShowingForReport.id}
          leadId={selectedShowingForReport.leadId}
          propertyAddress={selectedShowingForReport.propertyAddress}
          onSuccess={fetchShowings}
        />
      )}

      {/* Showing Detail Dialog */}
      <ShowingDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        showingId={selectedShowingId}
        onSuccess={fetchShowings}
        onOpenReport={(showingId, leadId, propertyAddress) => {
          setSelectedShowingForReport({ id: showingId, leadId, propertyAddress });
          setReportDialogOpen(true);
        }}
      />
    </div>
  );
};

export default ShowingsList;
