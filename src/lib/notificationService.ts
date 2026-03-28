// Notification service for sending email alerts
// Uses fire-and-forget pattern to avoid blocking UI

import { supabase } from "@/integrations/supabase/client";
import {
  priorityLeadTemplate,
  noShowTemplate,
  criticalErrorTemplate,
  leadNoShowTemplate,
  leadCancelledShowingTemplate,
  leadRescheduledShowingTemplate,
} from "./emailTemplates";
import type { LeadShowingEmailData } from "./emailTemplates";
import {
  type EmailTemplateType,
  DEFAULT_CONFIGS,
  renderEmailHtml,
} from "./emailTemplateDefaults";

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
  queue?: boolean;
  campaignId?: string;
}

// Fire-and-forget email sender - queues by default to respect Resend rate limits
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
        queue: params.queue !== false,
        campaign_id: params.campaignId || undefined,
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

// Fetch available properties for re-engagement emails (no-show, cancelled, rescheduled)
export async function fetchAvailableProperties(
  organizationId: string,
  excludePropertyId?: string,
  limit = 5,
  city?: string
): Promise<Array<{ address: string; rent_price: number | null; bedrooms: number | null; section_8_accepted: boolean | null }>> {
  let query = supabase
    .from("properties")
    .select("address, rent_price, bedrooms, section_8_accepted")
    .eq("organization_id", organizationId)
    .eq("status", "available")
    .limit(limit);

  if (excludePropertyId) {
    query = query.neq("id", excludePropertyId);
  }

  if (city) {
    query = query.eq("city", city);
  }

  const { data } = await query;
  return data || [];
}

// Build "Other Available Properties" HTML block for branded templates
function buildPropertyListHtml(
  properties: LeadShowingEmailData["otherProperties"]
): string {
  if (properties.length === 0) return "";
  const PRIMARY = "#4F46E5";
  return `
    <div style="margin:20px 0;">
      <p style="margin:0 0 10px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;color:#333;">
        Other Available Properties
      </p>
      ${properties
        .map(
          (p) => `
        <div style="background:#f8f9fa;border-left:4px solid ${PRIMARY};border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:600;color:#1a1a1a;">${p.address}</p>
          <p style="margin:4px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#6b7280;">
            ${p.bedrooms ? `${p.bedrooms} bed` : ""}${p.rent_price ? ` · $${p.rent_price.toLocaleString()}/mo` : ""}${p.section_8_accepted ? " · Section 8 OK" : ""}
          </p>
        </div>`
        )
        .join("")}
    </div>`;
}

// Send showing re-engagement email to lead (no-show, cancelled, rescheduled)
// Uses the branded renderEmailHtml wrapper for a polished look
export async function sendLeadShowingEmail(params: {
  leadEmail: string;
  organizationId: string;
  showingId: string;
  type: "no_show" | "cancelled" | "rescheduled";
  emailData: LeadShowingEmailData;
}): Promise<void> {
  const { leadEmail, organizationId, showingId, type, emailData } = params;

  // Map type to configurable template key
  const templateTypeMap: Record<string, EmailTemplateType> = {
    no_show: "no_show",
    cancelled: "cancelled_showing",
    rescheduled: "rescheduled_showing",
  };
  const templateType = templateTypeMap[type];

  // Try to load org-customized template, fall back to defaults
  let config = DEFAULT_CONFIGS[templateType];
  try {
    const { data } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("organization_id", organizationId)
      .eq("key", "email_templates")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      const saved = data.value as Record<string, unknown>;
      if (saved[templateType]) {
        config = saved[templateType] as typeof config;
      }
    }
  } catch {
    // Use defaults if fetch fails
  }

  // Also fetch org name and sender domain for variables
  let orgName = "Home Guard Management";
  let senderDomain = "rentfindercleveland.com";
  try {
    const { data: settingsRows } = await supabase
      .from("organization_settings")
      .select("key, value")
      .eq("organization_id", organizationId)
      .in("key", ["org_name", "sender_domain"]);
    for (const row of settingsRows || []) {
      if (row.key === "org_name" && typeof row.value === "string") orgName = row.value;
      if (row.key === "sender_domain" && typeof row.value === "string") senderDomain = row.value;
    }
  } catch {
    // Use defaults
  }

  // Extract first name from lead name
  const firstName = emailData.leadName.split(" ")[0] || emailData.leadName;

  const variables: Record<string, string> = {
    "{firstName}": firstName,
    "{fullName}": emailData.leadName,
    "{propertyAddress}": emailData.propertyAddress,
    "{orgName}": orgName,
    "{senderDomain}": senderDomain,
    "{showingDate}": emailData.scheduledTime || "",
  };

  // Build property list HTML as extra content
  const propertyListHtml = buildPropertyListHtml(emailData.otherProperties);

  // Render the branded email
  const html = renderEmailHtml(config, variables, propertyListHtml);

  // Interpolate the subject line
  const subject = Object.entries(variables).reduce(
    (s, [k, v]) => s.replaceAll(k, v),
    config.subject
  );

  sendNotificationEmail({
    to: leadEmail,
    subject,
    html,
    notificationType: `showing_${type}_lead`,
    organizationId,
    relatedEntityId: showingId,
    relatedEntityType: "showing",
  });
}
