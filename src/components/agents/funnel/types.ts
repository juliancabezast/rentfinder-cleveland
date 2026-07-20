// Shared types for the real-time Agents funnel (3D scene + 2D fallback + HUD)

export type StageKey =
  | "new"
  | "nurturing"
  | "showing_scheduled"
  | "showed"
  | "in_application"
  | "lost";

export interface AgentSnapshot {
  key: string;
  name: string;
  role: string;
  enabled: boolean;
  last_activity_at: string | null;
  activity_1h: number;
  activity_24h: number;
  tasks_today: { completed: number; pending: number; failed: number };
  health: "active" | "idle" | "error" | "disabled";
}

export interface FunnelSnapshot {
  generated_at: string;
  agents: AgentSnapshot[];
  funnel: {
    statuses: Partial<Record<StageKey, number>>;
    milestones: { ge50: number; ge80: number; eq100: number };
    hot: number;
  };
  flows: {
    leads_created_1h: number;
    leads_created_24h: number;
    emails_sent_24h: number;
    emails_bounced_24h: number;
    inbound_emails_24h: number;
    showings_today: number;
    notes_24h: number;
  };
  queues: {
    email_queued: number;
    tasks_pending: number;
    tasks_overdue: number;
  };
  integrations: {
    service: string;
    status: string;
    response_ms: number | null;
    last_checked_at: string | null;
    consecutive_failures: number | null;
  }[];
}

export type FunnelEvent =
  | { type: "lead_new"; magnitude: number }
  | { type: "agent_activity"; agentKey: string; failed: boolean; magnitude: number }
  | { type: "task_completed"; agentKey: string; magnitude: number };

export type Selection =
  | { type: "agent"; key: string }
  | { type: "stage"; key: StageKey }
  | null;
