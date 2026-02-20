import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let to = "", subject = "", notification_type = "", organization_id = "";
  try {
    const parsed = await req.json();
    to = parsed.to;
    subject = parsed.subject;
    notification_type = parsed.notification_type;
    organization_id = parsed.organization_id;
    const {
      html,
      related_entity_id,
      related_entity_type,
      from_name,
    } = parsed;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Get Resend API key ────────────────────────────────────────────
    // Try org-specific key first, then fall back to env var
    let resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

    if (organization_id && !resendApiKey) {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("resend_api_key")
        .eq("organization_id", organization_id)
        .single();

      if (creds?.resend_api_key) {
        resendApiKey = creds.resend_api_key;
      }
    }

    if (!resendApiKey) {
      throw new Error("No Resend API key configured");
    }

    // ── Determine sender ──────────────────────────────────────────────
    const senderName = from_name || "Rent Finder Cleveland";
    const fromAddress = `${senderName} <support@rentfindercleveland.com>`;

    // ── Send email via Resend API ─────────────────────────────────────
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", JSON.stringify(resendData));
      throw new Error(
        `Resend API error: ${resendData.message || resendResponse.status}`
      );
    }

    const resendEmailId = resendData.id;

    // ── Log to email_events table ─────────────────────────────────────
    if (organization_id) {
      await supabase.from("email_events").insert({
        organization_id,
        email_type: notification_type || "notification",
        recipient_email: to,
        subject,
        resend_email_id: resendEmailId,
        status: "sent",
        related_entity_id: related_entity_id || null,
        related_entity_type: related_entity_type || null,
        sent_at: new Date().toISOString(),
      });
    }

    // ── Record cost ───────────────────────────────────────────────────
    if (organization_id) {
      try {
        await supabase.rpc("zacchaeus_record_cost", {
          p_organization_id: organization_id,
          p_service: "resend",
          p_usage_quantity: 1,
          p_usage_unit: "email",
          p_unit_cost: 0.0,
          p_total_cost: 0.0,
          p_lead_id: related_entity_type === "lead" ? related_entity_id : null,
        });
      } catch {
        // Non-blocking cost recording
      }
    }

    // Log successful email
    if (organization_id) {
      try {
        await supabase.from("system_logs").insert({
          organization_id,
          level: "info",
          category: "general",
          event_type: "email_sent",
          message: `Email sent to ${to}: "${subject}"`,
          details: { notification_type: notification_type || "notification", resend_email_id: resendEmailId, related_entity_id, related_entity_type },
        });
      } catch { /* non-blocking */ }
    }

    return new Response(
      JSON.stringify({
        success: true,
        resend_email_id: resendEmailId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("send-notification-email error:", error);

    // Log error
    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: "general",
        event_type: "email_send_error",
        message: `Failed to send email to ${to || "unknown"}: ${(error as Error).message || "Unknown error"}`,
        details: { error: String(error), to, subject, notification_type },
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || "Failed to send email",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
