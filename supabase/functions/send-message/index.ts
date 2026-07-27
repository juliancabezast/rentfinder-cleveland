import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // HTML escape helper to prevent XSS in emails
  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let lead_id = "", channel = "", organization_id = "";
  try {
    const parsed = await req.json();
    lead_id = parsed.lead_id;
    channel = parsed.channel;
    organization_id = parsed.organization_id;
    const messageBody = parsed.body;

    if (!lead_id || !channel || !messageBody || !organization_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: lead_id, channel, body, organization_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Authenticate caller (C2) ───────────────────────────────────
    // Accept either an internal service-role call (other edge functions/cron) OR a
    // logged-in user. Anonymous/unauthenticated callers are rejected, and for user
    // callers the organization_id is derived from THEIR record (never trusted from body)
    // to prevent cross-tenant message sending.
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isServiceRole = callerToken.length > 0 && callerToken === serviceRoleKey;

    if (!isServiceRole) {
      if (!callerToken || callerToken === anonKey) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: authData, error: authErr } = await supabase.auth.getUser(callerToken);
      if (authErr || !authData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: callerRec } = await supabase
        .from("users")
        .select("organization_id, is_active")
        .eq("auth_user_id", authData.user.id)
        .single();
      if (!callerRec || callerRec.is_active === false || !callerRec.organization_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Force the caller's own org — ignore any body-supplied organization_id.
      organization_id = callerRec.organization_id;
    }
    // A validated user JWT = a HUMAN sender; the service-role key = automation
    // (other edge functions / agent tasks). Used below for the human-takeover
    // exemption in the compliance gate.
    const isHumanSender = !isServiceRole;

    // ── Get lead info ──────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, phone, email, full_name, sms_consent, call_consent, whatsapp_consent")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (leadErr || !lead) {
      return new Response(
        JSON.stringify({ success: false, error: "Lead not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Joseph compliance check (C4 — fail CLOSED) ─────────────────
    // Correct RPC signature: {p_organization_id, p_lead_id, p_action_type, p_agent_key}
    // returning jsonb {passed, violations}. Previously called with wrong arg names and
    // compared as a boolean, so the gate never triggered (TCPA/consent bypass).
    try {
      const { data: compliance, error: complianceErr } = await supabase.rpc(
        "joseph_compliance_check",
        {
          // WhatsApp is checked as "sms" — joseph has no whatsapp branch, and
          // "sms" enforces the shared DNC / sms_consent / TCPA-hours gates.
          // whatsapp_consent itself is enforced explicitly below (server-side).
          p_organization_id: organization_id,
          p_lead_id: lead_id,
          p_action_type: channel === "email" ? "email" : "sms",
          p_agent_key: isHumanSender ? "manual" : "automation",
        }
      );
      if (complianceErr) throw complianceErr;

      if (compliance?.passed === false) {
        // Human-takeover exemption: an authenticated HUMAN sender may message a
        // human-controlled lead — taking control makes them responsible for the
        // lead's communications (HumanTakeoverModal), so the HUMAN_CONTROLLED
        // block only applies to AUTOMATED callers. Every other blocking
        // violation (DNC, consent, TCPA hours/days) still blocks humans too.
        const violations: Array<{ code?: string; severity?: string }> =
          Array.isArray(compliance?.violations) ? compliance.violations : [];
        const hardViolations = violations.filter(
          (v) =>
            v?.severity !== "warning" &&
            !(isHumanSender && v?.code === "HUMAN_CONTROLLED")
        );
        if (hardViolations.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Compliance check failed — contact is not permitted for this lead.",
              violations: hardViolations,
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    } catch (complianceErr) {
      // Fail CLOSED: if the compliance gate cannot run, do NOT send.
      console.error("Joseph compliance check error (failing closed):", complianceErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Compliance check unavailable; message blocked.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Get org credentials ────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    let messageId: string | null = null;
    let emailQueued = false; // email path returns queued:true (drained later)

    if (channel === "sms" || channel === "whatsapp") {
      if (!lead.phone) {
        return new Response(
          JSON.stringify({ success: false, error: "Lead has no phone number" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Channel-specific consent at the trust boundary: the UI also checks
      // whatsapp_consent, but a direct API call must not bypass it (TCPA).
      if (channel === "whatsapp" && !lead.whatsapp_consent) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Lead has not consented to WhatsApp messages.",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const sid = creds?.twilio_account_sid;
      const token = creds?.twilio_auth_token;
      const fromPhone = creds?.twilio_phone_number;

      if (!fromPhone) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Twilio phone number not configured. Add it in Settings → Integrations.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!sid || !token) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Twilio credentials not configured. Add them in Settings → Integrations.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Build Twilio request
      const toNumber =
        channel === "whatsapp"
          ? `whatsapp:${lead.phone}`
          : lead.phone;
      const fromNumber =
        channel === "whatsapp"
          ? `whatsapp:${fromPhone}`
          : fromPhone;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const formData = new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: messageBody,
      });

      const twilioResp = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const twilioData = await twilioResp.json();

      if (!twilioResp.ok) {
        throw new Error(
          `Twilio error: ${twilioData.message || twilioResp.status}`
        );
      }

      messageId = twilioData.sid;
    } else if (channel === "email") {
      if (!lead.email) {
        return new Response(
          JSON.stringify({ success: false, error: "Lead has no email address" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Send via our email function. Use a RAW fetch with the service-role
      // Bearer (project rule: edge→edge through a service-role gate must NOT go
      // via functions.invoke, which puts the key in `apikey` — the exact bug
      // that 401'd confirmations for 7 days in the 2026-07-10 outage).
      const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          to: lead.email,
          subject: "Message from Rent Finder Cleveland",
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rent Finder Cleveland</h1>
              </div>
              <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                <p>Hi <strong>${escapeHtml(lead.full_name || "there")}</strong>,</p>
                <p>${escapeHtml(messageBody).replace(/\n/g, "<br>")}</p>
                <br>
                <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
              </div>
            </div>`,
          notification_type: "manual_message",
          organization_id,
          related_entity_id: lead_id,
          related_entity_type: "lead",
          queue: true,
        }),
      });

      const emailData = await emailResp.json().catch(() => ({}));
      if (!emailResp.ok) {
        throw new Error(emailData?.error || `Email send failed (HTTP ${emailResp.status})`);
      }
      // queue:true → the email is enqueued, not yet delivered. Record that state
      // distinctly instead of pretending it was sent.
      emailQueued = emailData?.queued === true || !emailData?.resend_email_id;
      messageId = emailData?.resend_email_id || null;
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unsupported channel: ${channel}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Log message to the communications table ────────────────────
    // (The old target `messages` never existed, so every outbound touch was
    // lost silently — the whole app reads history from `communications`.)
    // Email sent with queue:true is recorded as "queued", not "sent".
    const commStatus = channel === "email" ? (emailQueued ? "queued" : "sent") : "sent";
    const { error: commErr } = await supabase.from("communications").insert({
      organization_id,
      lead_id,
      direction: "outbound",
      channel,
      recipient: channel === "email" ? lead.email : lead.phone,
      subject: channel === "email" ? "Message from Rent Finder Cleveland" : null,
      body: messageBody,
      status: commStatus,
      twilio_message_sid: channel === "email" ? null : messageId,
      sent_at: commStatus === "sent" ? new Date().toISOString() : null,
    });
    if (commErr) console.error("communications insert failed:", commErr);

    // ── Update lead contact timestamp ──────────────────────────────
    await supabase
      .from("leads")
      .update({
        last_contact_at: new Date().toISOString(),
        last_contact_channel: channel, // "sms" | "whatsapp" | "email" — the medium of this outbound touch
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    // ── Record cost ────────────────────────────────────────────────
    try {
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: organization_id,
        p_service: channel === "email" ? "resend" : "twilio",
        p_usage_quantity: 1,
        p_usage_unit: channel === "email" ? "email" : "sms_segment",
        p_unit_cost: channel === "email" ? 0.0 : 0.0079,
        p_total_cost: channel === "email" ? 0.0 : 0.0079,
        p_lead_id: lead_id,
      });
    } catch (costErr) {
      console.warn("Cost recording failed:", costErr);
    }

    // Log successful message
    try {
      await supabase.from("system_logs").insert({
        organization_id,
        level: "info",
        category: channel === "email" ? "general" : "twilio",
        event_type: "message_sent",
        message: `${channel.toUpperCase()} message sent to ${lead.full_name || lead.phone}`,
        details: { channel, message_id: messageId, lead_id, body: messageBody },
        related_lead_id: lead_id,
      });
    } catch (logErr) {
      console.warn("System log insert failed:", logErr);
    }

    return new Response(
      JSON.stringify({ success: true, message_id: messageId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("send-message error:", err);

    // Log error
    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: channel === "email" ? "general" : "twilio",
        event_type: "message_send_error",
        message: `Failed to send message: ${(err as Error).message || "Unknown error"}`,
        details: { error: String(err), channel, lead_id },
        related_lead_id: lead_id || null,
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        success: false,
        error: (err as Error).message || "Failed to send message",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
