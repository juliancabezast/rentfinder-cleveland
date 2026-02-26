import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Processing limits
const BATCH_SIZE = 20;
const DELAY_MS = 500; // 500ms between tasks
const TASK_TIMEOUT_MS = 30_000; // 30s per task

// Exponential backoff schedule (minutes)
const BACKOFF_MINUTES = [5, 15, 60, 240, 720, 1440, 2880];

// Legacy agent_type → canonical agent_key mapping (mirrors frontend constants.ts)
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
  notification_dispatcher: "nehemiah",
  system_logger: "nehemiah",
  sms_inbound: "ruth",
  campaign_sms: "ruth",
  recapture: "elijah",
  campaign: "elijah",
  campaign_voice: "elijah",
  welcome_sequence: "elijah",
  showing_confirmation: "samuel",
  doorloop_pull: "samuel",
  no_show_followup: "samuel",
  no_show_follow_up: "samuel",
  post_showing: "samuel",
  cost_tracker: "zacchaeus",
  health_monitor: "zacchaeus",
};

function resolveAgentKey(agentType: string): string {
  return LEGACY_TO_CANONICAL[agentType] || agentType;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface OrgCreds {
  bland_api_key: string | null;
  twilio_phone_number: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  resend_api_key: string | null;
}

interface OrgSettings {
  sender_domain: string;
  outbound_pathway_id: string | null;
  org_name: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
// deno-lint-ignore no-explicit-any
type AgentTask = any;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function completeTask(supabase: SupabaseClient, taskId: string) {
  await supabase
    .from("agent_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId);
}

async function failTask(
  supabase: SupabaseClient,
  task: AgentTask,
  errorMsg: string
) {
  const attempt = task.attempt_number || 1;
  const maxAttempts = task.max_attempts || 7;

  if (attempt < maxAttempts) {
    const delay =
      BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
    const nextRun = new Date(Date.now() + delay * 60 * 1000);

    await supabase
      .from("agent_tasks")
      .update({
        status: "pending",
        attempt_number: attempt + 1,
        scheduled_for: nextRun.toISOString(),
        context: {
          ...task.context,
          last_error: errorMsg,
          last_attempt_at: new Date().toISOString(),
        },
      })
      .eq("id", task.id);
  } else {
    await supabase
      .from("agent_tasks")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        context: { ...task.context, final_error: errorMsg },
      })
      .eq("id", task.id);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Task execution timed out")), ms)
    ),
  ]);
}

const escapeHtml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleShowingConfirmation(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  creds: OrgCreds,
  settings: OrgSettings
): Promise<string> {
  const ctx = task.context || {};
  const propertyAddress = ctx.property_address || "your scheduled property";
  const scheduledAt = ctx.scheduled_at || "";

  // Format date for message
  let dateStr = scheduledAt;
  try {
    const d = new Date(scheduledAt);
    dateStr = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    /* keep raw */
  }

  // Try call first if lead has phone and Bland is configured
  if (lead.phone && creds.bland_api_key && settings.outbound_pathway_id) {
    // Compliance check
    const { data: complianceOk } = await supabase.rpc(
      "joseph_compliance_check",
      {
        p_lead_id: task.lead_id,
        p_contact_method: "call",
        p_agent_key: "samuel",
      }
    );

    if (complianceOk !== false) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const callResp = await fetch("https://api.bland.ai/v1/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.bland_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: lead.phone,
          from: creds.twilio_phone_number,
          pathway_id: settings.outbound_pathway_id,
          voice: "maya",
          language: "en",
          timezone: "America/New_York",
          max_duration: 5,
          record: true,
          wait_for_greeting: true,
          request_data: {
            lead_id: task.lead_id,
            lead_first_name: lead.full_name?.split(" ")[0] || "",
            lead_last_name: lead.full_name?.split(" ").slice(1).join(" ") || "",
            lead_name: lead.full_name || "",
            lead_email: lead.email || "",
            lead_phone: lead.phone,
            property_id: ctx.property_id || "",
            property_address: propertyAddress,
            property_rent: "",
            property_bedrooms: "",
            property_bathrooms: "",
            organization_id: task.organization_id,
            webhook_secret: Deno.env.get("BLAND_WEBHOOK_SECRET") || "",
            task_type: "showing_confirmation",
            showing_id: ctx.showing_id || "",
            scheduled_at: scheduledAt,
          },
          webhook: `${supabaseUrl}/functions/v1/pathway-webhook`,
          metadata: {
            agent_key: "samuel",
            call_type: "showing_confirmation",
            lead_id: task.lead_id,
            property_id: ctx.property_id || "",
            organization_id: task.organization_id,
            showing_id: ctx.showing_id || "",
          },
        }),
      });

      const callData = await callResp.json();
      if (callResp.ok && callData.call_id) {
        await supabase
          .from("agent_tasks")
          .update({ result_call_id: null })
          .eq("id", task.id);

        try {
          await supabase.rpc("zacchaeus_record_cost", {
            p_organization_id: task.organization_id,
            p_service: "bland",
            p_usage_quantity: 1,
            p_usage_unit: "call",
            p_unit_cost: 0.09,
            p_total_cost: 0.09,
            p_lead_id: task.lead_id,
          });
        } catch {
          /* non-blocking */
        }

        return `Bland.ai confirmation call initiated (${callData.call_id})`;
      }
      // Fall through to SMS/email if call failed
    }
  }

  // Fallback: SMS if lead has phone
  if (lead.phone) {
    const smsBody = `Hi ${lead.full_name?.split(" ")[0] || "there"}! This is a reminder about your showing at ${propertyAddress} on ${dateStr}. Reply YES to confirm or call us to reschedule.`;

    const { error } = await supabase.functions.invoke("send-message", {
      body: {
        lead_id: task.lead_id,
        channel: "sms",
        body: smsBody,
        organization_id: task.organization_id,
      },
    });

    if (!error) return "Confirmation SMS sent";
  }

  // Fallback: Email
  if (lead.email) {
    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: lead.email,
          subject: `Showing Reminder — ${propertyAddress}`,
          html: buildShowingConfirmationEmail(
            lead.full_name || "there",
            propertyAddress,
            dateStr
          ),
          notification_type: "showing_confirmation",
          organization_id: task.organization_id,
          related_entity_id: task.lead_id,
          related_entity_type: "lead",
          queue: true,
        },
      }
    );
    if (!error) return "Confirmation email queued";
  }

  throw new Error("Lead has no phone or email for confirmation");
}

async function handleSmsInbound(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask
): Promise<string> {
  if (!lead.phone) {
    throw new Error("Lead has no phone number for SMS");
  }

  const ctx = task.context || {};
  const instruction = ctx.instruction || "";

  // Build a friendly SMS from the instruction
  let smsBody: string;
  if (ctx.task === "intro_missing_info") {
    const firstName = lead.full_name?.split(" ")[0];
    const property = ctx.parsed_property || "a property";
    smsBody = firstName
      ? `Hi ${firstName}! Thanks for your interest in ${property}. Could you share your full name so we can assist you better?`
      : `Hi! Thanks for your interest in ${property}. Could you share your name so we can help you with your search?`;
  } else {
    smsBody =
      instruction ||
      "Hi! We received your inquiry. Could you provide some additional details so we can assist you?";
  }

  const { error } = await supabase.functions.invoke("send-message", {
    body: {
      lead_id: task.lead_id,
      channel: "sms",
      body: smsBody,
      organization_id: task.organization_id,
    },
  });

  if (error) throw new Error(`send-message failed: ${error.message}`);
  return "SMS sent for missing info";
}

async function handleWelcomeSequence(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  settings: OrgSettings
): Promise<string> {
  const ctx = task.context || {};
  const leadName = lead.full_name || ctx.email?.split("@")[0] || "there";
  const firstName = leadName.split(" ")[0];

  // Try email first
  if (lead.email || ctx.email) {
    const email = lead.email || ctx.email;

    // Get property info if available
    let propertyInfo = "";
    if (ctx.interested_property_id || lead.interested_property_id) {
      const { data: prop } = await supabase
        .from("properties")
        .select("address, rent_amount, bedrooms, bathrooms")
        .eq("id", ctx.interested_property_id || lead.interested_property_id)
        .single();

      if (prop) {
        propertyInfo = `
          <div style="background-color:#f9f5fc;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #370d4b;">
            <p style="margin:0 0 4px;font-weight:600;color:#370d4b;">${escapeHtml(prop.address)}</p>
            <p style="margin:0;color:#666;">
              ${prop.bedrooms ? `${prop.bedrooms} bed` : ""}${prop.bathrooms ? ` / ${prop.bathrooms} bath` : ""}${prop.rent_amount ? ` — $${prop.rent_amount}/mo` : ""}
            </p>
          </div>`;
      }
    }

    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: email,
          subject: `Welcome to ${settings.org_name}!`,
          html: buildWelcomeEmail(firstName, propertyInfo, settings.sender_domain, settings.org_name),
          notification_type: "welcome_sequence",
          organization_id: task.organization_id,
          related_entity_id: task.lead_id,
          related_entity_type: "lead",
          from_name: settings.org_name,
          queue: true,
        },
      }
    );

    if (!error) return "Welcome email queued";
  }

  // Fallback: SMS
  if (lead.phone || ctx.phone) {
    const { error } = await supabase.functions.invoke("send-message", {
      body: {
        lead_id: task.lead_id,
        channel: "sms",
        body: `Hi ${firstName}! Welcome to ${settings.org_name}. We're excited to help you find your next home. Check out available properties at ${settings.sender_domain}. Reply with any questions!`,
        organization_id: task.organization_id,
      },
    });

    if (!error) return "Welcome SMS sent";
  }

  throw new Error("Lead has no email or phone for welcome sequence");
}

async function handleRecapture(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  creds: OrgCreds,
  settings: OrgSettings
): Promise<string> {
  const ctx = task.context || {};

  if (task.action_type === "call") {
    if (!lead.phone) throw new Error("Lead has no phone for recapture call");
    if (!creds.bland_api_key || !settings.outbound_pathway_id) {
      throw new Error("Bland.ai not configured for outbound calls");
    }

    const { data: complianceOk } = await supabase.rpc(
      "joseph_compliance_check",
      {
        p_lead_id: task.lead_id,
        p_contact_method: "call",
        p_agent_key: "elijah",
      }
    );

    if (complianceOk === false) {
      throw new Error("Compliance check failed for recapture call");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const propertyAddress = ctx.property_address || "";

    const callResp = await fetch("https://api.bland.ai/v1/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.bland_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: lead.phone,
        from: creds.twilio_phone_number,
        pathway_id: settings.outbound_pathway_id,
        voice: "maya",
        language: "en",
        timezone: "America/New_York",
        max_duration: 10,
        record: true,
        wait_for_greeting: true,
        request_data: {
          lead_id: task.lead_id,
          lead_first_name: lead.full_name?.split(" ")[0] || "",
          lead_last_name:
            lead.full_name?.split(" ").slice(1).join(" ") || "",
          lead_name: lead.full_name || "",
          lead_email: lead.email || "",
          lead_phone: lead.phone,
          property_id: ctx.property_id || "",
          property_address: propertyAddress,
          property_rent: ctx.property_rent || "",
          property_bedrooms: ctx.property_bedrooms || "",
          property_bathrooms: ctx.property_bathrooms || "",
          organization_id: task.organization_id,
          webhook_secret: Deno.env.get("BLAND_WEBHOOK_SECRET") || "",
        },
        webhook: `${supabaseUrl}/functions/v1/pathway-webhook`,
        metadata: {
          agent_key: "elijah",
          call_type: "outbound_recapture",
          lead_id: task.lead_id,
          property_id: ctx.property_id || "",
          organization_id: task.organization_id,
        },
      }),
    });

    const callData = await callResp.json();
    if (!callResp.ok) {
      throw new Error(
        `Bland.ai call failed: ${callData.message || callResp.status}`
      );
    }

    try {
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: task.organization_id,
        p_service: "bland",
        p_usage_quantity: 1,
        p_usage_unit: "call",
        p_unit_cost: 0.09,
        p_total_cost: 0.09,
        p_lead_id: task.lead_id,
      });
    } catch {
      /* non-blocking */
    }

    return `Recapture call initiated (${callData.call_id})`;
  }

  // SMS recapture
  if (!lead.phone) throw new Error("Lead has no phone for recapture SMS");

  const firstName = lead.full_name?.split(" ")[0] || "there";
  const smsBody =
    ctx.message ||
    `Hi ${firstName}! We noticed you were looking at rentals in Cleveland. We have new properties available that might interest you. Reply STOP to opt out.`;

  const { error } = await supabase.functions.invoke("send-message", {
    body: {
      lead_id: task.lead_id,
      channel: "sms",
      body: smsBody,
      organization_id: task.organization_id,
    },
  });

  if (error) throw new Error(`send-message failed: ${error.message}`);
  return "Recapture SMS sent";
}

async function handleNoShowFollowup(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask
): Promise<string> {
  const ctx = task.context || {};
  const firstName = lead.full_name?.split(" ")[0] || "there";
  const propertyAddress = ctx.property_address || "the property";

  if (lead.phone && task.action_type === "sms") {
    const smsBody = `Hi ${firstName}, we missed you at the showing for ${propertyAddress}. Would you like to reschedule? We're happy to find a time that works better for you. Reply YES to reschedule.`;

    const { error } = await supabase.functions.invoke("send-message", {
      body: {
        lead_id: task.lead_id,
        channel: "sms",
        body: smsBody,
        organization_id: task.organization_id,
      },
    });

    if (!error) return "No-show follow-up SMS sent";
  }

  if (lead.email) {
    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: lead.email,
          subject: `Missed Showing — ${propertyAddress}`,
          html: buildNoShowEmail(firstName, propertyAddress),
          notification_type: "no_show_followup",
          organization_id: task.organization_id,
          related_entity_id: task.lead_id,
          related_entity_type: "lead",
          queue: true,
        },
      }
    );
    if (!error) return "No-show follow-up email queued";
  }

  throw new Error("Lead has no phone or email for no-show follow-up");
}

async function handlePostShowing(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask
): Promise<string> {
  const ctx = task.context || {};
  const firstName = lead.full_name?.split(" ")[0] || "there";
  const propertyAddress = ctx.property_address || "the property";

  if (lead.email) {
    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: lead.email,
          subject: `Next Steps — ${propertyAddress}`,
          html: buildPostShowingEmail(firstName, propertyAddress),
          notification_type: "post_showing",
          organization_id: task.organization_id,
          related_entity_id: task.lead_id,
          related_entity_type: "lead",
          queue: true,
        },
      }
    );
    if (!error) return "Post-showing email queued";
  }

  if (lead.phone) {
    const smsBody = `Hi ${firstName}! Thanks for visiting ${propertyAddress} today. If you'd like to move forward with an application, reply APPLY or visit rentfindercleveland.com.`;

    const { error } = await supabase.functions.invoke("send-message", {
      body: {
        lead_id: task.lead_id,
        channel: "sms",
        body: smsBody,
        organization_id: task.organization_id,
      },
    });

    if (!error) return "Post-showing SMS sent";
  }

  throw new Error("Lead has no email or phone for post-showing follow-up");
}

async function handleNotificationDispatch(
  supabase: SupabaseClient,
  task: AgentTask
): Promise<string> {
  // Stub: log context and mark completed
  console.log(
    `Notification dispatch task ${task.id}:`,
    JSON.stringify(task.context)
  );
  return "Notification logged (stub handler)";
}

async function handleCampaign(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask
): Promise<string> {
  // Stub: log and complete
  console.log(
    `Campaign task ${task.id}:`,
    task.action_type,
    JSON.stringify(task.context)
  );
  return "Campaign task logged (stub handler)";
}

// ── Email Templates ──────────────────────────────────────────────────────────

function buildShowingConfirmationEmail(
  name: string,
  address: string,
  date: string
): string {
  return `<div style="font-family:'Montserrat',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Home Guard Management</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <h2 style="color:#370d4b;margin-top:0;">Showing Reminder</h2>
      <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
      <p>This is a friendly reminder about your upcoming showing:</p>
      <div style="background-color:#f9f5fc;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #370d4b;">
        <p style="margin:0 0 4px;font-weight:600;color:#370d4b;">${escapeHtml(address)}</p>
        <p style="margin:0;color:#666;">${escapeHtml(date)}</p>
      </div>
      <p>Please reply to this email or call us if you need to reschedule.</p>
      <p style="color:#666;font-size:14px;">— Home Guard Management</p>
    </div>
  </div>`;
}

function buildWelcomeEmail(firstName: string, propertyInfo: string, senderDomain: string, orgName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to ${escapeHtml(orgName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3eef8;font-family:'Montserrat','Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3eef8;">
<tr><td style="padding:24px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#370d4b 0%,#5a1d7a 100%);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="margin:0 0 4px;color:#ffb22c;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(orgName)}</h1>
    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;">Quality Rental Homes in Cleveland</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">

    <h2 style="color:#370d4b;margin:0 0 16px;font-size:22px;font-weight:700;">Welcome, ${escapeHtml(firstName)}!</h2>

    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Thank you for your interest in our rental properties. We're excited to help you find your next home in Cleveland.
    </p>

    ${propertyInfo}

    <!-- Steps -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;">
      <tr><td style="padding:12px 16px;background-color:#f9f5fc;border-radius:10px;">
        <p style="margin:0 0 12px;font-weight:600;color:#370d4b;font-size:15px;">Here's what happens next:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;"><span style="display:inline-block;width:22px;height:22px;background-color:#370d4b;color:#ffb22c;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">1</span></td>
            <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">We'll match you with available properties based on your preferences</td>
          </tr>
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;"><span style="display:inline-block;width:22px;height:22px;background-color:#370d4b;color:#ffb22c;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">2</span></td>
            <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">Schedule a showing at your convenience</td>
          </tr>
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;"><span style="display:inline-block;width:22px;height:22px;background-color:#370d4b;color:#ffb22c;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">3</span></td>
            <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">Apply online and move in!</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- CTA Buttons -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 24px;">
      <tr><td style="text-align:center;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://${senderDomain}/p/book-showing" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" fillcolor="#ffb22c" stroke="f"><v:textbox inset="0,0,0,0"><center style="color:#370d4b;font-family:'Montserrat',sans-serif;font-size:15px;font-weight:700;">Book a Showing</center></v:textbox></v:roundrect><![endif]-->
        <!--[if !mso]><!-->
        <a href="https://${senderDomain}/p/book-showing" style="display:inline-block;background-color:#ffb22c;color:#370d4b;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;line-height:1;">Book a Showing</a>
        <!--<![endif]-->
      </td></tr>
      <tr><td style="text-align:center;padding-top:12px;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=rfc" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" fillcolor="#370d4b" stroke="f"><v:textbox inset="0,0,0,0"><center style="color:#ffffff;font-family:'Montserrat',sans-serif;font-size:15px;font-weight:700;">Apply Now</center></v:textbox></v:roundrect><![endif]-->
        <!--[if !mso]><!-->
        <a href="https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=rfc" style="display:inline-block;background-color:#370d4b;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;line-height:1;">Apply Now</a>
        <!--<![endif]-->
      </td></tr>
    </table>

    <!-- Section 8 Badge -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
      <tr><td style="text-align:center;padding:14px 20px;background:linear-gradient(135deg,#e8f5e9 0%,#f1f8e9 100%);border-radius:10px;border:1px solid #c8e6c9;">
        <p style="margin:0;color:#2e7d32;font-size:14px;font-weight:600;">
          &#10003; We accept Section 8 Housing Choice Vouchers
        </p>
      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background-color:#faf8ff;padding:24px 32px;border-radius:0 0 16px 16px;border:1px solid #e5e5e5;border-top:none;text-align:center;">
    <p style="margin:0 0 8px;color:#666;font-size:13px;">Questions? Simply reply to this email — we're here to help.</p>
    <p style="margin:0;color:#999;font-size:12px;">${escapeHtml(orgName)} &middot; Cleveland, OH</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildNoShowEmail(firstName: string, address: string): string {
  return `<div style="font-family:'Montserrat',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Home Guard Management</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <h2 style="color:#370d4b;margin-top:0;">We Missed You!</h2>
      <p>Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p>We noticed you weren't able to make it to the showing at <strong>${escapeHtml(address)}</strong>. No worries — we'd love to reschedule!</p>
      <p>Reply to this email or give us a call to find a time that works better for you.</p>
      <p style="color:#666;font-size:14px;">— Home Guard Management</p>
    </div>
  </div>`;
}

function buildPostShowingEmail(firstName: string, address: string): string {
  return `<div style="font-family:'Montserrat',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Home Guard Management</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <h2 style="color:#370d4b;margin-top:0;">Thanks for Visiting!</h2>
      <p>Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p>Thanks for visiting <strong>${escapeHtml(address)}</strong> today! We hope you enjoyed the tour.</p>
      <p><strong>Ready to apply?</strong> You can start your rental application online:</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://rentfindercleveland.com" style="background-color:#ffb22c;color:#370d4b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Start Application</a>
      </div>
      <p>If you have any questions or would like to schedule another showing, just reply to this email.</p>
      <p style="color:#666;font-size:14px;">— Home Guard Management</p>
    </div>
  </div>`;
}

// ── Router ────────────────────────────────────────────────────────────────────

async function dispatchTask(
  supabase: SupabaseClient,
  task: AgentTask,
  creds: OrgCreds,
  settings: OrgSettings
): Promise<string> {
  // Fetch lead info
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, full_name, phone, email, interested_property_id, sms_consent, call_consent"
    )
    .eq("id", task.lead_id)
    .single();

  if (leadErr || !lead) {
    throw new Error(`Lead not found: ${task.lead_id}`);
  }

  switch (task.agent_type) {
    case "showing_confirmation":
      return handleShowingConfirmation(supabase, task, lead, creds, settings);
    case "sms_inbound":
      return handleSmsInbound(supabase, task, lead);
    case "welcome_sequence":
      return handleWelcomeSequence(supabase, task, lead, settings);
    case "recapture":
      return handleRecapture(supabase, task, lead, creds, settings);
    case "no_show_followup":
      return handleNoShowFollowup(supabase, task, lead);
    case "post_showing":
      return handlePostShowing(supabase, task, lead);
    case "notification_dispatcher":
      return handleNotificationDispatch(supabase, task);
    case "campaign_voice":
    case "campaign":
      return handleCampaign(supabase, task, lead);
    default:
      throw new Error(`Unknown agent_type: ${task.agent_type}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const startTime = Date.now();

    // Get all organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name");

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, dispatched: 0, message: "No orgs" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let totalDispatched = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalHumanControlled = 0;
    const allResults: {
      taskId: string;
      status: string;
      reason?: string;
    }[] = [];

    for (const org of orgs) {
      // Get credentials
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select(
          "bland_api_key, twilio_phone_number, twilio_account_sid, twilio_auth_token, resend_api_key"
        )
        .eq("organization_id", org.id)
        .single();

      // Get settings
      const { data: settingsRows } = await supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", org.id)
        .in("key", ["sender_domain", "outbound_pathway_id"]);

      const settingsMap: Record<string, string> = {};
      for (const s of settingsRows || []) {
        settingsMap[s.key] = s.value;
      }

      const orgCreds: OrgCreds = {
        bland_api_key: creds?.bland_api_key || null,
        twilio_phone_number: creds?.twilio_phone_number || null,
        twilio_account_sid: creds?.twilio_account_sid || null,
        twilio_auth_token: creds?.twilio_auth_token || null,
        resend_api_key: creds?.resend_api_key || null,
      };

      const orgSettings: OrgSettings = {
        sender_domain:
          settingsMap["sender_domain"] || "rentfindercleveland.com",
        outbound_pathway_id: settingsMap["outbound_pathway_id"] || null,
        org_name: org.name || "Home Guard Management",
      };

      // Atomically claim pending tasks
      const { data: tasks, error: claimErr } = await supabase.rpc(
        "claim_pending_tasks",
        {
          p_organization_id: org.id,
          p_batch_size: BATCH_SIZE,
        }
      );

      if (claimErr) {
        console.error(
          `Failed to claim tasks for org ${org.id}:`,
          claimErr.message
        );
        continue;
      }

      if (!tasks || tasks.length === 0) continue;

      for (const task of tasks) {
        const taskStart = Date.now();
        const canonicalAgent = resolveAgentKey(task.agent_type);

        try {
          const result = await withTimeout(
            dispatchTask(supabase, task, orgCreds, orgSettings),
            TASK_TIMEOUT_MS
          );

          await completeTask(supabase, task.id);
          totalDispatched++;
          allResults.push({
            taskId: task.id,
            status: "completed",
            reason: result,
          });

          const execMs = Date.now() - taskStart;

          // Log activity + update counters (non-blocking)
          try {
            await Promise.all([
              supabase.from("agent_activity_log").insert({
                organization_id: org.id,
                agent_key: canonicalAgent,
                action: task.action_type || task.agent_type,
                status: "success",
                message: result,
                execution_ms: execMs,
                related_lead_id: task.lead_id || null,
                related_task_id: task.id,
              }),
              supabase.rpc("log_agent_execution", {
                p_organization_id: org.id,
                p_agent_key: canonicalAgent,
                p_success: true,
                p_execution_ms: execMs,
              }),
            ]);
          } catch { /* non-blocking */ }
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.message : String(err);
          console.warn(
            `Task ${task.id} (${task.agent_type}/${task.action_type}) failed:`,
            errMsg
          );

          await failTask(supabase, task, errMsg);
          totalFailed++;
          allResults.push({
            taskId: task.id,
            status: "failed",
            reason: errMsg,
          });

          const execMs = Date.now() - taskStart;

          // Log failure + update counters (non-blocking)
          try {
            await Promise.all([
              supabase.from("agent_activity_log").insert({
                organization_id: org.id,
                agent_key: canonicalAgent,
                action: task.action_type || task.agent_type,
                status: "failure",
                message: errMsg.slice(0, 500),
                execution_ms: execMs,
                related_lead_id: task.lead_id || null,
                related_task_id: task.id,
              }),
              supabase.rpc("log_agent_execution", {
                p_organization_id: org.id,
                p_agent_key: canonicalAgent,
                p_success: false,
                p_execution_ms: execMs,
              }),
            ]);
          } catch { /* non-blocking */ }
        }

        // Delay between tasks
        if (tasks.indexOf(task) < tasks.length - 1) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      }

      // System log per org
      const orgDispatched = allResults.filter(
        (r) => r.status === "completed"
      ).length;
      const orgFailed = allResults.filter(
        (r) => r.status === "failed"
      ).length;

      if (orgDispatched > 0 || orgFailed > 0) {
        try {
          await supabase.from("system_logs").insert({
            organization_id: org.id,
            level: orgFailed > 0 ? "warning" : "info",
            category: "general",
            event_type: "task_dispatched",
            message: `Nehemiah: ${orgDispatched} dispatched, ${orgFailed} failed out of ${tasks.length} tasks`,
            details: {
              dispatched: orgDispatched,
              failed: orgFailed,
              total: tasks.length,
              results: allResults.slice(-20),
            },
          });
        } catch {
          /* non-blocking */
        }
      }
    }

    const executionMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: totalDispatched,
        skipped: totalSkipped,
        failed: totalFailed,
        human_controlled: totalHumanControlled,
        execution_ms: executionMs,
        results: allResults.slice(-50),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("agent-task-dispatcher error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
