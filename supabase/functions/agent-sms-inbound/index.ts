import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

// Normalize phone number to E.164 format
function normalizePhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

// Generate TwiML response
function twiml(content: string = ""): Response {
  const xml = content 
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${content}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(xml, {
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse Twilio form data
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = (formData.get("Body") as string || "").trim();
    const messageSid = formData.get("MessageSid") as string;

    console.log(`Inbound SMS: From=${from}, To=${to}, Body="${body.slice(0, 50)}..."`);

    if (!from || !to) {
      console.error("Missing required Twilio fields");
      return twiml();
    }

    const normalizedFrom = normalizePhone(from);
    const normalizedTo = normalizePhone(to);

    // Look up organization by Twilio phone number
    const { data: credentials, error: credError } = await supabase
      .from("organization_credentials")
      .select("organization_id, twilio_phone_number")
      .or(`twilio_phone_number.eq.${normalizedTo},twilio_phone_number.eq.${to}`)
      .limit(1)
      .single();

    if (credError || !credentials) {
      console.error("No organization found for number:", normalizedTo);
      return twiml();
    }

    const orgId = credentials.organization_id;

    // Fetch organization
    const { data: org } = await supabase
      .from("organizations")
      .select("name, phone")
      .eq("id", orgId)
      .single();

    const orgPhone = org?.phone || credentials.twilio_phone_number;
    const orgName = org?.name || "Our team";

    // Check for keywords
    const bodyUpper = body.toUpperCase();
    const isKeyword = ["STOP", "START", "HELP", "YES", "NO"].includes(bodyUpper);

    // Handle STOP keyword
    if (bodyUpper === "STOP") {
      // Call handle_sms_opt_out RPC
      try {
        await supabase.rpc("handle_sms_opt_out", {
          p_organization_id: orgId,
          p_phone: normalizedFrom,
          p_action: "stop",
        });
      } catch (optOutErr) {
        console.error("handle_sms_opt_out error:", optOutErr);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "sms_inbound",
        p_action: "sms_stop_received",
        p_status: "success",
        p_message: `Lead opted out via STOP keyword`,
        p_details: { phone: normalizedFrom },
        p_execution_ms: Date.now() - startTime,
      });

      // Return empty response - Twilio handles STOP replies
      return twiml();
    }

    // Handle START keyword
    if (bodyUpper === "START") {
      try {
        await supabase.rpc("handle_sms_opt_out", {
          p_organization_id: orgId,
          p_phone: normalizedFrom,
          p_action: "start",
        });
      } catch (optOutErr) {
        console.error("handle_sms_opt_out error:", optOutErr);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "sms_inbound",
        p_action: "sms_start_received",
        p_status: "success",
        p_message: `Lead opted back in via START keyword`,
        p_details: { phone: normalizedFrom },
        p_execution_ms: Date.now() - startTime,
      });

      return twiml(`Welcome back! You've been re-subscribed to messages from ${orgName}. Reply STOP to unsubscribe.`);
    }

    // Handle HELP keyword
    if (bodyUpper === "HELP") {
      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "sms_inbound",
        p_action: "sms_help_received",
        p_status: "success",
        p_message: `Help request received`,
        p_details: { phone: normalizedFrom },
        p_execution_ms: Date.now() - startTime,
      });

      return twiml(`Thanks for reaching out! Call us at ${orgPhone} for assistance. Reply STOP to unsubscribe.`);
    }

    // Find lead by phone
    const { data: lead } = await supabase
      .from("leads")
      .select("id, first_name, status, is_human_controlled, assigned_leasing_agent_id")
      .eq("organization_id", orgId)
      .eq("phone", normalizedFrom)
      .limit(1)
      .single();

    // Handle YES keyword (showing confirmation context)
    if (bodyUpper === "YES" && lead) {
      // Check if there's a pending showing for this lead
      const { data: pendingShowing } = await supabase
        .from("showings")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("status", "scheduled")
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single();

      if (pendingShowing) {
        await supabase
          .from("showings")
          .update({ 
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", pendingShowing.id);

        await supabase.rpc("log_agent_activity", {
          p_organization_id: orgId,
          p_agent_key: "sms_inbound",
          p_action: "showing_confirmed_sms",
          p_status: "success",
          p_message: `Showing confirmed via SMS YES reply`,
          p_details: { showing_id: pendingShowing.id },
          p_lead_id: lead.id,
          p_showing_id: pendingShowing.id,
          p_execution_ms: Date.now() - startTime,
        });

        return twiml(`Great! Your showing is confirmed. We look forward to seeing you! Call ${orgPhone} if you need anything.`);
      }
    }

    // Handle NO keyword (showing context - reschedule)
    if (bodyUpper === "NO" && lead) {
      const { data: pendingShowing } = await supabase
        .from("showings")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("status", "scheduled")
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single();

      if (pendingShowing) {
        // Create a task to handle reschedule
        await supabase.from("agent_tasks").insert({
          organization_id: orgId,
          lead_id: lead.id,
          agent_type: "notification_dispatcher",
          action_type: "notify",
          scheduled_for: new Date().toISOString(),
          status: "pending",
          context: {
            notification_type: "showing_reschedule_requested",
            showing_id: pendingShowing.id,
            trigger: "sms_no_reply",
          },
        });

        await supabase.rpc("log_agent_activity", {
          p_organization_id: orgId,
          p_agent_key: "sms_inbound",
          p_action: "showing_reschedule_requested",
          p_status: "success",
          p_message: `Lead requested reschedule via SMS NO reply`,
          p_details: { showing_id: pendingShowing.id },
          p_lead_id: lead.id,
          p_showing_id: pendingShowing.id,
          p_execution_ms: Date.now() - startTime,
        });

        return twiml(`No problem! Reply with what day/time works better, or call us at ${orgPhone} to reschedule.`);
      }
    }

    // Non-keyword message - regular conversation
    // Create communication record for inbound message
    await supabase.from("communications").insert({
      organization_id: orgId,
      lead_id: lead?.id || null,
      channel: "sms",
      direction: "inbound",
      recipient: normalizedTo,
      body: body,
      status: "received",
      sent_at: new Date().toISOString(),
      twilio_message_sid: messageSid,
    });

    if (lead) {
      // Update lead last contact
      const leadUpdate: Record<string, any> = {
        last_contact_at: new Date().toISOString(),
      };

      // If contacted, move to engaged
      if (lead.status === "contacted") {
        leadUpdate.status = "engaged";
      }

      await supabase.from("leads").update(leadUpdate).eq("id", lead.id);

      // If human controlled, just log it - don't auto-respond
      if (lead.is_human_controlled) {
        await supabase.rpc("log_agent_activity", {
          p_organization_id: orgId,
          p_agent_key: "sms_inbound",
          p_action: "sms_received_human_controlled",
          p_status: "success",
          p_message: `SMS received from human-controlled lead (no auto-reply)`,
          p_details: { body: body.slice(0, 200) },
          p_lead_id: lead.id,
          p_execution_ms: Date.now() - startTime,
        });

        return twiml();
      }

      // Notify assigned agent if any
      if (lead.assigned_leasing_agent_id) {
        await supabase.from("agent_tasks").insert({
          organization_id: orgId,
          lead_id: lead.id,
          agent_type: "notification_dispatcher",
          action_type: "notify",
          scheduled_for: new Date().toISOString(),
          status: "pending",
          context: {
            notification_type: "sms_received",
            message_preview: body.slice(0, 100),
            assigned_agent_id: lead.assigned_leasing_agent_id,
          },
        });
      }

      // Auto-reply
      const leadName = lead.first_name || "there";
      const autoReply = `Thanks for your message, ${leadName}! A team member will get back to you shortly. Call ${orgPhone} if you need immediate help. Reply STOP to unsubscribe.`;

      // Record auto-reply
      await supabase.from("communications").insert({
        organization_id: orgId,
        lead_id: lead.id,
        channel: "sms",
        direction: "outbound",
        recipient: normalizedFrom,
        body: autoReply,
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "sms_inbound",
        p_action: "sms_auto_replied",
        p_status: "success",
        p_message: `SMS received and auto-reply sent`,
        p_details: { inbound_body: body.slice(0, 200), lead_status: lead.status },
        p_lead_id: lead.id,
        p_execution_ms: Date.now() - startTime,
      });

      return twiml(autoReply);
    }

    // No lead found - could be new inquiry
    await supabase.rpc("log_agent_activity", {
      p_organization_id: orgId,
      p_agent_key: "sms_inbound",
      p_action: "sms_unknown_sender",
      p_status: "success",
      p_message: `SMS received from unknown number`,
      p_details: { phone: normalizedFrom, body: body.slice(0, 200) },
      p_execution_ms: Date.now() - startTime,
    });

    // Reply to unknown sender
    return twiml(`Thanks for texting ${orgName}! Call us at ${orgPhone} or visit our website to get started. Reply STOP to unsubscribe.`);

  } catch (error: unknown) {
    console.error("SMS inbound webhook error:", error);
    
    // Always return valid TwiML
    try {
      await supabase.rpc("log_agent_activity", {
        p_organization_id: null,
        p_agent_key: "sms_inbound",
        p_action: "sms_error",
        p_status: "failure",
        p_message: `SMS processing error: ${error instanceof Error ? error.message : String(error)}`,
        p_details: { error: String(error) },
        p_execution_ms: Date.now() - startTime,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return twiml();
  }
});
