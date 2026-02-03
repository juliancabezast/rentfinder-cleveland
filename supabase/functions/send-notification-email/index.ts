import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "notifications@rentfindercleveland.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationPayload {
  to: string;
  subject: string;
  html: string;
  notification_type: string;
  organization_id?: string;
  related_entity_id?: string;
  related_entity_type?: string;
}

// Brand colors
const BRAND = {
  primary: "#370d4b",
  accent: "#ffb22c",
  background: "#f4f1f1",
  textDark: "#1a1a1a",
  textLight: "#666666",
};

// Email wrapper template
function wrapEmailContent(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rent Finder Cleveland</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${BRAND.background};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.background};">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND.primary}, #5a1a7a); padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                🏠 Rent Finder Cleveland
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 32px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: ${BRAND.textLight}; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} Rent Finder Cleveland. All rights reserved.
                <br><br>
                This is an automated notification. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Create CTA button
function ctaButton(text: string, url: string): string {
  return `
    <a href="${url}" style="display: inline-block; background-color: ${BRAND.accent}; color: ${BRAND.textDark}; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-top: 16px;">
      ${text}
    </a>
  `;
}

// Info row
function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 0; color: ${BRAND.textLight}; font-size: 14px; width: 120px; vertical-align: top;">${label}:</td>
      <td style="padding: 8px 0; color: ${BRAND.textDark}; font-size: 14px; font-weight: 500;">${value}</td>
    </tr>
  `;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const payload: NotificationPayload = await req.json();

    // Validate required fields
    if (!payload.to || !payload.subject || !payload.html) {
      throw new Error("Missing required fields: to, subject, html");
    }

    // Wrap HTML content if it's not already wrapped
    const wrappedHtml = payload.html.includes("<!DOCTYPE html")
      ? payload.html
      : wrapEmailContent(payload.html);

    // Send via Resend REST API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Rent Finder Cleveland <${FROM_EMAIL}>`,
        to: [payload.to],
        subject: payload.subject,
        html: wrappedHtml,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || "Failed to send email via Resend");
    }

    // Log success in system_logs
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("system_logs").insert({
      organization_id: payload.organization_id || null,
      level: "info",
      category: "general",
      event_type: "email_notification_sent",
      message: `Email sent: ${payload.subject} to ${payload.to}`,
      details: {
        notification_type: payload.notification_type,
        resend_id: result.id,
        related_entity_id: payload.related_entity_id,
        related_entity_type: payload.related_entity_type,
      },
    });

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (error) {
    console.error("Error sending notification email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
