import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Calendar, Layers, LayoutDashboard, ScrollText, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addHours } from "date-fns";
import { RealtimeChannel } from "@supabase/supabase-js";

import { AgentMetricsBar } from "@/components/agents/AgentMetricsBar";
import { DashboardTab } from "@/components/agents/DashboardTab";
import { DepartmentDetailTab } from "@/components/agents/DepartmentDetailTab";
import { ScheduleTab } from "@/components/agents/ScheduleTab";
import { AgentsTab } from "@/components/settings/AgentsTab";
import type { Agent, AgentTask, ActivityLog, AgentStats } from "@/components/agents/types";
import { resolveAgentKey } from "@/components/agents/constants";
import { Users } from "lucide-react";

const SystemLogs = React.lazy(() => import("@/pages/SystemLogs"));
const CostDashboard = React.lazy(() => import("@/pages/costs/CostDashboard"));

const AgentsPage: React.FC = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Fetch agents
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents-page", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const { data, error } = await supabase
        .from("agents_registry")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("biblical_name");
      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch pending tasks count per agent
  const { data: pendingTasks } = useQuery({
    queryKey: ["pending-tasks-count", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return {};
      const { data, error } = await supabase
        .from("agent_tasks")
        .select("agent_type, status")
        .eq("organization_id", userRecord.organization_id)
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((task) => {
        const canonical = resolveAgentKey(task.agent_type);
        counts[canonical] = (counts[canonical] || 0) + 1;
      });
      return counts;
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch activity log
  const { data: activityLog } = useQuery({
    queryKey: ["agent-activity-log-page", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const { data, error } = await supabase
        .from("agent_activity_log")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActivityLog[];
    },
    enabled: !!userRecord?.organization_id,
    refetchInterval: 30000,
  });

  // Fetch scheduled tasks for next 24h
  const { data: scheduledTasks, isLoading: scheduleLoading } = useQuery({
    queryKey: ["scheduled-tasks-24h", userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const now = new Date();
      const tomorrow = addHours(now, 24);
      const { data, error } = await supabase
        .from("agent_tasks")
        .select(`
          id, agent_type, action_type, scheduled_for, status, lead_id,
          leads:lead_id (full_name, first_name, last_name)
        `)
        .eq("organization_id", userRecord.organization_id)
        .eq("status", "pending")
        .lte("scheduled_for", tomorrow.toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data as AgentTask[];
    },
    enabled: !!userRecord?.organization_id,
  });

  // Toggle agent enabled/disabled
  const toggleMutation = useMutation({
    mutationFn: async ({ agentId, isEnabled }: { agentId: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from("agents_registry")
        .update({
          is_enabled: isEnabled,
          status: isEnabled ? "idle" : "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents-page"] });
    },
  });

  // Real-time subscription for activity log
  useEffect(() => {
    if (!userRecord?.organization_id) return;
    const channel: RealtimeChannel = supabase
      .channel("agents-page-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_activity_log",
          filter: `organization_id=eq.${userRecord.organization_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["agent-activity-log-page"] });
          queryClient.invalidateQueries({ queryKey: ["agents-page"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRecord?.organization_id, queryClient]);

  // Compute stats
  const stats: AgentStats = useMemo(() => {
    if (!agents) return { active: 0, enabled: 0, total: 0, executedToday: 0, successesToday: 0, failuresToday: 0, pendingGlobal: 0, successRate: 100, errorCount: 0 };
    const active = agents.filter((a) => a.status === "active").length;
    const enabled = agents.filter((a) => a.is_enabled).length;
    const total = agents.length;
    const executedToday = agents.reduce((s, a) => s + (a.executions_today || 0), 0);
    const successesToday = agents.reduce((s, a) => s + (a.successes_today || 0), 0);
    const failuresToday = agents.reduce((s, a) => s + (a.failures_today || 0), 0);
    const pendingGlobal = Object.values(pendingTasks || {}).reduce((s, c) => s + c, 0);
    const successRate = executedToday > 0 ? Math.round((successesToday / executedToday) * 100) : 100;
    const errorCount = agents.filter((a) => a.status === "error").length;
    return { active, enabled, total, executedToday, successesToday, failuresToday, pendingGlobal, successRate, errorCount };
  }, [agents, pendingTasks]);

  const handleToggle = (agentId: string, isEnabled: boolean) => {
    toggleMutation.mutate({ agentId, isEnabled });
  };

  if (agentsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          AI Agents Control Center
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor and manage all AI agents in real-time
        </p>
      </div>

      {/* Compact metrics bar */}
      <AgentMetricsBar stats={stats} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="inline-flex w-full sm:w-auto h-auto">
          <TabsTrigger value="dashboard" className="flex-1 sm:flex-initial gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="fleet" className="flex-1 sm:flex-initial gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Fleet</span>
          </TabsTrigger>
          <TabsTrigger value="department" className="flex-1 sm:flex-initial gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">By Dept</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex-1 sm:flex-initial gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex-1 sm:flex-initial gap-2">
            <ScrollText className="h-4 w-4" />
            <span className="hidden sm:inline">Logs</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex-1 sm:flex-initial gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Costs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab stats={stats} />
        </TabsContent>

        <TabsContent value="fleet" className="mt-4">
          <AgentsTab />
        </TabsContent>

        <TabsContent value="department" className="mt-4">
          <DepartmentDetailTab
            agents={agents || []}
            pendingTasks={pendingTasks || {}}
            activityLog={activityLog || []}
            onToggleAgent={handleToggle}
            isToggling={toggleMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab
            scheduledTasks={scheduledTasks || []}
            isLoading={scheduleLoading}
          />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <React.Suspense fallback={<Skeleton className="h-[500px]" />}>
            <SystemLogs />
          </React.Suspense>
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <React.Suspense fallback={<Skeleton className="h-[500px]" />}>
            <CostDashboard />
          </React.Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AgentsPage;
