import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResendEmail {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  last_event: string;
  bcc: string | null;
  cc: string | null;
  reply_to: string | null;
  scheduled_at: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get Resend API key ────────────────────────────────────────
    let resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

    if (!resendApiKey) {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("resend_api_key")
        .eq("organization_id", organization_id)
        .single();
      if (creds?.resend_api_key) resendApiKey = creds.resend_api_key;
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "No Resend API key configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch ALL emails from Resend (paginated, max 100 per page) ──
    const allResendEmails: ResendEmail[] = [];
    let afterCursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    const MAX_PAGES = 20; // Safety limit: 20 pages × 100 = 2000 emails max

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    while (hasMore && pageCount < MAX_PAGES) {
      // Respect Resend rate limit: 2 req/sec → wait 600ms between pages
      if (pageCount > 0) await delay(600);

      const url = new URL("https://api.resend.com/emails");
      url.searchParams.set("limit", "100");
      if (afterCursor) url.searchParams.set("after", afterCursor);

      let resp: Response;
      let retries = 0;
      while (true) {
        resp = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        });

        // Handle rate limiting with retry
        if (resp.status === 429 && retries < 3) {
          retries++;
          console.log(`Rate limited, retry ${retries}/3 after 2s...`);
          await delay(2000);
          continue;
        }
        break;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`Resend list error (${resp.status}):`, errText);
        // If list endpoint not supported, fall back to sync-by-id
        if (resp.status === 404 || resp.status === 405) {
          return await syncByExistingIds(supabase, resendApiKey, organization_id);
        }
        // If we already got some emails, proceed with what we have
        if (allResendEmails.length > 0) {
          console.warn(`Stopping pagination after ${pageCount} pages due to error, proceeding with ${allResendEmails.length} emails`);
          break;
        }
        throw new Error(`Resend API error: ${resp.status} — ${errText}`);
      }

      const body = await resp.json();
      const emails: ResendEmail[] = body.data || [];
      allResendEmails.push(...emails);
      hasMore = body.has_more === true;

      if (emails.length > 0) {
        afterCursor = emails[emails.length - 1].id;
      } else {
        hasMore = false;
      }
      pageCount++;
    }

    // ── Map Resend emails to upsert rows ──────────────────────────
    const statusMap: Record<string, string> = {
      sent: "sent",
      delivered: "delivered",
      delivery_delayed: "queued",
      complained: "complained",
      bounced: "bounced",
      opened: "opened",
      clicked: "clicked",
    };

    const now = new Date().toISOString();
    const rows = allResendEmails.map((email) => {
      const lastEvent = email.last_event || "sent";
      return {
        organization_id,
        event_type: lastEvent === "delivery_delayed" ? "delivery_delayed" : "sent",
        recipient_email: email.to?.[0] || "",
        subject: email.subject || "(no subject)",
        resend_email_id: email.id,
        created_at: email.created_at,
        details: {
          status: statusMap[lastEvent] || lastEvent,
          last_event: lastEvent,
          from: email.from,
          synced_from_resend: true,
          synced_at: now,
        },
      };
    });

    // ── Batch upsert (50 at a time) — unique index prevents duplicates ──
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const BATCH = 50;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);

      for (const row of batch) {
        // Check if this email already exists — fetch current details to MERGE
        const { data: existing } = await supabase
          .from("email_events")
          .select("id, details")
          .eq("resend_email_id", row.resend_email_id)
          .eq("organization_id", organization_id)
          .maybeSingle();

        if (existing) {
          // Merge: preserve existing fields (campaign_id, related_entity_id, etc.)
          // then overlay with fresh Resend data
          const mergedDetails = {
            ...(existing.details as Record<string, unknown> || {}),
            ...row.details,
          };
          await supabase
            .from("email_events")
            .update({ details: mergedDetails })
            .eq("id", existing.id);
          updated++;
        } else {
          // New email — insert
          const { error: insertErr } = await supabase.from("email_events").insert(row);
          if (insertErr) {
            skipped++;
          } else {
            created++;
          }
        }
      }
    }

    // ── Log sync ──────────────────────────────────────────────────
    try {
      await supabase.from("system_logs").insert({
        organization_id,
        level: "info",
        category: "general",
        event_type: "resend_sync",
        message: `Resend sync: ${allResendEmails.length} total, ${created} new, ${updated} updated, ${skipped} skipped`,
        details: {
          total_from_resend: allResendEmails.length,
          created,
          updated,
          skipped,
          pages_fetched: pageCount,
        },
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        success: true,
        total_from_resend: allResendEmails.length,
        created,
        updated,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-resend-emails error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: (err as Error).message || "Sync failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Fallback: sync by existing IDs if list endpoint not available ──
async function syncByExistingIds(
  supabase: any,
  apiKey: string,
  organizationId: string
) {
  const { data: records } = await supabase
    .from("email_events")
    .select("id, resend_email_id, details")
    .eq("organization_id", organizationId)
    .not("resend_email_id", "is", null);

  if (!records || records.length === 0) {
    return new Response(
      JSON.stringify({ success: true, total_from_resend: 0, created: 0, updated: 0, skipped: 0, message: "No emails to sync" }),
      { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }
    );
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let updated = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    // Respect Resend rate limit: 2 req/sec
    if (i > 0) await wait(600);
    try {
      const resp = await fetch(`https://api.resend.com/emails/${record.resend_email_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.status === 429) { await wait(2000); continue; }
      if (!resp.ok) continue;

      const emailData = await resp.json();
      const lastEvent = emailData.last_event || "sent";

      await supabase
        .from("email_events")
        .update({
          details: {
            ...(record.details || {}),
            status: lastEvent === "delivered" ? "delivered" : lastEvent,
            last_event: lastEvent,
            synced_at: new Date().toISOString(),
          },
        })
        .eq("id", record.id);

      updated++;
    } catch (e) {
      console.warn(`Failed to sync ${record.resend_email_id}:`, e);
    }
  }

  return new Response(
    JSON.stringify({ success: true, total_from_resend: records.length, created: 0, updated, skipped: 0, fallback: true }),
    { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }
  );
}
