import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Notification routing configuration
interface NotificationRouting {
  recipients: ("admin" | "editor" | "assigned_agent" | "super_admin")[];
  channels: ("in_app" | "email" | "sms")[];
  urgency: "info" | "warning" | "urgent" | "success";
  category: "lead" | "showing" | "property" | "system" | "agent" | "cost";
}

const NOTIFICATION_ROUTING: Record<string, NotificationRouting> = {
  priority_lead: {
    recipients: ["admin", "editor"],
    channels: ["in_app", "email"],
    urgency: "urgent",
    category: "lead",
  },
  lead_score_jump: {
    recipients: ["assigned_agent"],
    channels: ["in_app"],
    urgency: "info",
    category: "lead",
  },
  showing_no_show: {
    recipients: ["assigned_agent", "editor"],
    channels: ["in_app", "sms"],
    urgency: "warning",
    category: "showing",
  },
  failed_contact_attempts: {
    recipients: ["editor"],
    channels: ["in_app"],
    urgency: "warning",
    category: "lead",
  },
  human_takeover: {
    recipients: ["admin"],
    channels: ["in_app"],
    urgency: "info",
    category: "lead",
  },
  system_error: {
    recipients: ["admin"],
    channels: ["in_app", "email"],
    urgency: "urgent",
    category: "system",
  },
  daily_spend_alert: {
    recipients: ["admin"],
    channels: ["email"],
    urgency: "warning",
    category: "cost",
  },
};

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
    const notificationType = context?.notification_type;

    if (!organization_id || !notificationType) {
      throw new Error("Missing required fields: organization_id, context.notification_type");
    }

    console.log(`Notification dispatch: type=${notificationType}, org=${organization_id}`);

    // Get routing configuration
    const routing = NOTIFICATION_ROUTING[notificationType];
    if (!routing) {
      console.log(`Unknown notification type: ${notificationType}, using default routing`);
      // Default to admin in-app notification
    }

    const effectiveRouting = routing || {
      recipients: ["admin"] as const,
      channels: ["in_app"] as const,
      urgency: "info" as const,
      category: "system" as const,
    };

    // Fetch org details
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();

    // Fetch credentials for SMS
    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("organization_id", organization_id)
      .single();

    // Fetch lead if provided
    let lead: any = null;
    if (lead_id) {
      const { data } = await supabase
        .from("leads")
        .select("first_name, last_name, full_name, phone, assigned_leasing_agent_id, lead_score")
        .eq("id", lead_id)
        .single();
      lead = data;
    }

    // Determine recipients
    const recipientRoles = effectiveRouting.recipients;
    const recipientUsers: any[] = [];

    // Build query for users based on roles
    let userQuery = supabase
      .from("users")
      .select("id, email, phone, full_name, role")
      .eq("organization_id", organization_id)
      .eq("is_active", true);

    // Filter by roles
    const roleFilters: string[] = [];
    if (recipientRoles.includes("super_admin")) roleFilters.push("super_admin");
    if (recipientRoles.includes("admin")) roleFilters.push("admin");
    if (recipientRoles.includes("editor")) roleFilters.push("editor");

    if (roleFilters.length > 0) {
      const { data: roleUsers } = await userQuery.in("role", roleFilters);
      if (roleUsers) recipientUsers.push(...roleUsers);
    }

    // Add assigned agent if applicable
    if (recipientRoles.includes("assigned_agent") && lead?.assigned_leasing_agent_id) {
      const { data: agentUser } = await supabase
        .from("users")
        .select("id, email, phone, full_name, role")
        .eq("id", lead.assigned_leasing_agent_id)
        .eq("is_active", true)
        .single();
      if (agentUser && !recipientUsers.find(u => u.id === agentUser.id)) {
        recipientUsers.push(agentUser);
      }
    }

    // Remove duplicates
    const uniqueRecipients = recipientUsers.filter((user, index, self) =>
      index === self.findIndex(u => u.id === user.id)
    );

    if (uniqueRecipients.length === 0) {
      console.log("No recipients found for notification");
      return new Response(
        JSON.stringify({ success: true, recipients_notified: 0, emails_sent: 0, sms_sent: 0, reason: "no_recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build notification content
    const notificationContent = buildNotificationContent(notificationType, context, lead, org?.name);

    const results = {
      recipients_notified: 0,
      emails_sent: 0,
      sms_sent: 0,
      errors: [] as string[],
    };

    // Process each recipient
    for (const recipient of uniqueRecipients) {
      try {
        // Create in-app notification
        if (effectiveRouting.channels.includes("in_app")) {
          await supabase.from("notifications").insert({
            organization_id,
            user_id: recipient.id,
            title: notificationContent.title,
            message: notificationContent.message,
            type: effectiveRouting.urgency,
            category: effectiveRouting.category,
            related_lead_id: lead_id || null,
            related_showing_id: context?.showing_id || null,
            related_property_id: context?.property_id || null,
          });
          results.recipients_notified++;
        }

        // Send email
        if (effectiveRouting.channels.includes("email") && recipient.email && resendApiKey) {
          try {
            const emailHtml = buildEmailHtml(notificationContent, org?.name || "LeaseFlow");
            
            const resendResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `${org?.name || "LeaseFlow"} <notifications@rentfindercleveland.com>`,
                to: [recipient.email],
                subject: notificationContent.emailSubject,
                html: emailHtml,
              }),
            });

            if (resendResponse.ok) {
              results.emails_sent++;
              
              // Update notification with email_sent flag
              await supabase
                .from("notifications")
                .update({ email_sent: true })
                .eq("user_id", recipient.id)
                .eq("title", notificationContent.title)
                .order("created_at", { ascending: false })
                .limit(1);
            } else {
              const error = await resendResponse.text();
              console.error(`Email failed for ${recipient.email}:`, error);
              results.errors.push(`Email to ${recipient.email} failed`);
            }
          } catch (emailError: unknown) {
            console.error(`Email error for ${recipient.email}:`, emailError);
            results.errors.push(`Email to ${recipient.email} error: ${emailError instanceof Error ? emailError.message : String(emailError)}`);
          }
        }

        // Send SMS
        if (effectiveRouting.channels.includes("sms") && recipient.phone && credentials?.twilio_account_sid) {
          try {
            // Check compliance first
            const { data: compliance } = await supabase.rpc("joseph_compliance_check", {
              p_organization_id: organization_id,
              p_lead_id: lead_id, // Note: This checks lead compliance, not user
              p_action_type: "sms",
              p_agent_key: "notification_dispatcher",
            });

            // For user SMS, we skip compliance check since it's to staff
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${credentials.twilio_account_sid}/Messages.json`;
            const twilioAuth = btoa(`${credentials.twilio_account_sid}:${credentials.twilio_auth_token}`);

            const smsBody = `[${org?.name || "LeaseFlow"}] ${notificationContent.title}: ${notificationContent.smsMessage}`;

            const twilioResponse = await fetch(twilioUrl, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${twilioAuth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                From: credentials.twilio_phone_number,
                To: recipient.phone,
                Body: smsBody.slice(0, 1600), // SMS limit
              }),
            });

            if (twilioResponse.ok) {
              results.sms_sent++;
              
              // Update notification with sms_sent flag
              await supabase
                .from("notifications")
                .update({ sms_sent: true })
                .eq("user_id", recipient.id)
                .eq("title", notificationContent.title)
                .order("created_at", { ascending: false })
                .limit(1);
            } else {
              const error = await twilioResponse.text();
              console.error(`SMS failed for ${recipient.phone}:`, error);
              results.errors.push(`SMS to ${recipient.phone} failed`);
            }
          } catch (smsError: unknown) {
            console.error(`SMS error for ${recipient.phone}:`, smsError);
            results.errors.push(`SMS to ${recipient.phone} error: ${smsError instanceof Error ? smsError.message : String(smsError)}`);
          }
        }
      } catch (recipientError: unknown) {
        console.error(`Error processing recipient ${recipient.id}:`, recipientError);
        results.errors.push(`Recipient ${recipient.id} error: ${recipientError instanceof Error ? recipientError.message : String(recipientError)}`);
      }
    }

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "notification_dispatcher",
      p_action: "notifications_sent",
      p_status: results.errors.length === 0 ? "success" : "partial",
      p_message: `Notifications dispatched: ${results.recipients_notified} in-app, ${results.emails_sent} emails, ${results.sms_sent} SMS`,
      p_details: {
        notification_type: notificationType,
        ...results,
      },
      p_lead_id: lead_id,
      p_task_id: task_id,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Notification dispatcher error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure
    try {
      const { lead_id, organization_id, task_id } = await req.clone().json().catch(() => ({}));
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "notification_dispatcher",
        p_action: "dispatch_failed",
        p_status: "failure",
        p_message: `Notification dispatch error: ${errorMessage}`,
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

// Build notification content based on type
function buildNotificationContent(
  type: string,
  context: any,
  lead: any,
  orgName: string | undefined
): { title: string; message: string; emailSubject: string; smsMessage: string } {
  const leadName = lead?.full_name || `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim() || "A lead";

  switch (type) {
    case "priority_lead":
      return {
        title: "🔥 Priority Lead Alert",
        message: `${leadName} has been flagged as a priority lead with score ${context?.lead_score || lead?.lead_score || "high"}. ${context?.priority_reason || "Requires immediate attention."}`,
        emailSubject: `[Priority] New high-value lead: ${leadName}`,
        smsMessage: `${leadName} is now priority. Score: ${context?.lead_score || lead?.lead_score}. Take action ASAP.`,
      };

    case "lead_score_jump":
      return {
        title: "📈 Lead Score Increased",
        message: `${leadName}'s score increased to ${context?.new_score || "high"}. They may be ready to move forward.`,
        emailSubject: `Lead score update: ${leadName}`,
        smsMessage: `${leadName} score jumped to ${context?.new_score}. Follow up soon.`,
      };

    case "showing_no_show":
      return {
        title: "⚠️ Showing No-Show",
        message: `${leadName} did not show up for their scheduled showing. The no-show follow-up sequence has been initiated.`,
        emailSubject: `No-Show Alert: ${leadName}`,
        smsMessage: `${leadName} missed their showing. AI follow-up in progress.`,
      };

    case "failed_contact_attempts":
      return {
        title: "📞 Contact Attempts Failed",
        message: `Multiple attempts to reach ${leadName} have failed. Human intervention may be needed.`,
        emailSubject: `Unable to reach: ${leadName}`,
        smsMessage: `Can't reach ${leadName} after multiple tries. Please review.`,
      };

    case "human_takeover":
      return {
        title: "👤 Human Takeover",
        message: `${leadName} has been placed under human control. ${context?.reason || ""}`,
        emailSubject: `Lead transferred to human: ${leadName}`,
        smsMessage: `${leadName} now under human control.`,
      };

    case "system_error":
      return {
        title: "🚨 System Error",
        message: `A system error occurred: ${context?.error_message || "Unknown error"}. Please check the system logs.`,
        emailSubject: `[URGENT] System Error - ${orgName || "LeaseFlow"}`,
        smsMessage: `System error detected. Check dashboard immediately.`,
      };

    case "daily_spend_alert":
      return {
        title: "💰 Daily Spend Alert",
        message: `Daily spending has reached ${context?.spend_amount || "the threshold"}. Review your cost dashboard.`,
        emailSubject: `Daily Spend Alert - ${orgName || "LeaseFlow"}`,
        smsMessage: `Daily spend alert: ${context?.spend_amount}. Review costs.`,
      };

    default:
      return {
        title: "📢 Notification",
        message: context?.message || "You have a new notification.",
        emailSubject: `Notification from ${orgName || "LeaseFlow"}`,
        smsMessage: context?.message?.slice(0, 140) || "New notification.",
      };
  }
}

// Build email HTML
function buildEmailHtml(content: { title: string; message: string }, orgName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #370d4b 0%, #5a1a75 100%); padding: 20px 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">${content.title}</h1>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
        <p style="font-size: 16px; margin: 0 0 20px 0;">${content.message}</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="https://app.leaseflow.ai/dashboard" style="display: inline-block; background: #ffb22c; color: #370d4b; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            View Dashboard
          </a>
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 0 0 12px 12px; text-align: center; font-size: 12px; color: #888;">
        <p style="margin: 0;">Sent by ${orgName} via LeaseFlow</p>
      </div>
    </body>
    </html>
  `;
}
