import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resend pricing fallback when org has no `email_unit_cost` setting
const DEFAULT_EMAIL_UNIT_COST = 0.001;

// Notification types treated as marketing for consent purposes.
// Transactional types (showing confirmations, etc.) bypass the consent gate.
const MARKETING_NOTIFICATION_TYPES = new Set([
  "campaign",
  "marketing",
  "featured_property",
  "newsletter",
  "promotion",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let to = "", subject = "", notification_type = "", organization_id = "";
  try {
    const parsed = await req.json();
    to = parsed.to;
    subject = parsed.subject;
    notification_type = parsed.notification_type;
    organization_id = parsed.organization_id;
    const {
      html,
      related_entity_id,
      related_entity_type,
      from_name,
      queue,  // If true, queue email instead of sending immediately
      campaign_id,
    } = parsed;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Authenticate caller (close open-relay hole) ────────────────
    // This function sends HTML mail from the org's verified domain; it must not be callable
    // anonymously. Accept internal service-role calls (edge fns / queue processor / cron) OR a
    // logged-in user; reject anon/invalid tokens.
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isServiceRole = callerToken.length > 0 && callerToken === serviceRoleKey;
    if (!isServiceRole) {
      if (!callerToken || callerToken === anonKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: authData, error: authErr } = await supabase.auth.getUser(callerToken);
      if (authErr || !authData?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Marketing consent gate ──
    // Campaign / newsletter / marketing emails check the recipient lead has
    // not unsubscribed and has positive email_marketing_consent. Transactional
    // emails (showing confirms, application invites, password resets) skip
    // this — they are legitimate interest under CAN-SPAM/CASL.
    const isMarketing =
      MARKETING_NOTIFICATION_TYPES.has(String(notification_type || "")) ||
      Boolean(campaign_id);
    if (isMarketing && related_entity_type === "lead" && related_entity_id) {
      try {
        const { data: leadConsent, error: consentErr } = await supabase
          .from("leads")
          .select("email_marketing_consent, unsubscribed_at")
          .eq("id", related_entity_id)
          .maybeSingle();
        // If the consent columns aren't deployed yet, the SELECT errors with
        // PGRST204 — degrade gracefully and allow the send (logged below).
        if (consentErr) {
          console.warn(
            "Consent columns unavailable, allowing marketing email:",
            consentErr.message,
          );
        } else if (leadConsent?.unsubscribed_at) {
          return new Response(
            JSON.stringify({ error: "Lead has unsubscribed from marketing emails." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else if (leadConsent?.email_marketing_consent === false) {
          return new Response(
            JSON.stringify({ error: "Lead has not consented to marketing emails." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (consentCheckErr) {
        console.warn("Consent check failed, allowing send:", consentCheckErr);
      }
    }

    // ── QUEUE MODE: Insert into email_events as "queued" for agent processing ──
    if (queue && organization_id) {
      const senderName = from_name || "Rent Finder Cleveland";
      const detailsObj: Record<string, unknown> = {
          html,
          from_name: senderName,
          status: "queued",
          notification_type: notification_type || "notification",
          related_entity_id: related_entity_id || null,
          related_entity_type: related_entity_type || null,
          queued_at: new Date().toISOString(),
        };
      if (campaign_id) detailsObj.campaign_id = campaign_id;
      const { error: queueErr } = await supabase.from("email_events").insert({
        organization_id,
        event_type: "delivery_delayed",
        recipient_email: to,
        subject,
        details: detailsObj,
      });
      if (queueErr) console.error("Queue insert error:", queueErr.message);

      console.log(`Email queued for ${to}: "${subject}"`);

      return new Response(
        JSON.stringify({ success: true, queued: true, message: "Email queued for agent processing" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── IMMEDIATE MODE: Send via Resend right now ──
    // Get Resend API key — try env var first, then org-specific
    let resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

    if (organization_id && !resendApiKey) {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("resend_api_key")
        .eq("organization_id", organization_id)
        .single();

      if (creds?.resend_api_key) {
        resendApiKey = creds.resend_api_key;
      }
    }

    if (!resendApiKey) {
      throw new Error("No Resend API key configured");
    }

    // Get org's sender domain, fallback to default
    let senderDomain = "rentfindercleveland.com";
    if (organization_id) {
      const { data: domainSetting } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", organization_id)
        .eq("key", "sender_domain")
        .single();
      if (domainSetting?.value) senderDomain = domainSetting.value;
    }
    const senderName = from_name || "Rent Finder Cleveland";
    const fromAddress = `${senderName} <support@${senderDomain}>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", JSON.stringify(resendData));
      throw new Error(
        `Resend API error: ${resendData.message || resendResponse.status}`
      );
    }

    const resendEmailId = resendData.id;

    // Log to email_events table
    if (organization_id) {
      const sentDetails: Record<string, unknown> = {
          status: "sent",
          notification_type: notification_type || "notification",
          related_entity_id: related_entity_id || null,
          related_entity_type: related_entity_type || null,
        };
      if (campaign_id) sentDetails.campaign_id = campaign_id;
      await supabase.from("email_events").insert({
        organization_id,
        event_type: "sent",
        recipient_email: to,
        subject,
        resend_email_id: resendEmailId,
        details: sentDetails,
      });
    }

    // Record cost (non-blocking) — read per-org pricing from settings, default $0.001
    if (organization_id) {
      try {
        const { data: costSetting } = await supabase
          .from("organization_settings")
          .select("value")
          .eq("organization_id", organization_id)
          .eq("key", "email_unit_cost")
          .maybeSingle();
        let unitCost = DEFAULT_EMAIL_UNIT_COST;
        if (costSetting?.value != null) {
          const parsed = typeof costSetting.value === "number"
            ? costSetting.value
            : Number(costSetting.value);
          if (Number.isFinite(parsed) && parsed >= 0) unitCost = parsed;
        }
        await supabase.rpc("zacchaeus_record_cost", {
          p_organization_id: organization_id,
          p_service: "resend",
          p_usage_quantity: 1,
          p_usage_unit: "email",
          p_unit_cost: unitCost,
          p_total_cost: unitCost,
          p_lead_id: related_entity_type === "lead" ? related_entity_id : null,
        });
      } catch (costErr) {
        console.warn("Cost recording failed:", costErr);
      }
    }

    // System log (non-blocking)
    if (organization_id) {
      try {
        await supabase.from("system_logs").insert({
          organization_id,
          level: "info",
          category: "general",
          event_type: "email_sent",
          message: `Email sent to ${to}: "${subject}"`,
          details: { notification_type: notification_type || "notification", resend_email_id: resendEmailId, related_entity_id, related_entity_type },
        });
      } catch (logErr) {
        console.warn("System log insert failed:", logErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, resend_email_id: resendEmailId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-notification-email error:", error);

    // Log error
    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: "general",
        event_type: "email_send_error",
        message: `Failed to send email to ${to || "unknown"}: ${(error as Error).message || "Unknown error"}`,
        details: { error: String(error), to, subject, notification_type },
      });
    } catch (logErr) {
      console.warn("Error log insert failed:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || "Failed to send email",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
