import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendMessageRequest {
  lead_id: string;
  channel: "sms" | "whatsapp";
  body: string;
  organization_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, channel, body, organization_id }: SendMessageRequest =
      await req.json();

    if (!lead_id || !channel || !body || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get org credentials
    const { data: creds, error: credsError } = await supabase
      .from("organization_credentials")
      .select(
        "twilio_account_sid, twilio_auth_token, twilio_phone_number, twilio_whatsapp_number"
      )
      .eq("organization_id", organization_id)
      .single();

    if (credsError || !creds) {
      console.error("Error fetching credentials:", credsError);
      return new Response(
        JSON.stringify({ error: "Missing organization credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required Twilio credentials
    if (!creds.twilio_account_sid || !creds.twilio_auth_token) {
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (channel === "sms" && !creds.twilio_phone_number) {
      return new Response(
        JSON.stringify({ error: "Twilio SMS phone number not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (channel === "whatsapp" && !creds.twilio_whatsapp_number) {
      return new Response(
        JSON.stringify({ error: "Twilio WhatsApp number not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead phone
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("phone, whatsapp_number, full_name, sms_consent, whatsapp_consent")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      console.error("Error fetching lead:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify consent
    if (channel === "sms" && !lead.sms_consent) {
      return new Response(
        JSON.stringify({ error: "Lead has not consented to SMS" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (channel === "whatsapp" && !lead.whatsapp_consent) {
      return new Response(
        JSON.stringify({ error: "Lead has not consented to WhatsApp" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipientPhone =
      channel === "whatsapp"
        ? lead.whatsapp_number || lead.phone
        : lead.phone;

    let twilioFrom: string;
    let twilioTo: string;

    if (channel === "whatsapp") {
      twilioFrom = `whatsapp:${creds.twilio_whatsapp_number}`;
      twilioTo = `whatsapp:${recipientPhone}`;
    } else {
      twilioFrom = creds.twilio_phone_number!;
      twilioTo = recipientPhone;
    }

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.twilio_account_sid}/Messages.json`;

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          btoa(`${creds.twilio_account_sid}:${creds.twilio_auth_token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: twilioFrom,
        To: twilioTo,
        Body: body,
      }),
    });

    const twilioResult = await twilioResponse.json();

    // Log in communications table
    const { error: insertError } = await supabase.from("communications").insert({
      organization_id,
      lead_id,
      channel,
      direction: "outbound",
      recipient: recipientPhone,
      body,
      status: twilioResponse.ok ? "sent" : "failed",
      twilio_message_sid: twilioResult.sid || null,
      cost_twilio: twilioResult.price
        ? parseFloat(twilioResult.price) * -1
        : 0,
      sent_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Error logging communication:", insertError);
    }

    // Update lead last_contact_at
    await supabase
      .from("leads")
      .update({ last_contact_at: new Date().toISOString() })
      .eq("id", lead_id);

    if (!twilioResponse.ok) {
      // Log error
      await supabase.from("system_logs").insert({
        organization_id,
        level: "error",
        category: "twilio",
        event_type: `${channel}_send_failed`,
        message: `Failed to send ${channel} to ${recipientPhone}`,
        details: { error: twilioResult, lead_id },
        related_lead_id: lead_id,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: twilioResult.message || "Failed to send message",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_sid: twilioResult.sid,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error in send-message:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
