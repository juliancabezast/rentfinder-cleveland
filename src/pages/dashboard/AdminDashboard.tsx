import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { PriorityLeadCard, PriorityLeadCardSkeleton } from "@/components/dashboard/PriorityLeadCard";
import { ShowingCard, ShowingCardSkeleton } from "@/components/dashboard/ShowingCard";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/dashboard/ActivityFeed";
import { IntegrationHealth } from "@/components/dashboard/IntegrationHealth";
import VoiceQualityWidget from "@/components/dashboard/VoiceQualityWidget";
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
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userRecord?.organization_id) return;

      try {
        const today = new Date();
        const todayStart = startOfDay(today).toISOString();
        const todayEnd = endOfDay(today).toISOString();
        const weekStart = startOfWeek(today).toISOString();
        const monthStart = startOfMonth(today).toISOString();
        const monthEnd = endOfMonth(today).toISOString();

        // Fetch all data in parallel
        const [
          propertiesResult,
          leadsResult,
          newLeadsResult,
          showingsTodayResult,
          priorityLeadsResult,
          alertsResult,
          recentCallsResult,
          convertedResult,
        ] = await Promise.all([
          // Properties count by status
          supabase
            .from("properties")
            .select("status")
            .eq("organization_id", userRecord.organization_id),
          // Active leads count
          supabase
            .from("leads")
            .select("id", { count: "exact" })
            .eq("organization_id", userRecord.organization_id)
            .not("status", "in", '("lost","converted")'),
          // New leads this week
          supabase
            .from("leads")
            .select("id", { count: "exact" })
            .eq("organization_id", userRecord.organization_id)
            .gte("created_at", weekStart),
          // Showings today
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
          // Priority leads
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
          // Unread alerts
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
          // Recent calls for activity feed
          supabase
            .from("calls")
            .select("id, started_at, direction, status, phone_number")
            .eq("organization_id", userRecord.organization_id)
            .order("started_at", { ascending: false })
            .limit(10),
          // Converted leads this month for conversion rate
          supabase
            .from("leads")
            .select("id", { count: "exact" })
            .eq("organization_id", userRecord.organization_id)
            .eq("status", "converted")
            .gte("updated_at", monthStart)
            .lte("updated_at", monthEnd),
        ]);

        // Process properties by status
        const propertiesByStatus: Record<string, number> = {};
        (propertiesResult.data || []).forEach((p) => {
          propertiesByStatus[p.status] = (propertiesByStatus[p.status] || 0) + 1;
        });

        // Calculate conversion rate
        const totalLeadsMonth = (newLeadsResult.count || 0);
        const convertedMonth = (convertedResult.count || 0);
        const conversionRate = totalLeadsMonth > 0
          ? Math.round((convertedMonth / totalLeadsMonth) * 100)
          : 0;

        setStats({
          totalProperties: propertiesResult.data?.length || 0,
          propertiesByStatus,
          activeLeads: leadsResult.count || 0,
          newLeadsThisWeek: newLeadsResult.count || 0,
          showingsToday: showingsTodayResult.data?.length || 0,
          conversionRate,
        });

        // Process today's showings
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

        // Process priority leads
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

        // Process alerts
        setAlerts(
          (alertsResult.data || []).map((a: any) => ({
            id: a.id,
            message: a.message,
            alert_type: a.alert_type,
            created_at: a.created_at,
            property_address: a.properties?.address,
          }))
        );

        // Process activity feed from calls
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
      {/* Welcome Header - Modern greeting */}
      <DashboardGreeting />

      {/* Stats Grid - With stagger animations */}
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

      {/* Integration Health Widget */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-up stagger-5">
          <IntegrationHealth />
        </div>
        <div className="animate-fade-up stagger-6">
          <VoiceQualityWidget />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Priority Leads */}
        <Card variant="glass">
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
                    No priority leads at the moment.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Today's Showings */}
        <Card variant="glass">
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
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No showings scheduled for today.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Property Alerts */}
        <Card variant="glass">
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

        {/* Activity Feed */}
        {loading ? (
          <ActivityFeedSkeleton />
        ) : (
          <ActivityFeed activities={activities} />
        )}
      </div>
    </div>
  );
};
