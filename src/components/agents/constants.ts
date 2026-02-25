import { Phone, ClipboardCheck, Handshake, LucideIcon } from "lucide-react";

// Department definitions with colors and icons
// 3 departments reflecting the leasing pipeline: Qualification → Leasing → Closing
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
    key: "calificacion",
    label: "Qualification",
    icon: Phone,
    color: "border-teal-500",
    bgColor: "bg-teal-50 dark:bg-teal-950/30",
    dotColor: "bg-teal-500",
    agentKeys: ["aaron", "esther", "nehemiah"],
  },
  {
    key: "leasing",
    label: "Leasing",
    icon: ClipboardCheck,
    color: "border-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    dotColor: "bg-amber-500",
    agentKeys: ["elijah"],
  },
  {
    key: "cierre",
    label: "Closing",
    icon: Handshake,
    color: "border-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    dotColor: "bg-green-500",
    agentKeys: ["samuel"],
  },
];

// 5 agents — canonical display names
// All old agent_keys map to one of the 5 real agents
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // Primary agent_keys (new canonical keys)
  aaron: "Voice Reception",
  esther: "Email Reception",
  nehemiah: "Qualification Director",
  elijah: "Leasing Consultant",
  samuel: "Closing Agent",
  // Legacy agent_keys → mapped to the 5 real agents
  main_inbound: "Voice Reception",
  bland_call_webhook: "Voice Reception",
  sms_inbound: "Leasing Consultant",
  hemlane_parser: "Email Reception",
  scoring: "Qualification Director",
  transcript_analyst: "Qualification Director",
  task_dispatcher: "Qualification Director",
  recapture: "Leasing Consultant",
  showing_confirmation: "Closing Agent",
  conversion_predictor: "Qualification Director",
  insight_generator: "Qualification Director",
  report_generator: "Qualification Director",
  doorloop_pull: "Closing Agent",
  cost_tracker: "Qualification Director",
  no_show_followup: "Closing Agent",
  no_show_follow_up: "Closing Agent",
  post_showing: "Closing Agent",
  campaign: "Leasing Consultant",
  campaign_voice: "Leasing Consultant",
  welcome_sequence: "Leasing Consultant",
  campaign_sms: "Leasing Consultant",
};

// Status visual config
export const STATUS_CONFIG: Record<string, { color: string; bgColor: string; pulse?: boolean }> = {
  idle: { color: "text-gray-500", bgColor: "bg-gray-400" },
  active: { color: "text-green-500", bgColor: "bg-green-500", pulse: true },
  error: { color: "text-red-500", bgColor: "bg-red-500" },
  disabled: { color: "text-gray-300", bgColor: "bg-gray-300" },
  degraded: { color: "text-amber-500", bgColor: "bg-amber-500" },
};

// Legacy agent_key → canonical agent_key mapping
const LEGACY_TO_CANONICAL: Record<string, string> = {
  main_inbound: "aaron",
  bland_call_webhook: "aaron",
  hemlane_parser: "esther",
  scoring: "nehemiah",
  transcript_analyst: "nehemiah",
  task_dispatcher: "nehemiah",
  conversion_predictor: "nehemiah",
  insight_generator: "nehemiah",
  report_generator: "nehemiah",
  cost_tracker: "nehemiah",
  sms_inbound: "elijah",
  recapture: "elijah",
  campaign: "elijah",
  campaign_voice: "elijah",
  campaign_sms: "elijah",
  welcome_sequence: "elijah",
  showing_confirmation: "samuel",
  doorloop_pull: "samuel",
  no_show_followup: "samuel",
  no_show_follow_up: "samuel",
  post_showing: "samuel",
};

// Helper: resolve a legacy key to its canonical agent
export function resolveAgentKey(agentKey: string): string {
  return LEGACY_TO_CANONICAL[agentKey] || agentKey;
}

// Helper: find which department an agent belongs to
export function getDepartmentForAgent(agentKey: string): DepartmentConfig | undefined {
  const canonical = resolveAgentKey(agentKey);
  return DEPARTMENTS.find((d) => d.agentKeys.includes(canonical));
}

// Helper: get display name for an agent
export function getAgentDisplayName(agentKey: string, biblicalName: string, displayRole: string): string {
  const functionalName =
    AGENT_DISPLAY_NAMES[agentKey.toLowerCase()] ||
    AGENT_DISPLAY_NAMES[biblicalName.toLowerCase()] ||
    displayRole;
  return functionalName;
}
