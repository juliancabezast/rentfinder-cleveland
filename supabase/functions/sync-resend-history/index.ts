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
        JSON.stringify({ error: "No Resend API key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

      // Small delay for rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    // Insert new emails into email_events
    let inserted = 0;
    let skipped = 0;

    for (const email of allEmails) {
      if (existingIds.has(email.id)) {
        skipped++;
        continue;
      }

      // Only import emails from our domains
      const fromAddr = email.from || "";
      if (!fromAddr.includes("rentfindercleveland.com") && !fromAddr.includes("homeguardmanagement.com")) {
        skipped++;
        continue;
      }

      // Map last_event to valid event_type
      const validTypes = ["sent", "delivered", "opened", "clicked", "bounced", "complained", "delivery_delayed"];
      const lastEvent = email.last_event || "sent";
      const eventType = validTypes.includes(lastEvent) ? lastEvent : "sent";

      const fromAddress = email.from || "";
      const isOutbound = fromAddress.includes("rentfindercleveland.com") ||
                         fromAddress.includes("homeguardmanagement.com");

      // Recipient: first "to" address
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
          direction: isOutbound ? "outbound" : "inbound",
          notification_type: isOutbound ? "outbound" : "inbound",
        },
      }).select("id");

      if (insertResult.error) {
        if (errors.length < 10) errors.push(`${email.id}: ${insertResult.error.message}`);
        console.error(`Insert failed for ${email.id}:`, insertResult.error.message);
      } else {
        inserted++;
      }
    }

    // Log
    await supabase.from("system_logs").insert({
      organization_id: org.id,
      level: "info",
      category: "general",
      event_type: "resend_history_sync",
      message: `Resend history sync: ${inserted} imported, ${skipped} duplicates, ${allEmails.length} total from Resend (${pageCount} pages)`,
      details: { inserted, skipped, total_fetched: allEmails.length, pages: pageCount },
    });

    return new Response(
      JSON.stringify({
        message: "Resend history sync complete",
        total_fetched: allEmails.length,
        inserted,
        skipped,
        pages: pageCount,
      }),
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
