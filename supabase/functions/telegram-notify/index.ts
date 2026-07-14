import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// telegram-notify — the single service-role choke point for Telegram alerts.
// Callable edge-to-edge and from cron (no user JWT). Routes to one of the two
// org bots by `channel`, and either sends a preformatted `message` or formats a
// known `event` from its `payload`. Best-effort: never throws to the caller.
//
//   channel "report"   → general bot   (telegram_bot_token / telegram_chat_id)
//   channel "showings" → showings bot  (telegram_showings_* → route settings → general)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORG_SLUG = "rent-finder-cleveland";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface NotifyBody {
  organization_id?: string;
  channel?: "report" | "showings";
  event?: string;
  payload?: Record<string, unknown>;
  message?: string;
}

// ── Event formatters (HTML) ──────────────────────────────────────────────────
function formatEvent(event: string, p: Record<string, unknown>): string {
  const name = escapeHtml(p.name || p.full_name || "Unknown");
  const phone = p.phone ? `\n📞 ${escapeHtml(p.phone)}` : "";
  const voucher = p.has_voucher ? "\n🎟️ Section 8 voucher" : "";
  const interest = p.interest ? `\n🏠 ${escapeHtml(p.interest)}` : "";
  const source = p.source ? ` · <i>${escapeHtml(p.source)}</i>` : "";

  switch (event) {
    case "new_lead":
      return `🆕 <b>New lead</b> — ${name}${source}${interest}${phone}${voucher}`;
    case "hot_lead":
      return `🔥 <b>Hot lead (${escapeHtml(p.score ?? "")})</b> — ${name}${source}${interest}${phone}${voucher}`;
    case "hemlane_digest": {
      const total = escapeHtml(p.total ?? 0);
      const created = escapeHtml(p.created ?? 0);
      const updated = escapeHtml(p.updated ?? 0);
      const skipped = Number(p.skipped ?? 0);
      const skippedTxt = skipped > 0 ? `, ${skipped} omitidos` : "";
      const props = p.properties ? ` · ${escapeHtml(p.properties)} propiedades` : "";
      return `📧 <b>Hemlane digest procesado</b>\n${total} leads — ${created} nuevos, ${updated} enriquecidos${skippedTxt}${props}`;
    }
    case "showing_scheduled": {
      const prop = escapeHtml(p.property || "a property");
      const when = p.when ? `\n🗓️ ${escapeHtml(p.when)}` : "";
      return `📅 <b>Showing scheduled</b> — ${name}\n🏠 ${prop}${when}${phone}`;
    }
    default:
      return `ℹ️ <b>${escapeHtml(event)}</b>\n${escapeHtml(JSON.stringify(p))}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const body = (await req.json().catch(() => ({}))) as NotifyBody;

    const channel = body.channel === "showings" ? "showings" : "report";

    // Resolve org (single tenant): explicit id → by slug → first org.
    let orgId = body.organization_id ?? null;
    if (!orgId) {
      const { data: bySlug } = await supabase
        .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
      orgId = bySlug?.id ?? null;
      if (!orgId) {
        const { data: any1 } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        orgId = any1?.id ?? null;
      }
    }
    if (!orgId) return json({ ok: false, skipped: "no_org" });

    // Build the message: preformatted `message` wins, else format the `event`.
    let message = typeof body.message === "string" ? body.message : "";
    if (!message && body.event) {
      message = formatEvent(body.event, body.payload || {});
    }
    if (!message || message.length > 4000) return json({ ok: false, skipped: "no_message" });

    // Resolve bot credentials for the channel.
    const [{ data: creds }, { data: settings }] = await Promise.all([
      supabase
        .from("organization_credentials")
        .select("telegram_bot_token, telegram_chat_id, telegram_showings_bot_token, telegram_showings_chat_id")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", orgId)
        .in("key", ["telegram_route_bot_token", "telegram_route_chat_id", "telegram_showings_bot_token", "telegram_showings_chat_id"]),
    ]);

    const smap = new Map((settings || []).map((s: { key: string; value: string }) => [s.key, s.value]));
    const setting = (k: string) => {
      const v = smap.get(k);
      if (v == null) return undefined;
      // organization_settings.value may be JSON-encoded ("\"abc\"") or raw.
      const str = String(v);
      try { const parsed = JSON.parse(str); return typeof parsed === "string" ? parsed : str; } catch { return str; }
    };

    let botToken: string | undefined;
    let chatId: string | undefined;
    if (channel === "showings") {
      botToken = creds?.telegram_showings_bot_token
        || setting("telegram_showings_bot_token") || setting("telegram_route_bot_token")
        || creds?.telegram_bot_token;
      chatId = creds?.telegram_showings_chat_id
        || setting("telegram_showings_chat_id") || setting("telegram_route_chat_id")
        || creds?.telegram_chat_id;
    } else {
      botToken = creds?.telegram_bot_token;
      chatId = creds?.telegram_chat_id;
    }

    if (!botToken || !chatId) return json({ ok: false, skipped: "not_configured" });

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgResp.ok) {
      const t = await tgResp.text().catch(() => "");
      console.warn(`telegram-notify send failed ${tgResp.status}: ${t}`);
      return json({ ok: false, error: "send_failed" });
    }
    return json({ ok: true });
  } catch (err) {
    console.error("telegram-notify error:", err);
    return json({ ok: false, error: (err as Error).message });
  }
});

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
