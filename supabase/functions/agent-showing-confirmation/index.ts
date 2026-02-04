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

// Format date for display
function formatDateTime(isoDate: string, timezone: string = "America/New_York"): { date: string; time: string } {
  const date = new Date(isoDate);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  return {
    date: date.toLocaleDateString("en-US", options),
    time: date.toLocaleTimeString("en-US", timeOptions),
  };
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

    console.log(`Showing confirmation: showing=${showingId}, attempt=${attemptNumber}`);

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

    // Check if already confirmed
    if (showing.status === "confirmed") {
      console.log("Showing already confirmed");
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
      return new Response(
        JSON.stringify({ success: true, already_confirmed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if showing is still in the future
    if (new Date(showing.scheduled_at) <= new Date()) {
      console.log("Showing is in the past");
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
      return new Response(
        JSON.stringify({ success: false, reason: "showing_in_past" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run compliance check for call
    const { data: compliance } = await supabase.rpc("joseph_compliance_check", {
      p_organization_id: organization_id,
      p_lead_id: lead_id,
      p_action_type: "call",
      p_agent_key: "showing_confirmation",
    });

    // Fetch org and credentials
    const { data: org } = await supabase
      .from("organizations")
      .select("name, phone, timezone")
      .eq("id", organization_id)
      .single();

    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("bland_api_key, twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    const timezone = org?.timezone || "America/New_York";
    const { date: showingDate, time: showingTime } = formatDateTime(showing.scheduled_at, timezone);
    const property = showing.property;
    const lead = showing.lead;
    const leadName = lead?.first_name || "there";
    const orgName = org?.name || "our team";
    const propertyAddress = property?.address || "the property";

    let callDispatched = false;
    let smsSent = false;

    // Try calling first (if compliance passes and we have Bland API key)
    if (compliance?.passed && credentials?.bland_api_key) {
      const taskPrompt = `You are confirming a property showing appointment.

Greeting: "Hi ${leadName}, this is ${orgName} calling to confirm your property showing."

Details:
- Property: ${propertyAddress}, ${property?.city || ""} ${property?.state || ""}
- Date: ${showingDate}
- Time: ${showingTime}

Your script:
1. Confirm: "Can you confirm you'll be there for your showing at ${propertyAddress} on ${showingDate} at ${showingTime}?"
2. If YES: "Great! We'll see you then. Do you have any questions about the property beforehand?"
3. If NO / need to reschedule: "No problem! What day and time would work better for you?" (Capture their preferred time)
4. Remind them: "Please arrive 5-10 minutes early. Bring a valid ID. Call us at ${org?.phone || credentials.twilio_phone_number} if anything changes."

Be friendly and helpful. If they have questions about the property, answer what you know (${property?.bedrooms || ""}BR/${property?.bathrooms || ""}BA, $${property?.rent_price || ""}/mo).`;

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
          max_duration: 5,
          metadata: {
            organization_id,
            lead_id,
            showing_id: showingId,
            task_id,
            agent_type: "showing_confirmation",
            attempt_number: attemptNumber,
          },
        }),
      });

      if (blandResponse.ok) {
        callDispatched = true;
        const blandData = await blandResponse.json();
        console.log("Confirmation call dispatched:", blandData.call_id);
      } else {
        console.error("Bland.ai failed:", await blandResponse.text());
      }
    }

    // If call failed or not possible, try SMS (especially on attempt 2+)
    if (!callDispatched && credentials?.twilio_account_sid) {
      // Check SMS compliance
      const { data: smsCompliance } = await supabase.rpc("joseph_compliance_check", {
        p_organization_id: organization_id,
        p_lead_id: lead_id,
        p_action_type: "sms",
        p_agent_key: "showing_confirmation",
      });

      if (smsCompliance?.passed) {
        const orgPhone = org?.phone || credentials.twilio_phone_number;
        const smsBody = `Hi ${leadName}! Reminder: You have a showing at ${propertyAddress} on ${showingDate} at ${showingTime}. Reply YES to confirm or call ${orgPhone} to reschedule. Reply STOP to unsubscribe.`;

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

    // Update showing with confirmation attempt info
    await supabase
      .from("showings")
      .update({
        confirmation_attempts: (showing.confirmation_attempts || 0) + 1,
        last_confirmation_attempt_at: new Date().toISOString(),
      })
      .eq("id", showingId);

    // If this was the final attempt (3rd) and still not confirmed
    const maxAttempts = 3;
    if (attemptNumber >= maxAttempts && showing.status === "scheduled") {
      // Cancel the showing
      await supabase
        .from("showings")
        .update({
          status: "cancelled",
          cancellation_reason: "No confirmation after 3 attempts",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", showingId);

      // Notify leasing agent
      await supabase.from("agent_tasks").insert({
        organization_id,
        lead_id,
        agent_type: "notification_dispatcher",
        action_type: "notify",
        scheduled_for: new Date().toISOString(),
        status: "pending",
        context: {
          notification_type: "showing_cancelled",
          showing_id: showingId,
          reason: "No confirmation after 3 attempts",
          leasing_agent_id: showing.leasing_agent_id,
        },
      });

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "showing_confirmation",
        p_action: "showing_cancelled_no_confirmation",
        p_status: "success",
        p_message: `Showing cancelled after ${maxAttempts} confirmation attempts`,
        p_details: { showing_id: showingId },
        p_lead_id: lead_id,
        p_showing_id: showingId,
        p_task_id: task_id,
        p_execution_ms: Date.now() - startTime,
      });
    }

    // Mark task as completed
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
        })
        .eq("id", task_id);
    }

    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "showing_confirmation",
      p_action: "confirmation_attempt",
      p_status: callDispatched || smsSent ? "success" : "failure",
      p_message: `Confirmation attempt ${attemptNumber}: call=${callDispatched}, sms=${smsSent}`,
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
    console.error("Showing confirmation error:", error);
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
        p_agent_key: "showing_confirmation",
        p_action: "confirmation_error",
        p_status: "failure",
        p_message: `Confirmation error: ${errorMessage}`,
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
