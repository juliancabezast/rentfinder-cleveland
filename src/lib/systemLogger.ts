import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

async function getOrgAdminEmail(organizationId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("organizations")
      .select("owner_email")
      .eq("id", organizationId)
      .single();
    return data?.owner_email || null;
  } catch {
    return null;
  }
}

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

      try {
        const adminEmail = params.organization_id
          ? await getOrgAdminEmail(params.organization_id)
          : "admin@rentfindercleveland.com";

        if (adminEmail) {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              to: adminEmail,
              subject: `🚨 CRITICAL: ${params.event_type} - ${params.category}`,
              html: `
                <h2>Critical System Alert</h2>
                <p><strong>${params.message}</strong></p>
                <table style="border-collapse: collapse; margin: 16px 0;">
                  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Category:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${params.category}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Event:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${params.event_type}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toISOString()}</td></tr>
                  ${params.details ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Details:</strong></td><td style="padding: 8px; border: 1px solid #ddd;"><pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(params.details, null, 2)}</pre></td></tr>` : ""}
                </table>
                <p>Review this in your <a href="https://cleveland-lease-buddy.lovable.app/system-logs">System Logs</a>.</p>
              `,
              notification_type: "critical_error",
              organization_id: params.organization_id,
            },
          });
        }
      } catch (emailErr) {
        console.error("Failed to send critical error email:", emailErr);
      }
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
