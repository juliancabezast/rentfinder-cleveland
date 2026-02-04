import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Personalize voice script with lead data
function personalizeScript(
  script: string,
  lead: any,
  org: any,
  property: any
): string {
  const name = lead.first_name || lead.full_name?.split(" ")[0] || "there";
  const propertyAddress = property?.address || "our available properties";
  
  return script
    .replace(/\{name\}/gi, name)
    .replace(/\{first_name\}/gi, lead.first_name || name)
    .replace(/\{property\}/gi, propertyAddress)
    .replace(/\{org_name\}/gi, org?.name || "Rent Finder Cleveland");
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const {
      task_id,
      lead_id,
      organization_id,
      context,
    } = await req.json();

    const { campaign_id, campaign_recipient_id, voice_script } = context || {};

    if (!lead_id || !organization_id || !campaign_id) {
      throw new Error("Missing required parameters");
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*, interested_property:properties(*)")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${leadError?.message}`);
    }

    if (!lead.phone) {
      throw new Error("Lead has no phone number");
    }

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignError?.message}`);
    }

    // Check campaign is still active
    if (campaign.status === "paused" || campaign.status === "cancelled") {
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
      if (campaign_recipient_id) {
        await supabase
          .from("campaign_recipients")
          .update({ status: "skipped", error_message: `Campaign ${campaign.status}` })
          .eq("id", campaign_recipient_id);
      }
      
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Campaign ${campaign.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organization_id)
      .single();

    // Run compliance check
    const { data: complianceResult } = await supabase.rpc("joseph_compliance_check", {
      p_lead_id: lead_id,
      p_channel: "call",
      p_message_type: "marketing",
    });

    if (!complianceResult?.allowed) {
      if (campaign_recipient_id) {
        await supabase
          .from("campaign_recipients")
          .update({ 
            status: "skipped", 
            error_message: complianceResult?.reason || "Compliance check failed" 
          })
          .eq("id", campaign_recipient_id);
      }

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "campaign_voice",
        p_action: "call_blocked",
        p_status: "blocked",
        p_message: `Compliance blocked: ${complianceResult?.reason}`,
        p_lead_id: lead_id,
        p_execution_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: complianceResult?.reason }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Bland.ai API key
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("bland_api_key")
      .eq("organization_id", organization_id)
      .single();

    const blandApiKey = creds?.bland_api_key || Deno.env.get("BLAND_API_KEY");

    if (!blandApiKey) {
      throw new Error("Bland.ai not configured");
    }

    // Personalize the script
    const script = voice_script || campaign.voice_script || 
      `Hello {name}, this is a call from Rent Finder Cleveland. We wanted to follow up about rental properties in your area. If you're interested, please visit our website or call us back. Have a great day!`;
    
    const personalizedScript = personalizeScript(script, lead, org, lead.interested_property);

    // Webhook URL for call results
    const webhookUrl = `${supabaseUrl}/functions/v1/bland-call-webhook`;

    // Call Bland.ai
    const blandResponse = await fetch("https://api.bland.ai/v1/calls", {
      method: "POST",
      headers: {
        Authorization: blandApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: lead.phone,
        task: personalizedScript,
        model: "enhanced",
        language: lead.preferred_language || "en",
        voice: "maya",
        max_duration: 5,
        record: true,
        wait_for_greeting: true,
        webhook: webhookUrl,
        metadata: {
          organization_id,
          lead_id,
          task_id,
          agent_type: "campaign_voice",
          campaign_id,
          campaign_recipient_id,
        },
        first_sentence: `Hello, is this ${lead.first_name || "there"}?`,
      }),
    });

    const blandData = await blandResponse.json();

    if (!blandResponse.ok) {
      throw new Error(`Bland.ai error: ${blandData.message || JSON.stringify(blandData)}`);
    }

    const blandCallId = blandData.call_id;

    // Update campaign recipient
    if (campaign_recipient_id) {
      await supabase
        .from("campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          channel: "call",
        })
        .eq("id", campaign_recipient_id);
    }

    // Update campaign sent_count
    await supabase
      .from("campaigns")
      .update({ sent_count: (campaign.sent_count || 0) + 1 })
      .eq("id", campaign_id);

    // Record estimated cost (Bland.ai ~$0.09/min, estimate 2 min avg for campaign calls)
    await supabase.rpc("zacchaeus_record_cost", {
      p_organization_id: organization_id,
      p_service: "bland_ai",
      p_usage_quantity: 2,
      p_usage_unit: "minutes",
      p_unit_cost: 0.09,
      p_total_cost: 0.18,
      p_lead_id: lead_id,
    });

    // Update task (mark as in-progress, webhook will complete it)
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ 
          status: "in_progress",
          executed_at: new Date().toISOString(),
        })
        .eq("id", task_id);
    }

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "campaign_voice",
      p_action: "call_initiated",
      p_status: "success",
      p_message: `Campaign voice call initiated to ${lead.first_name || lead.phone}`,
      p_details: {
        campaign_id,
        campaign_recipient_id,
        bland_call_id: blandCallId,
      },
      p_lead_id: lead_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        channel: "call",
        recipient_id: campaign_recipient_id,
        bland_call_id: blandCallId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Campaign voice error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
