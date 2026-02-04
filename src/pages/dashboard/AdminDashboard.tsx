import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { PriorityLeadCard, PriorityLeadCardSkeleton } from "@/components/dashboard/PriorityLeadCard";
import { ShowingCard, ShowingCardSkeleton } from "@/components/dashboard/ShowingCard";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/dashboard/ActivityFeed";
import VoiceQualityWidget from "@/components/dashboard/VoiceQualityWidget";
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
  Building,
  Users,
  Calendar,
  TrendingUp,
  Bell,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalProperties: number;
  propertiesByStatus: Record<string, number>;
  activeLeads: number;
  newLeadsThisWeek: number;
  showingsToday: number;
  conversionRate: number;
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

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userRecord?.organization_id) return;

      try {
        const today = new Date();
        const todayStart = startOfDay(today).toISOString();
        const todayEnd = endOfDay(today).toISOString();

        // Single RPC for all stats + parallel queries for list data
        const [
          summaryResult,
          showingsTodayResult,
          priorityLeadsResult,
          alertsResult,
          recentCallsResult,
        ] = await Promise.all([
          // Single RPC replaces 8 parallel queries for stats
          supabase.rpc('get_dashboard_summary'),
          // Keep list queries for UI cards
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
        ]);

        // Map RPC response to stats state
        const summary = summaryResult.data as {
          properties: { total: number; available: number; coming_soon: number; in_leasing: number; rented: number };
          leads: { active: number; new_this_week: number; converted_this_month: number; total_this_month: number };
          showings: { today: number };
          conversion_rate: number;
        } | null;

        if (summary) {
          setStats({
            totalProperties: summary.properties.total,
            propertiesByStatus: {
              available: summary.properties.available,
              coming_soon: summary.properties.coming_soon,
              in_leasing_process: summary.properties.in_leasing,
              rented: summary.properties.rented,
            },
            activeLeads: summary.leads.active,
            newLeadsThisWeek: summary.leads.new_this_week,
            showingsToday: summary.showings.today,
            conversionRate: summary.conversion_rate,
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
    <div className="space-y-6">
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

      {/* Stats Grid */}
      {isWidgetVisible("stats_cards") && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="animate-fade-up stagger-1">
            <StatCard
              title="Total Properties"
              value={stats?.totalProperties || 0}
              subtitle={`${stats?.propertiesByStatus?.available || 0} available`}
              icon={Building}
              impact={stats?.propertiesByStatus?.available && stats.propertiesByStatus.available > 5 ? "high" : "medium"}
              loading={loading}
            />
          </div>
          <div className="animate-fade-up stagger-2">
            <StatCard
              title="Active Leads"
              value={stats?.activeLeads || 0}
              subtitle="this week"
              icon={Users}
              trend={stats?.newLeadsThisWeek ? { value: stats.newLeadsThisWeek, isPositive: true } : undefined}
              impact={stats?.activeLeads && stats.activeLeads > 20 ? "high" : stats?.activeLeads && stats.activeLeads > 10 ? "medium" : "low"}
              loading={loading}
            />
          </div>
          <div className="animate-fade-up stagger-3">
            <StatCard
              title="Showings Today"
              value={stats?.showingsToday || 0}
              subtitle={format(new Date(), "EEEE, MMM d")}
              icon={Calendar}
              loading={loading}
            />
          </div>
          <div className="animate-fade-up stagger-4">
            <StatCard
              title="Conversion Rate"
              value={`${stats?.conversionRate || 0}%`}
              subtitle="This month"
              icon={TrendingUp}
              impact={stats?.conversionRate && stats.conversionRate >= 15 ? "high" : stats?.conversionRate && stats.conversionRate >= 8 ? "medium" : "low"}
              loading={loading}
            />
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
                            <p className="text-sm text-muted-foreground text-center py-8">
                              All leads are progressing normally. Priority leads will appear here when a lead scores 85+.
                            </p>
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
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <p className="text-sm text-muted-foreground mb-3">
                                No showings scheduled for today.
                              </p>
                              <Button
                                size="sm"
                                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                                onClick={() => navigate("/showings")}
                              >
                                Schedule Showing
                              </Button>
                            </div>
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
                            <p className="text-sm text-muted-foreground text-center py-8">
                              No unread alerts.
                            </p>
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
  );
};
