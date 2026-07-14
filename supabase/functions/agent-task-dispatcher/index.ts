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

// Determine what action was actually performed by parsing the handler result
function parseActualAction(result: string, fallbackAction: string): string {
  const lower = result.toLowerCase();
  if (lower.includes("call initiated") || lower.includes("bland.ai") || lower.includes("call_id")) return "call";
  if (lower.includes("sms sent") || lower.includes("sms fallback")) return "sms";
  if (lower.includes("email sent") || lower.includes("email fallback") || lower.includes("notification email")) return "email";
  if (lower.includes("lead status")) return "lead status changed";
  if (lower.includes("showing")) return "showing created";
  return fallbackAction || "task";
}

// ── Types ────────────────────────────────────────────────────────────────────

interface OrgCreds {
  bland_api_key: string | null;
  twilio_phone_number: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  resend_api_key: string | null;
}

interface EmailButton {
  text: string;
  url: string;
  style: "primary" | "secondary";
}

interface EmailTemplateConfig {
  subject?: string;
  headerTitle: string;
  headerSubtitle?: string;
  bodyParagraphs: string[];
  buttons: EmailButton[];
  showPropertyCard: boolean;
  showSteps: boolean;
  stepTexts?: string[];
  showSection8Badge: boolean;
  footerText: string;
}

// deno-lint-ignore no-explicit-any
type EmailTemplatesMap = Record<string, any>;

interface OrgSettings {
  sender_domain: string;
  outbound_pathway_id: string | null;
  org_name: string;
  email_templates: EmailTemplatesMap | null;
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

// Self-healing property address resolver. Agent tasks queued by OLDER code
// paths sometimes have empty `context.property_address`, which made the
// dispatcher fall back to literal strings like "your scheduled property"
// in the email. This walks every available source (context.property_id,
// then showing_id → property_id) and formats a real address.
async function resolvePropertyAddress(
  supabase: SupabaseClient,
  ctx: Record<string, unknown>,
  fallback = "your scheduled property",
): Promise<string> {
  const fromCtx = (ctx?.property_address as string | undefined)?.trim();
  if (fromCtx) return fromCtx;

  type PropRow = {
    address: string | null;
    unit_number: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  };
  const fmt = (p: PropRow | null): string | null => {
    if (!p?.address) return null;
    const head = `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}`;
    const tail = [p.city, p.state, p.zip_code].filter(Boolean).join(" ");
    return tail ? `${head}, ${tail}` : head;
  };

  // 1) Look up by property_id directly
  const propId = ctx?.property_id as string | undefined;
  if (propId) {
    const { data } = await supabase
      .from("properties")
      .select("address, unit_number, city, state, zip_code")
      .eq("id", propId)
      .maybeSingle();
    const formatted = fmt(data as PropRow | null);
    if (formatted) return formatted;
  }

  // 2) Walk through the showing → property
  const showingId = ctx?.showing_id as string | undefined;
  if (showingId) {
    const { data: showing } = await supabase
      .from("showings")
      .select("property_id")
      .eq("id", showingId)
      .maybeSingle();
    const sPropId = (showing as { property_id?: string } | null)?.property_id;
    if (sPropId) {
      const { data: prop } = await supabase
        .from("properties")
        .select("address, unit_number, city, state, zip_code")
        .eq("id", sPropId)
        .maybeSingle();
      const formatted = fmt(prop as PropRow | null);
      if (formatted) return formatted;
    }
  }

  return fallback;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleShowingConfirmation(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  creds: OrgCreds,
  settings: OrgSettings
): Promise<string> {
  const ctx = task.context || {};
  const propertyAddress = await resolvePropertyAddress(supabase, ctx, "your scheduled property");
  const scheduledAt = ctx.scheduled_at || "";

  // Format date for message (Cleveland timezone)
  let dateStr = scheduledAt;
  try {
    const d = new Date(scheduledAt);
    dateStr = d.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
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
    const { data: compliance, error: complianceErr } = await supabase.rpc(
      "joseph_compliance_check",
      {
        p_organization_id: task.organization_id,
        p_lead_id: task.lead_id,
        p_action_type: "call",
        p_agent_key: "samuel",
      }
    );

    if (!complianceErr && compliance?.passed === true) {
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
    const firstName = lead.full_name?.split(" ")[0] || "there";
    const customConfig = settings.email_templates?.showing_confirmation as EmailTemplateConfig | undefined;
    let html: string;
    let subject: string;

    if (customConfig) {
      const vars: Record<string, string> = {
        "{firstName}": firstName,
        "{fullName}": lead.full_name || firstName,
        "{propertyAddress}": propertyAddress,
        "{showingDate}": dateStr,
        "{orgName}": settings.org_name,
        "{senderDomain}": settings.sender_domain,
      };
      html = buildEmailFromConfig(customConfig, vars);
      subject = interpolateVars(customConfig.subject || `Showing Reminder — ${propertyAddress}`, vars);
    } else {
      html = buildShowingConfirmationEmail(lead.full_name || "there", propertyAddress, dateStr);
      subject = `Showing Reminder — ${propertyAddress}`;
    }

    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: lead.email,
          subject,
          html,
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

// ── Esther enrichment follow-up (audit F18) ─────────────────────────────
// One-shot retry scheduled +48h after an incomplete lead was created. The old
// info-request was fire-once-at-creation and phone-only leads got NOTHING.
// Self-cancelling: if the lead completed in the meantime, do nothing.
async function handleEnrichmentFollowup(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  settings: OrgSettings
): Promise<string> {
  const hasName = !!(lead.full_name && !String(lead.full_name).startsWith("Hemlane Lead"));
  const hasPhone = !!lead.phone;

  if (hasName && hasPhone) {
    return "Lead completed on its own — enrichment follow-up not needed";
  }

  // Respect opt-outs and closed leads (review finding): a lead who
  // unsubscribed or was marked lost/converted within the 48h window must not
  // get a "still interested?" email.
  if ((lead as Record<string, unknown>).unsubscribed_at) {
    return "Lead unsubscribed — enrichment follow-up cancelled";
  }
  const leadStatus = String((lead as Record<string, unknown>).status || "");
  if (leadStatus === "lost" || leadStatus === "converted") {
    return `Lead is ${leadStatus} — enrichment follow-up cancelled`;
  }

  if (lead.email) {
    const missing: string[] = [];
    if (!hasName) missing.push("<li><strong>Your full name</strong></li>");
    if (!hasPhone) missing.push("<li><strong>Best phone number</strong> to reach you</li>");
    const { error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        to: lead.email,
        subject: `Still interested? We'd love to help — ${settings.org_name}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
            <h1 style="margin:0;color:#ffb22c;font-size:20px;">Just checking in!</h1>
          </div>
          <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
            <p>Hi there! You reached out about one of our rentals a couple of days ago and we'd love to get you scheduled for a showing.</p>
            <p>Could you reply with:</p>
            <ul>${missing.join("")}</ul>
            <p>Just hit reply — your answer comes straight to our leasing team.</p>
            <br>
            <p style="color:#666;font-size:14px;">— The ${settings.org_name} Team</p>
          </div>
        </div>`,
        notification_type: "lead_info_request",
        organization_id: task.organization_id,
        related_entity_id: task.lead_id,
        related_entity_type: "lead",
        from_name: settings.org_name,
        queue: true,
      },
    });
    if (error) throw new Error(`Enrichment follow-up email failed: ${error.message}`);
    return `Enrichment follow-up email queued to ${lead.email} (missing: ${!hasName ? "name " : ""}${!hasPhone ? "phone" : ""})`;
  }

  // Phone-only lead (no email): no compliant automated channel exists since
  // SMS automation was removed — surface it to a human instead of doing nothing.
  await supabase.from("system_logs").insert({
    organization_id: task.organization_id,
    level: "warning",
    category: "general",
    event_type: "esther_manual_enrichment_needed",
    message: `Lead ${lead.full_name || task.lead_id} is still incomplete after 48h and has no email — needs a manual call/text to complete their info.`,
    details: { lead_id: task.lead_id, phone: lead.phone, missing_name: !hasName },
    related_lead_id: task.lead_id,
  });
  return "Phone-only lead flagged for manual enrichment (no automated channel)";
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

    // City-only interest context (comms policy: never name a specific property).
    // Cities derive from the lead's property-interest tags (lead_property_interests).
    let propertyInfo = "";
    let cities: string[] = [];
    {
      const { data: tagRows } = await supabase
        .from("lead_property_interests")
        .select("properties:property_id(city)")
        .eq("lead_id", task.lead_id)
        .order("last_interest_at", { ascending: false })
        .limit(10);
      cities = [
        ...new Set(
          ((tagRows as { properties: { city: string | null } | null }[] | null) || [])
            .map((r) => r.properties?.city)
            .filter((c): c is string => !!c)
        ),
      ];
      if (cities.length) {
        const cityPhrase = `homes in ${cities.slice(0, 3).join(", ")}`;
        propertyInfo = `
          <div style="background-color:#EEF2FF;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #4F46E5;">
            <p style="margin:0 0 4px;font-weight:600;color:#4F46E5;">Thanks for your interest in ${escapeHtml(cityPhrase)}!</p>
            <p style="margin:0;color:#666;"><a href="https://${settings.sender_domain}" style="color:#4F46E5;">Browse all current listings</a></p>
          </div>`;
      }
    }

    // Check for custom template
    const customConfig = settings.email_templates?.welcome as EmailTemplateConfig | undefined;
    let html: string;
    let subject: string;

    if (customConfig) {
      const vars: Record<string, string> = {
        "{firstName}": firstName,
        "{fullName}": lead.full_name || firstName,
        // Property-level vars retired (city-only comms policy) — kept as empty
        // strings so any legacy template placeholders resolve blank, not literal.
        "{propertyAddress}": "",
        "{propertyRent}": "",
        "{propertyBeds}": "",
        "{propertyBaths}": "",
        "{interestCities}": cities.join(", "),
        "{orgName}": settings.org_name,
        "{senderDomain}": settings.sender_domain,
      };
      html = buildEmailFromConfig(customConfig, vars, propertyInfo || undefined);
      subject = interpolateVars(customConfig.subject || `Welcome to ${settings.org_name}!`, vars);
    } else {
      html = buildWelcomeEmail(firstName, propertyInfo, settings.sender_domain, settings.org_name);
      subject = `Welcome to ${settings.org_name}!`;
    }

    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: email,
          subject,
          html,
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

    const { data: compliance, error: complianceErr } = await supabase.rpc(
      "joseph_compliance_check",
      {
        p_organization_id: task.organization_id,
        p_lead_id: task.lead_id,
        p_action_type: "call",
        p_agent_key: "elijah",
      }
    );

    if (complianceErr || compliance?.passed !== true) {
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
  lead: AgentTask,
  settings: OrgSettings
): Promise<string> {
  const ctx = task.context || {};
  const firstName = lead.full_name?.split(" ")[0] || "there";
  const propertyAddress = await resolvePropertyAddress(supabase, ctx, "the property");

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
    const customConfig = settings.email_templates?.no_show as EmailTemplateConfig | undefined;
    let html: string;
    let subject: string;

    if (customConfig) {
      const vars: Record<string, string> = {
        "{firstName}": firstName,
        "{fullName}": lead.full_name || firstName,
        "{propertyAddress}": propertyAddress,
        "{orgName}": settings.org_name,
        "{senderDomain}": settings.sender_domain,
      };
      html = buildEmailFromConfig(customConfig, vars);
      subject = interpolateVars(customConfig.subject || `We Missed You — ${propertyAddress}`, vars);
    } else {
      html = buildNoShowEmail(firstName, propertyAddress);
      subject = `Missed Showing — ${propertyAddress}`;
    }

    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: lead.email,
          subject,
          html,
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
  lead: AgentTask,
  settings: OrgSettings
): Promise<string> {
  const ctx = task.context || {};
  const firstName = lead.full_name?.split(" ")[0] || "there";
  const propertyAddress = await resolvePropertyAddress(supabase, ctx, "the property");

  if (lead.email) {
    const customConfig = settings.email_templates?.post_showing as EmailTemplateConfig | undefined;
    let html: string;
    let subject: string;

    if (customConfig) {
      const vars: Record<string, string> = {
        "{firstName}": firstName,
        "{fullName}": lead.full_name || firstName,
        "{propertyAddress}": propertyAddress,
        "{orgName}": settings.org_name,
        "{senderDomain}": settings.sender_domain,
      };
      html = buildEmailFromConfig(customConfig, vars);
      subject = interpolateVars(customConfig.subject || `Next Steps — ${propertyAddress}`, vars);
    } else {
      html = buildPostShowingEmail(firstName, propertyAddress);
      subject = `Next Steps — ${propertyAddress}`;
    }

    const { error } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: {
          to: lead.email,
          subject,
          html,
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
    const smsBody = `Hi ${firstName}! Thanks for visiting ${propertyAddress} today. If you'd like to move forward with an application, reply APPLY or visit ${settings.sender_domain}.`;

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
  _supabase: SupabaseClient,
  task: AgentTask
): Promise<string> {
  // notification_dispatcher tasks (e.g. "human_review_needed" from the conversion
  // predictor) are NOT wired to a real delivery channel yet: the standalone
  // agent-notification-dispatcher function has no caller/cron and its
  // NOTIFICATION_ROUTING does not cover the notification_type these tasks use.
  // Until that routing is built, we throw so the task is marked failed rather
  // than silently "completed" — which previously hid the gap (2,200+ tasks
  // marked done without ever notifying anyone). Same precedent as handleCampaign.
  const err = new Error(
    `Notification dispatch not implemented for notification_type="${
      (task.context as Record<string, unknown>)?.notification_type ?? "unknown"
    }". Wire agent-notification-dispatcher (routing + invocation) before enabling.`,
  );
  console.error(err.message, { taskId: task.id, context: task.context });
  throw err;
}

async function handleCampaign(
  _supabase: SupabaseClient,
  task: AgentTask,
  _lead: AgentTask,
): Promise<string> {
  // Campaign agent_tasks are not actually executed by the dispatcher.
  // Email campaigns flow through process-email-queue (via email_events queued
  // rows), and there is no SMS/voice campaign UI yet. Until that exists, we
  // throw so the task is marked failed rather than silently "completed",
  // which previously hid the gap.
  const err = new Error(
    `Campaign execution not implemented for agent_type="${task.agent_type}", action_type="${task.action_type}". Use the Campaigns wizard for email blasts, or remove this task.`,
  );
  console.error(err.message, { taskId: task.id, context: task.context });
  throw err;
}

// ── Config-driven Email Renderer ─────────────────────────────────────────────

function interpolateVars(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(key, escapeHtml(value)),
    text
  );
}

function buildEmailFromConfig(
  config: EmailTemplateConfig,
  vars: Record<string, string>,
  propertyInfoHtml?: string
): string {
  const v = (text: string) => interpolateVars(text, vars);
  const PRIMARY = "#4F46E5";
  const GOLD = "#ffb22c";

  const headerHtml = `<tr>
    <td style="background:linear-gradient(135deg,${PRIMARY} 0%,#6366F1 100%);padding:32px 30px;text-align:center;">
      <h1 style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:26px;font-weight:700;color:#ffffff;">${v(config.headerTitle)}</h1>
      ${config.headerSubtitle ? `<p style="margin:8px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:${GOLD};font-weight:500;">${v(config.headerSubtitle)}</p>` : ""}
      <div style="width:60px;height:3px;background:${GOLD};margin:16px auto 0;border-radius:2px;"></div>
    </td>
  </tr>`;

  const bodyHtml = config.bodyParagraphs
    .map((p) => `<p style="margin:0 0 14px;font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.6;color:#333333;">${v(p)}</p>`)
    .join("\n");

  let propHtml = "";
  if (config.showPropertyCard && propertyInfoHtml) {
    propHtml = `<div style="background:#EEF2FF;border-left:4px solid ${PRIMARY};border-radius:8px;padding:16px 20px;margin:20px 0;">${propertyInfoHtml}</div>`;
  } else if (config.showPropertyCard && vars["{propertyAddress}"]) {
    propHtml = `<div style="background:#EEF2FF;border-left:4px solid ${PRIMARY};border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#555;"><strong>${v("{propertyAddress}")}</strong></p>
    </div>`;
  }

  let stepsHtml = "";
  if (config.showSteps && config.stepTexts?.length) {
    stepsHtml = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      ${config.stepTexts.map((step, i) => `<tr>
        <td width="36" valign="top" style="padding-bottom:12px;">
          <div style="width:28px;height:28px;border-radius:50%;background:${PRIMARY};color:#fff;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;text-align:center;line-height:28px;">${i + 1}</div>
        </td>
        <td style="padding:4px 0 12px 10px;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#444;line-height:1.5;">${v(step)}</td>
      </tr>`).join("")}
    </table>`;
  }

  let buttonsHtml = "";
  if (config.buttons.length) {
    buttonsHtml = `<div style="text-align:center;margin:24px 0;">
      ${config.buttons.map((btn) => {
        const bg = btn.style === "primary" ? PRIMARY : GOLD;
        const color = btn.style === "primary" ? "#ffffff" : "#1a1a1a";
        return `<a href="${v(btn.url)}" style="display:inline-block;background:${bg};color:${color};font-family:Montserrat,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;margin:6px 8px;">${v(btn.text)}</a>`;
      }).join("\n")}
    </div>`;
  }

  const section8Html = config.showSection8Badge
    ? `<div style="text-align:center;margin:20px 0;">
         <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;font-family:Montserrat,Arial,sans-serif;font-size:13px;font-weight:600;padding:8px 18px;border-radius:20px;border:1px solid #c8e6c9;">Section 8 Vouchers Accepted</span>
       </div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f1f1;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f1;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        ${headerHtml}
        <tr><td style="padding:30px;">
          ${bodyHtml}
          ${propHtml}
          ${stepsHtml}
          ${buttonsHtml}
          ${section8Html}
        </td></tr>
        <tr><td style="padding:20px 30px;text-align:center;background:#f7f5fa;border-top:1px solid #e8e5ed;">
          <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#888;">${v(config.footerText)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Hardcoded Email Templates (fallback) ────────────────────────────────────

function buildShowingConfirmationEmail(
  name: string,
  address: string,
  date: string
): string {
  return `<div style="font-family:'Montserrat',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rent Finder Cleveland</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <h2 style="color:#4F46E5;margin-top:0;">Showing Reminder</h2>
      <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
      <p>This is a friendly reminder about your upcoming showing:</p>
      <div style="background-color:#EEF2FF;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #4F46E5;">
        <p style="margin:0 0 4px;font-weight:600;color:#4F46E5;">${escapeHtml(address)}</p>
        <p style="margin:0;color:#666;">${escapeHtml(date)}</p>
      </div>
      <p>Please reply to this email or call us if you need to reschedule.</p>
      <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
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
  <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#6366F1 100%);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="margin:0 0 4px;color:#ffb22c;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(orgName)}</h1>
    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;">Quality Rental Homes in Cleveland</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">

    <h2 style="color:#4F46E5;margin:0 0 16px;font-size:22px;font-weight:700;">Welcome, ${escapeHtml(firstName)}!</h2>

    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Thank you for your interest in our rental properties. We're excited to help you find your next home in Cleveland.
    </p>

    ${propertyInfo}

    <!-- Steps -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;">
      <tr><td style="padding:12px 16px;background-color:#EEF2FF;border-radius:10px;">
        <p style="margin:0 0 12px;font-weight:600;color:#4F46E5;font-size:15px;">Here's what happens next:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;"><span style="display:inline-block;width:22px;height:22px;background-color:#4F46E5;color:#ffb22c;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">1</span></td>
            <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">We'll match you with available properties based on your preferences</td>
          </tr>
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;"><span style="display:inline-block;width:22px;height:22px;background-color:#4F46E5;color:#ffb22c;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">2</span></td>
            <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">Schedule a showing at your convenience</td>
          </tr>
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:28px;"><span style="display:inline-block;width:22px;height:22px;background-color:#4F46E5;color:#ffb22c;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">3</span></td>
            <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">Apply online and move in!</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- CTA Buttons -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 24px;">
      <tr><td style="text-align:center;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://${senderDomain}/p/book-showing" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" fillcolor="#ffb22c" stroke="f"><v:textbox inset="0,0,0,0"><center style="color:#4F46E5;font-family:'Montserrat',sans-serif;font-size:15px;font-weight:700;">Book a Showing</center></v:textbox></v:roundrect><![endif]-->
        <!--[if !mso]><!-->
        <a href="https://${senderDomain}/p/book-showing" style="display:inline-block;background-color:#ffb22c;color:#4F46E5;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;line-height:1;">Book a Showing</a>
        <!--<![endif]-->
      </td></tr>
      <tr><td style="text-align:center;padding-top:12px;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=rfc" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" fillcolor="#4F46E5" stroke="f"><v:textbox inset="0,0,0,0"><center style="color:#ffffff;font-family:'Montserrat',sans-serif;font-size:15px;font-weight:700;">Apply Now</center></v:textbox></v:roundrect><![endif]-->
        <!--[if !mso]><!-->
        <a href="https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=rfc" style="display:inline-block;background-color:#4F46E5;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;line-height:1;">Apply Now</a>
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
    <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rent Finder Cleveland</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <h2 style="color:#4F46E5;margin-top:0;">We Missed You!</h2>
      <p>Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p>We noticed you weren't able to make it to the showing at <strong>${escapeHtml(address)}</strong>. No worries — we'd love to reschedule!</p>
      <p>Reply to this email or give us a call to find a time that works better for you.</p>
      <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
    </div>
  </div>`;
}

function buildPostShowingEmail(firstName: string, address: string): string {
  return `<div style="font-family:'Montserrat',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rent Finder Cleveland</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <h2 style="color:#4F46E5;margin-top:0;">Thanks for Visiting!</h2>
      <p>Hi <strong>${escapeHtml(firstName)}</strong>,</p>
      <p>Thanks for visiting <strong>${escapeHtml(address)}</strong> today! We hope you enjoyed the tour.</p>
      <p><strong>Ready to apply?</strong> You can start your rental application online:</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://rentfindercleveland.com" style="background-color:#ffb22c;color:#4F46E5;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Start Application</a>
      </div>
      <p>If you have any questions or would like to schedule another showing, just reply to this email.</p>
      <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
    </div>
  </div>`;
}

// ── Sheets backup (Apps Script webhook via agent-sheets-backup) ────────────────
async function handleSheetsBackup(task: AgentTask): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Invoke WITHOUT task_id so the sub-function doesn't double-manage task status
  // (the dispatcher's completeTask/failTask owns the lifecycle).
  const resp = await fetch(`${supabaseUrl}/functions/v1/agent-sheets-backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      lead_id: task.lead_id,
      organization_id: task.organization_id,
      context: task.context || { operation: "upsert" },
    }),
  });
  const out = await resp.json().catch(() => ({}));
  if (!resp.ok || out?.success === false) {
    throw new Error(`sheets-backup failed: ${out?.error || resp.status}`);
  }
  return out?.skipped ? `Sheets sync skipped (${out.reason})` : `Lead synced to Google Sheet`;
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
      "id, full_name, phone, email, sms_consent, call_consent, status, unsubscribed_at"
    )
    .eq("id", task.lead_id)
    .single();

  if (leadErr || !lead) {
    throw new Error(`Lead not found: ${task.lead_id}`);
  }

  switch (task.agent_type) {
    case "showing_confirmation":
      return handleShowingConfirmation(supabase, task, lead, creds, settings);
    case "welcome_sequence":
      return handleWelcomeSequence(supabase, task, lead, settings);
    case "esther":
      if (task.action_type === "enrichment_followup") {
        return handleEnrichmentFollowup(supabase, task, lead, settings);
      }
      return `Auto-completed esther/${task.action_type} (no handler)`;
    case "recapture":
      return handleRecapture(supabase, task, lead, creds, settings);
    case "no_show_followup":
      return handleNoShowFollowup(supabase, task, lead, settings);
    case "post_showing":
      return handlePostShowing(supabase, task, lead, settings);
    case "notification_dispatcher":
      return handleNotificationDispatch(supabase, task);
    case "campaign_voice":
    case "campaign":
      return handleCampaign(supabase, task, lead);
    case "sheets_backup":
      return handleSheetsBackup(task);
    case "conversion_predictor":
    case "lead_scoring":
    case "doorloop_pull":
      // No handler yet — auto-complete these task types
      return `Auto-completed ${task.agent_type} (no handler)`;
    default:
      throw new Error(`Unknown agent_type: ${task.agent_type}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Require service-role or admin authenticated caller ─────────
  {
    const _srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const _ak = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const _tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (_tok !== _srk) {
      if (!_tok || _tok === _ak) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, _srk);
      const { data: _auth } = await _sb.auth.getUser(_tok);
      if (!_auth?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: _u } = await _sb.from("users").select("role, is_active").eq("auth_user_id", _auth.user.id).maybeSingle();
      if (!_u || _u.is_active === false || !["super_admin","admin"].includes(_u.role || "")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
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
        .in("key", ["sender_domain", "outbound_pathway_id", "email_templates"]);

      // deno-lint-ignore no-explicit-any
      const settingsMap: Record<string, any> = {};
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

      // Parse email_templates: value is JSONB, may be an object or stringified JSON
      let emailTemplates: EmailTemplatesMap | null = null;
      if (settingsMap["email_templates"]) {
        const raw = settingsMap["email_templates"];
        emailTemplates = typeof raw === "string" ? JSON.parse(raw) : raw;
        // Only keep if it has at least one key
        if (emailTemplates && Object.keys(emailTemplates).length === 0) {
          emailTemplates = null;
        }
      }

      const orgSettings: OrgSettings = {
        sender_domain:
          String(settingsMap["sender_domain"] || "rentfindercleveland.com"),
        outbound_pathway_id: settingsMap["outbound_pathway_id"] ? String(settingsMap["outbound_pathway_id"]) : null,
        org_name: org.name || "Rent Finder Cleveland",
        email_templates: emailTemplates,
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

      // ── Check which agents are disabled (toggles) ──────────────────────
      const { data: registryRows } = await supabase
        .from("agents_registry")
        .select("agent_key, is_enabled")
        .eq("organization_id", org.id);

      const disabledAgents = new Set<string>(
        (registryRows || [])
          .filter((r: { is_enabled: boolean }) => !r.is_enabled)
          .map((r: { agent_key: string }) => r.agent_key)
      );

      for (const task of tasks) {
        const taskStart = Date.now();
        const canonicalAgent = resolveAgentKey(task.agent_type);

        // ── Voice removed: auto-cancel any legacy 'call' tasks ───────────
        // Voice/Bland was removed from the product; a 'call' task can never run.
        // Cancel it (instead of letting it fail-loop) so the queue self-cleans.
        if (task.action_type === "call") {
          await supabase
            .from("agent_tasks")
            .update({ status: "cancelled" })
            .eq("id", task.id);
          totalSkipped++;
          allResults.push({
            taskId: task.id,
            status: "cancelled",
            reason: "Voice/call capability removed — task auto-cancelled",
          });
          continue;
        }

        // ── Skip tasks for disabled agents ───────────────────────────────
        if (disabledAgents.has(canonicalAgent)) {
          // Return task to pending so it can run when agent is re-enabled
          await supabase
            .from("agent_tasks")
            .update({ status: "pending", executed_at: null })
            .eq("id", task.id);
          totalSkipped++;
          allResults.push({
            taskId: task.id,
            status: "skipped",
            reason: `Agent ${canonicalAgent} is disabled`,
          });
          continue;
        }

        try {
          const result = await withTimeout(
            dispatchTask(supabase, task, orgCreds, orgSettings),
            TASK_TIMEOUT_MS
          );

          await completeTask(supabase, task.id);
          totalDispatched++;

          // Parse actual action from result (e.g., "SMS sent" vs "call initiated")
          const actualAction = parseActualAction(result, task.action_type);

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
                action: actualAction,
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
