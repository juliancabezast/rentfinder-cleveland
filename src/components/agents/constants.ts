import { Phone, Brain, Settings, Megaphone, Lightbulb, Shield, LucideIcon } from "lucide-react";

// Department definitions with colors and icons
export interface DepartmentConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;        // Tailwind border/accent color
  bgColor: string;      // Light background for header
  dotColor: string;     // Status dot color
  agentKeys: string[];  // agent_key values belonging to this department
}

export const DEPARTMENTS: DepartmentConfig[] = [
  {
    key: "recepcion",
    label: "Recepcion",
    icon: Phone,
    color: "border-teal-500",
    bgColor: "bg-teal-50 dark:bg-teal-950/30",
    dotColor: "bg-teal-500",
    agentKeys: ["main_inbound", "bland_call_webhook", "sms_inbound", "hemlane_parser"],
  },
  {
    key: "evaluacion",
    label: "Evaluacion",
    icon: Brain,
    color: "border-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    dotColor: "bg-blue-500",
    agentKeys: ["scoring", "transcript_analyst"],
  },
  {
    key: "operaciones",
    label: "Operaciones",
    icon: Settings,
    color: "border-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    dotColor: "bg-purple-500",
    agentKeys: ["task_dispatcher"],
  },
  {
    key: "ventas",
    label: "Ventas",
    icon: Megaphone,
    color: "border-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    dotColor: "bg-amber-500",
    agentKeys: ["recapture", "showing_confirmation"],
  },
  {
    key: "inteligencia",
    label: "Inteligencia",
    icon: Lightbulb,
    color: "border-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    dotColor: "bg-green-500",
    agentKeys: ["conversion_predictor", "insight_generator", "report_generator"],
  },
  {
    key: "administracion",
    label: "Administracion",
    icon: Shield,
    color: "border-slate-500",
    bgColor: "bg-slate-50 dark:bg-slate-950/30",
    dotColor: "bg-slate-500",
    agentKeys: ["doorloop_pull", "cost_tracker"],
  },
];

// Biblical name → functional name mapping (canonical source)
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // By agent_key
  main_inbound: "Inbound Calls",
  bland_call_webhook: "Call Processor & Smart Matcher",
  sms_inbound: "SMS Conversational Agent",
  hemlane_parser: "Hemlane Email Parser",
  scoring: "Lead Scoring (AI)",
  transcript_analyst: "Transcript Analyst",
  task_dispatcher: "Operations Director",
  recapture: "Outbound Sales & Recapture",
  showing_confirmation: "Showing Lifecycle",
  conversion_predictor: "Conversion Predictor",
  insight_generator: "Insight Generator",
  report_generator: "Report Generator",
  doorloop_pull: "Doorloop Bridge",
  cost_tracker: "Health & Cost Monitor",
  // By biblical_name
  aaron: "Inbound Calls",
  deborah: "Call Processor & Smart Matcher",
  ruth: "SMS Conversational Agent",
  esther: "Hemlane Email Parser",
  daniel: "Lead Scoring (AI)",
  isaiah: "Transcript Analyst",
  nehemiah: "Operations Director",
  elijah: "Outbound Sales & Recapture",
  samuel: "Showing Lifecycle",
  solomon: "Conversion Predictor",
  moses: "Insight Generator",
  david: "Report Generator",
  ezra: "Doorloop Bridge",
  zacchaeus: "Health & Cost Monitor",
  // Legacy agent_type values
  no_show_followup: "Showing Lifecycle",
  no_show_follow_up: "Showing Lifecycle",
  post_showing: "Showing Lifecycle",
  campaign: "Outbound Sales & Recapture",
  campaign_voice: "Outbound Sales & Recapture",
  welcome_sequence: "Outbound Sales & Recapture",
};

// Status visual config
export const STATUS_CONFIG: Record<string, { color: string; bgColor: string; pulse?: boolean }> = {
  idle: { color: "text-gray-500", bgColor: "bg-gray-400" },
  active: { color: "text-green-500", bgColor: "bg-green-500", pulse: true },
  error: { color: "text-red-500", bgColor: "bg-red-500" },
  disabled: { color: "text-gray-300", bgColor: "bg-gray-300" },
  degraded: { color: "text-amber-500", bgColor: "bg-amber-500" },
};

// Helper: find which department an agent belongs to
export function getDepartmentForAgent(agentKey: string): DepartmentConfig | undefined {
  return DEPARTMENTS.find((d) => d.agentKeys.includes(agentKey));
}

// Helper: get display name for an agent
export function getAgentDisplayName(agentKey: string, biblicalName: string, displayRole: string): string {
  const functionalName =
    AGENT_DISPLAY_NAMES[agentKey.toLowerCase()] ||
    AGENT_DISPLAY_NAMES[biblicalName.toLowerCase()] ||
    displayRole;
  return functionalName;
}
