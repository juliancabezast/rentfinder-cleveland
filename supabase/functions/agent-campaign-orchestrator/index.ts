import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Personalize template with lead/org data
function personalizeTemplate(
  template: string,
  lead: any,
  org: any,
  property: any
): string {
  const name = lead.first_name || lead.full_name?.split(" ")[0] || "there";
  const propertyAddress = property?.address || lead.interested_property?.address || "our available properties";
  
  return template
    .replace(/\{name\}/gi, name)
    .replace(/\{first_name\}/gi, lead.first_name || name)
    .replace(/\{last_name\}/gi, lead.last_name || "")
    .replace(/\{property\}/gi, propertyAddress)
    .replace(/\{org_name\}/gi, org.name || "Rent Finder Cleveland")
    .replace(/\{org_phone\}/gi, org.phone || "(216) 555-0123");
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

    const {
      campaign_id,
      campaign_recipient_id,
      sms_template,
      email_subject,
      email_body,
    } = context || {};

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
      // Update task and recipient
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

    // Check throttling - max_per_hour
    if (campaign.max_per_hour) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "sent")
        .gte("sent_at", oneHourAgo);

      if ((count || 0) >= campaign.max_per_hour) {
        // Reschedule task for later
        if (task_id) {
          const delayMinutes = Math.floor(60 / campaign.max_per_hour) + 1;
          await supabase
            .from("agent_tasks")
            .update({ 
              scheduled_for: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
              status: "pending"
            })
            .eq("id", task_id);
        }
        
        return new Response(
          JSON.stringify({ success: true, delayed: true, reason: "Rate limit exceeded" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch org
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organization_id)
      .single();

    // Fetch org credentials
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    // Determine channel
    const isSms = campaign.campaign_type === "sms" || !!sms_template;
    const isEmail = campaign.campaign_type === "email" || !!email_subject;

    // Run compliance check
    const { data: complianceResult } = await supabase.rpc("joseph_compliance_check", {
      p_lead_id: lead_id,
      p_channel: isSms ? "sms" : "email",
      p_message_type: "marketing",
    });

    if (!complianceResult?.allowed) {
      // Update recipient as skipped
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
        p_agent_key: "campaign_orchestrator",
        p_action: "send_blocked",
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

    let communicationId: string | null = null;
    let channel = "";
    let resendEmailId: string | null = null;

    if (isSms && lead.phone) {
      // Send SMS via Twilio
      channel = "sms";
      
      const twilioSid = creds?.twilio_account_sid || Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioToken = creds?.twilio_auth_token || Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioFrom = creds?.twilio_phone_number || Deno.env.get("TWILIO_PHONE_NUMBER");

      if (!twilioSid || !twilioToken || !twilioFrom) {
        throw new Error("Twilio not configured");
      }

      const template = sms_template || campaign.sms_template || "";
      let message = personalizeTemplate(template, lead, org, null);
      
      // Add opt-out text
      if (!message.toLowerCase().includes("stop")) {
        message += "\n\nReply STOP to unsubscribe";
      }

      const twilioResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: lead.phone,
            From: twilioFrom,
            Body: message,
          }),
        }
      );

      const twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        throw new Error(`Twilio error: ${twilioData.message || JSON.stringify(twilioData)}`);
      }

      // Create communication record
      const { data: comm } = await supabase
        .from("communications")
        .insert({
          organization_id,
          lead_id,
          channel: "sms",
          direction: "outbound",
          recipient: lead.phone,
          body: message,
          status: "sent",
          sent_at: new Date().toISOString(),
          twilio_message_sid: twilioData.sid,
        })
        .select("id")
        .single();

      communicationId = comm?.id;

      // Record cost (~$0.0079 per SMS)
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: organization_id,
        p_service: "twilio_sms",
        p_usage_quantity: 1,
        p_usage_unit: "messages",
        p_unit_cost: 0.0079,
        p_total_cost: 0.0079,
        p_lead_id: lead_id,
        p_communication_id: communicationId,
      });

    } else if (isEmail && lead.email) {
      // Send Email via Resend
      channel = "email";
      
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        throw new Error("Resend not configured");
      }

      const subject = personalizeTemplate(email_subject || campaign.email_subject || "Update from Rent Finder", lead, org, null);
      const body = personalizeTemplate(email_body || campaign.email_body || "", lead, org, null);

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Rent Finder Cleveland <notifications@rentfindercleveland.com>`,
          to: [lead.email],
          subject,
          html: body,
        }),
      });

      const resendData = await resendResponse.json();

      if (!resendResponse.ok) {
        throw new Error(`Resend error: ${resendData.message || JSON.stringify(resendData)}`);
      }

      resendEmailId = resendData.id;

      // Create communication record
      const { data: comm } = await supabase
        .from("communications")
        .insert({
          organization_id,
          lead_id,
          channel: "email",
          direction: "outbound",
          recipient: lead.email,
          subject,
          body,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      communicationId = comm?.id;

      // Record cost (~$0.001 per email with Resend)
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: organization_id,
        p_service: "resend_email",
        p_usage_quantity: 1,
        p_usage_unit: "emails",
        p_unit_cost: 0.001,
        p_total_cost: 0.001,
        p_lead_id: lead_id,
        p_communication_id: communicationId,
      });

    } else {
      throw new Error("No valid channel/contact info for campaign send");
    }

    // Update campaign recipient
    if (campaign_recipient_id) {
      await supabase
        .from("campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          channel,
          communication_id: communicationId,
        })
        .eq("id", campaign_recipient_id);
    }

    // Update campaign sent_count
    await supabase
      .from("campaigns")
      .update({ sent_count: (campaign.sent_count || 0) + 1 })
      .eq("id", campaign_id);

    // Check if campaign is complete
    const { count: pendingCount } = await supabase
      .from("campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .in("status", ["pending", "queued"]);

    if (pendingCount === 0) {
      await supabase
        .from("campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaign_id);
    }

    // Update task
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          result_communication_id: communicationId,
        })
        .eq("id", task_id);
    }

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "campaign_orchestrator",
      p_action: "send_complete",
      p_status: "success",
      p_message: `Campaign ${channel} sent to ${lead.first_name || lead.phone}`,
      p_details: {
        campaign_id,
        campaign_recipient_id,
        channel,
        communication_id: communicationId,
      },
      p_lead_id: lead_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        channel, 
        recipient_id: campaign_recipient_id,
        communication_id: communicationId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Campaign orchestrator error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
