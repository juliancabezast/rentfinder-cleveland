export interface Agent {
  id: string;
  organization_id: string;
  agent_key: string;
  biblical_name: string;
  display_role: string;
  description: string;
  category: string;
  status: string;
  is_enabled: boolean;
  required_services: string[] | null;
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

export interface AgentTask {
  id: string;
  agent_type: string;
  action_type: string;
  scheduled_for: string;
  status: string;
  lead_id: string;
  leads?: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
}

export interface ActivityLog {
  id: string;
  agent_key: string;
  action: string;
  status: string;
  message: string;
  execution_ms: number | null;
  created_at: string;
  related_lead_id: string | null;
  cost_incurred: number | null;
  details: Record<string, unknown> | null;
}

export interface AgentStats {
  active: number;
  total: number;
  executedToday: number;
  successesToday: number;
  failuresToday: number;
  pendingGlobal: number;
  successRate: number;
  errorCount: number;
}

export function getLeadName(lead: AgentTask["leads"]): string {
  if (!lead) return "Unknown Lead";
  return lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
}
