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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
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
    const step = context?.step || "immediate";

    if (!lead_id || !organization_id || !showingId) {
      throw new Error("Missing required fields: lead_id, organization_id, context.showing_id");
    }

    console.log(`Post-showing: showing=${showingId}, step=${step}`);

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

    const property = showing.property;
    const lead = showing.lead;
    const leadName = lead?.first_name || "there";

    // Fetch org and credentials
    const { data: org } = await supabase
      .from("organizations")
      .select("name, phone")
      .eq("id", organization_id)
      .single();

    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("bland_api_key, twilio_account_sid, twilio_auth_token, twilio_phone_number, doorloop_api_key")
      .eq("organization_id", organization_id)
      .single();

    const orgName = org?.name || "our team";
    const orgPhone = org?.phone || credentials?.twilio_phone_number || "";
    const propertyAddress = property?.address || "the property";

    // Get application URL from settings
    const { data: appUrlSetting } = await supabase.rpc("get_org_setting", {
      p_organization_id: organization_id,
      p_key: "doorloop_application_url",
      p_default: '"https://apply.doorloop.com"',
    });
    const applicationUrl = typeof appUrlSetting === "string" ? appUrlSetting.replace(/"/g, "") : "https://apply.doorloop.com";

    const results = {
      sms_sent: false,
      email_sent: false,
      followup_scheduled: false,
      call_dispatched: false,
    };

    // Handle 48h follow-up step
    if (step === "followup_48h") {
      // Check if lead has already applied
      if (lead?.status === "in_application" || lead?.status === "converted") {
        console.log("Lead already in application process, skipping follow-up");
        if (task_id) {
          await supabase
            .from("agent_tasks")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", task_id);
        }
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "already_applied" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Run compliance check for call
      const { data: compliance } = await supabase.rpc("joseph_compliance_check", {
        p_organization_id: organization_id,
        p_lead_id: lead_id,
        p_action_type: "call",
        p_agent_key: "post_showing",
      });

      if (compliance?.passed && credentials?.bland_api_key) {
        const taskPrompt = `You are following up with a lead who viewed a property 2 days ago but hasn't started their application yet.

Greeting: "Hi ${leadName}, this is ${orgName}. I'm just checking in after your visit to ${propertyAddress}."

Your script:
1. Ask about their experience: "Did you have a chance to think about the property? Any questions I can help with?"
2. Address concerns: Listen and respond to any hesitations
3. Encourage application: "If you're still interested, I'd love to help you with the application. It only takes about 10 minutes."
4. Offer help: "Would you like me to walk you through the process, or send you the application link?"

Property details: ${property?.bedrooms || ""}BR/${property?.bathrooms || ""}BA, $${property?.rent_price || ""}/mo

Be helpful and not pushy. If they're not interested, thank them and wish them luck in their search.`;

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
              agent_type: "post_showing",
              step: "followup_48h",
            },
          }),
        });

        if (blandResponse.ok) {
          results.call_dispatched = true;
        }
      }
    } else {
      // Immediate post-showing sequence

      // Step 1: Thank You SMS
      const { data: smsCompliance } = await supabase.rpc("joseph_compliance_check", {
        p_organization_id: organization_id,
        p_lead_id: lead_id,
        p_action_type: "sms",
        p_agent_key: "post_showing",
      });

      if (smsCompliance?.passed && credentials?.twilio_account_sid) {
        const smsBody = `Hi ${leadName}! Thank you for visiting ${propertyAddress} today. We hope you loved it! Ready to apply? Start here: ${applicationUrl}. Questions? Call us at ${orgPhone}. Reply STOP to unsubscribe.`;

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
          results.sms_sent = true;

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

      // Step 2: Thank You Email
      if (lead?.email && resendApiKey) {
        const interestLevel = showing.prospect_interest_level;
        const agentReport = showing.agent_report;

        let highlightsSection = "";
        if ((interestLevel === "high" || interestLevel === "medium") && agentReport) {
          highlightsSection = `
            <div style="margin: 20px 0; padding: 15px; background: #f0f9f0; border-left: 4px solid #4caf50; border-radius: 4px;">
              <strong>From your showing:</strong> ${agentReport.slice(0, 200)}${agentReport.length > 200 ? "..." : ""}
            </div>
          `;
        }

        const propertyPhoto = property?.photos?.[0] || null;

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #370d4b 0%, #5a1a75 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Thank You for Visiting!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
              <p style="font-size: 16px;">Hi ${leadName},</p>
              
              <p>Thank you for taking the time to tour <strong>${propertyAddress}</strong> today! We hope you loved the space.</p>
              
              ${propertyPhoto ? `<img src="${propertyPhoto}" alt="${propertyAddress}" style="width: 100%; border-radius: 8px; margin: 20px 0;">` : ""}
              
              <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="margin: 0 0 10px 0; color: #370d4b;">${propertyAddress}</h3>
                <p style="margin: 0; color: #666;">${property?.city || ""}, ${property?.state || ""} • ${property?.bedrooms || ""}BR/${property?.bathrooms || ""}BA • $${property?.rent_price || ""}/month</p>
              </div>
              
              ${highlightsSection}
              
              <p>Ready to make this your new home? The application process is quick and easy!</p>
              
              <div style="margin: 30px 0; text-align: center;">
                <a href="${applicationUrl}" style="display: inline-block; background: #ffb22c; color: #370d4b; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
                  Start Your Application
                </a>
              </div>
              
              <p>Have questions? We're here to help!</p>
              
              <p style="margin-top: 30px;">
                Best regards,<br>
                <strong>The ${orgName} Team</strong><br>
                📞 ${orgPhone}
              </p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 12px 12px; text-align: center; font-size: 12px; color: #888;">
              <p>You're receiving this email because you toured one of our properties.</p>
            </div>
          </body>
          </html>
        `;

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${orgName} <noreply@rentfindercleveland.com>`,
            to: [lead.email],
            subject: `Thank You for Visiting ${propertyAddress}! Ready to Apply?`,
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          results.email_sent = true;

          await supabase.from("communications").insert({
            organization_id,
            lead_id,
            channel: "email",
            direction: "outbound",
            recipient: lead.email,
            subject: `Thank You for Visiting ${propertyAddress}! Ready to Apply?`,
            body: emailHtml,
            status: "sent",
            sent_at: new Date().toISOString(),
          });
        }
      }

      // Step 3: Schedule 48h follow-up
      const followupScheduledFor = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      await supabase.from("agent_tasks").insert({
        organization_id,
        lead_id,
        agent_type: "post_showing",
        action_type: "call",
        scheduled_for: followupScheduledFor,
        status: "pending",
        context: {
          step: "followup_48h",
          showing_id: showingId,
          property_id: property?.id,
          previous_sms_sent: results.sms_sent,
          previous_email_sent: results.email_sent,
          trigger: "post_showing_48h",
        },
      });

      results.followup_scheduled = true;
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
      p_agent_key: "post_showing",
      p_action: step === "followup_48h" ? "post_showing_followup" : "post_showing_immediate",
      p_status: "success",
      p_message: `Post-showing ${step}: SMS=${results.sms_sent}, Email=${results.email_sent}, Followup=${results.followup_scheduled}, Call=${results.call_dispatched}`,
      p_details: results,
      p_lead_id: lead_id,
      p_showing_id: showingId,
      p_task_id: task_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Post-showing error:", error);
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
        p_agent_key: "post_showing",
        p_action: "post_showing_error",
        p_status: "failure",
        p_message: `Post-showing error: ${errorMessage}`,
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
