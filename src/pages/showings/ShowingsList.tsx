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
  Users,
  Home,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Phone,
  Loader2,
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
import { format, startOfDay, endOfDay, addDays, parseISO, isToday, isTomorrow } from "date-fns";
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
  property_city?: string;
  rent_price?: number | null;
  lead_name?: string;
  lead_phone?: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active (Scheduled + Confirmed)" },
  { value: "all", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
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
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedShowingForReport, setSelectedShowingForReport] = useState<{
    id: string;
    leadId: string;
    propertyAddress?: string;
  } | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedShowingId, setSelectedShowingId] = useState<string | null>(null);

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

  const fetchShowings = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("showings")
        .select(
          `
          id, scheduled_at, status, duration_minutes, lead_id, property_id,
          properties(address, city, rent_price),
          leads(full_name, phone)
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
      } else if (dateFilter === "week") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(addDays(now, 7)).toISOString());
      }

      // Status filter
      if (statusFilter === "active") {
        query = query.in("status", ["scheduled", "confirmed"]);
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
          property_city: s.properties?.city,
          rent_price: s.properties?.rent_price,
          lead_name: s.leads?.full_name,
          lead_phone: s.leads?.phone,
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

  // ── KPI metrics ────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const uniqueLeads = new Set(showings.map((s) => s.lead_id));
    const uniqueProps = new Set(showings.filter((s) => s.property_id).map((s) => s.property_id));

    // Potential monthly revenue = sum of rent_price for unique properties
    const propRentMap = new Map<string, number>();
    showings.forEach((s) => {
      if (s.property_id && s.rent_price && !propRentMap.has(s.property_id)) {
        propRentMap.set(s.property_id, s.rent_price);
      }
    });
    const potentialRevenue = Array.from(propRentMap.values()).reduce((sum, r) => sum + r, 0);

    // Today's showings
    const todayCount = showings.filter((s) => {
      try { return isToday(parseISO(s.scheduled_at)); } catch { return false; }
    }).length;

    // Confirmed rate
    const confirmed = showings.filter((s) => s.status === "confirmed").length;
    const confirmRate = showings.length > 0 ? Math.round((confirmed / showings.length) * 100) : 0;

    return {
      total: showings.length,
      uniqueLeads: uniqueLeads.size,
      uniqueProps: uniqueProps.size,
      potentialRevenue,
      todayCount,
      confirmRate,
    };
  }, [showings]);

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
    status === "scheduled" || status === "confirmed";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Showings
          </h1>
          <p className="text-muted-foreground">
            Manage property showings and appointments
          </p>
        </div>
        <Button
          onClick={() => setScheduleDialogOpen(true)}
          className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
        >
          <Plus className="h-4 w-4 mr-2" />
          Schedule Showing
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
          {/* ── KPI Bubbles ──────────────────────────────────────────── */}
          {!loading && showings.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <CalendarDays className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-indigo-700">{metrics.total}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Total Showings</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-violet-700">{metrics.uniqueLeads}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Unique Leads</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Home className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-700">{metrics.uniqueProps}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Properties</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-700">
                      ${metrics.potentialRevenue.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Rent Potential/mo</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-teal-50 to-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-teal-700">{metrics.confirmRate}%</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">Confirmed Rate</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Filters ──────────────────────────────────────────────── */}
          <div className="glass-card rounded-xl p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
                  <Calendar className="h-4 w-4 mr-2" />
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
                <SelectTrigger className="w-full sm:w-56 min-h-[44px]">
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
            </div>
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
            <div className="space-y-6">
              {groupedByDay.map((group) => (
                <div key={group.dateKey}>
                  {/* Day header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-[#370d4b]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-[#370d4b]">
                        {format(parseISO(group.dateKey), "d")}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {group.label}
                    </h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {group.showings.length} showing{group.showings.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {/* Showing cards for this day */}
                  <div className="space-y-2 pl-2 border-l-2 border-[#370d4b]/10 ml-4">
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
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            {/* Time */}
                            <div className="flex items-center gap-2 sm:w-24 shrink-0">
                              <div className="text-right">
                                <p className="font-semibold text-sm">
                                  {format(parseISO(showing.scheduled_at), "h:mm a")}
                                </p>
                                {showing.duration_minutes && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {showing.duration_minutes} min
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              {showing.property_address && (
                                <p className="font-medium text-sm flex items-center gap-1 truncate">
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  {showing.property_address}
                                  {showing.property_city && `, ${showing.property_city}`}
                                  {showing.rent_price && (
                                    <span className="text-emerald-600 text-xs font-normal ml-1">
                                      ${showing.rent_price.toLocaleString()}/mo
                                    </span>
                                  )}
                                </p>
                              )}
                              {showing.lead_name && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <User className="h-3 w-3" />
                                  {showing.lead_name}
                                  {showing.lead_phone && ` · ${showing.lead_phone}`}
                                </p>
                              )}
                            </div>

                            {/* Actions + Status */}
                            <div className="flex items-center gap-2">
                              {canSubmitReport(showing.status) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={(e) => handleOpenReport(e, showing)}
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1" />
                                  Report
                                </Button>
                              )}
                              <Badge
                                className={
                                  statusColors[showing.status] || "bg-muted text-muted-foreground"
                                }
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
              ))}
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
            <ManageSlotsTab />

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
