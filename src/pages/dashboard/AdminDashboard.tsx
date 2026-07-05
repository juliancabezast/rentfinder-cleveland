import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { PriorityLeadCard, PriorityLeadCardSkeleton } from "@/components/dashboard/PriorityLeadCard";
import { ShowingCard, ShowingCardSkeleton } from "@/components/dashboard/ShowingCard";


import { TopPropertiesWidget } from "@/components/dashboard/TopPropertiesWidget";
import { NurturingWidget } from "@/components/dashboard/NurturingWidget";
import {
  DashboardCustomizer,
  DashboardPrefs,
  DASHBOARD_WIDGETS,
  loadDashboardPrefs,
  saveDashboardPrefs,
  getDefaultPrefs,
  StatsPeriod,
} from "@/components/dashboard/DashboardCustomizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DoorOpen,
  Users,
  Calendar,
  ChevronRight,
  Settings2,
  Zap,
  MessageSquare,
  Mail,
  Inbox,
  Flame,
  ListChecks,
  FileText,
  TrendingUp,
  Target,
  Hourglass,
  Timer,
  Home,
  CalendarCheck,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { format, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskQueuePanel } from "@/components/dashboard/TaskQueuePanel";

interface DashboardStats {
  totalDoors: number;
  totalDistinctProperties: number;
  propertiesByStatus: Record<string, number>;
  activeLeads: number;
  leadsToday: number;
  completeLeadsToday: number;
  leadsThisWeek: number;
  leadsLastWeek: number;
  pendingTasks: number;
}

interface PeriodStats {
  totalLeads: number;
  showingsCount: number;
  smsSent: number;
  emailsSent: number;
  emailsParsed: number;
  applicantsNow: number;
}

// Extra stat-chip metrics served by the dashboard_extra_stats() RPC in one
// round-trip (current-state / fixed-window — not affected by the period filter).
interface ExtraStats {
  newThisWeek: number;
  newPrevWeek: number;
  hotAwaitingContact: number;
  uncontactedBacklog24h: number;
  hotActive: number;
  showingsCompleted: number;
  showingsNoShow: number;
  queuePending: number;
  queueOverdue12h: number;
  availableUnits: number;
  rentedUnits: number;
  totalUnits: number;
  medianResponseMinutes: number | null;
  pctUnder1h: number | null;
}

interface PropertyInterest {
  property_id: string;
  address: string;
  city: string;
  lead_count: number;
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

export const AdminDashboard = () => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [extraStats, setExtraStats] = useState<ExtraStats | null>(null);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [priorityLeads, setPriorityLeads] = useState<PriorityLead[]>([]);
  const [upcomingShowings, setUpcomingShowings] = useState<TodayShowing[]>([]);
  const [topProperties, setTopProperties] = useState<PropertyInterest[]>([]);
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

  const isStatCardVisible = (cardId: string) => {
    return prefs.statCards?.[cardId] ?? true;
  };

  // Period filter now lives in the Customize panel (prefs) instead of a
  // toggle strip on the dashboard body.
  const statsPeriod: StatsPeriod = prefs.statsPeriod ?? 'total';

  // Helper: base query for clean leads (complete + no junk names).
  // is_demo guard future-proofs against seeded demo data (DemoDataTab).
  const cleanLeadCount = () =>
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", userRecord?.organization_id || "")
      .not("is_demo", "is", true)
      .not("full_name", "is", null)
      .not("phone", "is", null)
      .not("email", "is", null)
      .not("full_name", "ilike", "%.com%")
      .not("full_name", "ilike", "%http%")
      .not("full_name", "ilike", "%@%")
      .not("full_name", "ilike", "%comments%")
      .not("full_name", "ilike", "%unsubscribe%")
      .not("full_name", "ilike", "%click here%")
      .not("full_name", "ilike", "%mailto:%")
      .not("full_name", "ilike", "%subject:%")
      .not("full_name", "ilike", "%reply%");

  // ── Summary + list data (runs once) ──
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userRecord?.organization_id) return;

      try {
        const today = new Date();
        // Compute Cleveland midnight (DST-aware)
        const clevelandNow = new Date(today.toLocaleString("en-US", { timeZone: "America/New_York" }));
        clevelandNow.setHours(0, 0, 0, 0);
        const offset = today.getTime() - new Date(today.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime();
        const todayStart = new Date(clevelandNow.getTime() + offset).toISOString();
        const clevelandEnd = new Date(today.toLocaleString("en-US", { timeZone: "America/New_York" }));
        clevelandEnd.setHours(23, 59, 59, 999);
        const todayEnd = new Date(clevelandEnd.getTime() + offset).toISOString();

        const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        const [
          summaryResult,
          upcomingShowingsResult,
          priorityLeadsResult,
          propertiesResult,
          allLeadsTodayResult,
          leadsTodayResult,
          leadsThisWeekResult,
          leadsLastWeekResult,
          pendingTasksResult,
          leadsWithPropertyResult,
          extraStatsResult,
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
            .not("status", "in", '("cancelled","no_show")')
            .order("scheduled_at", { ascending: true })
            .limit(10),
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
            .from("properties")
            .select("address, city, zip_code")
            .eq("organization_id", userRecord.organization_id),
          // Leads today — ALL leads
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id)
            .gte("created_at", todayStart),
          // Leads today — complete + clean only
          cleanLeadCount().gte("created_at", todayStart),
          // Leads this week
          cleanLeadCount().gte("created_at", thisWeekStart.toISOString()),
          // Leads last week
          cleanLeadCount()
            .gte("created_at", lastWeekStart.toISOString())
            .lt("created_at", thisWeekStart.toISOString()),
          // Pending agent tasks
          supabase
            .from("agent_tasks")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", userRecord.organization_id)
            .in("status", ["pending", "in_progress"]),
          // Top properties by interest — DB-side aggregate (no 1000-row cap;
          // sums all units of a building and counts all-time interest).
          supabase.rpc("top_properties_by_interest", { p_limit: 5 }),
          // Extra stat chips (response time, backlog, WoW leads, inventory, hot
          // awaiting contact) — single DB-side aggregate, demo rows excluded.
          supabase.rpc("dashboard_extra_stats"),
        ]);

        if (summaryResult.error) console.error("Dashboard summary RPC error:", summaryResult.error);
        if (leadsTodayResult.error) console.error("Leads today count error:", leadsTodayResult.error);
        if (leadsThisWeekResult.error) console.error("Leads this week count error:", leadsThisWeekResult.error);
        if (pendingTasksResult.error) console.error("Pending tasks count error:", pendingTasksResult.error);

        const summary = summaryResult.data as {
          properties: { total: number; available: number; coming_soon: number; in_leasing: number; rented: number };
          leads: { active: number; new_this_week: number; converted_this_month: number; total_this_month: number };
          showings: { today: number };
          conversion_rate: number;
        } | null;

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
            leadsToday: allLeadsTodayResult.count || 0,
            completeLeadsToday: leadsTodayResult.count || 0,
            leadsThisWeek: leadsThisWeekResult.count || 0,
            leadsLastWeek: leadsLastWeekResult.count || 0,
            pendingTasks: pendingTasksResult.count || 0,
          });
        }

        setUpcomingShowings(
          (upcomingShowingsResult.data || []).map((s: any) => ({
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

        // Extra stat chips from dashboard_extra_stats()
        if (extraStatsResult.error) {
          console.error("Extra stats RPC error:", extraStatsResult.error);
        }
        const extra = extraStatsResult.data as {
          leads: { new_this_week: number; new_prev_week: number; hot_awaiting_contact: number; uncontacted_backlog_24h: number };
          hot_active: number;
          showings: { completed: number; no_show: number };
          queue: { pending: number; overdue_12h: number };
          inventory: { available: number; rented: number; total: number };
          response: { median_minutes: number; pct_under_1h: number; responded_count: number } | null;
        } | null;
        if (extra) {
          setExtraStats({
            newThisWeek: extra.leads?.new_this_week ?? 0,
            newPrevWeek: extra.leads?.new_prev_week ?? 0,
            hotAwaitingContact: extra.leads?.hot_awaiting_contact ?? 0,
            uncontactedBacklog24h: extra.leads?.uncontacted_backlog_24h ?? 0,
            hotActive: extra.hot_active ?? 0,
            showingsCompleted: extra.showings?.completed ?? 0,
            showingsNoShow: extra.showings?.no_show ?? 0,
            queuePending: extra.queue?.pending ?? 0,
            queueOverdue12h: extra.queue?.overdue_12h ?? 0,
            availableUnits: extra.inventory?.available ?? 0,
            rentedUnits: extra.inventory?.rented ?? 0,
            totalUnits: extra.inventory?.total ?? 0,
            medianResponseMinutes: extra.response?.median_minutes ?? null,
            pctUnder1h: extra.response?.pct_under_1h ?? null,
          });
        }

        // Top properties by interest — already ranked + counted by the RPC.
        if (leadsWithPropertyResult.error) {
          console.error("Top properties RPC error:", leadsWithPropertyResult.error);
        }
        setTopProperties(
          ((leadsWithPropertyResult.data as any[]) || []).map((r) => ({
            property_id: r.property_id,
            address: r.address,
            city: r.city,
            lead_count: Number(r.lead_count) || 0,
          })),
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

  // ── All stat card numbers (re-runs when period changes) ──
  useEffect(() => {
    const fetchPeriodStats = async () => {
      if (!userRecord?.organization_id) return;
      setPeriodLoading(true);

      try {
        const now = new Date();
        // Compute Cleveland-aware (DST-safe) period boundaries for ALL periods
        // — week/month previously used the viewer's browser timezone.
        const clevNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const tzOffset = now.getTime() - clevNow.getTime();
        const clevelandDay = () => {
          const d = new Date(clevNow);
          d.setHours(0, 0, 0, 0);
          return d;
        };
        const toUtcIso = (d: Date) => new Date(d.getTime() + tzOffset).toISOString();

        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        if (statsPeriod === 'day') {
          const d = clevelandDay();
          periodStart = toUtcIso(d);
          const e = new Date(d);
          e.setDate(e.getDate() + 1);
          periodEnd = toUtcIso(e);
        } else if (statsPeriod === 'week') {
          const d = clevelandDay();
          d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
          periodStart = toUtcIso(d);
        } else if (statsPeriod === 'month') {
          const d = clevelandDay();
          d.setDate(1);
          periodStart = toUtcIso(d);
        }

        // Leads: complete clean leads created in period
        let leadsQuery = cleanLeadCount();
        if (periodStart) leadsQuery = leadsQuery.gte("created_at", periodStart);

        // SMS: historical only — the twilio stream stopped 2026-06-25 (SMS
        // automation removed; n8n replacement pending). Chip is labeled paused.
        let smsQuery = supabase
          .from("system_logs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .eq("event_type", "message_sent")
          .eq("category", "twilio");
        if (periodStart) smsQuery = smsQuery.gte("created_at", periodStart);

        // Emails actually sent — DB RPC filters details->>status IN
        // (sent/delivered/clicked/opened/complained), excluding the bounced/
        // failed/queued rows the old event_type count inflated by +76%.
        const emailQuery = supabase.rpc("count_emails_sent", {
          p_since: periodStart ?? undefined,
        });

        let parsedQuery = supabase
          .from("system_logs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .eq("event_type", "esther_lead_processed");
        if (periodStart) parsedQuery = parsedQuery.gte("created_at", periodStart);

        // Applicants: CURRENT pipeline state — deliberately NOT period-gated.
        // (Gating by lead created_at hid every applicant created before the
        // selected window: Today showed 0 while 59 were in application.)
        const applicantsQuery = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .not("is_demo", "is", true)
          .eq("status", "in_application");

        // Showings: exclude cancelled/no_show AND superseded originals
        // ("rescheduled" — they double-counted reboooked appointments).
        // "Today" gets an upper bound so future showings don't leak in.
        let showingsCountQuery = supabase
          .from("showings")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id)
          .not("status", "in", '("cancelled","no_show","rescheduled")');
        if (periodStart) showingsCountQuery = showingsCountQuery.gte("scheduled_at", periodStart);
        if (periodEnd) showingsCountQuery = showingsCountQuery.lt("scheduled_at", periodEnd);

        const [leadsRes, smsRes, emailRes, parsedRes, applicantsRes, showingsCountRes] = await Promise.all([
          leadsQuery, smsQuery, emailQuery, parsedQuery, applicantsQuery, showingsCountQuery,
        ]);

        setPeriodStats({
          totalLeads: leadsRes.count || 0,
          showingsCount: showingsCountRes.count || 0,
          smsSent: smsRes.count || 0,
          emailsSent: Number(emailRes.data) || 0,
          emailsParsed: parsedRes.count || 0,
          applicantsNow: applicantsRes.count || 0,
        });
      } catch (error) {
        console.error("Error fetching period stats:", error);
      } finally {
        setPeriodLoading(false);
      }
    };

    fetchPeriodStats();
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


  return (
    <div className={cn(
      "grid gap-6 grid-cols-1",
      "xl:grid-cols-[1fr_360px]"
    )}>
      {/* Main Dashboard Content */}
      <div className="min-w-0 space-y-6 xl:min-h-[500px]">
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

        {/* Stats */}
        {isWidgetVisible("stats_cards") && (
          <div className="space-y-5">
            {/* ── Row 1: LEADS (indigo accent) ── */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em]">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Leads
              </p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {isStatCardVisible("leads") && (
                  <div className="animate-fade-up stagger-1">
                    <StatCard
                      title="Leads"
                      value={periodStats?.totalLeads || 0}
                      subtitle={
                        statsPeriod === 'day' ? 'complete · today'
                          : statsPeriod === 'week' ? 'complete · this week'
                          : statsPeriod === 'month' ? 'complete · this month'
                          : 'complete · all time'
                      }
                      icon={Users}
                      loading={loading || periodLoading}
                      className="border-l-[3px] border-l-indigo-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("new_leads_week") && (
                  <div className="animate-fade-up stagger-2">
                    <StatCard
                      title="New This Week"
                      value={extraStats?.newThisWeek ?? 0}
                      trend={
                        extraStats && extraStats.newPrevWeek > 0
                          ? {
                              value: Math.round(
                                ((extraStats.newThisWeek - extraStats.newPrevWeek) / extraStats.newPrevWeek) * 100
                              ),
                              isPositive: extraStats.newThisWeek >= extraStats.newPrevWeek,
                            }
                          : undefined
                      }
                      subtitle={extraStats ? `vs ${extraStats.newPrevWeek} last wk` : "this week"}
                      icon={TrendingUp}
                      loading={loading}
                      className="border-l-[3px] border-l-indigo-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("hot_leads") && (
                  <div className="animate-fade-up stagger-3">
                    <StatCard
                      title="Hot Leads"
                      value={extraStats?.hotActive ?? 0}
                      subtitle="score 80+, active last 30d"
                      icon={Flame}
                      loading={loading}
                      className="border-l-[3px] border-l-indigo-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("hot_awaiting") && (
                  <div className="animate-fade-up stagger-4">
                    <StatCard
                      title="Hot Awaiting Contact"
                      value={extraStats?.hotAwaitingContact ?? 0}
                      subtitle="score 90+, never contacted"
                      icon={Target}
                      loading={loading}
                      onClick={() => navigate("/leads")}
                      className="border-l-[3px] border-l-indigo-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("uncontacted_backlog") && (
                  <div className="animate-fade-up stagger-5">
                    <StatCard
                      title="Uncontacted Backlog"
                      value={extraStats?.uncontactedBacklog24h ?? 0}
                      subtitle=">24h without first touch"
                      icon={Hourglass}
                      loading={loading}
                      className="border-l-[3px] border-l-indigo-400/70"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 2: PIPELINE & PORTFOLIO (gold accent) ── */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em]">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Pipeline &amp; Portfolio
              </p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {isStatCardVisible("showings") && (
                  <div className="animate-fade-up stagger-1">
                    <StatCard
                      title="Showings"
                      value={periodStats?.showingsCount || 0}
                      subtitle={
                        statsPeriod === 'day' ? 'today'
                          : statsPeriod === 'week' ? 'since Monday'
                          : statsPeriod === 'month' ? 'this month'
                          : 'all time'
                      }
                      icon={Calendar}
                      loading={loading || periodLoading}
                      onClick={() => navigate("/showings")}
                      className="border-l-[3px] border-l-amber-400/80"
                    />
                  </div>
                )}
                {isStatCardVisible("show_up_rate") && (
                  <div className="animate-fade-up stagger-2">
                    <StatCard
                      title="Show-Up Rate"
                      value={
                        extraStats && (extraStats.showingsCompleted + extraStats.showingsNoShow) > 0
                          ? `${Math.round((extraStats.showingsCompleted / (extraStats.showingsCompleted + extraStats.showingsNoShow)) * 1000) / 10}%`
                          : "—"
                      }
                      subtitle={extraStats ? `${extraStats.showingsCompleted} completed showings` : "attended vs no-show"}
                      icon={CalendarCheck}
                      loading={loading}
                      className="border-l-[3px] border-l-amber-400/80"
                    />
                  </div>
                )}
                {isStatCardVisible("applicants") && (
                  <div className="animate-fade-up stagger-3">
                    <StatCard
                      title="Applicants"
                      value={periodStats?.applicantsNow || 0}
                      subtitle="currently in application"
                      icon={FileText}
                      loading={loading || periodLoading}
                      onClick={() => navigate("/applicants")}
                      className="border-l-[3px] border-l-amber-400/80"
                    />
                  </div>
                )}
                {isStatCardVisible("total_doors") && (
                  <div className="animate-fade-up stagger-4">
                    <StatCard
                      title="Total Doors"
                      value={stats?.totalDoors || 0}
                      subtitle={`${stats?.totalDistinctProperties || 0} properties`}
                      icon={DoorOpen}
                      loading={loading}
                      className="border-l-[3px] border-l-amber-400/80"
                    />
                  </div>
                )}
                {isStatCardVisible("available_units") && (
                  <div className="animate-fade-up stagger-5">
                    <StatCard
                      title="Available Units"
                      value={extraStats?.availableUnits ?? 0}
                      subtitle={
                        extraStats && extraStats.totalUnits > 0
                          ? `${Math.round((extraStats.rentedUnits / extraStats.totalUnits) * 100)}% occupied (${extraStats.rentedUnits}/${extraStats.totalUnits})`
                          : "ready to lease"
                      }
                      icon={Home}
                      loading={loading}
                      onClick={() => navigate("/properties")}
                      className="border-l-[3px] border-l-amber-400/80"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 3: COMMUNICATIONS & OPS (sky accent) ── */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em]">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Communications &amp; Ops
              </p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {isStatCardVisible("response_time") && (
                  <div className="animate-fade-up stagger-1">
                    <StatCard
                      title="Lead Response Time"
                      value={
                        extraStats?.medianResponseMinutes != null
                          ? `${extraStats.medianResponseMinutes} min`
                          : "—"
                      }
                      subtitle={
                        extraStats?.pctUnder1h != null
                          ? `${extraStats.pctUnder1h}% answered under 1h`
                          : "median first reply"
                      }
                      icon={Timer}
                      loading={loading}
                      className="border-l-[3px] border-l-sky-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("emails_sent") && (
                  <div className="animate-fade-up stagger-2">
                    <StatCard
                      title="Emails Sent"
                      value={periodStats?.emailsSent || 0}
                      subtitle="outbound · excl. bounces"
                      icon={Mail}
                      loading={loading || periodLoading}
                      className="border-l-[3px] border-l-sky-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("emails_parsed") && (
                  <div className="animate-fade-up stagger-3">
                    <StatCard
                      title="Leads From Email"
                      value={periodStats?.emailsParsed || 0}
                      subtitle="single-email inbound"
                      icon={Inbox}
                      loading={loading || periodLoading}
                      className="border-l-[3px] border-l-sky-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("sms_sent") && (
                  <div className="animate-fade-up stagger-4">
                    <StatCard
                      title="SMS Sent"
                      value={periodStats?.smsSent || 0}
                      subtitle="paused · historical"
                      icon={MessageSquare}
                      loading={loading || periodLoading}
                      className="border-l-[3px] border-l-sky-400/70"
                    />
                  </div>
                )}
                {isStatCardVisible("agent_queue") && (
                  <div className="animate-fade-up stagger-5">
                    <StatCard
                      title="Agent Queue"
                      value={extraStats?.queuePending ?? stats?.pendingTasks ?? 0}
                      subtitle={
                        extraStats
                          ? `${extraStats.queueOverdue12h} overdue >12h`
                          : "pending tasks"
                      }
                      icon={ListChecks}
                      loading={loading}
                      className="border-l-[3px] border-l-sky-400/70"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Top Properties + Nurturing Leads (each spans 2 cols) */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              <div className="animate-fade-up stagger-5">
                <TopPropertiesWidget data={topProperties} loading={loading} />
              </div>
              <div className="animate-fade-up stagger-6">
                <NurturingWidget loading={loading} />
              </div>
            </div>

          </div>
        )}

        {/* Dashboard Customizer Sheet */}
        <DashboardCustomizer
          open={showCustomizer}
          onOpenChange={setShowCustomizer}
          prefs={prefs}
          onPrefsChange={handlePrefsChange}
          onReset={handleResetPrefs}
        />
      </div>

      {/* Live Panel - Right Side. Sticky + natural height: the card hugs its
          content (no stretched empty void below) and follows the scroll. */}
      <div className="hidden xl:block xl:col-start-2 xl:row-start-1">
        <div className="xl:sticky xl:top-4">
          <TaskQueuePanel />
        </div>
      </div>

      {/* Priority Leads + Upcoming Showings - full width below */}
      {(() => {
        const widgetIds = ["priority_leads", "upcoming_showings"];
        const visibleWidgets = widgetIds.filter((id) => isWidgetVisible(id));
        if (visibleWidgets.length === 0) return null;

        const renderWidget = (widgetId: string) => {
          switch (widgetId) {
            case "priority_leads":
              return (
                <div key={widgetId}>
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
                      <ScrollArea className="h-[400px]">
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
            case "upcoming_showings":
              return (
                <div key={widgetId}>
                  <Card variant="glass" className="h-full">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-lg">Upcoming Showings</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/showings")}
                      >
                        View All <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                              <ShowingCardSkeleton key={i} variant="compact" />
                            ))
                          ) : upcomingShowings.length > 0 ? (
                            upcomingShowings.map((showing) => (
                              <ShowingCard
                                key={showing.id}
                                showing={showing}
                                variant="compact"
                              />
                            ))
                          ) : (
                            <EmptyState
                              icon={Calendar}
                              title="No upcoming showings"
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
            default:
              return null;
          }
        };

        return (
          <div className={cn(
            "grid gap-6",
            visibleWidgets.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2",
            "xl:col-span-2"
          )}>
            {visibleWidgets.map((widgetId) => renderWidget(widgetId))}
          </div>
        );
      })()}
    </div>
  );
};
