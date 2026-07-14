import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NY = "America/New_York";

// Full metrics report (hourly-report).
const REPORT_TRIGGERS = new Set([
  "report", "reporte", "r", "/report", "/reporte", "/r", "informe", "/informe", "status", "/status",
]);
// Upcoming-showings agenda with full lead/form detail.
const UPDATE_TRIGGERS = new Set([
  "update", "u", "/update", "agenda", "/agenda", "showings", "/showings",
  "próximos", "proximos", "citas", "/citas",
]);
const HELP_TRIGGERS = new Set(["help", "/help", "ayuda", "/ayuda"]);

const HELP_TEXT = `<b>📊 Rent Finder Bot</b>

Comandos:
• <b>update</b> — Próximos showings agendados (con teléfono, propiedad e info del formulario)
• <b>report</b> — Reporte completo (leads, showings, costos, etc.)
• <b>help</b> — Este mensaje

El reporte automático se envía cada hora.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const okResponse = () => new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Verify Telegram's secret token (if configured).
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!timingSafeEqual(provided, expectedSecret)) {
      console.warn("telegram-webhook: secret token mismatch — ignoring update");
      return okResponse();
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const update = await req.json();
    const message = update?.message;
    if (!message?.text || !message?.chat?.id) return okResponse();

    const chatId = String(message.chat.id);
    const text = message.text.trim().toLowerCase();

    // ── Resolve which bot/org this chat belongs to (general OR showings/route) ──
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("organization_id, telegram_bot_token, telegram_chat_id, telegram_showings_bot_token, telegram_showings_chat_id")
      .not("telegram_bot_token", "is", null)
      .limit(1)
      .maybeSingle();

    let organizationId: string | undefined = creds?.organization_id;
    let botToken: string | undefined;

    if (creds) {
      if (chatId === String(creds.telegram_chat_id)) botToken = creds.telegram_bot_token as string;
      else if (chatId === String(creds.telegram_showings_chat_id)) botToken = creds.telegram_showings_bot_token as string;
    }
    // Fall back to the route bot (organization_settings) if not matched yet.
    if (!botToken && organizationId) {
      const { data: rs } = await supabase
        .from("organization_settings").select("key, value")
        .eq("organization_id", organizationId)
        .in("key", ["telegram_route_bot_token", "telegram_route_chat_id"]);
      const m = new Map((rs || []).map((s: any) => [s.key, unwrap(s.value)]));
      if (chatId === m.get("telegram_route_chat_id")) botToken = m.get("telegram_route_bot_token");
    }

    if (!botToken || !organizationId) {
      console.warn(`telegram-webhook: unrecognized chat ${chatId}`);
      return okResponse();
    }

    // Typing indicator.
    const typing = () => fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }).catch(() => {});

    // ── Route the command ───────────────────────────────────────────────────
    if (REPORT_TRIGGERS.has(text)) {
      await typing();
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-hourly-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || result.error) {
        await sendTelegram(botToken, chatId, `❌ Error generando el reporte: ${result.error || "desconocido"}`);
      }
      // agent-hourly-report sends its own message on success.
    } else if (HELP_TRIGGERS.has(text)) {
      await sendTelegram(botToken, chatId, HELP_TEXT);
    } else {
      // "update" (and any other message) → the upcoming-showings agenda.
      await typing();
      const agenda = await buildShowingsAgenda(supabase, organizationId);
      await sendTelegramChunks(botToken, chatId, agenda);
    }

    return okResponse();
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Upcoming showings agenda, grouped by day, with full form info ─────────────
async function buildShowingsAgenda(supabase: any, organizationId: string): Promise<string> {
  const nowIso = new Date().toISOString();
  const { data: shows, error } = await supabase
    .from("showings")
    .select(`
      id, scheduled_at, status, prospect_interest_level, agent_report,
      leads:lead_id (
        full_name, first_name, last_name, phone, email, has_voucher, voucher_amount,
        housing_authority, move_in_date, budget_min, budget_max, preferred_language,
        source, source_detail, intake_preferences
      ),
      properties:property_id ( address, unit_number, city, rent_price )
    `)
    .eq("organization_id", organizationId)
    .gte("scheduled_at", nowIso)
    // Exclude reschedule-pending / dead states — only real confirmed upcoming ones.
    .not("status", "in", "(cancelled,no_show,completed,rescheduled)")
    .order("scheduled_at", { ascending: true })
    .limit(60);

  if (error) return `❌ No pude leer los showings: ${escapeHtml(error.message)}`;
  const list = (shows as any[]) || [];
  // Nobody has a confirmed upcoming showing → show open availability instead.
  if (list.length === 0) return await buildAvailability(supabase, organizationId);

  // Group by NY-day.
  const groups = new Map<string, any[]>();
  for (const s of list) {
    const dayKey = new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: NY });
    (groups.get(dayKey) || groups.set(dayKey, []).get(dayKey)!).push(s);
  }

  const out: string[] = [`📅 <b>Próximos showings (${list.length})</b>`];
  for (const [dayKey, items] of groups) {
    const dayLabel = new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("es-ES", {
      timeZone: NY, weekday: "long", day: "numeric", month: "long",
    });
    out.push(``, `━━ <b>${cap(dayLabel)}</b> ━━`);
    for (const s of items) out.push(renderShowing(s));
  }
  return out.join("\n");
}

// Fallback when there are no confirmed upcoming showings: summarize the open
// availability (open, enabled, unbooked slots) by day — dates + time ranges.
async function buildAvailability(supabase: any, organizationId: string): Promise<string> {
  const todayNY = new Date().toLocaleDateString("en-CA", { timeZone: NY });
  const slots: any[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 60000; from += PAGE) {
    const { data, error } = await supabase
      .from("showing_available_slots")
      .select("slot_date, slot_time, property_id")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true).eq("is_booked", false)
      .gte("slot_date", todayNY)
      .order("slot_date", { ascending: true }).order("slot_time", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return `📅 <b>No hay showings próximos.</b>\n❌ No pude leer la disponibilidad: ${escapeHtml(error.message)}`;
    slots.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  if (slots.length === 0) {
    return `📭 <b>No hay showings próximos ni horarios disponibles configurados.</b>`;
  }

  // Group by date → distinct times + distinct properties.
  const byDate = new Map<string, { times: Set<string>; props: Set<string> }>();
  for (const s of slots) {
    const g = byDate.get(s.slot_date) || { times: new Set(), props: new Set() };
    g.times.add(s.slot_time);
    g.props.add(s.property_id);
    byDate.set(s.slot_date, g);
  }

  const out: string[] = [
    `📭 <b>No hay showings confirmados próximos.</b>`,
    ``,
    `🟢 <b>Disponibilidad abierta para agendar (${slots.length} horarios):</b>`,
  ];
  let days = 0;
  for (const [date, g] of byDate) {
    if (days++ >= 14) { out.push(`<i>…y más días con disponibilidad</i>`); break; }
    const times = [...g.times].sort();
    const range = times.length <= 10
      ? times.map(fmtSlotTime).join(", ")
      : `${fmtSlotTime(times[0])}–${fmtSlotTime(times[times.length - 1])}`;
    const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
      timeZone: NY, weekday: "short", day: "numeric", month: "short",
    });
    out.push(`• <b>${cap(dayLabel)}</b> — ${range} · ${g.props.size} props`);
  }
  return out.join("\n");
}

// "HH:MM:SS" → "10:00 AM"
function fmtSlotTime(t: string): string {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  const ampm = h >= 12 ? "PM" : "AM";
  const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${disp}:${String(m).padStart(2, "0")} ${ampm}`;
}

function renderShowing(s: any): string {
  const time = new Date(s.scheduled_at).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit", hour12: true });
  const l = s.leads || {};
  const p = s.properties || {};
  const name = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "—";
  const addr = p.address ? `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}` : "—";
  const rent = p.rent_price ? ` ($${Number(p.rent_price).toLocaleString()}/mo)` : "";

  const lines: string[] = [];
  lines.push(`🕒 <b>${time}</b> — ${escapeHtml(addr)}${rent}`);
  lines.push(`   👤 <b>${escapeHtml(name)}</b> · 📞 ${escapeHtml(l.phone || "—")}`);
  if (l.email) lines.push(`   ✉️ ${escapeHtml(l.email)}`);

  // Compact "form" line: voucher, authority, move-in, budget, language.
  const bits: string[] = [];
  if (l.has_voucher) bits.push(`🎟️ Voucher${l.voucher_amount ? ` $${Number(l.voucher_amount).toLocaleString()}` : ""}`);
  if (l.housing_authority) bits.push(escapeHtml(l.housing_authority));
  if (l.move_in_date) bits.push(`Move-in ${escapeHtml(l.move_in_date)}`);
  if (l.budget_min || l.budget_max) bits.push(`Budget $${l.budget_min ?? "?"}–${l.budget_max ?? "?"}`);
  if (l.preferred_language) bits.push(l.preferred_language === "es" ? "ES" : "EN");
  if (bits.length) lines.push(`   ${bits.join(" · ")}`);

  // Full form detail: the original inquiry text + intake preferences.
  if (l.source_detail) lines.push(`   📝 ${escapeHtml(String(l.source_detail).slice(0, 400))}`);
  const prefs = renderPrefs(l.intake_preferences);
  if (prefs) lines.push(`   🗒️ ${escapeHtml(prefs)}`);
  if (s.agent_report) lines.push(`   💬 ${escapeHtml(String(s.agent_report).slice(0, 300))}`);
  return lines.join("\n");
}

function renderPrefs(prefs: unknown): string {
  if (!prefs || typeof prefs !== "object") return "";
  const entries = Object.entries(prefs as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  return entries.join(" · ");
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function unwrap(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  try { const p = JSON.parse(s); return typeof p === "string" ? p : s; } catch { return s; }
}
function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(botToken: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
}

// Telegram caps messages at 4096 chars — split long agendas on line boundaries.
async function sendTelegramChunks(botToken: string, chatId: string, text: string) {
  const LIMIT = 3800;
  if (text.length <= LIMIT) { await sendTelegram(botToken, chatId, text); return; }
  const lines = text.split("\n");
  let buf = "";
  for (const line of lines) {
    if (buf.length + line.length + 1 > LIMIT) {
      await sendTelegram(botToken, chatId, buf);
      buf = "";
    }
    buf += (buf ? "\n" : "") + line;
  }
  if (buf) await sendTelegram(botToken, chatId, buf);
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  return diff === 0;
}
