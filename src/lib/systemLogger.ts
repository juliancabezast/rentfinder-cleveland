import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type LogLevel = "info" | "warning" | "error" | "critical";

export type LogCategory =
  | "twilio"
  | "bland_ai"
  | "openai"
  | "persona"
  | "doorloop"
  | "lead"
  | "showing"
  | "authentication"
  | "system";

export interface LogEventParams {
  organization_id?: string;
  level: LogLevel;
  category: LogCategory | string;
  event_type: string;
  message: string;
  details?: Json;
  related_lead_id?: string;
  related_call_id?: string;
  related_showing_id?: string;
}

/**
 * Log a system event to the system_logs table
 * For critical errors, this would trigger email notification in a production environment
 */
export async function logSystemEvent(params: LogEventParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("system_logs").insert([
      {
        organization_id: params.organization_id || null,
        level: params.level,
        category: params.category,
        event_type: params.event_type,
        message: params.message,
        details: params.details || {},
        related_lead_id: params.related_lead_id || null,
        related_call_id: params.related_call_id || null,
        related_showing_id: params.related_showing_id || null,
        is_resolved: false,
        notification_sent: params.level === "critical",
        notification_sent_at: params.level === "critical" ? new Date().toISOString() : null,
      },
    ]);

    if (error) {
      console.error("Failed to log system event:", error);
      return { success: false, error: error.message };
    }

    // In production, critical errors would trigger email to admin@rentfindercleveland.com
    if (params.level === "critical") {
      console.warn("CRITICAL ERROR LOGGED:", params.message, params.details);
      // TODO: Implement email notification via edge function
    }

    return { success: true };
  } catch (err) {
    console.error("System logger error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Helper to get service display info
 */
export const SERVICE_CONFIG: Record<string, { label: string; color: string }> = {
  twilio: { label: "Twilio", color: "bg-red-500" },
  bland_ai: { label: "Bland.ai", color: "bg-purple-500" },
  openai: { label: "OpenAI", color: "bg-green-500" },
  persona: { label: "Persona", color: "bg-blue-500" },
  doorloop: { label: "Doorloop", color: "bg-orange-500" },
  lead: { label: "Lead", color: "bg-primary" },
  showing: { label: "Showing", color: "bg-accent" },
  authentication: { label: "Auth", color: "bg-yellow-500" },
  system: { label: "System", color: "bg-gray-500" },
};

/**
 * Helper to get level display info
 */
export const LEVEL_CONFIG: Record<LogLevel, { label: string; bgColor: string; textColor: string }> = {
  info: { label: "Info", bgColor: "bg-muted", textColor: "text-muted-foreground" },
  warning: { label: "Warning", bgColor: "bg-warning/20", textColor: "text-warning" },
  error: { label: "Error", bgColor: "bg-orange-500/20", textColor: "text-orange-600" },
  critical: { label: "Critical", bgColor: "bg-destructive/20", textColor: "text-destructive" },
};
