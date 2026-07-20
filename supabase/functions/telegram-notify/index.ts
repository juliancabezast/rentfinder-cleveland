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

// Per-lead action buttons for Funnel cards. Only when a lead_id is present.
function actionKeyboard(p: Record<string, unknown>): any[][] | undefined {
  const leadId = typeof p.lead_id === "string" ? p.lead_id : "";
  if (!leadId) return undefined;
  return [
    [{ text: "📋 Registrar acción", callback_data: `act:menu:${leadId}` }],
    [{ text: "💬 Enviar SMS", callback_data: `act:sms:${leadId}` },
     { text: "🎯 Cambiar etapa", callback_data: `act:st:${leadId}` }],
  ];
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
    case "new_lead": {
      // The prospect's own words (Hemlane inquiry text) — Julian reads intent
      // before dialing ("I would like to request an application…").
      const msg = p.message
        ? `\n💬 «${escapeHtml(String(p.message).slice(0, 220))}»` : "";
      return `🆕 <b>New lead</b> — ${name}${source}${interest}${phone}${voucher}${msg}`;
    }
    case "hot_lead":
      // A "call now" opportunity card for the showings bot (gated upstream —
      // never fires without a phone). Body shared with lead_reminder.
      return `📞🔥 <b>Hot lead — call now · ${escapeHtml(p.score ?? "")}</b>\n${hotLeadBody(p)}`;
    case "lead_reminder":
      // Next-day follow-up: same card, re-surfaced by the reminder cron. Rolls
      // over every morning until an action is registered (or the lead dies).
      return `⏰🔁 <b>Follow-up de hoy · ${escapeHtml(p.score ?? "")}</b>\n${hotLeadBody(p)}\n<i>Se repite mañana 9am si no registrás una acción.</i>`;
    case "leads_batch": {
      // Burst summary → one message instead of N cards. Two payload shapes:
      // parser bursts {count, sources} and the 9 AM queue summary {reminders, fresh}.
      const rem = Number(p.reminders ?? 0);
      const fresh = Number(p.fresh ?? 0);
      if (rem || fresh) {
        const parts: string[] = [];
        if (rem) parts.push(`⏰ ${rem} seguimiento${rem === 1 ? "" : "s"}`);
        if (fresh) parts.push(`🆕 ${fresh} nuevo${fresh === 1 ? "" : "s"}`);
        return `🗂️ <b>Pendientes de hoy</b> — ${parts.join(" + ")}\nTocá para gestionarlos uno por uno 👇`;
      }
      const count = Number(p.count ?? 0);
      const sources = p.sources ? ` — <i>${escapeHtml(p.sources)}</i>` : "";
      return `🆕 <b>${count} lead${count === 1 ? "" : "s"} completo${count === 1 ? "" : "s"} nuevo${count === 1 ? "" : "s"}</b>${sources}\nTocá para gestionarlos uno por uno 👇`;
    }
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

  // INTERNAL-ONLY sender (deployed --no-verify-jwt): without this gate, anyone
  // could push forged interactive lead cards into the owner's chat. Accept the
  // service key from Authorization OR apikey (functions.invoke uses apikey).
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const apikeyHdr = req.headers.get("apikey") || "";
  if (bearer !== serviceKey && apikeyHdr !== serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const body = (await req.json().catch(() => ({}))) as NotifyBody;

    // ALL per-lead alerts (new + hot + reminders) go to the FUNNEL bot
    // (@FunnelRFCBot) — the lead-management bot (2026-07-19 restructure; the
    // old Hot Leads/@ShowingsBot is being repurposed and receives nothing).
    // Forced regardless of the caller's `channel` (new_lead senders still pass
    // channel:"report"). Digests/reports keep their channel; 'showings' stays
    // resolvable for legacy callers.
    const LEAD_EVENTS = new Set(["new_lead", "hot_lead", "lead_reminder"]);
    const channel = LEAD_EVENTS.has(String(body.event || "")) ? "funnel"
      : body.channel === "showings" ? "showings"
      : body.channel === "funnel" ? "funnel" : "report";

    // Lead alerts only fire for COMPLETE leads: phone + a real name. A name-only
    // or phone-only shell (e.g. half of a Hemlane paired email, or the parser's
    // "Hemlane Lead (216)…" fallback) is not actionable yet.
    if (body.event === "new_lead" || body.event === "hot_lead" || body.event === "lead_reminder") {
      const p = (body.payload as Record<string, unknown> | undefined) || {};
      const ph = String(p.phone ?? "").trim();
      if (!ph) return json({ ok: false, skipped: "no_phone" });
      if (body.event === "new_lead") {
        const nm = String(p.name ?? p.full_name ?? "").trim();
        const low = nm.toLowerCase(); // parser has emitted both casings
        const shell = !nm || low.startsWith("hemlane lead") || nm.includes("{") ||
          low.startsWith("detail") || /\d{7,}/.test(nm);
        if (shell) return json({ ok: false, skipped: "no_real_name" });
      }
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

    // new_lead enrichment: if the caller didn't pass the prospect's inquiry
    // text (paired-email flow: the message arrived in the EARLIER name-only
    // email and lives only in lead_notes), pull the latest one by lead_id.
    if (body.event === "new_lead") {
      const p = (body.payload || (body.payload = {})) as Record<string, unknown>;
      if (!p.message && typeof p.lead_id === "string" && p.lead_id) {
        const { data: note } = await supabase.from("lead_notes")
          .select("content").eq("lead_id", p.lead_id)
          .like("content", "[Hemlane inquiry]%")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (note?.content) {
          p.message = String(note.content).replace(/^\[Hemlane inquiry\]\s*/, "");
        }
      }
    }

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
        .select("telegram_bot_token, telegram_chat_id, telegram_showings_bot_token, telegram_showings_chat_id, telegram_funnel_bot_token, telegram_funnel_chat_id")
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
    let sentViaFunnel = false; // gates the fnl:q button (dead on other bots)
    if (channel === "funnel") {
      // Lead-management bot. Pair token+chat ATOMICALLY — never mix one bot's
      // token with another bot's chat id under a partial config.
      const fTok = creds?.telegram_funnel_bot_token;
      const fChat = creds?.telegram_funnel_chat_id;
      const useFunnel = !!fTok && !!fChat;
      sentViaFunnel = useFunnel;
      botToken = useFunnel ? fTok : creds?.telegram_bot_token;
      chatId = useFunnel ? fChat : creds?.telegram_chat_id;
    } else if (channel === "showings") {
      // Legacy channel (old Hot Leads bot) — kept resolvable for old callers.
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

    // Hot-lead / follow-up cards carry the action keyboard; new-lead cards and
    // batch summaries carry a "Gestionar pendientes" button into the queue.
    // Preformatted `message` payloads get no buttons.
    const QUEUE_BTN = [{ text: "▶️ Gestionar pendientes", callback_data: "fnl:q" }];
    // New-lead cards act on THAT lead first (Kiara's card must never route to
    // the FIFO head): a per-lead card button, then the generic queue button.
    const newLeadKeyboard = (p: Record<string, unknown>): any[][] => {
      const rows: any[][] = [];
      if (typeof p.lead_id === "string" && p.lead_id) {
        rows.push([{ text: "📞 Gestionar este lead", callback_data: `fl:${p.lead_id}` }]);
      }
      rows.push(QUEUE_BTN);
      return rows;
    };
    const keyboard = body.message ? undefined
      : (body.event === "hot_lead" || body.event === "lead_reminder") ? actionKeyboard(body.payload || {})
      // fnl:/fl: only work on the Funnel bot — omit when we fell back elsewhere.
      : (body.event === "new_lead" && sentViaFunnel) ? newLeadKeyboard(body.payload || {})
      : (body.event === "leads_batch" && sentViaFunnel) ? [QUEUE_BTN]
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
