import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// All app domains for filtering
const APP_DOMAINS = ["rentfindercleveland.com", "homeguardmanagement.com", "portafoliodiversificado.com"];

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

    // Get ALL organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id");

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
        allResults.push({ org_id: org.id, error: "No Resend API key", inserted: 0, skipped: 0 });
        continue;
      }

      // Get existing resend_email_ids to avoid duplicates
      const { data: existingEvents } = await supabase
        .from("email_events")
        .select("resend_email_id")
        .eq("organization_id", org.id)
        .not("resend_email_id", "is", null);

      const existingIds = new Set(
        (existingEvents || []).map((e: any) => e.resend_email_id).filter(Boolean)
      );

      // Paginate through all Resend emails
      let allEmails: any[] = [];
      let hasMore = true;
      let afterCursor: string | null = null;
      let pageCount = 0;

      while (hasMore && pageCount < 50) {
        const params = new URLSearchParams({ limit: "100" });
        if (afterCursor) params.set("after", afterCursor);

        const resp = await fetch(`https://api.resend.com/emails?${params}`, {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error("Resend list error:", resp.status, errText);
          break;
        }

        const result = await resp.json();
        const emails = result.data || [];
        allEmails = allEmails.concat(emails);
        hasMore = result.has_more === true;
        pageCount++;

        if (emails.length > 0) {
          afterCursor = emails[emails.length - 1].id;
        } else {
          hasMore = false;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      // Insert new emails into email_events
      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const email of allEmails) {
        if (existingIds.has(email.id)) {
          skipped++;
          continue;
        }

        // Only import emails from our domains
        const fromAddr = email.from || "";
        const isFromAppDomain = APP_DOMAINS.some((d) => fromAddr.includes(d));
        if (!isFromAppDomain) {
          skipped++;
          continue;
        }

        // Map last_event to valid event_type
        const validTypes = ["sent", "delivered", "opened", "clicked", "bounced", "complained", "delivery_delayed"];
        const lastEvent = email.last_event || "sent";
        const eventType = validTypes.includes(lastEvent) ? lastEvent : "sent";

        const recipientEmail = Array.isArray(email.to)
          ? email.to[0]
          : (email.to || null);

        const insertResult = await supabase.from("email_events").insert({
          organization_id: org.id,
          event_type: eventType,
          recipient_email: recipientEmail,
          subject: email.subject || null,
          resend_email_id: email.id,
          details: {
            from: email.from || null,
            to: email.to || null,
            cc: email.cc || null,
            bcc: email.bcc || null,
            reply_to: email.reply_to || null,
            last_event: email.last_event || null,
            created_at_resend: email.created_at || null,
            direction: "outbound",
            notification_type: "outbound",
          },
        }).select("id");

        if (insertResult.error) {
          if (errors.length < 10) errors.push(`${email.id}: ${insertResult.error.message}`);
          console.error(`Insert failed for ${email.id}:`, insertResult.error.message);
        } else {
          inserted++;
        }
      }

      // Log per-org
      await supabase.from("system_logs").insert({
        organization_id: org.id,
        level: "info",
        category: "general",
        event_type: "resend_history_sync",
        message: `Resend history sync: ${inserted} imported, ${skipped} skipped, ${allEmails.length} total from Resend (${pageCount} pages)`,
        details: { inserted, skipped, total_fetched: allEmails.length, pages: pageCount, errors: errors.slice(0, 10) },
      });

      allResults.push({ org_id: org.id, inserted, skipped, total_fetched: allEmails.length, pages: pageCount, errors: errors.slice(0, 5) });
    }

    return new Response(
      JSON.stringify({ message: "Resend history sync complete", results: allResults }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-resend-history error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
