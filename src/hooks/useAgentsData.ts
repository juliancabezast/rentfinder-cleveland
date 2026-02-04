import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface Agent {
  id: string;
  organization_id: string;
  agent_key: string;
  biblical_name: string;
  display_role: string;
  description: string;
  category: 'voice' | 'intelligence' | 'communication' | 'verification' | 'sync' | 'system';
  status: 'idle' | 'active' | 'error' | 'disabled' | 'degraded';
  is_enabled: boolean;
  required_services: string[];
  edge_function_name: string | null;
  sprint: number;
  executions_today: number;
  successes_today: number;
  failures_today: number;
  executions_total: number;
  successes_total: number;
  failures_total: number;
  last_execution_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  avg_execution_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentActivityLog {
  id: string;
  organization_id: string;
  agent_key: string;
  action: string;
  status: 'success' | 'failure' | 'skipped' | 'in_progress';
  message: string;
  details: Record<string, unknown> | null;
  related_lead_id: string | null;
  related_call_id: string | null;
  related_showing_id: string | null;
  related_property_id: string | null;
  related_task_id: string | null;
  execution_ms: number | null;
  cost_incurred: number | null;
  created_at: string;
}

export interface CategoryStats {
  category: string;
  count: number;
  activeCount: number;
  errorCount: number;
}

export function useAgentsData() {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all agents
  const {
    data: agents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: ['agents', userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      
      const { data, error } = await supabase
        .from('agents_registry')
        .select('*')
        .eq('organization_id', userRecord.organization_id)
        .order('category', { ascending: true })
        .order('biblical_name', { ascending: true });

      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!userRecord?.organization_id,
  });

  // Fetch activity log
  const {
    data: activityLog,
    isLoading: activityLoading,
    error: activityError,
  } = useQuery({
    queryKey: ['agent-activity-log', userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];

      const { data, error } = await supabase
        .from('agent_activity_log')
        .select('*')
        .eq('organization_id', userRecord.organization_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AgentActivityLog[];
    },
    enabled: !!userRecord?.organization_id,
  });

  // Toggle agent enabled state
  const toggleAgentMutation = useMutation({
    mutationFn: async ({ agentId, isEnabled }: { agentId: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from('agents_registry')
        .update({
          is_enabled: isEnabled,
          status: isEnabled ? 'idle' : 'disabled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  // Real-time subscription for activity log
  useEffect(() => {
    if (!userRecord?.organization_id) return;

    const channel: RealtimeChannel = supabase
      .channel('agent-activity-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_activity_log',
          filter: `organization_id=eq.${userRecord.organization_id}`,
        },
        (payload) => {
          queryClient.setQueryData(
            ['agent-activity-log', userRecord.organization_id],
            (old: AgentActivityLog[] | undefined) => {
              if (!old) return [payload.new as AgentActivityLog];
              return [payload.new as AgentActivityLog, ...old].slice(0, 50);
            }
          );
          // Also refresh agents to update stats
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRecord?.organization_id, queryClient]);

  // Calculate category stats
  const categoryStats: CategoryStats[] = agents
    ? [
        { category: 'voice', count: 0, activeCount: 0, errorCount: 0 },
        { category: 'intelligence', count: 0, activeCount: 0, errorCount: 0 },
        { category: 'communication', count: 0, activeCount: 0, errorCount: 0 },
        { category: 'verification', count: 0, activeCount: 0, errorCount: 0 },
        { category: 'sync', count: 0, activeCount: 0, errorCount: 0 },
        { category: 'system', count: 0, activeCount: 0, errorCount: 0 },
      ].map((stat) => {
        const categoryAgents = agents.filter((a) => a.category === stat.category);
        return {
          ...stat,
          count: categoryAgents.length,
          activeCount: categoryAgents.filter((a) => a.status === 'active').length,
          errorCount: categoryAgents.filter((a) => a.status === 'error').length,
        };
      })
    : [];

  return {
    agents: agents || [],
    activityLog: activityLog || [],
    categoryStats,
    isLoading: agentsLoading || activityLoading,
    error: agentsError || activityError,
    toggleAgent: toggleAgentMutation.mutate,
    isToggling: toggleAgentMutation.isPending,
  };
}

// Fetch activity log for a specific agent
export function useAgentActivityLog(agentKey: string | null) {
  const { userRecord } = useAuth();

  return useQuery({
    queryKey: ['agent-activity-log', agentKey, userRecord?.organization_id],
    queryFn: async () => {
      if (!userRecord?.organization_id || !agentKey) return [];

      const { data, error } = await supabase
        .from('agent_activity_log')
        .select('*')
        .eq('organization_id', userRecord.organization_id)
        .eq('agent_key', agentKey)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as AgentActivityLog[];
    },
    enabled: !!userRecord?.organization_id && !!agentKey,
  });
}
