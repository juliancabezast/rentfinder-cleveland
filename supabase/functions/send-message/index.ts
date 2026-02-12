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

  try {
    const { lead_id, channel, body: messageBody, organization_id } =
      await req.json();

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

    // ── Get lead info ──────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, phone, email, full_name, sms_consent, call_consent")
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

    // ── Joseph compliance check ────────────────────────────────────
    try {
      const { data: complianceOk } = await supabase.rpc(
        "joseph_compliance_check",
        {
          p_lead_id: lead_id,
          p_contact_method: channel === "email" ? "email" : "sms",
          p_agent_key: "manual",
        }
      );

      if (complianceOk === false) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Compliance check failed — lead has not consented to this contact method.",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } catch {
      // If compliance function doesn't exist, proceed with manual consent check
      if (channel === "sms" && !lead.sms_consent) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Lead has not consented to SMS messages.",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ── Get org credentials ────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    let messageId: string | null = null;

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

      const sid = creds?.twilio_account_sid;
      const token = creds?.twilio_auth_token;
      const fromPhone = creds?.twilio_phone_number || "+12162383390";

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

      // Send via our email function
      const { data: emailData, error: emailErr } =
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: lead.email,
            subject: "Message from Rent Finder Cleveland",
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rent Finder Cleveland</h1>
              </div>
              <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                <p>Hi <strong>${lead.full_name || "there"}</strong>,</p>
                <p>${messageBody.replace(/\n/g, "<br>")}</p>
                <br>
                <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
              </div>
            </div>`,
            notification_type: "manual_message",
            organization_id,
            related_entity_id: lead_id,
            related_entity_type: "lead",
          },
        });

      if (emailErr) throw emailErr;
      messageId = emailData?.resend_email_id || "sent";
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

    // ── Log message to messages table ──────────────────────────────
    await supabase.from("messages").insert({
      organization_id,
      lead_id,
      direction: "outbound",
      channel,
      body: messageBody,
      external_id: messageId,
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    // ── Update lead contact timestamp ──────────────────────────────
    await supabase
      .from("leads")
      .update({
        last_contact_at: new Date().toISOString(),
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
    } catch {
      // Non-blocking
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
