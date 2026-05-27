// process-sms-queue
//
// Cron-triggered worker. Mirrors process-email-queue but for SMS sends in
// in-flight SMS / multi-channel campaigns.
//
// Flow:
// 1. For each running, non-paused campaign with SMS recipients in `pending`:
//    - Read campaign.sms_template + send_delay_seconds + property context
//    - For each pending recipient, invoke send-message (channel=sms).
//      send-message handles TCPA consent + Twilio + logging.
//    - Update campaign_recipients with status sent / failed and timestamps.
// 2. Sleep send_delay_seconds (clamped to a global floor of 1s) between sends.
// 3. After batch: refresh campaigns.sent_count / failed_count for SMS.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 25; // max SMS per campaign per run
const MIN_DELAY_MS = 1000; // floor — Twilio carrier-grade pacing
const DEFAULT_SMS_UNIT_COST = 0.0083;

interface CampaignRow {
  id: string;
  organization_id: string;
  property_id: string | null;
  status: string;
  sms_template: string | null;
  send_delay_seconds: number | null;
}

interface RecipientRow {
  id: string;
  lead_id: string;
  organization_id: string;
}

interface LeadRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  sms_consent: boolean | null;
}

interface PropertyRow {
  id: string;
  address: string;
  unit_number: string | null;
  city: string | null;
  rent_price: number | null;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [k, v]) => out.replaceAll(k, v ?? ""),
    template,
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Find SMS-bearing campaigns that are currently running.
    const { data: activeCampaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("id, organization_id, property_id, status, sms_template, send_delay_seconds")
      .eq("status", "in_progress")
      .in("campaign_type", ["sms_blast", "multi_channel"]);
    if (campErr) {
      return new Response(
        JSON.stringify({ error: `Failed to load campaigns: ${campErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ campaign_id: string; sent: number; failed: number; skipped: number }> = [];

    for (const camp of (activeCampaigns || []) as CampaignRow[]) {
      if (!camp.sms_template || !camp.sms_template.trim()) continue;
      const delayMs = Math.max(MIN_DELAY_MS, (camp.send_delay_seconds ?? 5) * 1000);

      // Resolve org-level SMS unit cost
      const { data: costSetting } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", camp.organization_id)
        .eq("key", "sms_unit_cost")
        .maybeSingle();
      const smsUnitCost = (() => {
        const raw = costSetting?.value;
        const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SMS_UNIT_COST;
      })();

      // Property context for variable interpolation
      let propertyVars: Record<string, string> = {};
      if (camp.property_id) {
        const { data: prop } = await supabase
          .from("properties")
          .select("id, address, unit_number, city, rent_price")
          .eq("id", camp.property_id)
          .maybeSingle();
        const p = prop as PropertyRow | null;
        if (p) {
          propertyVars = {
            "{propertyAddress}": `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}${p.city ? `, ${p.city}` : ""}`,
            "{propertyRent}": p.rent_price ? `$${Number(p.rent_price).toLocaleString()}` : "",
          };
        }
      }

      // Org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", camp.organization_id)
        .maybeSingle();
      const orgName = (org?.name as string) || "Rent Finder Cleveland";

      // Claim a batch of pending SMS recipients
      const { data: recipients, error: recErr } = await supabase
        .from("campaign_recipients")
        .select("id, lead_id, organization_id")
        .eq("campaign_id", camp.id)
        .eq("channel", "sms")
        .eq("status", "pending")
        .limit(BATCH_SIZE);
      if (recErr) {
        console.error(`Failed to fetch recipients for campaign ${camp.id}:`, recErr.message);
        continue;
      }
      if (!recipients || recipients.length === 0) {
        results.push({ campaign_id: camp.id, sent: 0, failed: 0, skipped: 0 });
        continue;
      }

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const recipient of recipients as RecipientRow[]) {
        // Mark as processing so a concurrent run doesn't re-claim
        const { data: claim } = await supabase
          .from("campaign_recipients")
          .update({ status: "processing" })
          .eq("id", recipient.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (!claim) continue; // someone else got it

        // Fetch the lead
        const { data: leadRow } = await supabase
          .from("leads")
          .select("id, full_name, first_name, last_name, phone, sms_consent")
          .eq("id", recipient.lead_id)
          .maybeSingle();
        const lead = leadRow as LeadRow | null;

        // Skip if missing phone or no consent
        if (!lead || !lead.phone) {
          await supabase
            .from("campaign_recipients")
            .update({ status: "failed", error_message: "Lead has no phone on file" })
            .eq("id", recipient.id);
          skipped++;
          continue;
        }
        if (!lead.sms_consent) {
          await supabase
            .from("campaign_recipients")
            .update({ status: "failed", error_message: "Lead has not given SMS consent" })
            .eq("id", recipient.id);
          skipped++;
          continue;
        }

        // Interpolate variables
        const fullName = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "there";
        const firstName = lead.first_name || fullName.split(" ")[0] || "there";
        const body = interpolate(camp.sms_template, {
          ...propertyVars,
          "{firstName}": firstName,
          "{fullName}": fullName,
          "{orgName}": orgName,
        });

        // Invoke send-message — it handles compliance + Twilio + cost recording.
        try {
          const { error: sendErr } = await supabase.functions.invoke("send-message", {
            body: {
              lead_id: recipient.lead_id,
              channel: "sms",
              body,
              organization_id: recipient.organization_id,
            },
          });
          if (sendErr) throw sendErr;
          await supabase
            .from("campaign_recipients")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", recipient.id);
          sent++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase
            .from("campaign_recipients")
            .update({ status: "failed", error_message: msg.slice(0, 500) })
            .eq("id", recipient.id);
          failed++;
        }

        // Respect campaign pacing between sends
        if (recipients.indexOf(recipient) < recipients.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      // Refresh campaign counters: count delivered / failed SMS recipients
      const [{ count: smsSent }, { count: smsFailed }, { count: smsPending }] = await Promise.all([
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", camp.id)
          .eq("channel", "sms")
          .eq("status", "sent"),
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", camp.id)
          .eq("channel", "sms")
          .eq("status", "failed"),
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", camp.id)
          .eq("channel", "sms")
          .in("status", ["pending", "processing"]),
      ]);

      results.push({ campaign_id: camp.id, sent, failed, skipped });

      // If everything is processed AND this is sms-only OR email side is also
      // done, mark campaign completed. For multi_channel campaigns, the
      // email worker is the one that finalizes status.
      if ((smsPending || 0) === 0 && camp.status === "in_progress") {
        const { data: emailLeft } = await supabase
          .from("email_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", camp.organization_id)
          .contains("details", { campaign_id: camp.id, status: "queued" });
        if ((emailLeft as unknown as { count?: number } | null)?.count === 0 || !emailLeft) {
          await supabase
            .from("campaigns")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              sent_count: smsSent || 0,
              failed_count: smsFailed || 0,
            })
            .eq("id", camp.id);
        }
      }

      // System log
      if (sent > 0 || failed > 0 || skipped > 0) {
        try {
          await supabase.from("system_logs").insert({
            organization_id: camp.organization_id,
            level: failed > 0 || skipped > 0 ? "warning" : "info",
            category: "twilio",
            event_type: "sms_queue_processed",
            message: `SMS queue processed for campaign ${camp.id}: ${sent} sent, ${failed} failed, ${skipped} skipped (avg cost $${(sent * smsUnitCost).toFixed(4)})`,
            details: {
              campaign_id: camp.id,
              sent,
              failed,
              skipped,
              estimated_cost: sent * smsUnitCost,
            },
          });
        } catch (logErr) {
          console.warn("System log insert failed:", logErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "SMS queue processed", results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("process-sms-queue error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
