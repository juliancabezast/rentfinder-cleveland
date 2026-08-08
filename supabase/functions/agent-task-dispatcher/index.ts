import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Processing limits (2026-07-20: 20/500ms → 40/300ms, owner asked to accelerate
// the legacy welcome_sequence drain; email queue at 14.4k/day absorbs it)
const BATCH_SIZE = 40;
const DELAY_MS = 300;
const TASK_TIMEOUT_MS = 30_000; // 30s per task

// Task types the product no longer supports — cancelled on sight so the queue
// self-cleans instead of fail-looping (voice + SMS removed, scoring demolished;
// these agent_types have no handler and never will).
const DEAD_AGENT_TYPES = new Set([
  "recapture",
  "campaign",
  "campaign_voice",
  "conversion_predictor",
  "lead_scoring",
  "scoring",
  "doorloop_pull",
  "sms_inbound",
]);

// Exponential backoff schedule (minutes)
const BACKOFF_MINUTES = [5, 15, 60, 240, 720, 1440, 2880];

// Legacy agent_type → canonical agent_key mapping (mirrors frontend constants.ts)
const LEGACY_TO_CANONICAL: Record<string, string> = {
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
  showing_nurture: "elijah",
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
  if (lower.includes("email sent") || lower.includes("email fallback") || lower.includes("notification email")) return "email";
  if (lower.includes("lead status")) return "lead status changed";
  if (lower.includes("showing")) return "showing created";
  return fallbackAction || "task";
}

// ── Types ────────────────────────────────────────────────────────────────────

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

  // Voice and SMS were removed from the product — confirmations are email-only.
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

  // Respect opt-outs and closed leads (mirror the enrichment/nurture guards):
  // a queued welcome must not fire for a lead who unsubscribed or was already
  // lost/converted. send-notification-email does not consent-gate
  // 'welcome_sequence', so the check has to happen here.
  if ((lead as Record<string, unknown>).unsubscribed_at) {
    return "Lead unsubscribed — welcome email cancelled";
  }
  {
    const leadStatus = String((lead as Record<string, unknown>).status || "");
    if (leadStatus === "lost" || leadStatus === "converted") {
      return `Lead is ${leadStatus} — welcome email cancelled`;
    }
  }

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

  throw new Error("Lead has no email for welcome sequence (SMS removed)");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Elijah — showing-nurture sequence (2026-07-21)
// ═══════════════════════════════════════════════════════════════════════════════
// Replaces the 9 AM Telegram pile-up of "leads que no agendaron" with an email
// cadence that does the chasing: one email every 3 days, 7 max, every CTA
// pointing at the public site so the prospect books themselves.
//
// The lead is NEVER deleted or lost. After 7 with no reaction it is tagged
// (nurture_outcome='exhausted') and goes quiet permanently.

const NURTURE_INTERVAL_DAYS = 3;
const NURTURE_MAX_STEPS = 7;

// Each step earns its place — a different angle, not the same nag 7 times.
// No property is ever named (city-only comms policy, and a specific unit is
// usually gone by the time step 5 lands).
const NURTURE_STEPS: {
  subject: (city: string) => string;
  heading: string;
  body: (first: string, city: string) => string;
  cta: string;
}[] = [
  {
    subject: (c) => `Ready to see a home${c ? ` in ${c}` : ""}?`,
    heading: "Let's get you inside a home",
    body: (f, c) => `Hi ${f}, thanks for reaching out about our rentals${c ? ` in ${c}` : ""}. The fastest way forward is to see one in person — you can pick a day and time yourself, it takes under a minute.`,
    cta: "Pick a time to tour",
  },
  {
    subject: () => `Tours are booking up this week`,
    heading: "Still looking?",
    body: (f, c) => `Hi ${f}, our tour slots${c ? ` in ${c}` : ""} tend to fill a few days out. If you're still searching, grabbing a time now keeps your options open — and it costs you nothing to hold one.`,
    cta: "See available times",
  },
  {
    subject: () => `A few things worth knowing before you tour`,
    heading: "What to expect",
    body: (f) => `Hi ${f}, a quick heads-up so there are no surprises: tours take about 15 minutes, you don't need to bring anything, and there's no obligation. If you like the place, we'll walk you through applying right there.`,
    cta: "Book a tour",
  },
  {
    subject: () => `New homes just came available`,
    heading: "Fresh listings",
    body: (f, c) => `Hi ${f}, our availability${c ? ` around ${c}` : ""} changes every week. If nothing fit before, it's worth another look — and you can book a tour on anything you like right from the listing.`,
    cta: "Browse what's available",
  },
  {
    subject: () => `Do you accept Section 8? (and other common questions)`,
    heading: "The questions we get most",
    body: (f) => `Hi ${f}, in case it's what's holding you back: yes, many of our homes accept Section 8 vouchers. Applying takes a valid ID, your last 3 paystubs, and a $59.90 screening fee (paid directly to TransUnion). Nothing else.`,
    cta: "Find a home and tour it",
  },
  {
    subject: () => `Still interested in renting with us?`,
    heading: "Checking in",
    body: (f) => `Hi ${f}, we don't want to keep filling your inbox if the timing isn't right. If you're still looking, one tour is all it takes to move forward. If not, no hard feelings — you can unsubscribe below and we'll stop.`,
    cta: "Book my tour",
  },
  {
    subject: () => `Last note from us`,
    heading: "We'll leave you to it",
    body: (f) => `Hi ${f}, this is the last email we'll send about your search. If you ever want to look again, our listings stay open to you any time — no need to re-register. Thanks for considering us.`,
    cta: "See our homes",
  },
];

function buildNurtureEmail(
  step: number, firstName: string, city: string, senderDomain: string, orgName: string,
): string {
  const s = NURTURE_STEPS[step - 1];
  const site = `https://${senderDomain}`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(s.heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f3eef8;font-family:'Montserrat','Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3eef8;">
<tr><td style="padding:24px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;">

  <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#6366F1 100%);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="margin:0 0 4px;color:#ffb22c;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(orgName)}</h1>
    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;">Quality Rental Homes in Cleveland</p>
  </td></tr>

  <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">
    <h2 style="color:#4F46E5;margin:0 0 16px;font-size:22px;font-weight:700;">${escapeHtml(s.heading)}</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 24px;">${escapeHtml(s.body(firstName, city))}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
      <tr><td align="center">
        <a href="${site}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5 0%,#6366F1 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">${escapeHtml(s.cta)}</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="background-color:#ffffff;padding:0 32px 28px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;border-radius:0 0 16px 16px;border-bottom:1px solid #e5e5e5;text-align:center;">
    <p style="margin:16px 0 0;color:#999;font-size:12px;line-height:1.5;">
      ${escapeHtml(orgName)} · Cleveland, OH<br>
      <a href="{{unsubscribe_url}}" style="color:#999;text-decoration:underline;">Unsubscribe from these emails</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function handleShowingNurture(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  settings: OrgSettings
): Promise<string> {
  const leadId = task.lead_id;
  const step = Number((task.context || {}).step) || 1;

  // ── Exit conditions, re-checked before EVERY send ────────────────────────
  // A task scheduled 3 days ago knows nothing about what happened since, so the
  // decision to send is made now, not when it was queued.
  const stop = async (outcome: string, why: string) => {
    await supabase.from("leads")
      .update({ nurture_outcome: outcome, nurture_completed_at: new Date().toISOString() })
      .eq("id", leadId);
    return `Nurture stopped (${outcome}): ${why}`;
  };

  if (!lead.email) return stop("stopped", "no email");
  if (lead.unsubscribed_at) return stop("stopped", "unsubscribed");
  if (["converted", "lost", "in_application"].includes(String(lead.status || ""))) {
    return stop("stopped", `lead status ${lead.status}`);
  }

  // Won: they booked. The confirmation flow owns them from here — the owner
  // asked for exactly this handoff ("si agendan se pausa y pasa a confirmación").
  {
    const { data: sh } = await supabase.from("showings")
      .select("id").eq("lead_id", leadId)
      .in("status", ["scheduled", "confirmed", "completed"]).limit(1).maybeSingle();
    if (sh) return stop("booked", "lead booked a showing");
  }

  // Replied: a human conversation beats an automated cadence.
  {
    const { data: reply } = await supabase.from("inbound_emails")
      .select("id").eq("lead_id", leadId)
      .gte("created_at", String(lead.nurture_started_at || task.created_at || ""))
      .limit(1).maybeSingle();
    if (reply) return stop("replied", "lead replied by email");
  }

  // Deliverability circuit breaker. Bounces are already suppressed at the send
  // boundary; COMPLAINTS are what get a domain blacklisted, and 90% of this
  // list inquired 90+ days ago. Stand down before the damage, not after.
  {
    const { data: health } = await supabase
      .rpc("nurture_health_check", { p_organization_id: task.organization_id })
      .maybeSingle();
    if (health && health.is_healthy === false) {
      throw new Error(
        `Nurture paused: complaint rate ${health.complaint_rate}% over ${health.recent_sends} sends`,
      );
    }
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const firstName = String(lead.full_name || lead.email.split("@")[0] || "there").split(" ")[0];
  let city = "";
  {
    const { data: tagRows } = await supabase
      .from("lead_property_interests")
      .select("properties:property_id(city)")
      .eq("lead_id", leadId)
      .order("last_interest_at", { ascending: false })
      .limit(5);
    city = ((tagRows as { properties: { city: string | null } | null }[] | null) || [])
      .map((r) => r.properties?.city).find((c): c is string => !!c) || "";
  }

  const tmpl = NURTURE_STEPS[step - 1];
  const html = buildNurtureEmail(step, firstName, city, settings.sender_domain, settings.org_name);

  // Raw fetch, not functions.invoke: invoke sends the service key in `apikey`
  // rather than Bearer, which is what broke confirmations for 7 days.
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      to: lead.email,
      subject: tmpl.subject(city),
      html,
      notification_type: "showing_nurture",
      organization_id: task.organization_id,
      related_entity_id: leadId,
      related_entity_type: "lead",
      from_name: settings.org_name,
      queue: true,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    // 403 = consent gate (opted out). That is a permanent answer, not a retry.
    if (resp.status === 403) return stop("stopped", "consent gate declined");
    throw new Error(`Nurture email ${step}/7 failed (${resp.status}): ${body.slice(0, 160)}`);
  }

  const nowIso = new Date().toISOString();
  await supabase.from("leads").update({
    nurture_emails_sent: step,
    nurture_last_sent_at: nowIso,
    nurture_outcome: step >= NURTURE_MAX_STEPS ? "exhausted" : "active",
    ...(step >= NURTURE_MAX_STEPS ? { nurture_completed_at: nowIso } : {}),
  }).eq("id", leadId);

  // The owner asked for these to show in the Leasing Tracker. Own action code —
  // folding ~6k automated sends/day into the human-effort counter would bury
  // the fact that a person actually worked the lead.
  {
    const { data: tag } = await supabase.from("lead_property_interests")
      .select("property_id").eq("lead_id", leadId)
      .order("last_interest_at", { ascending: false }).limit(1).maybeSingle();
    await supabase.from("leasing_activity").insert({
      organization_id: task.organization_id,
      property_id: (tag as { property_id?: string } | null)?.property_id ?? null,
      lead_id: leadId,
      action: "nurture_email_sent",
      source: "elijah",
    });
  }

  // Chain the next step. Step 7 ends the chain — the lead stays alive, tagged.
  if (step < NURTURE_MAX_STEPS) {
    await supabase.from("agent_tasks").insert({
      organization_id: task.organization_id,
      lead_id: leadId,
      agent_type: "showing_nurture",
      action_type: "email",
      status: "pending",
      scheduled_for: new Date(Date.now() + NURTURE_INTERVAL_DAYS * 86400000).toISOString(),
      context: { step: step + 1 },
    });
    return `Nurture email ${step}/7 queued; next in ${NURTURE_INTERVAL_DAYS}d`;
  }
  return `Nurture email 7/7 queued — sequence exhausted, lead tagged`;
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

  // SMS removed — no-show follow-ups are email-only.
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

  throw new Error("Lead has no email for post-showing follow-up (SMS removed)");
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
// Which legacy agent_type each flow trigger replaces. The handoff happens HERE,
// at dispatch time, rather than by rewriting the four live DB triggers — those
// are not even versioned in the repo, and rewriting them would put the risk on
// the producing side where a mistake silently stops mail from being created at
// all. This way the legacy trigger keeps producing exactly as it does, and the
// dispatcher decides who executes it.
const FLOW_TRIGGER_BY_AGENT: Record<string, string> = {
  welcome_sequence: "lead_created",
  showing_confirmation: "showing_booked",
  post_showing: "showing_completed",
  no_show_followup: "showing_no_show",
  no_show_follow_up: "showing_no_show",
  showing_nurture: "manual_enroll",
};

/**
 * If an ACTIVE flow owns this task's trigger, open a run and return its context
 * so the flow engine executes it instead of the legacy handler. Returns null
 * when no flow is active — which is the state every flow ships in, so this is a
 * no-op until someone deliberately turns one on.
 */
async function claimForFlow(
  supabase: SupabaseClient,
  task: AgentTask,
): Promise<Record<string, unknown> | null> {
  const trigger = FLOW_TRIGGER_BY_AGENT[task.agent_type];
  if (!trigger || !task.lead_id) return null;
  const ctx = (task.context || {}) as Record<string, unknown>;
  if (ctx.flow_id) return null; // already a flow task

  const { data: flow } = await supabase.from("flows")
    .select("id").eq("organization_id", task.organization_id)
    .eq("trigger_type", trigger).eq("is_active", true).maybeSingle();
  if (!flow) return null;

  const { data: step } = await supabase.from("flow_steps")
    .select("position").eq("flow_id", flow.id).eq("is_enabled", true)
    .order("position", { ascending: true }).limit(1).maybeSingle();
  if (!step) return null;

  // One live run per lead per flow — a partial unique index enforces it, so a
  // re-entering lead resumes rather than forking a second chain.
  const { data: run } = await supabase.from("flow_runs")
    .insert({
      organization_id: task.organization_id,
      flow_id: flow.id,
      lead_id: task.lead_id,
      current_position: step.position,
    })
    .select("id").maybeSingle();
  if (!run) {
    const { data: existing } = await supabase.from("flow_runs")
      .select("id, current_position").eq("flow_id", flow.id)
      .eq("lead_id", task.lead_id).eq("status", "active").maybeSingle();
    if (!existing) return null;
    return { flow_id: flow.id, run_id: existing.id, position: existing.current_position };
  }
  return { flow_id: flow.id, run_id: run.id, position: step.position, started_at: new Date().toISOString() };
}

// ── Flow engine ───────────────────────────────────────────────────────────
// Executes ONE step of a flow defined in the `flows` / `flow_steps` tables and
// schedules the next. The flows table only owns the SCHEDULE; the copy for an
// imported, unedited step is produced by delegating to the very handler that
// sends it today. That is deliberate: activating an imported flow must send the
// byte-identical email it already sends, or the switch is not reversible in any
// meaningful sense. Editing a step materialises `email_config`, and from then
// on this function renders it directly.
async function handleFlowStep(
  supabase: SupabaseClient,
  task: AgentTask,
  lead: AgentTask,
  settings: OrgSettings,
): Promise<string> {
  const ctx = (task.context || {}) as Record<string, unknown>;
  const flowId = String(ctx.flow_id || "");
  const runId = String(ctx.run_id || "");
  const position = Number(ctx.position) || 1;
  if (!flowId || !runId) throw new Error("flow_step task without flow_id/run_id");

  const finish = async (status: string, outcome: string | null, why: string) => {
    await supabase.from("flow_runs").update({
      status, outcome, ended_at: new Date().toISOString(),
    }).eq("id", runId);
    return `Flow ${flowId} step ${position} stopped (${outcome || status}): ${why}`;
  };

  const [{ data: flow }, { data: step }] = await Promise.all([
    supabase.from("flows").select("id, name, is_active").eq("id", flowId).maybeSingle(),
    supabase.from("flow_steps").select("*").eq("flow_id", flowId).eq("position", position).maybeSingle(),
  ]);

  // Deactivating a flow has to stop chains already in flight, not just prevent
  // new ones — otherwise turning it off would still mail people for days.
  if (!flow || !flow.is_active) return finish("stopped", "stopped", "flow is not active");
  if (!step) return finish("done", "exhausted", "no step at this position");
  if (!step.is_enabled) return finish("stopped", "stopped", "step disabled");

  // ── Exit conditions, re-checked NOW, never at enrollment ────────────────
  const exits: string[] = Array.isArray(step.exit_conditions) ? step.exit_conditions as string[] : [];
  const leadId = task.lead_id;
  if (exits.includes("unsubscribed") && lead.unsubscribed_at) {
    return finish("stopped", "unsubscribed", "lead unsubscribed");
  }
  for (const st of ["lost", "converted", "in_application"]) {
    if (exits.includes(st) && String(lead.status || "") === st) {
      return finish("stopped", "stopped", `lead status ${st}`);
    }
  }
  if (exits.includes("booked")) {
    const { data: sh } = await supabase.from("showings").select("id")
      .eq("lead_id", leadId).in("status", ["scheduled", "confirmed", "completed"])
      .limit(1).maybeSingle();
    if (sh) return finish("done", "booked", "lead booked a showing");
  }
  if (exits.includes("replied")) {
    const { data: reply } = await supabase.from("inbound_emails").select("id")
      .eq("lead_id", leadId).gte("created_at", String(ctx.started_at || task.created_at || ""))
      .limit(1).maybeSingle();
    if (reply) return finish("done", "replied", "lead replied by email");
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const cfg = (step.email_config || {}) as EmailTemplateConfig & Record<string, unknown>;
  const materialised = Object.keys(cfg).length > 0;
  let outcomeMsg: string;

  if (materialised) {
    const firstName = String(lead.full_name || "").trim().split(/\s+/)[0] || "there";
    const vars: Record<string, string> = {
      "{firstName}": firstName,
      "{fullName}": String(lead.full_name || firstName),
      "{orgName}": settings.org_name,
      "{senderDomain}": settings.sender_domain,
    };
    const html = buildEmailFromConfig(cfg, vars);
    const subject = interpolateVars(String(cfg.subject || settings.org_name), vars);
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        to: lead.email,
        subject,
        html,
        notification_type: step.notification_key || "flow_custom",
        organization_id: task.organization_id,
        related_entity_id: leadId,
        related_entity_type: "lead",
        from_name: settings.org_name,
        queue: true,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      if (resp.status === 403) return finish("stopped", "stopped", "consent gate declined");
      throw new Error(`Flow step ${position} failed (${resp.status}): ${body.slice(0, 160)}`);
    }
    outcomeMsg = `Flow "${flow.name}" step ${position} sent`;
  } else {
    // Imported and unedited → run the legacy handler verbatim.
    const legacy: Record<string, (t: AgentTask) => Promise<string>> = {
      welcome: (t) => handleWelcomeSequence(supabase, t, lead, settings),
      showing_confirmation: (t) => handleShowingConfirmation(supabase, t, lead, settings),
      no_show: (t) => handleNoShowFollowup(supabase, t, lead, settings),
      post_showing: (t) => handlePostShowing(supabase, t, lead, settings),
    };
    const key = String(step.template_key || "");
    if (legacy[key]) {
      outcomeMsg = await legacy[key](task);
    } else {
      // No template key at all: the nurture chain, whose 7 bodies live in this
      // file. Reuse it by position so the copy stays identical.
      outcomeMsg = await handleShowingNurture(
        supabase,
        { ...task, context: { ...(task.context || {}), step: position, flow_managed: true } },
        lead,
        settings,
      );
    }
  }

  // ── Advance ──────────────────────────────────────────────────────────────
  const { data: next } = await supabase.from("flow_steps")
    .select("position, delay_minutes, delay_anchor")
    .eq("flow_id", flowId).gt("position", position)
    .order("position", { ascending: true }).limit(1).maybeSingle();

  const nowIso = new Date().toISOString();
  if (!next) {
    await supabase.from("flow_runs").update({
      status: "done", outcome: "exhausted", last_step_at: nowIso, ended_at: nowIso,
    }).eq("id", runId);
    return `${outcomeMsg} — flow complete`;
  }

  await supabase.from("flow_runs").update({
    current_position: next.position, last_step_at: nowIso,
  }).eq("id", runId);

  await supabase.from("agent_tasks").insert({
    organization_id: task.organization_id,
    lead_id: leadId,
    agent_type: "flow_step",
    action_type: "email",
    scheduled_for: new Date(Date.now() + (next.delay_minutes || 0) * 60_000).toISOString(),
    attempt_number: 1,
    max_attempts: 3,
    status: "pending",
    context: { ...ctx, position: next.position },
  });

  return `${outcomeMsg} — next step ${next.position} scheduled`;
}

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
  settings: OrgSettings
): Promise<string> {
  // Fetch lead info
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, full_name, phone, email, sms_consent, call_consent, status, unsubscribed_at, nurture_started_at"
    )
    .eq("id", task.lead_id)
    .single();

  if (leadErr || !lead) {
    throw new Error(`Lead not found: ${task.lead_id}`);
  }

  // An active flow takes over its trigger's tasks. No flow is active by
  // default, so this returns null and nothing changes.
  {
    const claimed = await claimForFlow(supabase, task);
    if (claimed) {
      return handleFlowStep(
        supabase,
        { ...task, context: { ...(task.context || {}), ...claimed } },
        lead,
        settings,
      );
    }
  }

  switch (task.agent_type) {
    case "showing_confirmation":
      return handleShowingConfirmation(supabase, task, lead, settings);
    case "welcome_sequence":
      return handleWelcomeSequence(supabase, task, lead, settings);
    case "showing_nurture":
      return handleShowingNurture(supabase, task, lead, settings);
    case "esther":
      if (task.action_type === "enrichment_followup") {
        return handleEnrichmentFollowup(supabase, task, lead, settings);
      }
      return `Auto-completed esther/${task.action_type} (no handler)`;
    case "no_show_followup":
    case "no_show_follow_up":
      return handleNoShowFollowup(supabase, task, lead, settings);
    case "post_showing":
      return handlePostShowing(supabase, task, lead, settings);
    case "flow_step":
      return handleFlowStep(supabase, task, lead, settings);
    case "sheets_backup":
      return handleSheetsBackup(task);
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
      // Get settings
      const { data: settingsRows } = await supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", org.id)
        .in("key", ["sender_domain", "email_templates"]);

      // deno-lint-ignore no-explicit-any
      const settingsMap: Record<string, any> = {};
      for (const s of settingsRows || []) {
        settingsMap[s.key] = s.value;
      }


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
      const orgStartIdx = allResults.length;

      // Nehemiah heartbeat — the dispatcher IS Nehemiah; without this row the
      // agent looks dead in every liveness view even while executing thousands
      // of tasks under other agents' names.
      try {
        await supabase.from("agent_activity_log").insert({
          organization_id: org.id,
          agent_key: "nehemiah",
          action: "dispatch_run",
          status: "success",
          message: `Claimed ${tasks.length} task(s)`,
          details: { claimed: tasks.length },
        });
      } catch { /* non-blocking */ }

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

        // ── Dead capability guard: cancel-on-sight ──────────────────────
        // Voice + SMS were removed from the product and several agent_types
        // have no handler. notification_dispatcher died with the scoring
        // demolition (priority_lead/hot_lead were its only routable types).
        // Cancel these instead of letting them fail-loop so the queue
        // self-cleans.
        const notifType =
          task.agent_type === "notification_dispatcher"
            ? String((task.context as Record<string, unknown> | null)?.notification_type ?? "unknown")
            : null;
        const deadReason =
          task.action_type === "call"
            ? "Voice/call capability removed — task auto-cancelled"
            : task.action_type === "sms"
              ? "SMS capability removed — task auto-cancelled"
              : DEAD_AGENT_TYPES.has(task.agent_type)
                ? `Dead agent_type "${task.agent_type}" — task auto-cancelled`
                : notifType
                  ? `Unroutable notification_type "${notifType}" — task auto-cancelled`
                  : null;
        if (deadReason) {
          await supabase
            .from("agent_tasks")
            .update({
              status: "cancelled",
              completed_at: new Date().toISOString(),
              context: { ...task.context, cancel_reason: deadReason },
            })
            .eq("id", task.id);
          totalSkipped++;
          allResults.push({
            taskId: task.id,
            status: "cancelled",
            reason: deadReason,
          });
          continue;
        }

        // ── Skip tasks for disabled agents ───────────────────────────────
        if (disabledAgents.has(canonicalAgent)) {
          // Return to pending, but push scheduled_for forward so a disabled
          // agent's backlog can't permanently occupy the front of the claim
          // batch (claim_pending_tasks orders by scheduled_for ASC) and starve
          // every other agent's due tasks.
          await supabase
            .from("agent_tasks")
            .update({
              status: "pending",
              executed_at: null,
              scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            })
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
            dispatchTask(supabase, task, orgSettings),
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
      const orgDispatched = allResults.slice(orgStartIdx).filter((r) => r.status === "completed").length;
      const orgFailed = allResults.slice(orgStartIdx).filter((r) => r.status === "failed").length;

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
              results: allResults.slice(orgStartIdx).slice(-20),
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
