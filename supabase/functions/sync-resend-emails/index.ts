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

  // Accept either a specific organization_id (manual / per-org invoke)
  // OR an empty body (cron) — in which case we iterate over every org
  // that has a Resend API key configured.
  let bodyOrgId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.organization_id === "string" && body.organization_id) {
      bodyOrgId = body.organization_id;
    }
  } catch { /* empty body — fine, iterate all orgs */ }

  // Resolve the list of orgs to sync.
  const orgIds: string[] = [];
  if (bodyOrgId) {
    orgIds.push(bodyOrgId);
  } else {
    const { data: orgs } = await supabase
      .from("organization_credentials")
      .select("organization_id")
      .not("resend_api_key", "is", null);
    for (const o of orgs || []) {
      if (o.organization_id) orgIds.push(o.organization_id as string);
    }
  }

  if (orgIds.length === 0) {
    return new Response(
      JSON.stringify({ message: "No orgs with Resend API keys to sync", results: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const allResults: Array<Record<string, unknown>> = [];

  for (const organization_id of orgIds) {
    try {
      const result = await syncOneOrg(supabase, organization_id);
      allResults.push({ organization_id, ...result });
    } catch (orgErr) {
      console.error(`Sync failed for org ${organization_id}:`, orgErr);
      allResults.push({
        organization_id,
        success: false,
        error: (orgErr as Error).message || "Sync failed",
      });
    }
  }

  return new Response(
    JSON.stringify({ success: true, results: allResults }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// Per-org sync — extracted so the top-level serve() can iterate over orgs.
async function syncOneOrg(
  supabase: ReturnType<typeof createClient>,
  organization_id: string,
): Promise<Record<string, unknown>> {
  try {
    // ── Get Resend API key ────────────────────────────────────────
    let resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

    if (!resendApiKey) {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("resend_api_key")
        .eq("organization_id", organization_id)
        .single();
      if (creds?.resend_api_key) resendApiKey = creds.resend_api_key as string;
    }

    if (!resendApiKey) {
      return { success: false, error: "No Resend API key configured" };
    }

    // ── Fetch recent emails from Resend (paginated, max 100 per page) ──
    // Reduced from 20 pages → 5 to fit within edge function CPU limit.
    // Cron runs every 5 minutes so we'll catch up incrementally if there
    // are more emails than this batch can handle in one pass.
    const allResendEmails: ResendEmail[] = [];
    let afterCursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    const MAX_PAGES = 5; // Safety limit: 5 pages × 100 = 500 emails per run

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

    // ── Bulk lookup of existing email_events by resend_email_id ──
    // Single round trip instead of N (used to be 500+ individual SELECTs).
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const allResendIds = rows
      .map((r) => r.resend_email_id)
      .filter((id): id is string => Boolean(id));

    type ExistingRow = { id: string; resend_email_id: string; details: Record<string, unknown> | null };
    const existingById = new Map<string, ExistingRow>();

    if (allResendIds.length > 0) {
      // Chunk the IN() clause to keep URL size reasonable
      for (let i = 0; i < allResendIds.length; i += 100) {
        const idChunk = allResendIds.slice(i, i + 100);
        const { data: existingRows } = await supabase
          .from("email_events")
          .select("id, resend_email_id, details")
          .eq("organization_id", organization_id)
          .in("resend_email_id", idChunk);
        for (const r of (existingRows as ExistingRow[] | null) || []) {
          if (r.resend_email_id) existingById.set(r.resend_email_id, r);
        }
      }
    }

    // Partition into updates (merge with existing details) vs inserts.
    const toInsert: typeof rows = [];
    const toUpdate: Array<{ id: string; details: Record<string, unknown> }> = [];
    for (const row of rows) {
      const existing = existingById.get(row.resend_email_id);
      if (existing) {
        const mergedDetails = {
          ...(existing.details || {}),
          ...row.details,
        };
        toUpdate.push({ id: existing.id, details: mergedDetails });
      } else {
        toInsert.push(row);
      }
    }

    // Apply updates in parallel batches of 25 (one statement per row is
    // unavoidable for JSONB merges in PostgREST without a custom RPC).
    for (let i = 0; i < toUpdate.length; i += 25) {
      const chunk = toUpdate.slice(i, i + 25);
      await Promise.all(
        chunk.map((u) =>
          supabase
            .from("email_events")
            .update({ details: u.details })
            .eq("id", u.id),
        ),
      );
      updated += chunk.length;
    }

    // Bulk-insert net-new rows in chunks of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100);
      const { error: insertErr } = await supabase.from("email_events").insert(chunk);
      if (insertErr) {
        skipped += chunk.length;
        console.warn(`Insert chunk ${i}-${i + chunk.length} failed:`, insertErr.message);
      } else {
        created += chunk.length;
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

    return {
      success: true,
      total_from_resend: allResendEmails.length,
      created,
      updated,
      skipped,
    };
  } catch (err) {
    console.error(`sync-resend-emails error (org ${organization_id}):`, err);
    return {
      success: false,
      error: (err as Error).message || "Sync failed",
    };
  }
}

// ── Fallback: sync by existing IDs if list endpoint not available ──
async function syncByExistingIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  apiKey: string,
  organizationId: string,
): Promise<Record<string, unknown>> {
  const { data: records } = await supabase
    .from("email_events")
    .select("id, resend_email_id, details")
    .eq("organization_id", organizationId)
    .not("resend_email_id", "is", null);

  if (!records || records.length === 0) {
    return { success: true, total_from_resend: 0, created: 0, updated: 0, skipped: 0, message: "No emails to sync" };
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

  return { success: true, total_from_resend: records.length, created: 0, updated, skipped: 0, fallback: true };
}
