import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limit: max emails per batch to stay within Resend limits
const BATCH_SIZE = 10;
const DELAY_MS = 1500; // 1.5s between emails (safe for Resend 10/sec limit)

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get org
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single();

    if (!org) {
      return new Response(
        JSON.stringify({ error: "No organization found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Resend API key
    let resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
    if (!resendApiKey) {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("resend_api_key")
        .eq("organization_id", org.id)
        .single();
      if (creds?.resend_api_key) resendApiKey = creds.resend_api_key;
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "No Resend API key configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch queued emails (oldest first, limited batch)
    const { data: queued, error: fetchErr } = await supabase
      .from("email_events")
      .select("id, recipient_email, subject, details, organization_id")
      .eq("organization_id", org.id)
      .filter("details->>status", "eq", "queued")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch queue: ${fetchErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!queued || queued.length === 0) {
      return new Response(
        JSON.stringify({ message: "No queued emails", sent: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const email of queued) {
      try {
        const html = email.details?.html;
        if (!email.recipient_email || !email.subject || !html) {
          // Mark as failed — missing data
          await supabase
            .from("email_events")
            .update({ details: { ...email.details, status: "failed", error: "Missing email data" } })
            .eq("id", email.id);
          failed++;
          continue;
        }

        const fromName = email.details?.from_name || "Rent Finder Cleveland";
        const fromAddress = `${fromName} <support@rentfindercleveland.com>`;

        // Send via Resend
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [email.recipient_email],
            subject: email.subject,
            html,
          }),
        });

        const resendData = await resendResponse.json();

        if (resendResponse.ok) {
          // Mark as sent
          await supabase
            .from("email_events")
            .update({
              resend_email_id: resendData.id,
              details: {
                ...email.details,
                status: "sent",
                sent_at: new Date().toISOString(),
                resend_email_id: resendData.id,
              },
            })
            .eq("id", email.id);

          // Record cost
          try {
            await supabase.rpc("zacchaeus_record_cost", {
              p_organization_id: email.organization_id,
              p_service: "resend",
              p_usage_quantity: 1,
              p_usage_unit: "email",
              p_unit_cost: 0.0,
              p_total_cost: 0.0,
              p_lead_id: email.details?.related_entity_type === "lead"
                ? email.details?.related_entity_id
                : null,
            });
          } catch { /* non-blocking */ }

          sent++;
        } else {
          const errMsg = resendData.message || `HTTP ${resendResponse.status}`;
          await supabase
            .from("email_events")
            .update({
              details: {
                ...email.details,
                status: "failed",
                error: errMsg,
                failed_at: new Date().toISOString(),
              },
            })
            .eq("id", email.id);
          errors.push(`${email.recipient_email}: ${errMsg}`);
          failed++;
        }

        // Rate limiting delay
        await new Promise((r) => setTimeout(r, DELAY_MS));
      } catch (err) {
        errors.push(`${email.recipient_email}: ${String(err).slice(0, 100)}`);
        failed++;
      }
    }

    // System log
    await supabase.from("system_logs").insert({
      organization_id: org.id,
      level: "info",
      category: "general",
      event_type: "email_queue_processed",
      message: `Email queue processed: ${sent} sent, ${failed} failed out of ${queued.length}`,
      details: { sent, failed, total: queued.length, errors: errors.slice(0, 10) },
    });

    return new Response(
      JSON.stringify({
        message: "Queue processed",
        total: queued.length,
        sent,
        failed,
        errors: errors.slice(0, 10),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-email-queue error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
