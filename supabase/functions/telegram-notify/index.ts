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

// Humanize raw DB source codes into friendly labels.
const SOURCE_LABELS: Record<string, string> = {
  hemlane_email: "Hemlane",
  hemlane: "Hemlane",
  website: "Website",
  website_inquiry: "Website",
  referral: "Referral",
  manual: "Manual",
  campaign: "Campaign",
  csv_import: "CSV import",
  sms: "SMS",
};
function friendlySource(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return SOURCE_LABELS[s.toLowerCase()] || s;
}

// Pretty-print US numbers for readability; falls back to the raw string.
function prettyPhone(raw: unknown): string {
  const s = String(raw ?? "");
  const digits = s.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1"))
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return s.trim();
}

// The body of a "call now" card (name/phone/property/voucher/move-in), shared by
// the hot_lead alert and the next-day lead_reminder. Phone is PLAIN E.164 so
// Telegram mobile auto-detects a tappable call link.
function hotLeadBody(p: Record<string, unknown>): string {
  const name = escapeHtml(p.name || p.full_name || "Unknown");
  const src = friendlySource(p.source);
  const source = src ? ` · <i>${escapeHtml(src)}</i>` : "";
  const tel = String(p.phone ?? "").trim().replace(/[^\d+]/g, "");
  const phoneLine = tel ? `\n📞 ${escapeHtml(tel)}` : "";
  const propLine = p.property ? `\n🏠 ${escapeHtml(p.property)}` : "";
  const moreN = Number(p.more_count ?? 0);
  const more = moreN > 0 ? ` <i>(+${moreN} more tagged)</i>` : "";
  const vAmt = p.voucher_amount != null && Number(p.voucher_amount) > 0
    ? ` · $${Number(p.voucher_amount).toLocaleString("en-US")}/mo` : "";
  const voucherLine = p.has_voucher ? `\n🎟️ Section 8 voucher${vAmt}` : "";
  const moveLine = p.move_in ? `\n📅 Move-in ${escapeHtml(p.move_in)}` : "";
  return `<b>${name}</b>${source}${phoneLine}${propLine}${more}${voucherLine}${moveLine}`;
}

// Per-lead action button for Hot Leads cards. Only when a lead_id is present.
function actionKeyboard(p: Record<string, unknown>): any[][] | undefined {
  const leadId = typeof p.lead_id === "string" ? p.lead_id : "";
  if (!leadId) return undefined;
  return [[{ text: "📋 Registrar acción", callback_data: `act:menu:${leadId}` }]];
}

// ── Event formatters (HTML) ──────────────────────────────────────────────────
function formatEvent(event: string, p: Record<string, unknown>): string {
  const name = escapeHtml(p.name || p.full_name || "Unknown");
  const phone = p.phone ? `\n📞 ${escapeHtml(p.phone)}` : "";
  const voucher = p.has_voucher ? "\n🎟️ Section 8 voucher" : "";
  const interest = p.interest ? `\n🏠 ${escapeHtml(p.interest)}` : "";
  const src = friendlySource(p.source);
  const source = src ? ` · <i>${escapeHtml(src)}</i>` : "";

  switch (event) {
    case "new_lead":
      return `🆕 <b>New lead</b> — ${name}${source}${interest}${phone}${voucher}`;
    case "hot_lead":
      // A "call now" opportunity card for the showings bot (gated upstream —
      // never fires without a phone). Body shared with lead_reminder.
      return `📞🔥 <b>Hot lead — call now · ${escapeHtml(p.score ?? "")}</b>\n${hotLeadBody(p)}`;
    case "lead_reminder":
      // Next-day follow-up: same card, re-surfaced by the reminder cron. Rolls
      // over every morning until an action is registered (or the lead dies).
      return `⏰🔁 <b>Follow-up de hoy · ${escapeHtml(p.score ?? "")}</b>\n${hotLeadBody(p)}\n<i>Se repite mañana 9am si no registrás una acción.</i>`;
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

    // ALL per-lead alerts (new + hot + reminders) go to the Hot Leads bot — the
    // RFC report bot must NOT receive individual leads (user request). Force the
    // showings channel for these events regardless of the caller's `channel`
    // (the new_lead senders still pass channel:"report"). Digests/reports keep
    // their channel.
    const LEAD_EVENTS = new Set(["new_lead", "hot_lead", "lead_reminder"]);
    const channel = (body.channel === "showings" || LEAD_EVENTS.has(String(body.event || "")))
      ? "showings" : "report";

    // Lead alerts only fire when a phone is on file — a name-only lead (e.g. the
    // first half of a Hemlane paired email) is not actionable. Hot-lead alerts
    // are call-now opportunities, so a phone is mandatory there too.
    if (body.event === "new_lead" || body.event === "hot_lead" || body.event === "lead_reminder") {
      const ph = String((body.payload as Record<string, unknown> | undefined)?.phone ?? "").trim();
      if (!ph) return json({ ok: false, skipped: "no_phone" });
    }

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
      // Hot-lead cards go to the Showings Agent bot only. The route bot is now
      // LeasingAgent (interactive) and must NOT receive pushed hot leads.
      // Pair token+chat ATOMICALLY — never mix the showings token with the
      // general chat id (or vice versa) under a partial config.
      const sTok = creds?.telegram_showings_bot_token || setting("telegram_showings_bot_token");
      const sChat = creds?.telegram_showings_chat_id || setting("telegram_showings_chat_id");
      const useShowings = !!sTok && !!sChat;
      botToken = useShowings ? sTok : creds?.telegram_bot_token;
      chatId = useShowings ? sChat : creds?.telegram_chat_id;
    } else {
      botToken = creds?.telegram_bot_token;
      chatId = creds?.telegram_chat_id;
    }

    if (!botToken || !chatId) return json({ ok: false, skipped: "not_configured" });

    // Hot-lead / follow-up cards carry a "Registrar acción" button (only when a
    // lead_id is in the payload). Preformatted `message` payloads get no buttons.
    const keyboard = (!body.message && (body.event === "hot_lead" || body.event === "lead_reminder"))
      ? actionKeyboard(body.payload || {})
      : undefined;

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
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
