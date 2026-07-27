import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { AssignedLeadCard, AssignedLeadCardSkeleton } from "@/components/dashboard/AssignedLeadCard";
import { HumanTakeoverModal } from "@/components/leads/HumanTakeoverModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Users,
  CheckCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AgentStats {
  showingsToday: number;
  showingsThisMonth: number;
  completedThisMonth: number;
  assignedLeads: number;
}

interface AssignedLead {
  id: string;
  full_name: string | null;
  phone: string;
  status: string;
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

// Cleveland day/month windows (DST-aware) — never the browser's local timezone.
const ORG_TZ = "America/New_York";

function clevelandWindows() {
  const now = new Date();
  const clevNow = new Date(now.toLocaleString("en-US", { timeZone: ORG_TZ }));
  const offset = now.getTime() - clevNow.getTime();

  const dayStart = new Date(clevNow);
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(clevNow.getFullYear(), clevNow.getMonth(), 1);
  const nextMonthStart = new Date(clevNow.getFullYear(), clevNow.getMonth() + 1, 1);

  return {
    todayStart: new Date(dayStart.getTime() + offset).toISOString(),
    todayEnd: new Date(dayStart.getTime() + 86_400_000 - 1 + offset).toISOString(),
    monthStart: new Date(monthStart.getTime() + offset).toISOString(),
    monthEnd: new Date(nextMonthStart.getTime() - 1 + offset).toISOString(),
  };
}

export const AgentDashboard = () => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [assignedLeads, setAssignedLeads] = useState<AssignedLead[]>([]);
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);
  // Lead pending manual takeover — routes through the canonical HumanTakeoverModal
  const [takeoverLead, setTakeoverLead] = useState<AssignedLead | null>(null);

  const fetchAgentData = useCallback(async () => {
      if (!userRecord?.id || !userRecord?.organization_id) return;

      setLoading(true);

      try {
        const { todayStart, todayEnd, monthStart, monthEnd } = clevelandWindows();

        // Fetch all data in parallel
        const [
          showingsTodayResult,
          showingsMonthResult,
          assignedLeadsResult,
          assignedCountResult,
          recentReportsResult,
        ] = await Promise.all([
          // Today's showings assigned to this agent (count only).
          // Exclude cancelled/no_show/rescheduled + demo rows, matching the
          // admin dashboard_live() definition — otherwise a day with 3
          // cancellations + 1 real tour would read "Showings Today: 4".
          supabase
            .from("showings")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id)
            .eq("leasing_agent_id", userRecord.id)
            .not("status", "in", '("cancelled","no_show","rescheduled")')
            .not("is_demo", "is", true)
            .gte("scheduled_at", todayStart)
            .lte("scheduled_at", todayEnd),
          // Month's showings for stats (same exclusion set as above; "completed"
          // is still included, so completedThisMonth below is unaffected)
          supabase
            .from("showings")
            .select("id, status")
            .eq("organization_id", userRecord.organization_id)
            .eq("leasing_agent_id", userRecord.id)
            .not("status", "in", '("cancelled","no_show","rescheduled")')
            .not("is_demo", "is", true)
            .gte("scheduled_at", monthStart)
            .lte("scheduled_at", monthEnd),
          // Assigned leads that need attention (top 5 for the card list)
          supabase
            .from("leads")
            .select(`
              id, full_name, phone, status, is_human_controlled,
              lead_property_interests(last_interest_at, properties(address))
            `)
            .eq("organization_id", userRecord.organization_id)
            .eq("assigned_leasing_agent_id", userRecord.id)
            .in("status", ["nurturing", "qualified", "engaged"])
            .order("created_at", { ascending: false })
            .limit(5),
          // TOTAL assigned-leads count — the stat must not be capped by the
          // list's .limit(5)
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id)
            .eq("assigned_leasing_agent_id", userRecord.id)
            .in("status", ["nurturing", "qualified", "engaged"]),
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
          showingsToday: showingsTodayResult.count || 0,
          showingsThisMonth: showingsMonth.length,
          completedThisMonth,
          assignedLeads: assignedCountResult.count || 0,
        });

        // Process assigned leads (address = most recent property-interest tag)
        setAssignedLeads(
          (assignedLeadsResult.data || []).map((l: any) => {
            const latestTag = [...(l.lead_property_interests || [])].sort(
              (a: any, b: any) =>
                (b.last_interest_at || "").localeCompare(a.last_interest_at || "")
            )[0];
            return {
              id: l.id,
              full_name: l.full_name,
              phone: l.phone,
              status: l.status,
              is_human_controlled: l.is_human_controlled,
              property_address: latestTag?.properties?.address,
            };
          })
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
  }, [userRecord?.id, userRecord?.organization_id]);

  useEffect(() => {
    fetchAgentData();
  }, [fetchAgentData]);

  // Open the canonical takeover flow (mandatory 20-char reason + pause RPC)
  const handleTakeControl = (leadId: string) => {
    const lead = assignedLeads.find((l) => l.id === leadId);
    if (lead) setTakeoverLead(lead);
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
        <StatCard
          title="Assigned Leads"
          value={stats?.assignedLeads || 0}
          subtitle="Requiring attention"
          icon={Users}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
                    <AssignedLeadCardSkeleton key={i} />
                  ))
                ) : assignedLeads.length > 0 ? (
                  assignedLeads.map((lead) => (
                    <AssignedLeadCard
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

        {/* Recent Reports — sits beside "Leads Requiring Attention" on lg+
            (no col-span, so the two cards share the row instead of leaving a
            blank half-width column next to the leads card) */}
        <Card variant="glass">
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

      {/* Canonical takeover flow: >=20-char reason + pause_lead_agent_tasks RPC */}
      {takeoverLead && (
        <HumanTakeoverModal
          open={!!takeoverLead}
          onOpenChange={(open) => { if (!open) setTakeoverLead(null); }}
          leadId={takeoverLead.id}
          leadName={takeoverLead.full_name || "Unknown"}
          onSuccess={() => {
            setAssignedLeads((prev) =>
              prev.map((l) =>
                l.id === takeoverLead.id ? { ...l, is_human_controlled: true } : l
              )
            );
            setTakeoverLead(null);
          }}
        />
      )}
    </div>
  );
};
