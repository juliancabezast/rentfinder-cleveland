import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { PriorityLeadCard, PriorityLeadCardSkeleton } from "@/components/dashboard/PriorityLeadCard";
import { ShowingCard, ShowingCardSkeleton } from "@/components/dashboard/ShowingCard";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/dashboard/ActivityFeed";
import { VoiceQualityWidget } from "@/components/dashboard/VoiceQualityWidget";
import {
  DashboardCustomizer,
  DashboardPrefs,
  DASHBOARD_WIDGETS,
  loadDashboardPrefs,
  saveDashboardPrefs,
  getDefaultPrefs,
} from "@/components/dashboard/DashboardCustomizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DoorOpen,
  Users,
  UserPlus,
  Calendar,
  Bell,
  ChevronRight,
  Settings2,
  Zap,
  MessageSquare,
  Mail,
  Inbox,
  Flame,
  Phone,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RealTimeAgentPanel } from "@/components/dashboard/RealTimeAgentPanel";

type StatsPeriod = 'day' | 'week' | 'month' | 'total';

interface DashboardStats {
  totalDoors: number;
  totalDistinctProperties: number;
  propertiesByStatus: Record<string, number>;
  activeLeads: number;
  newLeadsThisWeek: number;
  totalLeads: number;
  leadsToday: number;
  hotLeads: number;
}

interface Row2Stats {
  smsSent: number;
  emailsSent: number;
  emailsParsed: number;
  callsMade: number;
  callMinutes: number;
}

interface PriorityLead {
  id: string;
  full_name: string | null;
  phone: string;
  lead_score: number | null;
  priority_reason: string | null;
  status: string;
  is_human_controlled: boolean | null;
  property_address?: string;
}

interface TodayShowing {
  id: string;
  scheduled_at: string;
  status: string;
  property_address?: string;
  lead_name?: string;
  lead_phone?: string;
  duration_minutes?: number;
}

interface PropertyAlert {
  id: string;
  message: string;
  alert_type: string;
  created_at: string;
  property_address?: string;
}

export const AdminDashboard = () => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [row2Stats, setRow2Stats] = useState<Row2Stats | null>(null);
  const [row2Loading, setRow2Loading] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('week');
  const [priorityLeads, setPriorityLeads] = useState<PriorityLead[]>([]);
  const [todayShowings, setTodayShowings] = useState<TodayShowing[]>([]);
  const [alerts, setAlerts] = useState<PropertyAlert[]>([]);
  const [activities, setActivities] = useState<Array<{
    id: string;
    type: "call" | "showing_scheduled" | "showing_completed" | "lead_created" | "sms_sent";
    title: string;
    description?: string;
    timestamp: string;
  }>>([]);

  // Dashboard customization state
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [prefs, setPrefs] = useState<DashboardPrefs>(getDefaultPrefs());

  // Load preferences on mount
  useEffect(() => {
    if (userRecord?.id) {
      setPrefs(loadDashboardPrefs(userRecord.id));
    }
  }, [userRecord?.id]);

  // Save preferences when they change
  const handlePrefsChange = (newPrefs: DashboardPrefs) => {
    setPrefs(newPrefs);
    if (userRecord?.id) {
      saveDashboardPrefs(userRecord.id, newPrefs);
    }
  };

  const handleResetPrefs = () => {
    const defaults = getDefaultPrefs();
    setPrefs(defaults);
    if (userRecord?.id) {
      saveDashboardPrefs(userRecord.id, defaults);
    }
    toast.success("Dashboard reset to defaults");
  };

  const isWidgetVisible = (widgetId: string) => {
    return prefs.widgets.find((w) => w.id === widgetId)?.visible ?? true;
  };

  // ── Row 1 + list data (runs once) ──
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userRecord?.organization_id) return;

      try {
        const today = new Date();
        const todayStart = startOfDay(today).toISOString();
        const todayEnd = endOfDay(today).toISOString();

        const [
          summaryResult,
          showingsTodayResult,
          priorityLeadsResult,
          alertsResult,
          recentCallsResult,
          totalLeadsResult,
          leadsTodayResult,
          hotLeadsResult,
          propertiesResult,
        ] = await Promise.all([
          supabase.rpc('get_dashboard_summary'),
          supabase
            .from("showings")
            .select(`
              id, scheduled_at, status, duration_minutes,
              properties(address, city),
              leads(full_name, phone)
            `)
            .eq("organization_id", userRecord.organization_id)
            .gte("scheduled_at", todayStart)
            .lte("scheduled_at", todayEnd)
            .order("scheduled_at", { ascending: true }),
          supabase
            .from("leads")
            .select(`
              id, full_name, phone, lead_score, priority_reason, status, is_human_controlled,
              properties(address)
            `)
            .eq("organization_id", userRecord.organization_id)
            .eq("is_priority", true)
            .not("status", "in", '("lost","converted")')
            .order("lead_score", { ascending: false })
            .limit(5),
          supabase
            .from("property_alerts")
            .select(`
              id, message, alert_type, created_at,
              properties(address)
            `)
            .eq("organization_id", userRecord.organization_id)
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("calls")
            .select("id, started_at, direction, status, phone_number")
            .eq("organization_id", userRecord.organization_id)
            .order("started_at", { ascending: false })
            .limit(10),
          // Row 1 stat queries
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id)
            .gte("created_at", todayStart),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id)
            .gte("lead_score", 80)
            .not("status", "in", '("lost","converted")'),
          // Properties for distinct count
          supabase
            .from("properties")
            .select("address, city, zip_code")
            .eq("organization_id", userRecord.organization_id),
        ]);

        const summary = summaryResult.data as {
          properties: { total: number; available: number; coming_soon: number; in_leasing: number; rented: number };
          leads: { active: number; new_this_week: number; converted_this_month: number; total_this_month: number };
          showings: { today: number };
          conversion_rate: number;
        } | null;

        // Count distinct properties (unique address+city+zip combos)
        const allProps = propertiesResult.data || [];
        const distinctSet = new Set(allProps.map((p: any) => `${p.address}|${p.city}|${p.zip_code}`));

        if (summary) {
          setStats({
            totalDoors: summary.properties.total,
            totalDistinctProperties: distinctSet.size,
            propertiesByStatus: {
              available: summary.properties.available,
              coming_soon: summary.properties.coming_soon,
              in_leasing_process: summary.properties.in_leasing,
              rented: summary.properties.rented,
            },
            activeLeads: summary.leads.active,
            newLeadsThisWeek: summary.leads.new_this_week,
            totalLeads: totalLeadsResult.count || 0,
            leadsToday: leadsTodayResult.count || 0,
            hotLeads: hotLeadsResult.count || 0,
          });
        }

        setTodayShowings(
          (showingsTodayResult.data || []).map((s: any) => ({
            id: s.id,
            scheduled_at: s.scheduled_at,
            status: s.status,
            duration_minutes: s.duration_minutes,
            property_address: s.properties
              ? `${s.properties.address}, ${s.properties.city}`
              : undefined,
            lead_name: s.leads?.full_name,
            lead_phone: s.leads?.phone,
          }))
        );

        setPriorityLeads(
          (priorityLeadsResult.data || []).map((l: any) => ({
            id: l.id,
            full_name: l.full_name,
            phone: l.phone,
            lead_score: l.lead_score,
            priority_reason: l.priority_reason,
            status: l.status,
            is_human_controlled: l.is_human_controlled,
            property_address: l.properties?.address,
          }))
        );

        setAlerts(
          (alertsResult.data || []).map((a: any) => ({
            id: a.id,
            message: a.message,
            alert_type: a.alert_type,
            created_at: a.created_at,
            property_address: a.properties?.address,
          }))
        );

        setActivities(
          (recentCallsResult.data || []).map((c: any) => ({
            id: c.id,
            type: "call" as const,
            title: `${c.direction === "inbound" ? "Inbound" : "Outbound"} call`,
            description: `${c.phone_number} - ${c.status}`,
            timestamp: c.started_at,
          }))
        );

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [userRecord?.organization_id]);

  // ── Row 2 stats (re-runs when period changes) ──
  useEffect(() => {
    const fetchRow2 = async () => {
      if (!userRecord?.organization_id) return;
      setRow2Loading(true);

      try {
        const now = new Date();
        let periodStart: string | null = null;
        if (statsPeriod === 'day') periodStart = startOfDay(now).toISOString();
        else if (statsPeriod === 'week') periodStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
        else if (statsPeriod === 'month') periodStart = startOfMonth(now).toISOString();

        // Build filtered queries
        let smsQuery = supabase
          .from("communications")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .eq("channel", "sms")
          .eq("direction", "outbound");
        if (periodStart) smsQuery = smsQuery.gte("created_at", periodStart);

        let emailQuery = supabase
          .from("communications")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .eq("channel", "email")
          .eq("direction", "outbound");
        if (periodStart) emailQuery = emailQuery.gte("created_at", periodStart);

        let parsedQuery = supabase
          .from("system_logs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .eq("event_type", "esther_lead_processed");
        if (periodStart) parsedQuery = parsedQuery.gte("created_at", periodStart);

        let callsQuery = supabase
          .from("calls")
          .select("duration_seconds")
          .eq("organization_id", userRecord.organization_id);
        if (periodStart) callsQuery = callsQuery.gte("started_at", periodStart);

        const [smsRes, emailRes, parsedRes, callsRes] = await Promise.all([
          smsQuery, emailQuery, parsedQuery, callsQuery,
        ]);

        const callRows = callsRes.data || [];
        const totalSeconds = callRows.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);

        setRow2Stats({
          smsSent: smsRes.count || 0,
          emailsSent: emailRes.count || 0,
          emailsParsed: parsedRes.count || 0,
          callsMade: callRows.length,
          callMinutes: Math.round(totalSeconds / 60),
        });
      } catch (error) {
        console.error("Error fetching row 2 stats:", error);
      } finally {
        setRow2Loading(false);
      }
    };

    fetchRow2();
  }, [userRecord?.organization_id, statsPeriod]);

  const handleTakeControl = async (leadId: string) => {
    if (!userRecord) return;

    try {
      const { error } = await supabase
        .from("leads")
        .update({
          is_human_controlled: true,
          human_controlled_by: userRecord.id,
          human_controlled_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      if (error) throw error;

      setPriorityLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, is_human_controlled: true } : l
        )
      );
      toast.success("You've taken control of this lead");
    } catch (error) {
      console.error("Error taking control:", error);
      toast.error("Failed to take control of lead");
    }
  };

  const handleMarkAlertRead = async (alertId: string) => {
    if (!userRecord) return;

    try {
      await supabase
        .from("property_alerts")
        .update({
          is_read: true,
          read_by: userRecord.id,
          read_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (error) {
      console.error("Error marking alert read:", error);
    }
  };


  return (
    <div className="flex gap-6">
      {/* Main Dashboard Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Welcome Header with Customize Button */}
        <div className="flex items-start justify-between gap-4">
          <DashboardGreeting />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowCustomizer(true)}
            className="shrink-0"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats Grid — Row 1: Totals */}
        {isWidgetVisible("stats_cards") && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="animate-fade-up stagger-1">
                <StatCard
                  title="Total Doors"
                  value={stats?.totalDoors || 0}
                  subtitle={`${stats?.totalDistinctProperties || 0} properties`}
                  icon={DoorOpen}
                  impact={stats?.totalDoors && stats.totalDoors > 10 ? "high" : stats?.totalDoors && stats.totalDoors > 5 ? "medium" : "low"}
                  loading={loading}
                />
              </div>
              <div className="animate-fade-up stagger-2">
                <StatCard
                  title="Total Leads"
                  value={stats?.totalLeads || 0}
                  subtitle={`${stats?.activeLeads || 0} active`}
                  icon={Users}
                  trend={stats?.newLeadsThisWeek ? { value: stats.newLeadsThisWeek, isPositive: true } : undefined}
                  impact={stats?.totalLeads && stats.totalLeads > 20 ? "high" : stats?.totalLeads && stats.totalLeads > 10 ? "medium" : "low"}
                  loading={loading}
                />
              </div>
              <div className="animate-fade-up stagger-3">
                <StatCard
                  title="Leads Today"
                  value={stats?.leadsToday || 0}
                  subtitle={format(new Date(), "EEEE, MMM d")}
                  icon={UserPlus}
                  impact={stats?.leadsToday && stats.leadsToday > 0 ? "high" : undefined}
                  loading={loading}
                />
              </div>
              <div className="animate-fade-up stagger-4">
                <StatCard
                  title="Hot Leads"
                  value={stats?.hotLeads || 0}
                  subtitle="score 80+"
                  icon={Flame}
                  impact={stats?.hotLeads && stats.hotLeads > 0 ? "high" : stats?.hotLeads === 0 ? "low" : undefined}
                  loading={loading}
                />
              </div>
            </div>

            {/* Period Filter for Row 2 */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
              {([
                { key: 'day' as StatsPeriod, label: 'Hoy' },
                { key: 'week' as StatsPeriod, label: 'Semana' },
                { key: 'month' as StatsPeriod, label: 'Mes' },
                { key: 'total' as StatsPeriod, label: 'Total' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatsPeriod(key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    statsPeriod === key
                      ? "bg-white text-[#370d4b] shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Stats Grid — Row 2: Activity (filtered by period) */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="animate-fade-up stagger-5">
                <StatCard
                  title="Mensajes Enviados"
                  value={row2Stats?.smsSent || 0}
                  subtitle="SMS outbound"
                  icon={MessageSquare}
                  impact={row2Stats?.smsSent && row2Stats.smsSent > 50 ? "high" : row2Stats?.smsSent && row2Stats.smsSent > 10 ? "medium" : undefined}
                  loading={loading || row2Loading}
                />
              </div>
              <div className="animate-fade-up stagger-6">
                <StatCard
                  title="Correos Enviados"
                  value={row2Stats?.emailsSent || 0}
                  subtitle="emails outbound"
                  icon={Mail}
                  impact={row2Stats?.emailsSent && row2Stats.emailsSent > 50 ? "high" : row2Stats?.emailsSent && row2Stats.emailsSent > 10 ? "medium" : undefined}
                  loading={loading || row2Loading}
                />
              </div>
              <div className="animate-fade-up stagger-7">
                <StatCard
                  title="Emails Parseados"
                  value={row2Stats?.emailsParsed || 0}
                  subtitle="via Esther"
                  icon={Inbox}
                  impact={row2Stats?.emailsParsed && row2Stats.emailsParsed > 0 ? "medium" : undefined}
                  loading={loading || row2Loading}
                />
              </div>
              <div className="animate-fade-up stagger-8">
                <StatCard
                  title="Llamadas Hechas"
                  value={row2Stats?.callsMade || 0}
                  subtitle={`${row2Stats?.callMinutes || 0} min en llamada`}
                  icon={Phone}
                  impact={row2Stats?.callsMade && row2Stats.callsMade > 10 ? "high" : row2Stats?.callsMade && row2Stats.callsMade > 0 ? "medium" : undefined}
                  loading={loading || row2Loading}
                />
              </div>
            </div>
          </div>
        )}

        {/* Voice Quality Widget */}
        {isWidgetVisible("ai_agent_performance") && (
          <div className="animate-fade-up stagger-5">
            <VoiceQualityWidget />
          </div>
        )}

        {/* Main Widget Grid - auto-fill to avoid gaps */}
        {(() => {
          const widgetIds = ["priority_leads", "today_showings", "property_alerts", "recent_activity"];
          const visibleWidgets = widgetIds.filter((id) => isWidgetVisible(id));
          const visibleCount = visibleWidgets.length;

          if (visibleCount === 0) return null;

          // Build grid classes based on visible count
          const getGridClass = () => {
            if (visibleCount === 1) return "grid gap-6 grid-cols-1";
            return cn(
              "grid gap-6",
              prefs.layout === "comfortable"
                ? "grid-cols-1 lg:grid-cols-2"
                : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
            );
          };

          // Should last item span full width? (odd count, 2-column layout)
          const shouldLastSpanFull = visibleCount > 1 && visibleCount % 2 === 1 && prefs.layout === "comfortable";

          const renderWidget = (widgetId: string, isLast: boolean) => {
            const spanFull = isLast && shouldLastSpanFull;
            const wrapperClass = spanFull ? "lg:col-span-2" : "";

            switch (widgetId) {
              case "priority_leads":
                return (
                  <div key={widgetId} className={wrapperClass}>
                    <Card variant="glass" className="h-full">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Priority Leads</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate("/leads?filter=priority")}
                        >
                          View All <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-[400px]">
                          <div className="space-y-3">
                            {loading ? (
                              Array.from({ length: 3 }).map((_, i) => (
                                <PriorityLeadCardSkeleton key={i} />
                              ))
                            ) : priorityLeads.length > 0 ? (
                              priorityLeads.map((lead) => (
                                <PriorityLeadCard
                                  key={lead.id}
                                  lead={lead}
                                  onTakeControl={handleTakeControl}
                                />
                              ))
                            ) : (
                              <EmptyState
                                icon={Zap}
                                title="No priority leads"
                                description="Leads with score 85+ will appear here"
                                action={{ label: "View all leads", onClick: () => navigate("/leads") }}
                              />
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                );
              case "today_showings":
                return (
                  <div key={widgetId} className={wrapperClass}>
                    <Card variant="glass" className="h-full">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Today's Showings</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate("/showings")}
                        >
                          View All <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-[400px]">
                          <div className="space-y-3">
                            {loading ? (
                              Array.from({ length: 3 }).map((_, i) => (
                                <ShowingCardSkeleton key={i} variant="compact" />
                              ))
                            ) : todayShowings.length > 0 ? (
                              todayShowings.map((showing) => (
                                <ShowingCard
                                  key={showing.id}
                                  showing={showing}
                                  variant="compact"
                                />
                              ))
                            ) : (
                              <EmptyState
                                icon={Calendar}
                                title="No showings today"
                                description="Schedule a showing from the leads page"
                                action={{ label: "View showings", onClick: () => navigate("/showings") }}
                              />
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                );
              case "property_alerts":
                return (
                  <div key={widgetId} className={wrapperClass}>
                    <Card variant="glass" className="h-full">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Bell className="h-5 w-5" />
                          Property Alerts
                          {alerts.length > 0 && (
                            <Badge variant="destructive">{alerts.length}</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-[300px]">
                          <div className="space-y-3">
                            {loading ? (
                              Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                                  <div className="flex-1 space-y-1">
                                    <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                                    <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                                  </div>
                                </div>
                              ))
                            ) : alerts.length > 0 ? (
                              alerts.map((alert) => (
                                <div
                                  key={alert.id}
                                  className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50"
                                >
                                  <Bell className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{alert.message}</p>
                                    {alert.property_address && (
                                      <p className="text-xs text-muted-foreground truncate">
                                        {alert.property_address}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkAlertRead(alert.id)}
                                  >
                                    Dismiss
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <EmptyState
                                icon={Bell}
                                title="No unread alerts"
                                description="Property alerts will appear here"
                              />
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                );
              case "recent_activity":
                return (
                  <div key={widgetId} className={wrapperClass}>
                    {loading ? (
                      <ActivityFeedSkeleton />
                    ) : (
                      <ActivityFeed activities={activities} />
                    )}
                  </div>
                );
              default:
                return null;
            }
          };

          return (
            <div className={getGridClass()}>
              {visibleWidgets.map((widgetId, index) =>
                renderWidget(widgetId, index === visibleWidgets.length - 1)
              )}
            </div>
          );
        })()}

        {/* Dashboard Customizer Sheet */}
        <DashboardCustomizer
          open={showCustomizer}
          onOpenChange={setShowCustomizer}
          prefs={prefs}
          onPrefsChange={handlePrefsChange}
          onReset={handleResetPrefs}
        />
      </div>

      {/* Real-Time Agent Panel - Right Side */}
      <div className="hidden xl:block w-[380px] shrink-0">
        <div className="sticky top-4">
          <RealTimeAgentPanel />
        </div>
      </div>
    </div>
  );
};
