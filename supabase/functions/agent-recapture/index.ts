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
    const attemptNumber = context?.attempt_number || 1;

    if (!lead_id || !organization_id) {
      throw new Error("Missing required fields: lead_id, organization_id");
    }

    console.log(`Recapture: lead=${lead_id}, attempt=${attemptNumber}`);

    // Update task status to in_progress
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "in_progress", executed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    // Fetch lead with history
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${lead_id}`);
    }

    // Run compliance check
    const { data: compliance } = await supabase.rpc("joseph_compliance_check", {
      p_organization_id: organization_id,
      p_lead_id: lead_id,
      p_action_type: "call",
      p_agent_key: "recapture",
    });

    if (!compliance?.passed) {
      console.log("Compliance check failed:", compliance?.violations);
      
      // Mark task as failed
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ 
            status: "failed", 
            completed_at: new Date().toISOString(),
            context: { ...context, failure_reason: "compliance_blocked", violations: compliance?.violations }
          })
          .eq("id", task_id);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "recapture",
        p_action: "blocked_by_compliance",
        p_status: "skipped",
        p_message: `Recapture blocked: ${JSON.stringify(compliance?.violations)}`,
        p_details: { compliance },
        p_lead_id: lead_id,
        p_task_id: task_id,
        p_execution_ms: Date.now() - startTime,
      });

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

    if (!credentials?.bland_api_key) {
      throw new Error("No Bland.ai API key configured");
    }

    // Fetch previous calls for context
    const { data: previousCalls } = await supabase
      .from("calls")
      .select("id, transcript, summary, property_id, status, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(3);

    // Determine property context
    let propertyContext = "";
    let interestedProperty: any = null;
    let alternativeProperties: any[] = [];

    if (lead.interested_property_id) {
      const { data: prop } = await supabase
        .from("properties")
        .select("id, address, city, state, bedrooms, bathrooms, rent_price, status, alternative_property_ids")
        .eq("id", lead.interested_property_id)
        .single();
      
      interestedProperty = prop;

      if (prop) {
        if (prop.status === "available") {
          propertyContext = `The lead was interested in ${prop.address}, ${prop.city} (${prop.bedrooms}BR/${prop.bathrooms}BA, $${prop.rent_price}/mo) which is still available.`;
        } else {
          // Property no longer available - fetch alternatives
          propertyContext = `The lead was interested in ${prop.address} which is no longer available.`;
          
          // Try alternative_property_ids first
          if (prop.alternative_property_ids && prop.alternative_property_ids.length > 0) {
            const { data: alts } = await supabase
              .from("properties")
              .select("address, city, bedrooms, bathrooms, rent_price")
              .in("id", prop.alternative_property_ids)
              .eq("status", "available")
              .limit(3);
            alternativeProperties = alts || [];
          }

          // If no alternatives found, search by similar criteria
          if (alternativeProperties.length === 0) {
            const { data: similar } = await supabase
              .from("properties")
              .select("address, city, bedrooms, bathrooms, rent_price")
              .eq("organization_id", organization_id)
              .eq("status", "available")
              .eq("bedrooms", prop.bedrooms)
              .order("rent_price", { ascending: true })
              .limit(3);
            alternativeProperties = similar || [];
          }

          if (alternativeProperties.length > 0) {
            propertyContext += ` Alternatives: ${alternativeProperties.map(a => `${a.address} ($${a.rent_price}/mo)`).join(", ")}.`;
          }
        }
      }
    }

    // Check for dropped call context
    const lastCall = previousCalls?.[0];
    const wasDropped = lastCall?.status === "failed" || (lastCall?.transcript?.length || 0) < 50;

    // Build task prompt
    const orgName = org?.name || "our leasing team";
    const leadName = lead.first_name || "there";
    
    let taskPrompt = "";
    
    if (wasDropped && lastCall) {
      taskPrompt = `You are calling back a lead who was speaking with us but got disconnected.

Greeting: "Hi ${leadName}, this is ${orgName}. We were speaking earlier and got disconnected. I wanted to make sure we could continue helping you find your new home."

${propertyContext}`;
    } else if (interestedProperty && interestedProperty.status !== "available" && alternativeProperties.length > 0) {
      const altList = alternativeProperties.map(a => `${a.address} - ${a.bedrooms}BR, $${a.rent_price}/mo`).join("\n");
      taskPrompt = `You are calling a lead who previously inquired about a property that's no longer available.

Greeting: "Hi ${leadName}, this is ${orgName}. You recently called about ${interestedProperty.address}, and I wanted to let you know that property is no longer available. But we have some similar homes I think you'll love!"

Available alternatives:
${altList}

Describe these alternatives enthusiastically. Try to schedule a showing.`;
    } else {
      taskPrompt = `You are doing a friendly follow-up call with a lead who showed interest but hasn't moved forward yet.

Greeting: "Hi ${leadName}, this is ${orgName}. You recently showed interest in one of our properties, and I wanted to check in to see if you're still looking for a home."

${propertyContext || "Ask what they're looking for in terms of location, bedrooms, and budget."}`;
    }

    // Add common instructions
    taskPrompt += `

Your goals:
1. Re-engage the lead and understand their current housing situation
2. Capture any missing info (name, email, move-in timeline, voucher status)
3. Offer to schedule a property showing
4. Get consent for follow-up: "Is it okay if we text you about new listings?"

Be warm, helpful, and not pushy. If they're no longer interested, thank them and wish them well.
At the end, mention: "You can reply STOP to any text to unsubscribe."`;

    // Get org settings for voice
    const { data: voiceIdSetting } = await supabase.rpc("get_org_setting", {
      p_organization_id: organization_id,
      p_key: "bland_voice_id",
      p_default: '"default"',
    });
    const voiceId = typeof voiceIdSetting === "string" ? voiceIdSetting.replace(/"/g, "") : "default";

    // Call Bland.ai
    const webhookUrl = `${supabaseUrl}/functions/v1/bland-call-webhook`;

    const blandResponse = await fetch("https://api.bland.ai/v1/calls", {
      method: "POST",
      headers: {
        "Authorization": credentials.bland_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: normalizePhone(lead.phone),
        task: taskPrompt,
        voice: voiceId !== "default" ? voiceId : undefined,
        webhook: webhookUrl,
        record: true,
        max_duration: 10,
        metadata: {
          organization_id,
          lead_id,
          task_id,
          agent_type: "recapture",
          attempt_number: attemptNumber,
        },
      }),
    });

    if (blandResponse.ok) {
      const blandData = await blandResponse.json();
      
      // Mark task as completed (call was dispatched)
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ 
            status: "completed", 
            completed_at: new Date().toISOString(),
            context: { ...context, bland_call_id: blandData.call_id }
          })
          .eq("id", task_id);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "recapture",
        p_action: "call_dispatched",
        p_status: "success",
        p_message: `Recapture call dispatched (attempt ${attemptNumber})`,
        p_details: { bland_call_id: blandData.call_id, attempt: attemptNumber },
        p_lead_id: lead_id,
        p_task_id: task_id,
        p_execution_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ success: true, bland_call_id: blandData.call_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bland.ai failed - try SMS fallback
    const blandError = await blandResponse.text();
    console.error("Bland.ai failed:", blandError);

    // Check SMS compliance
    const { data: smsCompliance } = await supabase.rpc("joseph_compliance_check", {
      p_organization_id: organization_id,
      p_lead_id: lead_id,
      p_action_type: "sms",
      p_agent_key: "recapture",
    });

    let smsSent = false;
    if (smsCompliance?.passed && credentials?.twilio_account_sid) {
      const orgPhone = org?.phone || credentials.twilio_phone_number;
      const propertyMention = interestedProperty ? interestedProperty.address : "homes in Cleveland";
      
      const smsBody = `Hi ${leadName}, we tried reaching you about ${propertyMention}. Call us at ${orgPhone} or reply to schedule a showing! Reply STOP to unsubscribe.`;

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
          To: normalizePhone(lead.phone),
          Body: smsBody,
        }),
      });

      if (twilioResponse.ok) {
        const twilioData = await twilioResponse.json();
        smsSent = true;

        // Create communication record
        await supabase.from("communications").insert({
          organization_id,
          lead_id,
          channel: "sms",
          direction: "outbound",
          recipient: lead.phone,
          body: smsBody,
          status: "sent",
          sent_at: new Date().toISOString(),
          twilio_message_sid: twilioData.sid,
        });

        // Record cost
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

    // Schedule next recapture attempt
    try {
      await supabase.rpc("schedule_next_recapture", {
        p_organization_id: organization_id,
        p_lead_id: lead_id,
        p_current_attempt: attemptNumber,
        p_task_id: task_id,
      });
    } catch (scheduleErr) {
      console.error("Failed to schedule next recapture:", scheduleErr);
    }

    // Mark current task as failed
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ 
          status: "failed", 
          completed_at: new Date().toISOString(),
          context: { ...context, bland_error: blandError, sms_fallback_sent: smsSent }
        })
        .eq("id", task_id);
    }

    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "recapture",
      p_action: "call_failed_sms_fallback",
      p_status: smsSent ? "partial" : "failure",
      p_message: `Bland.ai failed, SMS fallback ${smsSent ? "sent" : "not sent"}`,
      p_details: { bland_error: blandError, sms_sent: smsSent, attempt: attemptNumber },
      p_lead_id: lead_id,
      p_task_id: task_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: false, sms_fallback_sent: smsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Recapture agent error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const { lead_id, organization_id, task_id } = await req.clone().json().catch(() => ({}));
      
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "recapture",
        p_action: "recapture_error",
        p_status: "failure",
        p_message: `Recapture error: ${errorMessage}`,
        p_details: { error: String(error) },
        p_lead_id: lead_id,
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
