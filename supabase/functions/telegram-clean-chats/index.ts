import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// telegram-clean-chats — nightly self-clean of every bot's chat at 1am ET.
// Telegram's Bot API only lets a bot delete messages < 48h old (and there is no
// API to read a chat's history), so this is a ROLLING nightly wipe: each run
// clears the day's messages; anything older than 48h is untouchable by the bot.
// No sender instrumentation needed — we learn the current max message_id with a
// throwaway probe, then walk backwards deleting, keyed off a per-chat high-water
// mark so each run only touches the new messages (which stay inside the 48h
// window). Best-effort: >48h / already-deleted ids just fail and are skipped.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_SLUG = "rent-finder-cleveland";
const NY = "America/New_York";
const SPAN_CAP = 800; // never walk more than this many ids per bot per run (safety)

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function setSetting(supabase: any, orgId: string, key: string, value: string) {
  await supabase.from("organization_settings").upsert(
    { organization_id: orgId, key, value, category: "communications" },
    { onConflict: "organization_id,key" },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal-only (cron / service-role). Accept the key from Authorization OR apikey.
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") || "";
  if (bearer !== serviceKey && apikey !== serviceKey) return json({ ok: false, error: "unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = (await req.json().catch(() => ({}))) as any;
  const force = !!body?.force; // manual immediate run (bypasses the 1am gate)

  // DST-safe 1am ET gate: the cron fires at 05:00 AND 06:00 UTC; exactly one of
  // those is 1am America/New_York (EDT vs EST), so gating on Cleveland hour === 1
  // runs this exactly once at 1am ET year-round.
  const clevelandHour = Number(new Date().toLocaleString("en-US", { timeZone: NY, hour: "2-digit", hour12: false }));
  const clevelandDate = new Date().toLocaleDateString("en-CA", { timeZone: NY });
  if (!force && clevelandHour !== 1) return json({ ok: false, skipped: "not_1am_et", clevelandHour });

  const { data: org } = await supabase.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
  const orgId = org?.id;
  if (!orgId) return json({ ok: false, skipped: "no_org" });

  // Once-per-day marker (belt-and-suspenders; the hour gate already prevents the
  // 5&6 UTC pair from both running).
  const markerKey = "tg_clean_last_date";
  if (!force) {
    const { data: mk } = await supabase.from("organization_settings")
      .select("value").eq("organization_id", orgId).eq("key", markerKey).maybeSingle();
    if (mk?.value === clevelandDate) return json({ ok: false, skipped: "already_ran_today" });
  }

  const { data: creds } = await supabase.from("organization_credentials")
    .select("telegram_bot_token, telegram_chat_id, telegram_showings_bot_token, telegram_showings_chat_id, telegram_funnel_bot_token, telegram_funnel_chat_id, telegram_route_bot_token, telegram_route_chat_id")
    .eq("organization_id", orgId).maybeSingle();
  if (!creds) return json({ ok: false, skipped: "no_creds" });

  const bots = [
    { key: "general", token: creds.telegram_bot_token, chat: creds.telegram_chat_id },
    { key: "showings", token: creds.telegram_showings_bot_token, chat: creds.telegram_showings_chat_id },
    { key: "funnel", token: creds.telegram_funnel_bot_token, chat: creds.telegram_funnel_chat_id },
    { key: "route", token: creds.telegram_route_bot_token, chat: creds.telegram_route_chat_id },
  ].filter((b) => b.token && b.chat);

  const results: Record<string, number> = {};

  for (const bot of bots) {
    try {
      // Probe: a silent throwaway message → its message_id is the current max.
      const probeRes = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: bot.chat, text: "🧹", disable_notification: true }),
      });
      const M = (await probeRes.json())?.result?.message_id;
      if (!M) { results[bot.key] = -1; continue; }

      const hwmKey = `tg_clean_hwm_${bot.key}`;
      const { data: hwm } = await supabase.from("organization_settings")
        .select("value").eq("organization_id", orgId).eq("key", hwmKey).maybeSingle();
      const lastId = Number(hwm?.value) || (M - 300);
      const floor = Math.max(1, lastId + 1, M - SPAN_CAP);

      // Delete from M down to floor in batches of 100 (deleteMessages). If a batch
      // is rejected (an id > 48h old), fall back to per-id deletes so the still-
      // deletable ones in that batch go through.
      let deleted = 0;
      for (let hi = M; hi >= floor; hi -= 100) {
        const ids: number[] = [];
        for (let id = hi; id > hi - 100 && id >= floor; id--) ids.push(id);
        try {
          const r = await fetch(`https://api.telegram.org/bot${bot.token}/deleteMessages`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: bot.chat, message_ids: ids }),
          });
          if (r.ok) { deleted += ids.length; continue; }
        } catch { /* fall through to per-id */ }
        for (const id of ids) {
          try {
            const rr = await fetch(`https://api.telegram.org/bot${bot.token}/deleteMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: bot.chat, message_id: id }),
            });
            if (rr.ok) deleted++;
          } catch { /* skip */ }
        }
      }
      results[bot.key] = deleted;
      await setSetting(supabase, orgId, hwmKey, String(M));
    } catch (e) {
      console.error("telegram-clean-chats: bot", bot.key, e);
      results[bot.key] = -2;
    }
  }

  await setSetting(supabase, orgId, markerKey, clevelandDate);
  return json({ ok: true, results });
});
