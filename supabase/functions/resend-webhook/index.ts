// resend-webhook
//
// Receives delivery events from Resend in real time and updates
// email_events.details.status so the Campaigns dashboard reflects reality
// without waiting for the 5-min sync-resend-emails polling cron.
//
// Resend signs webhooks via Svix. If RESEND_WEBHOOK_SECRET is set, we
// require valid signature headers; otherwise we accept-and-log (useful
// during initial setup).
//
// Event flow:
//   email.sent           → details.status = "sent"
//   email.delivered      → details.status = "delivered"
//   email.delivery_delayed → details.status = "queued" (back to queue)
//   email.bounced        → details.status = "bounced"
//   email.complained     → details.status = "complained"
//   email.opened         → details.status = "opened"
//   email.clicked        → details.status = "clicked"
//
// Configure in Resend dashboard:
//   URL: https://<project>.supabase.co/functions/v1/resend-webhook
//   Events: all email.* events
//   Secret: copy from "Signing secret" → set as RESEND_WEBHOOK_SECRET env var

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/svix@1.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resend event type → email_events.details.status value
const STATUS_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "queued",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

// Priority — newer events outrank older ones so "delivered" never
// downgrades to "sent" when a stale event arrives out of order.
const STATUS_PRIORITY: Record<string, number> = {
  complained: 8,
  bounced: 7,
  clicked: 6,
  opened: 5,
  delivered: 4,
  sent: 3,
  queued: 1,
};

interface ResendEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    [key: string]: unknown;
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rawBody = await req.text();
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");

    // ── Signature verification (when configured) ──
    let event: ResendEvent;
    if (webhookSecret) {
      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn("Resend webhook: missing svix headers — rejecting");
        return new Response(
          JSON.stringify({ error: "Missing signature headers" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        const wh = new Webhook(webhookSecret);
        event = wh.verify(rawBody, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        }) as ResendEvent;
      } catch (verifyErr) {
        console.error("Resend webhook signature failed:", verifyErr);
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      // Accept unsigned events during setup, but log a warning.
      console.warn(
        "Resend webhook: RESEND_WEBHOOK_SECRET not set — accepting unverified event. " +
          "Set the env var in Supabase Dashboard → Edge Functions → Secrets.",
      );
      try {
        event = JSON.parse(rawBody) as ResendEvent;
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const resendId = event.data?.email_id;
    const status = STATUS_MAP[event.type];

    if (!resendId) {
      console.warn("Resend webhook: missing email_id in event", event.type);
      return new Response(
        JSON.stringify({ received: true, ignored: "no email_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!status) {
      console.log(`Resend webhook: ignoring unknown event type "${event.type}"`);
      return new Response(
        JSON.stringify({ received: true, ignored: `unknown event ${event.type}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Find the matching email_events row by resend_email_id ──
    const { data: existing, error: lookupErr } = await supabase
      .from("email_events")
      .select("id, details")
      .eq("resend_email_id", resendId)
      .maybeSingle();

    if (lookupErr) {
      console.error("Resend webhook lookup failed:", lookupErr);
      return new Response(
        JSON.stringify({ error: "Lookup failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!existing) {
      // Could be an event for an email sent before our event-tracking was set
      // up, or sent from a different system. ACK so Resend stops retrying.
      console.log(`Resend webhook: no email_events row for resend_id=${resendId}`);
      return new Response(
        JSON.stringify({ received: true, ignored: "no matching email_events row" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const currentDetails = (existing.details as Record<string, unknown>) || {};
    const currentStatus = (currentDetails.status as string) || "queued";
    const newPriority = STATUS_PRIORITY[status] ?? 0;
    const oldPriority = STATUS_PRIORITY[currentStatus] ?? 0;

    // Never downgrade — e.g. a late-arriving "sent" event must NOT overwrite
    // an already-recorded "delivered" status.
    if (newPriority < oldPriority) {
      return new Response(
        JSON.stringify({
          received: true,
          skipped: `lower-priority event (${event.type} < ${currentStatus})`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const eventTimestampField =
      status === "delivered" ? "delivered_at"
      : status === "opened" ? "opened_at"
      : status === "clicked" ? "clicked_at"
      : status === "bounced" ? "bounced_at"
      : status === "complained" ? "complained_at"
      : status === "sent" ? "sent_at"
      : null;

    const mergedDetails: Record<string, unknown> = {
      ...currentDetails,
      status,
      last_event: event.type,
      last_event_at: event.created_at || new Date().toISOString(),
    };
    if (eventTimestampField) {
      mergedDetails[eventTimestampField] = event.created_at || new Date().toISOString();
    }

    const { error: updErr } = await supabase
      .from("email_events")
      .update({ details: mergedDetails })
      .eq("id", existing.id);

    if (updErr) {
      console.error("Resend webhook update failed:", updErr);
      return new Response(
        JSON.stringify({ error: "Update failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        received: true,
        status,
        email_events_id: existing.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("resend-webhook fatal:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
