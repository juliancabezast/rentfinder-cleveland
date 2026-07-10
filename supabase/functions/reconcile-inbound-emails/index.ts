import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// reconcile-inbound-emails — audit F21: the svix webhook was the ONLY inbound
// channel; any delivery gap beyond its retry budget silently lost ~33 lead
// emails/day with no catch-up (the digest died for 5 weeks unnoticed).
//
// Two passes, both idempotent:
//  1. REPLAY: re-drive inbound_emails rows stuck in pending/failed by
//     re-POSTing the webhook payload to agent-hemlane-parser in test mode
//     (Bearer service-role skips svix verification).
//  2. BACKFILL: list recently received emails from the Resend Receiving API
//     and re-drive any email_id missing from inbound_emails entirely
//     (webhook delivery never arrived).
//
// Secret-gated (x-reconcile-secret == INBOUND_RECONCILE_SECRET), cron-invoked
// hourly. Deployed --no-verify-jwt.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_REPLAY_PER_RUN = 25; // keep runtime bounded; hourly cron drains backlogs
// The parser bumps attempts on its own retry path and the claim below bumps it
// again per replay, so a row burns ~2 attempts per real replay → 8 ≈ 4 tries.
const MAX_ATTEMPTS = 8;

// Timing-safe string comparison: hash both sides, compare fixed-length digests
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const reconcileSecret = Deno.env.get("INBOUND_RECONCILE_SECRET");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Auth: dedicated secret header OR service-role bearer (manual runs)
  const authHeader = req.headers.get("authorization") || "";
  const secretHeader = req.headers.get("x-reconcile-secret") || "";
  const authorized =
    (reconcileSecret && secretHeader && (await safeEqual(secretHeader, reconcileSecret))) ||
    (authHeader.startsWith("Bearer ") && (await safeEqual(authHeader, `Bearer ${serviceRoleKey}`)));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parserUrl = `${supabaseUrl}/functions/v1/agent-hemlane-parser`;
  const replayEmail = async (emailId: string): Promise<{ ok: boolean; status: number }> => {
    const resp = await fetch(parserUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`, // parser test mode: skips svix
      },
      body: JSON.stringify({ type: "email.received", data: { email_id: emailId } }),
    });
    // Drain the body so the connection is released
    await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status };
  };

  const summary = {
    replayed: 0,
    replay_failed: 0,
    backfilled: 0,
    backfill_failed: 0,
    exhausted: 0,
    listing_unavailable: false,
  };

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    // ── PASS 1: replay stuck pending/failed rows ─────────────────────
    // 'pending' rows older than 15 min are crashes/timeouts mid-processing —
    // fresh ones may still be in-flight, leave them alone.
    // attempts filter is IN THE QUERY: filtering exhausted rows in JS after an
    // oldest-first LIMIT would starve the queue once the 25 oldest rows are
    // all exhausted (review finding).
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stuck, error: stuckErr } = await supabase
      .from("inbound_emails")
      .select("email_id, status, attempts, received_at")
      .in("status", ["pending", "failed"])
      .lt("received_at", fifteenMinAgo)
      .lt("attempts", MAX_ATTEMPTS)
      .order("received_at", { ascending: true })
      .limit(MAX_REPLAY_PER_RUN);
    if (stuckErr) throw new Error(`inbound_emails query failed: ${stuckErr.message}`);

    // Exhausted rows are only counted (they need human eyes, not more retries)
    const { count: exhaustedCount } = await supabase
      .from("inbound_emails")
      .select("email_id", { count: "exact", head: true })
      .in("status", ["pending", "failed"])
      .gte("attempts", MAX_ATTEMPTS);
    summary.exhausted = exhaustedCount || 0;

    for (const row of stuck || []) {
      if (dryRun) continue;
      // Optimistic claim: bump attempts only if nobody else touched the row
      // since we read it. This (a) prevents racing a concurrent svix retry
      // into duplicate processing, and (b) guarantees attempts advances even
      // when the parser dies BEFORE its own attempts++ (e.g. Resend 404 on an
      // expired email would otherwise loop hourly forever with attempts frozen).
      const { data: claimed } = await supabase
        .from("inbound_emails")
        .update({ attempts: (row.attempts || 0) + 1 })
        .eq("email_id", row.email_id)
        .eq("attempts", row.attempts || 0)
        .select("email_id");
      if (!claimed || claimed.length === 0) {
        console.log(`Skipping ${row.email_id} — claimed by a concurrent processor`);
        continue;
      }
      try {
        const r = await replayEmail(row.email_id);
        if (r.ok) summary.replayed++;
        else {
          summary.replay_failed++;
          console.warn(`Replay of ${row.email_id} returned ${r.status}`);
        }
      } catch (e) {
        summary.replay_failed++;
        console.error(`Replay of ${row.email_id} threw: ${(e as Error).message}`);
      }
    }

    // ── PASS 2: backfill webhook deliveries that never arrived ───────
    // Resend Receiving API list endpoint. If the endpoint shape differs on
    // this plan, degrade gracefully — replay (pass 1) still ran.
    if (resendApiKey) {
      try {
        const listResp = await fetch("https://api.resend.com/emails/receiving?limit=100", {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        });
        if (!listResp.ok) {
          summary.listing_unavailable = true;
          console.warn(`Resend receiving list returned ${listResp.status} — skipping backfill pass`);
        } else {
          const listJson = await listResp.json();
          const received: Array<{ id: string }> = Array.isArray(listJson?.data)
            ? listJson.data
            : Array.isArray(listJson)
            ? listJson
            : [];
          const ids = received.map((r) => r?.id).filter((v): v is string => typeof v === "string" && v.length > 10);

          if (ids.length > 0) {
            // Which of these does inbound_emails already know about?
            const { data: known } = await supabase
              .from("inbound_emails")
              .select("email_id")
              .in("email_id", ids);
            const knownSet = new Set((known || []).map((k) => k.email_id));
            const missing = ids.filter((id) => !knownSet.has(id));

            let backfillBudget = MAX_REPLAY_PER_RUN;
            for (const id of missing) {
              if (backfillBudget-- <= 0) break;
              if (dryRun) continue;
              try {
                const r = await replayEmail(id);
                if (r.ok) summary.backfilled++;
                else {
                  summary.backfill_failed++;
                  console.warn(`Backfill of ${id} returned ${r.status}`);
                }
              } catch (e) {
                summary.backfill_failed++;
                console.error(`Backfill of ${id} threw: ${(e as Error).message}`);
              }
            }
            if (missing.length > 0) {
              console.log(`Backfill: ${missing.length} email(s) unknown to inbound_emails (processed up to ${MAX_REPLAY_PER_RUN})`);
            }
          }
        }
      } catch (e) {
        summary.listing_unavailable = true;
        console.warn(`Resend receiving list unavailable: ${(e as Error).message}`);
      }
    } else {
      summary.listing_unavailable = true;
    }

    // Audit trail — only log runs that actually replayed/backfilled something
    // (exhausted count rides along in details but must not spam hourly logs)
    const didWork = summary.replayed + summary.replay_failed + summary.backfilled + summary.backfill_failed > 0;
    if (didWork && !dryRun) {
      try {
        const { data: org } = await supabase
          .from("organizations").select("id").eq("slug", "rent-finder-cleveland").single();
        if (org?.id) {
          await supabase.from("system_logs").insert({
            organization_id: org.id,
            level: summary.replay_failed + summary.backfill_failed > 0 ? "warning" : "info",
            category: "general",
            event_type: "inbound_reconcile_run",
            message: `Inbound reconcile: ${summary.replayed} replayed, ${summary.backfilled} backfilled, ${summary.replay_failed + summary.backfill_failed} failed, ${summary.exhausted} exhausted (>=${MAX_ATTEMPTS} attempts)`,
            details: summary,
          });
        }
      } catch { /* non-blocking */ }
    }

    return new Response(JSON.stringify({ success: true, dry_run: dryRun, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reconcile-inbound-emails error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error", ...summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
