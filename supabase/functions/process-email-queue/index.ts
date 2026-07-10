import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limit: max emails per org per batch to stay within Resend limits
const BATCH_SIZE = 10;
const DELAY_MS = 1500; // 1.5s between emails (safe for Resend 10/sec limit)

// Resend pricing fallback (overridden by org settings.email_unit_cost when set)
const DEFAULT_EMAIL_UNIT_COST = 0.001;
const DEFAULT_MAX_ATTEMPTS = 3;

// Notification types treated as marketing (mirrors send-notification-email).
const MARKETING_NOTIFICATION_TYPES = new Set([
  "campaign",
  "marketing",
  "featured_property",
  "newsletter",
  "promotion",
]);

// ── CAN-SPAM unsubscribe (per-recipient, HMAC-signed) ──────────────────────
function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signLeadId(leadId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(leadId));
  return base64urlEncode(new Uint8Array(sig));
}

// Build a per-lead unsubscribe URL. Falls back to a mailto opt-out when the
// signing secret or lead id is unavailable, so marketing mail always ships a
// working unsubscribe path.
async function buildUnsubscribeUrl(
  leadId: string | null | undefined,
  supabaseUrl: string,
  senderDomain: string,
): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") || "";
  if (!secret || !leadId) {
    return `mailto:unsubscribe@${senderDomain}?subject=Unsubscribe`;
  }
  const sig = await signLeadId(leadId, secret);
  const token = `${leadId}.${sig}`;
  return `${supabaseUrl}/functions/v1/unsubscribe?token=${token}`;
}

function isMarketingEmail(details: Record<string, unknown> | undefined): boolean {
  if (!details) return false;
  if (typeof details.campaign_id === "string" && details.campaign_id.length > 0) return true;
  const nt = String(details.notification_type || "");
  return MARKETING_NOTIFICATION_TYPES.has(nt) || nt.startsWith("campaign");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Safety net: revert any "processing" emails stuck for more than 5 minutes (crashed runs)
    const { error: unstickErr } = await supabase.rpc("unstick_processing_emails");
    if (unstickErr) console.warn("unstick_processing_emails failed:", unstickErr.message);

    // Get ALL organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name");

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No organizations found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allResults: any[] = [];

    for (const org of orgs) {
      // Get Resend API key for this org
      let resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
      if (!resendApiKey) {
        const { data: creds } = await supabase
          .from("organization_credentials")
          .select("resend_api_key")
          .eq("organization_id", org.id)
          .single();
        if (creds?.resend_api_key) resendApiKey = creds.resend_api_key;
      }

      if (!resendApiKey) {
        continue; // Skip orgs without Resend key
      }

      // Read org settings: sender domain + per-email cost
      const { data: orgSettingsRows } = await supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", org.id)
        .in("key", ["sender_domain", "email_unit_cost"]);
      const settingsMap = new Map(
        (orgSettingsRows || []).map((r: { key: string; value: unknown }) => [r.key, r.value]),
      );
      const senderDomain =
        (settingsMap.get("sender_domain") as string) || "rentfindercleveland.com";
      const emailUnitCost = (() => {
        const raw = settingsMap.get("email_unit_cost");
        if (typeof raw === "number") return raw;
        if (typeof raw === "string") {
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= 0) return parsed;
        }
        return DEFAULT_EMAIL_UNIT_COST;
      })();

      // Atomically claim queued emails (prevents duplicate sends on concurrent runs)
      const { data: queued, error: fetchErr } = await supabase
        .rpc("claim_queued_emails", {
          p_organization_id: org.id,
          p_batch_size: BATCH_SIZE,
        });

      if (fetchErr) {
        console.error(`Failed to fetch queue for org ${org.id}:`, fetchErr.message);
        allResults.push({ org_id: org.id, error: fetchErr.message, sent: 0, failed: 0 });
        continue;
      }

      if (!queued || queued.length === 0) {
        continue; // No queued emails for this org
      }

      let sent = 0;
      let failed = 0;
      let suppressed = 0;
      const errors: string[] = [];

      // ── Hard-bounce suppression (sender-reputation kill-switch) ──────
      // Never send to an address that already hard-bounced for this org.
      // Found 2026-07-04: a producer re-queued the same typo'd address every
      // ~5 min for 6 days (~1,050 real bounces) and torched deliverability
      // (86% bounce rate). Guarding at the send boundary protects against
      // ANY producer (dispatcher, campaigns, parser) repeating that.
      const batchRecipients = Array.from(
        new Set(
          queued
            .map((e: { recipient_email?: string | null }) => e.recipient_email || "")
            .filter(Boolean),
        ),
      );
      const suppressedRecipients = new Set<string>();
      if (batchRecipients.length > 0) {
        const { data: bouncedRows, error: bounceErr } = await supabase
          .from("email_events")
          .select("recipient_email")
          .eq("organization_id", org.id)
          .in("recipient_email", batchRecipients)
          .eq("details->>status", "bounced")
          .limit(1000);
        if (bounceErr) {
          console.warn("Bounce-suppression lookup failed (continuing unguarded):", bounceErr.message);
        }
        for (const r of (bouncedRows as Array<{ recipient_email: string | null }> | null) || []) {
          if (r.recipient_email) suppressedRecipients.add(r.recipient_email.toLowerCase().trim());
        }
      }

      // Pre-fetch pacing AND status for every campaign referenced in this
      // batch. Status === "paused" means we skip its emails this run.
      // Tolerate the case where `send_delay_seconds` column hasn't been
      // deployed yet — fall back to target_criteria.send_delay_seconds.
      const campaignIds = Array.from(
        new Set(
          queued
            .map((e: { details?: { campaign_id?: string } }) => e.details?.campaign_id)
            .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
        ),
      );
      const campaignDelays = new Map<string, number>();
      const pausedCampaigns = new Set<string>();
      if (campaignIds.length > 0) {
        let campRows: Array<Record<string, unknown>> | null = null;
        const rich = await supabase
          .from("campaigns")
          .select("id, send_delay_seconds, status, target_criteria")
          .in("id", campaignIds);
        if (rich.error && /send_delay_seconds/.test(rich.error.message || "")) {
          const fallback = await supabase
            .from("campaigns")
            .select("id, status, target_criteria")
            .in("id", campaignIds);
          campRows = (fallback.data as Array<Record<string, unknown>> | null) || null;
        } else {
          campRows = (rich.data as Array<Record<string, unknown>> | null) || null;
        }
        for (const c of campRows || []) {
          const id = c.id as string;
          const direct = c.send_delay_seconds;
          const fromCriteria = (c.target_criteria as { send_delay_seconds?: number } | null)?.send_delay_seconds;
          const delay = typeof direct === "number" ? direct : typeof fromCriteria === "number" ? fromCriteria : null;
          if (delay !== null && delay >= 0) campaignDelays.set(id, delay);
          if (c.status === "paused") pausedCampaigns.add(id);
        }
      }

      for (const email of queued) {
        // Skip emails belonging to a paused campaign — re-queue them as-is
        // so they sit in queued status until the campaign resumes.
        const emailCampaignId = email.details?.campaign_id as string | undefined;
        if (emailCampaignId && pausedCampaigns.has(emailCampaignId)) {
          await supabase
            .from("email_events")
            .update({ details: { ...email.details, status: "queued" } })
            .eq("id", email.id);
          continue;
        }

        // Suppress sends to recipients with a prior hard bounce. Terminal
        // status ("suppressed") — never re-claimed, never retried.
        const rcptKey = (email.recipient_email || "").toLowerCase().trim();
        if (rcptKey && suppressedRecipients.has(rcptKey)) {
          await supabase
            .from("email_events")
            .update({
              details: {
                ...email.details,
                status: "suppressed",
                error: "Recipient previously hard-bounced — suppressed to protect sender reputation",
                suppressed_at: new Date().toISOString(),
              },
            })
            .eq("id", email.id);
          suppressed++;
          continue;
        }

        // Read attempt limits explicitly — the claim RPC may not project these
        // columns, so we can't trust email.attempt_number coming from it.
        const { data: attemptRow } = await supabase
          .from("email_events")
          .select("attempt_number, max_attempts")
          .eq("id", email.id)
          .maybeSingle();
        const priorAttempts = attemptRow?.attempt_number ?? 0;
        const maxAttempts = attemptRow?.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
        const currentAttempt = priorAttempts + 1;
        try {
          const html = email.details?.html;
          if (!email.recipient_email || !email.subject || !html) {
            await supabase
              .from("email_events")
              .update({
                attempt_number: currentAttempt,
                details: { ...email.details, status: "failed", error: "Missing email data" },
              })
              .eq("id", email.id);
            failed++;
            continue;
          }

          const fromName = email.details?.from_name || "Rent Finder Cleveland";
          const fromAddress = `${fromName} <support@${senderDomain}>`;
          // Replies must land on the Resend inbound domain so they re-enter
          // the Esther pipeline (audit F05) — the apex MX is split with SES
          // feedback and replies to support@ never reached anyone.
          const replyToAddress = `reply@inbound.${senderDomain}`;

          // ── CAN-SPAM: only marketing mail gets the unsubscribe URL + headers ──
          let outboundHtml = html as string;
          const resendExtraHeaders: Record<string, string> = {};
          if (isMarketingEmail(email.details)) {
            const leadId = email.details?.related_entity_type === "lead"
              ? (email.details?.related_entity_id as string | undefined)
              : undefined;
            const unsubUrl = await buildUnsubscribeUrl(leadId, supabaseUrl, senderDomain);
            outboundHtml = outboundHtml.split("{{unsubscribe_url}}").join(unsubUrl);
            resendExtraHeaders["List-Unsubscribe"] = `<${unsubUrl}>`;
            // One-Click POST is only valid against an HTTPS endpoint (not a mailto).
            if (unsubUrl.startsWith("http")) {
              resendExtraHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
            }
          }

          // Send via Resend
          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [email.recipient_email],
              reply_to: replyToAddress,
              subject: email.subject,
              html: outboundHtml,
              ...(Object.keys(resendExtraHeaders).length
                ? { headers: resendExtraHeaders }
                : {}),
            }),
          });

          const resendData = await resendResponse.json();

          if (resendResponse.ok) {
            await supabase
              .from("email_events")
              .update({
                resend_email_id: resendData.id,
                attempt_number: currentAttempt,
                details: {
                  ...email.details,
                  status: "sent",
                  sent_at: new Date().toISOString(),
                  resend_email_id: resendData.id,
                },
              })
              .eq("id", email.id);

            // Record cost (real Resend pricing from org settings, fallback $0.001/email)
            try {
              await supabase.rpc("zacchaeus_record_cost", {
                p_organization_id: email.organization_id,
                p_service: "resend",
                p_usage_quantity: 1,
                p_usage_unit: "email",
                p_unit_cost: emailUnitCost,
                p_total_cost: emailUnitCost,
                p_lead_id: email.details?.related_entity_type === "lead"
                  ? email.details?.related_entity_id
                  : null,
              });
            } catch (costErr) {
              console.warn("Cost recording failed:", costErr);
            }

            sent++;
          } else {
            const errMsg = resendData.message || `HTTP ${resendResponse.status}`;
            // Bounded retry: keep "queued" until max_attempts reached, then permanent fail.
            const exhausted = currentAttempt >= maxAttempts;
            await supabase
              .from("email_events")
              .update({
                attempt_number: currentAttempt,
                details: {
                  ...email.details,
                  status: exhausted ? "failed" : "queued",
                  error: errMsg,
                  failed_at: exhausted ? new Date().toISOString() : undefined,
                  last_attempt_at: new Date().toISOString(),
                  attempts: currentAttempt,
                },
              })
              .eq("id", email.id);
            errors.push(
              `${email.recipient_email}: ${errMsg}${exhausted ? " (max retries reached)" : ` (attempt ${currentAttempt}/${maxAttempts})`}`,
            );
            failed++;
          }

          // Rate limiting delay between emails. Use the MAX of the global
          // Resend safety floor (DELAY_MS) and the campaign's configured
          // send_delay_seconds, so a "Drip" campaign waits longer.
          if (queued.indexOf(email) < queued.length - 1) {
            const campaignId = email.details?.campaign_id as string | undefined;
            const campaignDelayMs = campaignId
              ? (campaignDelays.get(campaignId) ?? 0) * 1000
              : 0;
            const wait = Math.max(DELAY_MS, campaignDelayMs);
            await new Promise((r) => setTimeout(r, wait));
          }
        } catch (err) {
          const exhausted = currentAttempt >= maxAttempts;
          console.warn(`Email processing error for ${email.recipient_email}:`, err);
          await supabase
            .from("email_events")
            .update({
              attempt_number: currentAttempt,
              details: {
                ...email.details,
                status: exhausted ? "failed" : "queued",
                error: String(err).slice(0, 500),
                last_attempt_at: new Date().toISOString(),
                attempts: currentAttempt,
              },
            })
            .eq("id", email.id);
          errors.push(`${email.recipient_email}: ${String(err).slice(0, 100)}${exhausted ? " (max retries reached)" : ""}`);
          failed++;
        }
      }

      // System log per org
      if (sent > 0 || failed > 0 || suppressed > 0) {
        try {
          await supabase.from("system_logs").insert({
            organization_id: org.id,
            level: failed > 0 ? "warning" : "info",
            category: "general",
            event_type: "email_queue_processed",
            message: `Email queue processed: ${sent} sent, ${failed} failed, ${suppressed} suppressed out of ${queued.length}`,
            details: { sent, failed, suppressed, total: queued.length, errors: errors.slice(0, 10) },
          });
        } catch (logErr) {
          console.warn("System log insert failed:", logErr);
        }
      }

      allResults.push({ org_id: org.id, sent, failed, suppressed, total: queued.length });

      // Reconcile any in_progress campaigns for this org.
      // Completion criterion: no emails left in queued/processing AND every
      // recipient has either been delivered/sent OR permanently failed.
      // Also refresh `emails_queued` so the UI shows the real pending count.
      const { data: activeCampaigns } = await supabase
        .from("campaigns")
        .select("id, total_leads, leads_with_email")
        .eq("organization_id", org.id)
        .eq("status", "in_progress");

      for (const camp of activeCampaigns || []) {
        const [{ count: queuedLeft }, { count: processingLeft }, { count: sentCount }, { count: failedCount }] =
          await Promise.all([
            supabase
              .from("email_events")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .contains("details", { campaign_id: camp.id, status: "queued" }),
            supabase
              .from("email_events")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .contains("details", { campaign_id: camp.id, status: "processing" }),
            supabase
              .from("email_events")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .contains("details", { campaign_id: camp.id, status: "sent" }),
            supabase
              .from("email_events")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .contains("details", { campaign_id: camp.id, status: "failed" }),
          ]);

        const pending = (queuedLeft || 0) + (processingLeft || 0);

        // Keep emails_queued in sync with reality (was previously stuck at launch value)
        await supabase
          .from("campaigns")
          .update({
            emails_queued: pending,
            sent_count: sentCount || 0,
            failed_count: failedCount || 0,
          })
          .eq("id", camp.id);

        if (pending === 0 && ((sentCount || 0) + (failedCount || 0)) > 0) {
          await supabase
            .from("campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", camp.id);
          console.log(
            `Campaign ${camp.id} marked completed — sent=${sentCount}, failed=${failedCount}`,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Queue processed", results: allResults }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-email-queue error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
