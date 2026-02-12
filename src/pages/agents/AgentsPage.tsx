import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Activity, Calendar, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addHours } from "date-fns";
import { RealtimeChannel } from "@supabase/supabase-js";

import { AgentMetricsBar } from "@/components/agents/AgentMetricsBar";
import { OverviewTab } from "@/components/agents/OverviewTab";
import { ActivityLogTab } from "@/components/agents/ActivityLogTab";
import { ScheduleTab } from "@/components/agents/ScheduleTab";
import { DepartmentDetailTab } from "@/components/agents/DepartmentDetailTab";
import type { Agent, AgentTask, ActivityLog, AgentStats } from "@/components/agents/types";

const AgentsPage: React.FC = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

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
        counts[task.agent_type] = (counts[task.agent_type] || 0) + 1;
      });
      return counts;
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch activity log
  const { data: activityLog, isLoading: activityLoading } = useQuery({
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
        .gte("scheduled_for", now.toISOString())
        .lte("scheduled_for", tomorrow.toISOString())
        .order("scheduled_for", { ascending: true });
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
    if (!agents) return { active: 0, total: 0, executedToday: 0, successesToday: 0, failuresToday: 0, pendingGlobal: 0, successRate: 100, errorCount: 0 };
    const active = agents.filter((a) => a.is_enabled && (a.status === "active" || a.status === "idle")).length;
    const total = agents.length;
    const executedToday = agents.reduce((s, a) => s + (a.executions_today || 0), 0);
    const successesToday = agents.reduce((s, a) => s + (a.successes_today || 0), 0);
    const failuresToday = agents.reduce((s, a) => s + (a.failures_today || 0), 0);
    const pendingGlobal = Object.values(pendingTasks || {}).reduce((s, c) => s + c, 0);
    const successRate = executedToday > 0 ? Math.round((successesToday / executedToday) * 100) : 100;
    const errorCount = agents.filter((a) => a.status === "error").length;
    return { active, total, executedToday, successesToday, failuresToday, pendingGlobal, successRate, errorCount };
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
          <TabsTrigger value="overview" className="flex-1 sm:flex-initial gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 sm:flex-initial gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex-1 sm:flex-initial gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="department" className="flex-1 sm:flex-initial gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">By Dept</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            agents={agents || []}
            pendingTasks={pendingTasks || {}}
            organizationId={userRecord?.organization_id}
            onToggleAgent={handleToggle}
            isToggling={toggleMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityLogTab
            activityLog={activityLog || []}
            agents={agents || []}
            isLoading={activityLoading}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab
            scheduledTasks={scheduledTasks || []}
            isLoading={scheduleLoading}
          />
        </TabsContent>

        <TabsContent value="department" className="mt-4">
          <DepartmentDetailTab
            agents={agents || []}
            pendingTasks={pendingTasks || {}}
            activityLog={activityLog || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AgentsPage;
