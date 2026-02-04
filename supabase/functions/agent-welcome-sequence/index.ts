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

    if (!lead_id || !organization_id) {
      throw new Error("Missing required fields: lead_id, organization_id");
    }

    console.log(`Welcome sequence: lead=${lead_id}, source=${context?.source}`);

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${lead_id}`);
    }

    // Check compliance for SMS
    const { data: smsCompliance } = await supabase.rpc("joseph_compliance_check", {
      p_organization_id: organization_id,
      p_lead_id: lead_id,
      p_action_type: "sms",
      p_agent_key: "welcome_sequence",
    });

    const canSendSms = smsCompliance?.passed === true;

    // Check compliance for email (we don't have a specific email compliance check, so just check if blocked)
    const canSendEmail = lead.email && !lead.do_not_contact;

    // If all channels blocked, log and return
    if (!canSendSms && !canSendEmail) {
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "welcome_sequence",
        p_action: "blocked",
        p_status: "skipped",
        p_message: "All communication channels blocked by compliance",
        p_details: { sms_blocked: !canSendSms, email_blocked: !canSendEmail },
        p_lead_id: lead_id,
        p_task_id: task_id,
        p_execution_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ success: true, sms_sent: false, email_sent: false, followup_scheduled: false, reason: "blocked_by_compliance" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch organization
    const { data: org } = await supabase
      .from("organizations")
      .select("name, phone")
      .eq("id", organization_id)
      .single();

    // Fetch credentials
    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    // Fetch interested property if available
    let property: any = null;
    let lowestPrice: number | null = null;

    if (lead.interested_property_id) {
      const { data: prop } = await supabase
        .from("properties")
        .select("address, city, state, rent_price, photos")
        .eq("id", lead.interested_property_id)
        .single();
      property = prop;
    }

    // Get lowest available property price for the message
    const { data: lowestPriceProperty } = await supabase
      .from("properties")
      .select("rent_price")
      .eq("organization_id", organization_id)
      .eq("status", "available")
      .order("rent_price", { ascending: true })
      .limit(1)
      .single();

    if (lowestPriceProperty) {
      lowestPrice = lowestPriceProperty.rent_price;
    }

    const results = {
      sms_sent: false,
      email_sent: false,
      followup_scheduled: false,
    };

    // Step 1: Send Welcome SMS
    if (canSendSms && credentials?.twilio_account_sid && credentials?.twilio_auth_token && credentials?.twilio_phone_number) {
      try {
        const leadName = lead.first_name || "there";
        const propertyInfo = property 
          ? `${property.address}, ${property.city}`
          : "our properties";
        const priceInfo = lowestPrice 
          ? `starting at $${lowestPrice}/mo`
          : "";

        const smsBody = `Hi ${leadName}! Thanks for your interest in ${propertyInfo}. ${priceInfo ? `We have homes available ${priceInfo}. ` : ""}A team member will reach out shortly to help you find the perfect home!\n\nReply STOP to unsubscribe.`;

        // Send via Twilio
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

          // Record cost (SMS ~ $0.0075 per segment)
          await supabase.rpc("zacchaeus_record_cost", {
            p_organization_id: organization_id,
            p_service: "twilio_sms",
            p_usage_quantity: 1,
            p_usage_unit: "messages",
            p_unit_cost: 0.0075,
            p_total_cost: 0.0075,
            p_lead_id: lead_id,
          });

          results.sms_sent = true;
          console.log("Welcome SMS sent:", twilioData.sid);
        } else {
          const error = await twilioResponse.text();
          console.error("Twilio SMS error:", error);
        }
      } catch (smsError) {
        console.error("SMS sending error:", smsError);
      }
    }

    // Step 2: Send Welcome Email
    if (canSendEmail && resendApiKey) {
      try {
        const leadName = lead.first_name || lead.full_name?.split(" ")[0] || "there";
        const orgName = org?.name || "Our Team";
        const orgPhone = org?.phone || "";

        const propertySection = property
          ? `
            <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
              <h3 style="margin: 0 0 10px 0; color: #370d4b;">${property.address}</h3>
              <p style="margin: 0; color: #666;">${property.city}, ${property.state} • $${property.rent_price}/month</p>
            </div>
          `
          : "";

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #370d4b 0%, #5a1a75 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ${orgName}!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
              <p style="font-size: 16px;">Hi ${leadName},</p>
              
              <p>Thank you for your interest in finding your new home with us! We're excited to help you discover the perfect rental property.</p>
              
              ${propertySection}
              
              <p>A member of our team will be reaching out to you shortly to:</p>
              <ul style="color: #555;">
                <li>Learn more about what you're looking for</li>
                <li>Answer any questions you have</li>
                <li>Schedule a property showing at your convenience</li>
              </ul>
              
              <div style="margin: 30px 0; text-align: center;">
                <a href="tel:${orgPhone}" style="display: inline-block; background: #ffb22c; color: #370d4b; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Call Us: ${orgPhone}
                </a>
              </div>
              
              <p>We look forward to helping you find your new home!</p>
              
              <p style="margin-top: 30px;">
                Best regards,<br>
                <strong>The ${orgName} Team</strong>
              </p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 12px 12px; text-align: center; font-size: 12px; color: #888;">
              <p>You're receiving this email because you expressed interest in our rental properties.</p>
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
            subject: `Welcome to ${orgName} – Let's Find Your New Home!`,
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          const resendData = await resendResponse.json();
          
          // Create communication record
          await supabase.from("communications").insert({
            organization_id,
            lead_id,
            channel: "email",
            direction: "outbound",
            recipient: lead.email,
            subject: `Welcome to ${orgName} – Let's Find Your New Home!`,
            body: emailHtml,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

          results.email_sent = true;
          console.log("Welcome email sent:", resendData.id);
        } else {
          const error = await resendResponse.text();
          console.error("Resend email error:", error);
        }
      } catch (emailError) {
        console.error("Email sending error:", emailError);
      }
    }

    // Step 3: Schedule follow-up call if no showing is scheduled
    const { data: existingShowings } = await supabase
      .from("showings")
      .select("id")
      .eq("lead_id", lead_id)
      .in("status", ["scheduled", "confirmed"])
      .limit(1);

    if (!existingShowings || existingShowings.length === 0) {
      // Get recapture delay from settings
      const { data: delaySetting } = await supabase.rpc("get_org_setting", {
        p_organization_id: organization_id,
        p_key: "recapture_first_delay_hours",
        p_default: "24",
      });

      const delayHours = parseInt(String(delaySetting).replace(/"/g, "")) || 24;
      const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();

      // Create follow-up task for recapture agent
      await supabase.from("agent_tasks").insert({
        organization_id,
        lead_id,
        agent_type: "recapture",
        action_type: "call",
        scheduled_for: scheduledFor,
        attempt_number: 1,
        max_attempts: 7, // Will follow the recapture schedule
        status: "pending",
        context: {
          source: context?.source || lead.source,
          interested_property_id: lead.interested_property_id,
          trigger: "welcome_sequence_followup",
          welcome_sms_sent: results.sms_sent,
          welcome_email_sent: results.email_sent,
        },
      });

      results.followup_scheduled = true;
    }

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "welcome_sequence",
      p_action: "welcome_sent",
      p_status: "success",
      p_message: `Welcome sequence completed: SMS=${results.sms_sent}, Email=${results.email_sent}, Followup=${results.followup_scheduled}`,
      p_details: results,
      p_lead_id: lead_id,
      p_task_id: task_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Welcome sequence error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure
    try {
      const { lead_id, organization_id, task_id } = await req.clone().json().catch(() => ({}));
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "welcome_sequence",
        p_action: "welcome_failed",
        p_status: "failure",
        p_message: `Welcome sequence error: ${errorMessage}`,
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
