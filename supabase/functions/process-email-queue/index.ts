import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limit: max emails per org per batch to stay within Resend limits
const BATCH_SIZE = 10;
const DELAY_MS = 1500; // 1.5s between emails (safe for Resend 10/sec limit)

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Safety net: revert any "processing" emails stuck for more than 5 minutes (crashed runs)
    const { error: unstickErr } = await supabase.rpc("unstick_processing_emails");
    if (unstickErr) console.warn("unstick_processing_emails failed:", unstickErr.message);

    // Get ALL organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name");

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No organizations found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allResults: any[] = [];

    for (const org of orgs) {
      // Get Resend API key for this org
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
        continue; // Skip orgs without Resend key
      }

      // Get org's sender domain from settings, fallback to rentfindercleveland.com
      const { data: orgSettings } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", org.id)
        .eq("key", "sender_domain")
        .single();
      const senderDomain = orgSettings?.value || "rentfindercleveland.com";

      // Atomically claim queued emails (prevents duplicate sends on concurrent runs)
      const { data: queued, error: fetchErr } = await supabase
        .rpc("claim_queued_emails", {
          p_organization_id: org.id,
          p_batch_size: BATCH_SIZE,
        });

      if (fetchErr) {
        console.error(`Failed to fetch queue for org ${org.id}:`, fetchErr.message);
        allResults.push({ org_id: org.id, error: fetchErr.message, sent: 0, failed: 0 });
        continue;
      }

      if (!queued || queued.length === 0) {
        continue; // No queued emails for this org
      }

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const email of queued) {
        try {
          const html = email.details?.html;
          if (!email.recipient_email || !email.subject || !html) {
            await supabase
              .from("email_events")
              .update({ details: { ...email.details, status: "failed", error: "Missing email data" } })
              .eq("id", email.id);
            failed++;
            continue;
          }

          const fromName = email.details?.from_name || "Rent Finder Cleveland";
          const fromAddress = `${fromName} <support@${senderDomain}>`;

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
            } catch (costErr) {
              console.warn("Cost recording failed:", costErr);
            }

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

          // Rate limiting delay between emails
          if (queued.indexOf(email) < queued.length - 1) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        } catch (err) {
          console.warn(`Email processing error for ${email.recipient_email}:`, err);
          // Revert to queued so it can be retried on next run
          await supabase
            .from("email_events")
            .update({ details: { ...email.details, status: "queued" } })
            .eq("id", email.id);
          errors.push(`${email.recipient_email}: ${String(err).slice(0, 100)}`);
          failed++;
        }
      }

      // System log per org
      if (sent > 0 || failed > 0) {
        try {
          await supabase.from("system_logs").insert({
            organization_id: org.id,
            level: failed > 0 ? "warning" : "info",
            category: "general",
            event_type: "email_queue_processed",
            message: `Email queue processed: ${sent} sent, ${failed} failed out of ${queued.length}`,
            details: { sent, failed, total: queued.length, errors: errors.slice(0, 10) },
          });
        } catch (logErr) {
          console.warn("System log insert failed:", logErr);
        }
      }

      allResults.push({ org_id: org.id, sent, failed, total: queued.length });
    }

    return new Response(
      JSON.stringify({ message: "Queue processed", results: allResults }),
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
