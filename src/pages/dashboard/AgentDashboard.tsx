import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { PriorityLeadCard, PriorityLeadCardSkeleton } from "@/components/dashboard/PriorityLeadCard";
import { DailyRouteCard } from "@/components/showings/DailyRouteCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Users,
  CheckCircle,
  DollarSign,
  ChevronRight,
  FileText,
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AgentStats {
  showingsToday: number;
  showingsThisMonth: number;
  completedThisMonth: number;
  assignedLeads: number;
  commissionEarned?: number;
}

interface TodayShowing {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  property: {
    address: string;
    unit_number: string | null;
    city: string;
    bedrooms: number;
    bathrooms: number;
    rent_price: number;
  } | null;
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    lead_score: number | null;
    is_priority: boolean | null;
  } | null;
}

interface AssignedLead {
  id: string;
  full_name: string | null;
  phone: string;
  lead_score: number | null;
  status: string;
  priority_reason: string | null;
  is_human_controlled: boolean | null;
  property_address?: string;
}

interface RecentReport {
  id: string;
  property_address: string;
  scheduled_at: string;
  prospect_interest_level: string | null;
  completed_at: string | null;
}

export const AgentDashboard = () => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [todayShowings, setTodayShowings] = useState<TodayShowing[]>([]);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLead[]>([]);
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);

  useEffect(() => {
    const fetchAgentData = async () => {
      if (!userRecord?.id || !userRecord?.organization_id) return;

      try {
        const today = new Date();
        const todayStart = startOfDay(today).toISOString();
        const todayEnd = endOfDay(today).toISOString();
        const monthStart = startOfMonth(today).toISOString();
        const monthEnd = endOfMonth(today).toISOString();

        // Fetch all data in parallel
        const [
          showingsTodayResult,
          showingsMonthResult,
          assignedLeadsResult,
          recentReportsResult,
        ] = await Promise.all([
          // Today's showings assigned to this agent
          supabase
            .from("showings")
            .select(`
              id, scheduled_at, status, duration_minutes,
              properties:property_id (address, unit_number, city, bedrooms, bathrooms, rent_price),
              leads:lead_id (id, full_name, phone, lead_score, is_priority)
            `)
            .eq("organization_id", userRecord.organization_id)
            .eq("leasing_agent_id", userRecord.id)
            .gte("scheduled_at", todayStart)
            .lte("scheduled_at", todayEnd)
            .order("scheduled_at", { ascending: true }),
          // Month's showings for stats
          supabase
            .from("showings")
            .select("id, status")
            .eq("organization_id", userRecord.organization_id)
            .eq("leasing_agent_id", userRecord.id)
            .gte("scheduled_at", monthStart)
            .lte("scheduled_at", monthEnd),
          // Assigned leads that need attention
          supabase
            .from("leads")
            .select(`
              id, full_name, phone, lead_score, status, priority_reason, is_human_controlled,
              properties(address)
            `)
            .eq("organization_id", userRecord.organization_id)
            .eq("assigned_leasing_agent_id", userRecord.id)
            .in("status", ["nurturing", "qualified", "engaged"])
            .order("lead_score", { ascending: false })
            .limit(5),
          // Recent completed showings with reports
          supabase
            .from("showings")
            .select(`
              id, scheduled_at, prospect_interest_level, completed_at, agent_report,
              properties(address)
            `)
            .eq("organization_id", userRecord.organization_id)
            .eq("leasing_agent_id", userRecord.id)
            .eq("status", "completed")
            .not("agent_report", "is", null)
            .order("completed_at", { ascending: false })
            .limit(5),
        ]);

        // Calculate stats
        const showingsMonth = showingsMonthResult.data || [];
        const completedThisMonth = showingsMonth.filter(
          (s) => s.status === "completed"
        ).length;

        setStats({
          showingsToday: showingsTodayResult.data?.length || 0,
          showingsThisMonth: showingsMonth.length,
          completedThisMonth,
          assignedLeads: assignedLeadsResult.data?.length || 0,
          commissionEarned: userRecord.commission_rate
            ? completedThisMonth * 50 // Placeholder calculation
            : undefined,
        });

        // Process today's showings for route card
        setTodayShowings(
          (showingsTodayResult.data || []).map((s: any) => ({
            id: s.id,
            scheduled_at: s.scheduled_at,
            status: s.status,
            duration_minutes: s.duration_minutes,
            property: s.properties,
            lead: s.leads ? {
              id: s.leads.id,
              full_name: s.leads.full_name,
              phone: s.leads.phone,
              lead_score: s.leads.lead_score,
              is_priority: s.leads.is_priority,
            } : null,
          }))
        );

        // Process assigned leads
        setAssignedLeads(
          (assignedLeadsResult.data || []).map((l: any) => ({
            id: l.id,
            full_name: l.full_name,
            phone: l.phone,
            lead_score: l.lead_score,
            status: l.status,
            priority_reason: l.priority_reason,
            is_human_controlled: l.is_human_controlled,
            property_address: l.properties?.address,
          }))
        );

        // Process recent reports
        setRecentReports(
          (recentReportsResult.data || []).map((r: any) => ({
            id: r.id,
            property_address: r.properties?.address || "Unknown",
            scheduled_at: r.scheduled_at,
            prospect_interest_level: r.prospect_interest_level,
            completed_at: r.completed_at,
          }))
        );

      } catch (error) {
        console.error("Error fetching agent data:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchAgentData();
  }, [userRecord?.id, userRecord?.organization_id, userRecord?.commission_rate]);

  // Refresh function for route card
  const refreshShowings = () => {
    // Refetch data by triggering useEffect
    if (userRecord?.id && userRecord?.organization_id) {
      setLoading(true);
      // This will trigger the useEffect
      setTodayShowings([]);
    }
  };

  const handleGetDirections = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
  };

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

      setAssignedLeads((prev) =>
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

  const getInterestBadge = (level: string | null) => {
    switch (level) {
      case "high":
        return <Badge className="bg-green-500">High Interest</Badge>;
      case "medium":
        return <Badge className="bg-amber-500">Medium Interest</Badge>;
      case "low":
        return <Badge variant="secondary">Low Interest</Badge>;
      case "not_interested":
        return <Badge variant="destructive">Not Interested</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {userRecord?.full_name?.split(" ")[0] || "Agent"}
        </h1>
        <p className="text-muted-foreground">
          Here's your schedule and tasks for today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Showings Today"
          value={stats?.showingsToday || 0}
          subtitle={format(new Date(), "EEEE, MMM d")}
          icon={Calendar}
          loading={loading}
        />
        <StatCard
          title="This Month"
          value={stats?.showingsThisMonth || 0}
          subtitle="Total showings"
          icon={Calendar}
          loading={loading}
        />
        <StatCard
          title="Completed"
          value={stats?.completedThisMonth || 0}
          subtitle="This month"
          icon={CheckCircle}
          loading={loading}
        />
        {stats?.commissionEarned !== undefined ? (
          <StatCard
            title="Commission"
            value={`$${stats.commissionEarned.toLocaleString()}`}
            subtitle="Estimated this month"
            icon={DollarSign}
            loading={loading}
          />
        ) : (
          <StatCard
            title="Assigned Leads"
            value={stats?.assignedLeads || 0}
            subtitle="Requiring attention"
            icon={Users}
            loading={loading}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Route */}
        <DailyRouteCard
          showings={todayShowings}
          loading={loading}
          onRefresh={refreshShowings}
        />

        {/* Assigned Leads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Leads Requiring Attention</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/leads")}
            >
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[450px]">
              <div className="space-y-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <PriorityLeadCardSkeleton key={i} />
                  ))
                ) : assignedLeads.length > 0 ? (
                  assignedLeads.map((lead) => (
                    <PriorityLeadCard
                      key={lead.id}
                      lead={lead}
                      onTakeControl={handleTakeControl}
                    />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No leads requiring immediate attention.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Reports */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Recent Showing Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-1">
                      <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-24 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : recentReports.length > 0 ? (
              <div className="space-y-3">
                {recentReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{report.property_address}</p>
                        <p className="text-xs text-muted-foreground">
                          {report.completed_at
                            ? format(new Date(report.completed_at), "MMM d, yyyy h:mm a")
                            : format(new Date(report.scheduled_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    {getInterestBadge(report.prospect_interest_level)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  No showing reports submitted yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
