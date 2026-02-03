// Notification service for sending email alerts
// Uses fire-and-forget pattern to avoid blocking UI

import { supabase } from "@/integrations/supabase/client";
import {
  priorityLeadTemplate,
  noShowTemplate,
  criticalErrorTemplate,
  testEmailTemplate,
} from "./emailTemplates";

// Default notification preferences
export const DEFAULT_NOTIFICATION_PREFS = {
  priority_lead: true,
  no_show: true,
  critical_error: true,
  daily_summary: false,
  score_jump: false,
  notification_email: "",
};

export type NotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFS;

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  notificationType: string;
  organizationId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

// Fire-and-forget email sender - doesn't block UI
export function sendNotificationEmail(params: SendEmailParams): void {
  supabase.functions
    .invoke("send-notification-email", {
      body: {
        to: params.to,
        subject: params.subject,
        html: params.html,
        notification_type: params.notificationType,
        organization_id: params.organizationId,
        related_entity_id: params.relatedEntityId,
        related_entity_type: params.relatedEntityType,
      },
    })
    .catch((err) => {
      console.error("Email notification failed:", err);
    });
}

// Get app URL for email links
function getAppUrl(): string {
  // Use window.location.origin for the current app URL
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://rentfindercleveland.com";
}

// Send priority lead notification
export function sendPriorityLeadNotification(params: {
  adminEmail: string;
  organizationId: string;
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    email: string | null;
    lead_score: number | null;
    priority_reason: string | null;
    source: string;
  };
  propertyAddress?: string;
}): void {
  const { adminEmail, organizationId, lead, propertyAddress } = params;
  const leadName = lead.full_name || "Unknown Lead";

  sendNotificationEmail({
    to: adminEmail,
    subject: `🔥 Priority Lead: ${leadName}${propertyAddress ? ` — ${propertyAddress}` : ""}`,
    html: priorityLeadTemplate({
      leadName,
      phone: lead.phone,
      email: lead.email || undefined,
      leadScore: lead.lead_score || 0,
      priorityReason: lead.priority_reason || "High lead score",
      propertyAddress,
      source: lead.source,
      appUrl: getAppUrl(),
      leadId: lead.id,
    }),
    notificationType: "priority_lead",
    organizationId,
    relatedEntityId: lead.id,
    relatedEntityType: "lead",
  });
}

// Send showing no-show notification
export function sendNoShowNotification(params: {
  adminEmail: string;
  organizationId: string;
  showing: {
    id: string;
    scheduled_at: string;
  };
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
  };
  propertyAddress: string;
  agentName?: string;
}): void {
  const { adminEmail, organizationId, showing, lead, propertyAddress, agentName } = params;
  const leadName = lead.full_name || "Unknown Lead";

  sendNotificationEmail({
    to: adminEmail,
    subject: `⚠️ No-Show: ${leadName} missed showing at ${propertyAddress}`,
    html: noShowTemplate({
      leadName,
      phone: lead.phone,
      propertyAddress,
      scheduledTime: new Date(showing.scheduled_at).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      agentName,
      appUrl: getAppUrl(),
      showingId: showing.id,
      leadId: lead.id,
    }),
    notificationType: "showing_no_show",
    organizationId,
    relatedEntityId: showing.id,
    relatedEntityType: "showing",
  });
}

// Send critical error notification
export function sendCriticalErrorNotification(params: {
  adminEmail: string;
  organizationId?: string;
  service: string;
  eventType: string;
  errorMessage: string;
  affectedEntity?: string;
  suggestedAction?: string;
}): void {
  const { adminEmail, organizationId, service, eventType, errorMessage, affectedEntity, suggestedAction } =
    params;

  sendNotificationEmail({
    to: adminEmail,
    subject: `🚨 Critical Error: ${service} — ${eventType}`,
    html: criticalErrorTemplate({
      service,
      eventType,
      errorMessage,
      timestamp: new Date().toLocaleString(),
      affectedEntity,
      suggestedAction,
      appUrl: getAppUrl(),
    }),
    notificationType: "critical_error",
    organizationId,
  });
}

// Send test email
export async function sendTestEmail(params: {
  adminEmail: string;
  organizationId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        to: params.adminEmail,
        subject: "✅ Rent Finder Cleveland — Email Test Successful",
        html: testEmailTemplate(),
        notification_type: "test",
        organization_id: params.organizationId,
      },
    });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (err) {
    console.error("Test email failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send test email",
    };
  }
}
