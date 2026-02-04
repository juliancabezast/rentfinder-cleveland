import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
  };
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
    const event: ResendWebhookEvent = await req.json();
    console.log("Resend webhook received:", JSON.stringify(event).slice(0, 500));

    const eventType = event.type;
    const emailId = event.data?.email_id;
    const recipientEmail = event.data?.to?.[0];
    const subject = event.data?.subject;

    if (!emailId) {
      console.log("No email_id in webhook payload");
      return new Response(
        JSON.stringify({ received: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to find the communication record
    // First try by matching email + approximate time
    let communication: any = null;
    let leadId: string | null = null;
    let organizationId: string | null = null;

    if (recipientEmail) {
      const recentTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: comms } = await supabase
        .from("communications")
        .select("id, lead_id, organization_id")
        .eq("channel", "email")
        .eq("recipient", recipientEmail)
        .gte("sent_at", recentTime)
        .order("sent_at", { ascending: false })
        .limit(1);

      if (comms && comms.length > 0) {
        communication = comms[0];
        leadId = communication.lead_id;
        organizationId = communication.organization_id;
      }
    }

    // Insert email event
    const { error: eventInsertError } = await supabase
      .from("email_events")
      .insert({
        resend_email_id: emailId,
        event_type: eventType,
        communication_id: communication?.id || null,
        lead_id: leadId,
        organization_id: organizationId,
        recipient_email: recipientEmail,
        subject,
        details: event,
      });

    if (eventInsertError) {
      console.error("Failed to insert email event:", eventInsertError);
    }

    // Update communication based on event type
    if (communication?.id) {
      const updateData: Record<string, any> = {};

      switch (eventType) {
        case "email.sent":
          // Already marked as sent when we send
          break;

        case "email.delivered":
          updateData.status = "delivered";
          updateData.delivered_at = new Date().toISOString();
          break;

        case "email.opened":
          updateData.status = "opened";
          updateData.opened_at = new Date().toISOString();
          break;

        case "email.clicked":
          updateData.status = "clicked";
          break;

        case "email.bounced":
          updateData.status = "failed";
          
          // Mark lead's email as potentially invalid
          if (leadId) {
            await supabase.rpc("log_agent_activity", {
              p_organization_id: organizationId,
              p_agent_key: "resend_event_processor",
              p_action: "email_bounced",
              p_status: "warning",
              p_message: `Email bounced for ${recipientEmail} - email may be invalid`,
              p_lead_id: leadId,
              p_execution_ms: Date.now() - startTime,
            });
          }
          break;

        case "email.complained":
          updateData.status = "failed";
          
          // Mark lead as do not contact for email (spam complaint)
          if (leadId) {
            await supabase
              .from("leads")
              .update({ do_not_contact: true })
              .eq("id", leadId);

            await supabase.rpc("log_agent_activity", {
              p_organization_id: organizationId,
              p_agent_key: "resend_event_processor",
              p_action: "spam_complaint",
              p_status: "warning",
              p_message: `Spam complaint from ${recipientEmail} - marked as DNC`,
              p_lead_id: leadId,
              p_execution_ms: Date.now() - startTime,
            });
          }
          break;

        case "email.delivery_delayed":
          await supabase.rpc("log_agent_activity", {
            p_organization_id: organizationId,
            p_agent_key: "resend_event_processor",
            p_action: "delivery_delayed",
            p_status: "warning",
            p_message: `Email delivery delayed to ${recipientEmail}`,
            p_lead_id: leadId,
            p_execution_ms: Date.now() - startTime,
          });
          break;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("communications")
          .update(updateData)
          .eq("id", communication.id);
      }
    }

    // Check if this email was part of a campaign
    if (communication?.id) {
      const { data: campaignRecipient } = await supabase
        .from("campaign_recipients")
        .select("id, campaign_id")
        .eq("communication_id", communication.id)
        .maybeSingle();

      if (campaignRecipient) {
        const recipientUpdate: Record<string, any> = {};

        switch (eventType) {
          case "email.delivered":
            recipientUpdate.status = "delivered";
            recipientUpdate.delivered_at = new Date().toISOString();
            break;
          case "email.bounced":
          case "email.complained":
            recipientUpdate.status = "failed";
            recipientUpdate.error_message = eventType === "email.bounced" ? "Email bounced" : "Spam complaint";
            break;
        }

        if (Object.keys(recipientUpdate).length > 0) {
          await supabase
            .from("campaign_recipients")
            .update(recipientUpdate)
            .eq("id", campaignRecipient.id);

          // Update campaign delivered_count
          if (eventType === "email.delivered") {
            const { data: campaign } = await supabase
              .from("campaigns")
              .select("delivered_count")
              .eq("id", campaignRecipient.campaign_id)
              .single();

            await supabase
              .from("campaigns")
              .update({ delivered_count: (campaign?.delivered_count || 0) + 1 })
              .eq("id", campaignRecipient.campaign_id);
          }
        }
      }
    }

    // Log success for non-trivial events
    if (["email.bounced", "email.complained", "email.delivered"].includes(eventType)) {
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organizationId,
        p_agent_key: "resend_event_processor",
        p_action: "event_processed",
        p_status: "success",
        p_message: `Processed ${eventType} for ${recipientEmail}`,
        p_details: {
          resend_email_id: emailId,
          event_type: eventType,
          communication_id: communication?.id,
        },
        p_lead_id: leadId,
        p_execution_ms: Date.now() - startTime,
      });
    }

    // Always return 200 to Resend
    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Resend processor error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Still return 200 to prevent retries
    return new Response(
      JSON.stringify({ received: true, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
