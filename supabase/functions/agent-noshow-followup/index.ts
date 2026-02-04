import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.includes(supabaseServiceKey)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Parse request
    const { task_id, lead_id, organization_id, context } = await req.json();
    const showingId = context?.showing_id;
    const attemptNumber = context?.attempt_number || 1;

    if (!lead_id || !organization_id || !showingId) {
      throw new Error("Missing required fields: lead_id, organization_id, context.showing_id");
    }

    console.log(`No-show follow-up: showing=${showingId}, attempt=${attemptNumber}`);

    // Update task status to in_progress
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "in_progress", executed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    // Fetch showing details
    const { data: showing, error: showingError } = await supabase
      .from("showings")
      .select("*, property:properties(*), lead:leads(*)")
      .eq("id", showingId)
      .single();

    if (showingError || !showing) {
      throw new Error(`Showing not found: ${showingId}`);
    }

    // Check if lead has already rescheduled
    const { data: rescheduledShowing } = await supabase
      .from("showings")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("organization_id", organization_id)
      .in("status", ["scheduled", "confirmed"])
      .gt("scheduled_at", new Date().toISOString())
      .limit(1);

    if (rescheduledShowing && rescheduledShowing.length > 0) {
      console.log("Lead has already rescheduled");
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
      return new Response(
        JSON.stringify({ success: true, already_rescheduled: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run compliance check for call
    const { data: compliance } = await supabase.rpc("joseph_compliance_check", {
      p_organization_id: organization_id,
      p_lead_id: lead_id,
      p_action_type: "call",
      p_agent_key: "no_show_followup",
    });

    if (!compliance?.passed) {
      console.log("Compliance check failed:", compliance?.violations);
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
      return new Response(
        JSON.stringify({ success: false, reason: "compliance_blocked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org and credentials
    const { data: org } = await supabase
      .from("organizations")
      .select("name, phone")
      .eq("id", organization_id)
      .single();

    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("bland_api_key, twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    const property = showing.property;
    const lead = showing.lead;
    const leadName = lead?.first_name || "there";
    const orgName = org?.name || "our team";
    const propertyAddress = property?.address || "the property";

    let callDispatched = false;
    let smsSent = false;

    // Try calling with empathetic script
    if (credentials?.bland_api_key) {
      const taskPrompt = `You are following up with a lead who missed their property showing. Be warm, understanding, and non-accusatory.

IMPORTANT TONE: Be genuinely caring. Do NOT guilt or blame them. Express concern for their wellbeing.

Greeting: "Hi ${leadName}, this is ${orgName}. I hope everything is okay - we noticed you weren't able to make it to your showing at ${propertyAddress} today."

Key points:
1. Express understanding: "Life gets busy, and things come up - it's totally understandable."
2. Check if they're still interested: "Are you still looking for a new home?"
3. Offer to reschedule: "We'd love to reschedule the showing whenever works best for you. ${propertyAddress} is still available."
4. Make it easy: "What day and time would be more convenient?"
5. Be helpful: "Is there anything we can help with in your housing search?"

Property reminder: ${property?.bedrooms || ""}BR/${property?.bathrooms || ""}BA, $${property?.rent_price || ""}/mo

If they're no longer interested, wish them well and thank them for their time.
End with: "Feel free to call us anytime at ${org?.phone || credentials.twilio_phone_number}."`;

      const { data: voiceIdSetting } = await supabase.rpc("get_org_setting", {
        p_organization_id: organization_id,
        p_key: "bland_voice_id",
        p_default: '"default"',
      });
      const voiceId = typeof voiceIdSetting === "string" ? voiceIdSetting.replace(/"/g, "") : "default";

      const webhookUrl = `${supabaseUrl}/functions/v1/bland-call-webhook`;

      const blandResponse = await fetch("https://api.bland.ai/v1/calls", {
        method: "POST",
        headers: {
          "Authorization": credentials.bland_api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: normalizePhone(lead?.phone || ""),
          task: taskPrompt,
          voice: voiceId !== "default" ? voiceId : undefined,
          webhook: webhookUrl,
          record: true,
          max_duration: 8,
          metadata: {
            organization_id,
            lead_id,
            showing_id: showingId,
            task_id,
            agent_type: "no_show_followup",
            attempt_number: attemptNumber,
          },
        }),
      });

      if (blandResponse.ok) {
        callDispatched = true;
        const blandData = await blandResponse.json();
        console.log("No-show follow-up call dispatched:", blandData.call_id);
      } else {
        console.error("Bland.ai failed:", await blandResponse.text());
      }
    }

    // If call failed, try SMS
    if (!callDispatched && credentials?.twilio_account_sid) {
      const { data: smsCompliance } = await supabase.rpc("joseph_compliance_check", {
        p_organization_id: organization_id,
        p_lead_id: lead_id,
        p_action_type: "sms",
        p_agent_key: "no_show_followup",
      });

      if (smsCompliance?.passed) {
        const orgPhone = org?.phone || credentials.twilio_phone_number;
        const smsBody = `Hi ${leadName}, we missed you at ${propertyAddress} today. No worries! Reply to reschedule or call ${orgPhone}. We'd love to help you find your new home. Reply STOP to unsubscribe.`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${credentials.twilio_account_sid}/Messages.json`;
        const twilioAuth = btoa(`${credentials.twilio_account_sid}:${credentials.twilio_auth_token}`);

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: credentials.twilio_phone_number,
            To: normalizePhone(lead?.phone || ""),
            Body: smsBody,
          }),
        });

        if (twilioResponse.ok) {
          const twilioData = await twilioResponse.json();
          smsSent = true;

          await supabase.from("communications").insert({
            organization_id,
            lead_id,
            channel: "sms",
            direction: "outbound",
            recipient: lead?.phone,
            body: smsBody,
            status: "sent",
            sent_at: new Date().toISOString(),
            twilio_message_sid: twilioData.sid,
          });

          await supabase.rpc("zacchaeus_record_cost", {
            p_organization_id: organization_id,
            p_service: "twilio_sms",
            p_usage_quantity: 1,
            p_usage_unit: "messages",
            p_unit_cost: 0.0079,
            p_total_cost: 0.0079,
            p_lead_id: lead_id,
          });
        }
      }
    }

    // Schedule next attempt if this wasn't the final one
    const maxAttempts = 3;
    if (attemptNumber < maxAttempts && !callDispatched) {
      // Schedule pattern: Attempt 2 at day+1, Attempt 3 at day+3
      const delayDays = attemptNumber === 1 ? 1 : 3;
      const nextScheduledFor = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

      await supabase.from("agent_tasks").insert({
        organization_id,
        lead_id,
        agent_type: "no_show_followup",
        action_type: "call",
        scheduled_for: nextScheduledFor,
        attempt_number: attemptNumber + 1,
        max_attempts: maxAttempts,
        status: "pending",
        context: {
          showing_id: showingId,
          property_id: property?.id,
          trigger: "no_show_retry",
        },
      });
    }

    // Mark task as completed
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "no_show_followup",
      p_action: "noshow_followup",
      p_status: callDispatched || smsSent ? "success" : "failure",
      p_message: `No-show follow-up attempt ${attemptNumber}: call=${callDispatched}, sms=${smsSent}`,
      p_details: { call_dispatched: callDispatched, sms_sent: smsSent, attempt: attemptNumber },
      p_lead_id: lead_id,
      p_showing_id: showingId,
      p_task_id: task_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, call_dispatched: callDispatched, sms_sent: smsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("No-show follow-up error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const { lead_id, organization_id, task_id, context } = await req.clone().json().catch(() => ({}));
      
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "no_show_followup",
        p_action: "noshow_error",
        p_status: "failure",
        p_message: `No-show follow-up error: ${errorMessage}`,
        p_details: { error: String(error) },
        p_lead_id: lead_id,
        p_showing_id: context?.showing_id,
        p_task_id: task_id,
        p_execution_ms: Date.now() - startTime,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
