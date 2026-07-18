import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NY = "America/New_York";
const SESSION_TTL_MIN = 30; // an in-flight flow older than this is treated as gone

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
// Open the action menu.
const MENU_TRIGGERS = new Set([
  "menu", "/menu", "/start", "start", "x", "agendar", "/agendar", "schedule", "book",
  "acciones", "acción", "accion", "hola",
]);
// Abort an in-flight flow.
const CANCEL_TRIGGERS = new Set(["cancel", "cancelar", "/cancel", "salir", "/salir"]);

const HELP_TEXT = `<b>🤖 Rent Finder Bot</b>

Comandos:
• <b>menu</b> — Menú de acciones (agendar showing, crear lead, agenda, reporte)
• <b>update</b> — Próximos showings agendados (con teléfono, propiedad e info del formulario)
• <b>report</b> — Reporte completo (leads, showings, costos, etc.)
• <b>help</b> — Este mensaje

El reporte automático se envía cada hora.`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Ctx {
  supabase: any;
  supabaseUrl: string;
  serviceRoleKey: string;
  organizationId: string;
  botToken: string;
  bot: string;
  chatId: string;
}
interface Session {
  chat_id: string;
  bot: string | null;
  organization_id: string | null;
  step: string;
  data: Record<string, any>;
  updated_at: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const okResponse = () =>
    new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Verify Telegram's secret token. FAIL CLOSED: this is the function's only
  // request-authenticity gate (deployed --no-verify-jwt), so a missing secret
  // must refuse everything rather than process anonymous callers.
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("telegram-webhook: TELEGRAM_WEBHOOK_SECRET not configured — refusing all updates");
    return okResponse();
  }
  {
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
    const cbq = update?.callback_query;
    const message = update?.message;
    const chatId = String(cbq?.message?.chat?.id ?? message?.chat?.id ?? "");
    if (!chatId) return okResponse();

    // Which bot is this? The webhook is registered per-bot with ?bot=general /
    // ?bot=showings so we resolve reliably even when both bots DM the same chat.
    const botParam = new URL(req.url).searchParams.get("bot"); // 'general' | 'showings' | 'leasing' | null

    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("organization_id, telegram_bot_token, telegram_chat_id, telegram_showings_bot_token, telegram_showings_chat_id")
      .not("telegram_bot_token", "is", null)
      .limit(1)
      .maybeSingle();

    const organizationId: string | undefined = creds?.organization_id;

    // The LeasingAgent bot's token/chat live in organization_settings
    // (telegram_route_bot_token / telegram_route_chat_id). LeasingAgent serves
    // the whole interactive menu; the general (RFC) + showings bots are
    // push-only and just redirect a user who messages them here.
    let routeToken: string | undefined;
    let routeChat: string | undefined;
    if (organizationId) {
      const { data: rs } = await supabase
        .from("organization_settings").select("key, value")
        .eq("organization_id", organizationId)
        .in("key", ["telegram_route_bot_token", "telegram_route_chat_id"]);
      const m = new Map((rs || []).map((s: any) => [s.key, unwrap(s.value)]));
      routeToken = m.get("telegram_route_bot_token") as string | undefined;
      routeChat = m.get("telegram_route_chat_id") as string | undefined;
    }

    let botToken: string | undefined;
    let bot = "general";

    if (creds) {
      if (botParam === "leasing") {
        bot = "leasing";
        botToken = routeToken;
      } else if (botParam === "showings") {
        bot = "showings";
        botToken = (creds.telegram_showings_bot_token as string) || undefined;
      } else if (botParam === "general") {
        bot = "general";
        botToken = (creds.telegram_bot_token as string) || undefined;
      } else {
        // Legacy fallback: match by chat id (general first). All bots usually DM
        // the same chat, so ?bot= is the reliable signal; this is best-effort.
        if (chatId === String(creds.telegram_chat_id)) {
          bot = "general";
          botToken = creds.telegram_bot_token as string;
        } else if (chatId === String(creds.telegram_showings_chat_id)) {
          bot = "showings";
          botToken = creds.telegram_showings_bot_token as string;
        } else if (routeChat && chatId === String(routeChat)) {
          bot = "leasing";
          botToken = routeToken;
        }
      }
    }
    if (!botToken) botToken = creds?.telegram_bot_token as string;

    if (!botToken || !organizationId) {
      console.warn(`telegram-webhook: unrecognized chat ${chatId} (bot=${botParam})`);
      return okResponse();
    }

    // Owner allowlist: the Telegram secret only proves the request came from
    // Telegram, not WHICH user messaged the bot. Only act on the org's own
    // configured chats — otherwise any stranger who messages a public bot could
    // drive it (read lead PII, create leads, book showings).
    const allowedChats = new Set(
      [creds?.telegram_chat_id, creds?.telegram_showings_chat_id, routeChat]
        .map((c) => (c == null ? "" : String(c)))
        .filter((c) => c && c !== "null")
    );
    // Fail CLOSED: if no owner chats are configured we cannot verify the caller,
    // so refuse rather than admit an anonymous caller into the now-interactive
    // LeasingAgent menu (lead PII read / lead creation / showing booking).
    if (!allowedChats.has(chatId)) {
      console.warn(`telegram-webhook: ignoring update from non-allowlisted chat ${chatId}`);
      return okResponse();
    }

    const ctx: Ctx = { supabase, supabaseUrl, serviceRoleKey, organizationId, botToken, bot, chatId };

    if (cbq) {
      await handleCallback(ctx, cbq);
    } else if (message?.text) {
      await handleText(ctx, message.text);
    }
    return okResponse();
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Text messages
// ═══════════════════════════════════════════════════════════════════════════════
async function handleText(ctx: Ctx, rawText: string) {
  // Only the LeasingAgent bot is interactive. If someone messages the RFC or
  // Showings bot, point them to LeasingAgent instead of driving the menu there.
  if (ctx.bot !== "leasing") { await redirectToLeasing(ctx); return; }

  const raw = String(rawText).trim();
  const t = raw.toLowerCase();

  // Escapes that always win.
  if (CANCEL_TRIGGERS.has(t)) {
    await clearSession(ctx);
    await sendMenu(ctx, "❌ Listo, cancelado.");
    return;
  }
  if (MENU_TRIGGERS.has(t)) {
    await setSession(ctx, "idle", {});
    await sendMenu(ctx);
    return;
  }

  // In-flight flow steps that expect free text (only if the session is fresh).
  const session = await getSession(ctx);
  if (session) {
    if (session.step === "choose_property") { await handlePropertyFilter(ctx, session, raw); return; }
    if (session.step === "find_lead") { await handleLeadSearch(ctx, session, raw); return; }
    if (session.step === "create_lead") { await handleCreateLeadInput(ctx, session, raw); return; }
    if (session.step === "leasing_search") { await handleLeasingSearch(ctx, session, raw); return; }
    if (session.step === "custom_time") { await handleCustomTime(ctx, session, raw); return; }
    // Button-only steps: nudge instead of dumping the agenda on a stray text.
    if (["choose_day", "choose_time", "confirm", "offer_schedule", "leasing_lang"].includes(session.step)) {
      await send(ctx, "👆 Usá los botones de arriba, o mandá <b>menu</b> para reiniciar.");
      return;
    }
  }

  // Commands.
  if (REPORT_TRIGGERS.has(t)) { await runReport(ctx); return; }
  if (HELP_TRIGGERS.has(t)) { await send(ctx, HELP_TEXT); return; }

  // Default (incl. UPDATE_TRIGGERS and anything else): the upcoming agenda.
  await typing(ctx);
  const agenda = await buildShowingsAgenda(ctx.supabase, ctx.organizationId);
  await sendChunks(ctx, agenda);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Callback queries (button presses)
// ═══════════════════════════════════════════════════════════════════════════════
async function handleCallback(ctx: Ctx, cbq: any) {
  const data: string = cbq.data || "";
  const messageId: number | undefined = cbq.message?.message_id;
  const answer = (text?: string) => answerCbq(ctx, cbq.id, text);

  // Only LeasingAgent is interactive. Old buttons lingering on the RFC/Showings
  // threads just redirect (e.g. a stale hot-lead card in the showings bot).
  if (ctx.bot !== "leasing") { await answer(); await redirectToLeasing(ctx, messageId); return; }

  try {
    if (data === "m:sch") { await answer(); await startSchedule(ctx, messageId); return; }
    if (data === "m:new") { await answer(); await startCreateLead(ctx, messageId, true); return; }
    if (data === "m:ag")  { await answer("Cargando agenda…"); await typing(ctx);
      const agenda = await buildShowingsAgenda(ctx.supabase, ctx.organizationId); await sendChunks(ctx, agenda); return; }
    if (data === "m:rp")  { await answer("Generando reporte…"); await typing(ctx); await runReport(ctx); return; }
    if (data === "m:lr")  { await answer(); await startLeasingReport(ctx, messageId); return; }
    if (data === "m:menu"){ await answer(); await clearSession(ctx); await showMenu(ctx, messageId); return; }
    if (data === "m:x")   { await answer(); await clearSession(ctx); await showMenu(ctx, messageId, "❌ Listo, cancelado."); return; }

    if (data.startsWith("p:"))  { await answer(); await chooseProperty(ctx, messageId, data.slice(2)); return; }
    if (data.startsWith("dp:")) { await answer(); await renderDays(ctx, messageId, parseInt(data.slice(3), 10) || 0); return; }
    if (data === "dx")          { await answer(); await renderCustomDays(ctx, messageId); return; }
    if (data.startsWith("d:"))  { await answer(); await chooseDay(ctx, messageId, data.slice(2)); return; }
    if (data.startsWith("tp:")) { await answer(); await renderTimes(ctx, messageId, parseInt(data.slice(3), 10) || 0); return; }
    if (data === "tx")          { await answer(); await startCustomTime(ctx, messageId); return; }
    if (data === "bk")          { await answer(); await renderDays(ctx, messageId, 0); return; }
    if (data === "bk2")         { await answer(); await backToTimes(ctx, messageId); return; }
    if (data.startsWith("t:"))  { await answer(); await chooseSlot(ctx, messageId, data.slice(2)); return; }
    if (data === "nl")          { await answer(); await startCreateLead(ctx, messageId, false); return; }
    if (data.startsWith("l:"))  { await answer(); await chooseLead(ctx, messageId, data.slice(2)); return; }
    if (data.startsWith("lrl:")){ await answer("Generando…"); await generateLeasingReport(ctx, messageId, data.slice(4) === "en" ? "en" : "es"); return; }
    if (data.startsWith("lr:")) { await answer(); await chooseLeasingBuilding(ctx, messageId, parseInt(data.slice(3), 10)); return; }

    if (data === "ok")   { await answer("Agendando…"); await confirmBooking(ctx, messageId); return; }
    if (data === "no")   { await answer(); await clearSession(ctx); await showMenu(ctx, messageId, "❌ Listo, cancelado."); return; }
    if (data === "os:y") { await answer(); await offerScheduleYes(ctx, messageId); return; }
    if (data === "os:n") { await answer(); await clearSession(ctx); await showMenu(ctx, messageId, "✅ Lead guardado. 👍"); return; }

    await answer();
  } catch (err) {
    console.error("handleCallback error:", err);
    try { await answer("Ocurrió un error."); } catch { /* ignore */ }
  }
}

// ── Menu ───────────────────────────────────────────────────────────────────────
function mainMenuKeyboard() {
  return [
    [{ text: "📅 Agendar showing", callback_data: "m:sch" }],
    [{ text: "➕ Crear lead", callback_data: "m:new" }],
    [{ text: "📄 Reporte de leasing", callback_data: "m:lr" }],
    [{ text: "📋 Ver agenda", callback_data: "m:ag" }, { text: "📊 Reporte", callback_data: "m:rp" }],
  ];
}
const MENU_GREETING = "👋 Soy <b>LeasingAgent</b>, tu asistente de agendas y reportes.\n¿Qué querés hacer?";
// RFC/Showings bots are push-only; nudge the user to the interactive bot.
async function redirectToLeasing(ctx: Ctx, messageId?: number) {
  const msg = "🤖 Este bot es solo de avisos.\nPara <b>agendar showings</b> y <b>reportes</b>, escribile a <b>LeasingAgent</b>.";
  if (messageId) await editOrSend(ctx, messageId, msg);
  else await send(ctx, msg);
}
async function sendMenu(ctx: Ctx, prefix?: string) {
  await send(ctx, (prefix ? `${prefix}\n\n` : "") + MENU_GREETING, mainMenuKeyboard());
}
// Same menu, but edits the button's message in place (falls back to a new one).
async function showMenu(ctx: Ctx, messageId: number | undefined, prefix?: string) {
  await editOrSend(ctx, messageId, (prefix ? `${prefix}\n\n` : "") + MENU_GREETING, mainMenuKeyboard());
}

// ── Step 1: choose property (type to filter) ─────────────────────────────────────
async function startSchedule(ctx: Ctx, messageId?: number) {
  // Preserve any lead already chosen (lead-first flow); otherwise start clean.
  const prev = await getSession(ctx);
  const data = prev?.data?.lead_id
    ? { lead_id: prev.data.lead_id, lead_name: prev.data.lead_name, lead_phone: prev.data.lead_phone, lead_email: prev.data.lead_email ?? null }
    : {};
  await setSession(ctx, "choose_property", data);
  const msg = "🏠 <b>Agendar showing</b>\n\nEscribí parte de la <b>dirección</b> o <b>ciudad</b> de la propiedad (ej: <code>117th</code> o <code>Cleveland</code>):";
  await editOrSend(ctx, messageId, msg, [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}

async function handlePropertyFilter(ctx: Ctx, session: Session, rawQuery: string) {
  const q = sanitizeLike(rawQuery);
  if (q.length < 2) { await send(ctx, "Escribí al menos 2 letras de la dirección o ciudad."); return; }

  await typing(ctx);
  const { data: props } = await ctx.supabase
    .from("properties")
    .select("id, address, unit_number, city, status")
    .eq("organization_id", ctx.organizationId)
    .in("status", ["available"]) // bookable = available only (coming_soon not bookable)
    .or(`address.ilike.%${q}%,city.ilike.%${q}%,unit_number.ilike.%${q}%`)
    .limit(25);

  if (!props || props.length === 0) {
    await send(ctx, `🔎 No encontré propiedades activas para «${escapeHtml(rawQuery)}». Probá otra búsqueda.`,
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }

  const ids = props.map((p: any) => p.id);
  const cutoffMs = await leadTimeCutoffMs(ctx.supabase, ctx.organizationId);
  const { data: slotProps } = await ctx.supabase
    .from("showing_available_slots")
    .select("property_id, slot_date, slot_time")
    .eq("organization_id", ctx.organizationId)
    .eq("is_enabled", true).eq("is_booked", false)
    .gte("slot_date", todayNY())
    .in("property_id", ids);
  // Only count properties that still have a FUTURE (bookable) slot.
  const withSlots = new Set(
    (slotProps || [])
      .filter((s: any) => slotToUtcMs(s.slot_date, s.slot_time) > cutoffMs)
      .map((s: any) => s.property_id)
  );

  const usable = props.filter((p: any) => withSlots.has(p.id));
  if (usable.length === 0) {
    await send(ctx, `📭 Esas propiedades no tienen horarios disponibles configurados. Probá otra búsqueda.`,
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }

  const shown = usable.slice(0, 8);
  const rows = shown.map((p: any) => [{ text: propLabel(p).slice(0, 62), callback_data: `p:${p.id}` }]);
  rows.push([{ text: "❌ Cancelar", callback_data: "m:x" }]);
  const extra = usable.length > shown.length ? `\n<i>(${usable.length - shown.length} más — refiná la búsqueda para verlas)</i>` : "";
  await send(ctx, `🏠 <b>Elegí la propiedad:</b>${extra}`, rows);
}

// ── Step 2: choose slot ──────────────────────────────────────────────────────────
async function chooseProperty(ctx: Ctx, messageId: number | undefined, propertyId: string) {
  const { data: prop } = await ctx.supabase
    .from("properties")
    .select("id, address, unit_number, city, status")
    .eq("organization_id", ctx.organizationId)
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop || prop.status !== "available") {
    await editOrSend(ctx, messageId, "❌ Esa propiedad ya no está disponible. Mandá <b>menu</b> para reiniciar.");
    return;
  }
  const session = (await getSession(ctx)) || { data: {} } as Session;
  // Reset any previously-chosen slot so a stale property button can't leave a
  // different property's slot in the session (which would confirm the wrong time).
  const data = {
    ...(session.data || {}),
    property_id: prop.id,
    property_label: propLabel(prop),
    slot_day: undefined, slot_id: undefined, slot_date: undefined, slot_time: undefined,
    slot_label: undefined, custom_slot: undefined,
  };
  await setSession(ctx, "choose_day", data);
  await renderDays(ctx, messageId, 0);
}

// All future, bookable slots for a property (past/too-soon already dropped).
async function fetchFutureSlots(ctx: Ctx, propertyId: string): Promise<any[]> {
  const { data: slots } = await ctx.supabase
    .from("showing_available_slots")
    .select("id, slot_date, slot_time, duration_minutes")
    .eq("organization_id", ctx.organizationId)
    .eq("property_id", propertyId)
    .eq("is_enabled", true).eq("is_booked", false)
    .gte("slot_date", todayNY())
    .order("slot_date", { ascending: true }).order("slot_time", { ascending: true })
    .limit(500);
  const cutoffMs = await leadTimeCutoffMs(ctx.supabase, ctx.organizationId);
  return (slots || []).filter((s: any) => slotToUtcMs(s.slot_date, s.slot_time) > cutoffMs);
}

// ── Step 2: choose the DAY ───────────────────────────────────────────────────────
async function renderDays(ctx: Ctx, messageId: number | undefined, page: number) {
  const session = await getSession(ctx);
  if (!session?.data?.property_id) {
    await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo.");
    return;
  }
  const slots = await fetchFutureSlots(ctx, session.data.property_id);
  const dayCount = new Map<string, number>();
  for (const s of slots) dayCount.set(s.slot_date, (dayCount.get(s.slot_date) || 0) + 1);
  const days = [...dayCount.keys()]; // date-ascending (query order preserved)

  const PER = 8;
  const pages = Math.max(1, Math.ceil(days.length / PER));
  const p = Math.min(Math.max(page, 0), pages - 1);
  const rows = days.slice(p * PER, p * PER + PER).map((d) => [{
    text: `${slotDayLabel(d)} · ${dayCount.get(d)} horario${dayCount.get(d) === 1 ? "" : "s"}`,
    callback_data: `d:${d}`,
  }]);
  const nav: any[] = [];
  if (p > 0) nav.push({ text: "◀️", callback_data: `dp:${p - 1}` });
  if (p < pages - 1) nav.push({ text: "▶️", callback_data: `dp:${p + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "🗓️ Otro día", callback_data: "dx" }]);
  rows.push([{ text: "◀️ Otra propiedad", callback_data: "m:sch" }, { text: "❌ Cancelar", callback_data: "m:x" }]);

  const head = days.length
    ? `🏠 <b>${escapeHtml(session.data.property_label)}</b>\n📅 <b>Elegí el día:</b>${pages > 1 ? ` <i>(pág ${p + 1}/${pages})</i>` : ""}`
    : `🏠 <b>${escapeHtml(session.data.property_label)}</b>\nNo tiene días con horarios abiertos — tocá <b>🗓️ Otro día</b> para abrir uno.`;
  await editOrSend(ctx, messageId, head, rows);
}

// Pick ANY of the next 14 days (even without preset slots → abrir horario nuevo).
async function renderCustomDays(ctx: Ctx, messageId: number | undefined) {
  const base = new Date(`${todayNY()}T12:00:00Z`); // noon UTC never day-shifts in NY
  const days: string[] = [];
  for (let i = 0; i < 14; i++) {
    days.push(new Date(base.getTime() + i * 86400000).toLocaleDateString("en-CA", { timeZone: NY }));
  }
  const rows: any[] = [];
  for (let i = 0; i < days.length; i += 2) {
    rows.push(days.slice(i, i + 2).map((d) => ({ text: slotDayLabel(d), callback_data: `d:${d}` })));
  }
  rows.push([{ text: "◀️ Volver", callback_data: "bk" }, { text: "❌ Cancelar", callback_data: "m:x" }]);
  await editOrSend(ctx, messageId, "🗓️ <b>Elegí cualquier día</b> (podés abrir un horario fuera de la agenda):", rows);
}

async function chooseDay(ctx: Ctx, messageId: number | undefined, dateStr: string) {
  const session = await getSession(ctx);
  if (!session?.data?.property_id) {
    await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo.");
    return;
  }
  const data = { ...(session.data || {}), slot_day: dateStr,
    slot_id: undefined, slot_date: undefined, slot_time: undefined, slot_label: undefined, custom_slot: undefined };
  await setSession(ctx, "choose_time", data);
  await renderTimes(ctx, messageId, 0);
}

// ── Step 2b: choose the TIME within the chosen day ───────────────────────────────
async function renderTimes(ctx: Ctx, messageId: number | undefined, page: number) {
  const session = await getSession(ctx);
  const day = session?.data?.slot_day;
  if (!session?.data?.property_id || !day) {
    await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo.");
    return;
  }
  const slots = (await fetchFutureSlots(ctx, session.data.property_id)).filter((s: any) => s.slot_date === day);

  const PER = 8;
  const pages = Math.max(1, Math.ceil(slots.length / PER));
  const p = Math.min(Math.max(page, 0), pages - 1);
  const rows = slots.slice(p * PER, p * PER + PER).map((s: any) => [{
    text: fmtSlotTime(s.slot_time), callback_data: `t:${s.id}`,
  }]);
  const nav: any[] = [];
  if (p > 0) nav.push({ text: "◀️", callback_data: `tp:${p - 1}` });
  if (p < pages - 1) nav.push({ text: "▶️", callback_data: `tp:${p + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "🕐 Otro horario", callback_data: "tx" }]);
  rows.push([{ text: "◀️ Otro día", callback_data: "bk" }, { text: "❌ Cancelar", callback_data: "m:x" }]);

  const head = slots.length
    ? `🏠 <b>${escapeHtml(session.data.property_label)}</b>\n📅 <b>${slotDayLabel(day)}</b> — elegí la hora:${pages > 1 ? ` <i>(pág ${p + 1}/${pages})</i>` : ""}`
    : `🏠 <b>${escapeHtml(session.data.property_label)}</b>\n📅 <b>${slotDayLabel(day)}</b> — sin horarios abiertos.\nTocá <b>🕐 Otro horario</b> para abrir uno:`;
  await editOrSend(ctx, messageId, head, rows);
}

// Back from the custom-time prompt to the time list — must reset the step so
// stray text is treated as a button-nudge, not a custom-time entry.
async function backToTimes(ctx: Ctx, messageId: number | undefined) {
  const session = await getSession(ctx);
  if (session?.data) await setSession(ctx, "choose_time", { ...session.data, custom_slot: undefined });
  await renderTimes(ctx, messageId, 0);
}

// ── Step 2c: custom time (outside the agenda) ────────────────────────────────────
async function startCustomTime(ctx: Ctx, messageId: number | undefined) {
  const session = await getSession(ctx);
  if (!session?.data?.property_id || !session?.data?.slot_day) {
    await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para reiniciar.");
    return;
  }
  await setSession(ctx, "custom_time", session.data);
  await editOrSend(ctx, messageId,
    `🕐 <b>${slotDayLabel(session.data.slot_day)}</b>\nEscribí la hora del showing.\nEj: <code>2:30 PM</code> · <code>14:30</code> · <code>10 am</code>`,
    [[{ text: "◀️ Volver a horarios", callback_data: "bk2" }], [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}

async function handleCustomTime(ctx: Ctx, session: Session, raw: string) {
  const day = session.data?.slot_day;
  if (!session.data?.property_id || !day) { await send(ctx, "⌛ Se perdió la selección. Mandá <b>menu</b>."); return; }
  const t = parseTime(raw);
  if (!t) {
    await send(ctx, "⚠️ No entendí la hora. Probá: <code>2:30 PM</code>, <code>14:30</code> o <code>10 am</code>.",
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }
  const cutoffMs = await leadTimeCutoffMs(ctx.supabase, ctx.organizationId);
  if (slotToUtcMs(day, t) <= cutoffMs) {
    await send(ctx, "⏰ Esa hora ya pasó. Elegí una hora futura.",
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }
  // Don't offer a time an active showing already occupies (agent-hour guard).
  const { count } = await ctx.supabase
    .from("showing_available_slots")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .eq("slot_date", day).eq("slot_time", t).eq("is_booked", true);
  if ((count || 0) > 0) {
    await send(ctx, "❌ Ya hay un showing a esa hora. Probá otra.",
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }
  const data = { ...(session.data || {}),
    slot_id: undefined, slot_date: day, slot_time: t, custom_slot: true,
    slot_label: `${slotDayLabel(day)} · ${fmtSlotTime(t)}` };
  if (data.lead_id) {
    await setSession(ctx, "confirm", data);
    await showConfirm(ctx, undefined, data);
  } else {
    await setSession(ctx, "find_lead", data);
    await send(ctx, `✅ <b>${escapeHtml(data.property_label)}</b>\n📅 ${escapeHtml(data.slot_label)}\n\n👤 Enviá el <b>nombre</b> o <b>teléfono</b> del lead:`,
      [[{ text: "➕ Crear lead nuevo", callback_data: "nl" }], [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
  }
}

// ── Step 3: identify the lead ────────────────────────────────────────────────────
async function chooseSlot(ctx: Ctx, messageId: number | undefined, slotId: string) {
  const session = await getSession(ctx);
  if (!session?.data?.property_id) {
    await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo.");
    return;
  }
  const { data: slot } = await ctx.supabase
    .from("showing_available_slots")
    .select("id, property_id, slot_date, slot_time, duration_minutes, is_enabled, is_booked")
    .eq("organization_id", ctx.organizationId)
    .eq("id", slotId)
    .maybeSingle();
  if (!slot || !slot.is_enabled || slot.is_booked) {
    await editOrSend(ctx, messageId, "❌ Ese horario ya no está disponible. Elegí otro:");
    await renderTimes(ctx, undefined, 0);
    return;
  }
  // Guard against booking a past/too-soon slot tapped from a stale message.
  const cutoffMs = await leadTimeCutoffMs(ctx.supabase, ctx.organizationId);
  if (slotToUtcMs(slot.slot_date, slot.slot_time) <= cutoffMs) {
    await editOrSend(ctx, messageId, "⏰ Ese horario ya pasó. Te muestro los disponibles:");
    await renderTimes(ctx, undefined, 0);
    return;
  }

  const data = {
    ...(session.data || {}),
    slot_id: slot.id,
    slot_date: slot.slot_date,
    slot_time: slot.slot_time,
    duration: slot.duration_minutes || 30,
    slot_label: `${slotDayLabel(slot.slot_date)} · ${fmtSlotTime(slot.slot_time)}`,
    custom_slot: undefined, // booking a real existing slot — not a custom one
  };

  // Lead-first flow already has the lead → jump straight to confirm.
  if (data.lead_id) {
    await setSession(ctx, "confirm", data);
    await showConfirm(ctx, messageId, data);
    return;
  }

  await setSession(ctx, "find_lead", data);
  const msg = `✅ <b>${escapeHtml(data.property_label)}</b>\n📅 ${escapeHtml(data.slot_label)}\n\n👤 Enviá el <b>nombre</b> o <b>teléfono</b> del lead a agendar:`;
  await editOrSend(ctx, messageId, msg, [
    [{ text: "➕ Crear lead nuevo", callback_data: "nl" }],
    [{ text: "❌ Cancelar", callback_data: "m:x" }],
  ]);
}

async function handleLeadSearch(ctx: Ctx, session: Session, rawQuery: string) {
  await typing(ctx);
  // People often paste a whole blob (a reminder card, a signature) that happens
  // to contain the phone/email. Naively stripping every non-digit fused the
  // street number + rent + date + phone into one junk string that matched
  // nothing, so the lead was "not found" even though the phone was right there.
  // Extract the real phone/email first; only fall back to a name search when the
  // text carries neither.
  const email = extractEmail(rawQuery);
  const phone10 = extractPhone10(rawQuery);

  let query = ctx.supabase
    .from("leads")
    .select("id, full_name, first_name, last_name, phone, lead_score")
    .eq("organization_id", ctx.organizationId)
    .not("phone", "is", null)
    .order("lead_score", { ascending: false })
    .limit(8);

  const orClauses: string[] = [];
  if (phone10) orClauses.push(`phone.ilike.%${phone10}%`);
  if (email) orClauses.push(`email.ilike.%${sanitizeLike(email)}%`);

  if (orClauses.length) {
    query = query.or(orClauses.join(","));
  } else {
    // No phone/email found. If the input is basically a number, treat it as a
    // partial phone fragment (old behavior); otherwise search by cleaned name.
    const onlyPhoneChars = /^[\s\d()+.\-]+$/.test(rawQuery.trim());
    const digits = rawQuery.replace(/\D/g, "");
    if (onlyPhoneChars && digits.length >= 7) {
      query = query.ilike("phone", `%${digits}%`);
    } else {
      const q = sanitizeLike(cleanNameQuery(rawQuery));
      if (q.length < 2) { await send(ctx, "Escribí al menos 2 letras del nombre, o un teléfono."); return; }
      query = query.or(`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }
  }

  const { data: leads } = await query;
  const list = leads || [];
  if (list.length === 0) {
    await send(ctx, `🔎 No encontré ningún lead con teléfono para «${escapeHtml(rawQuery)}».\nProbá con otro dato, o creá el lead:`,
      [[{ text: "➕ Crear lead nuevo", callback_data: "nl" }], [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }
  const rows = list.map((l: any) => [{
    text: `${leadName(l)} · ${prettyPhone(l.phone)}`.slice(0, 62),
    callback_data: `l:${l.id}`,
  }]);
  rows.push([{ text: "➕ Crear lead nuevo", callback_data: "nl" }]);
  rows.push([{ text: "❌ Cancelar", callback_data: "m:x" }]);
  await send(ctx, `👤 <b>Elegí el lead:</b>`, rows);
}

async function chooseLead(ctx: Ctx, messageId: number | undefined, leadId: string) {
  const session = await getSession(ctx);
  // A slot must be chosen — either a preset one (slot_id) or a custom time
  // (custom_slot, whose row is created lazily at confirm, so slot_id is null).
  if (!session?.data?.slot_id && !session?.data?.custom_slot) {
    await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo.");
    return;
  }
  const { data: lead } = await ctx.supabase
    .from("leads")
    .select("id, full_name, first_name, last_name, phone, email")
    .eq("organization_id", ctx.organizationId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) { await editOrSend(ctx, messageId, "❌ No encontré ese lead. Mandá <b>menu</b> para reiniciar."); return; }
  if (!lead.phone) { await editOrSend(ctx, messageId, "❌ Ese lead no tiene teléfono; no puedo agendarlo."); return; }

  const data = { ...(session.data || {}), lead_id: lead.id, lead_name: leadName(lead), lead_phone: lead.phone, lead_email: lead.email || null };
  await setSession(ctx, "confirm", data);
  await showConfirm(ctx, messageId, data);
}

// ── Create lead ──────────────────────────────────────────────────────────────────
async function startCreateLead(ctx: Ctx, messageId: number | undefined, fromMenu: boolean) {
  const prev = await getSession(ctx);
  // From the menu: start clean. Mid-schedule (nl): keep the chosen property/slot.
  const data = fromMenu ? { from_menu_create: true } : { ...(prev?.data || {}), from_menu_create: false };
  await setSession(ctx, "create_lead", data);
  const msg = "➕ <b>Crear lead</b>\n\nMandá los 3 datos separados por coma:\n<code>Nombre Apellido, teléfono, email</code>\n\nEj: <code>Juan Pérez, 216-555-1234, juan@mail.com</code>\n\n<i>El email es necesario para enviarle la confirmación del showing.</i>";
  await editOrSend(ctx, messageId, msg, [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}

async function handleCreateLeadInput(ctx: Ctx, session: Session, raw: string) {
  const parts = raw.split(",").map((s) => s.trim());
  const name = parts[0] || "";
  const phoneRaw = parts[1] || "";
  const email = (parts[2] || "").trim();
  const digits = phoneRaw.replace(/\D/g, "");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  if (name.length < 2 || !/\p{L}/u.test(name) || digits.length < 10 || !emailOk) {
    await send(ctx, "⚠️ Necesito los <b>3 datos</b>: nombre, teléfono y email.\n<code>Nombre Apellido, teléfono, email</code>\nEj: <code>Juan Pérez, 216-555-1234, juan@mail.com</code>",
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }
  const phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  await typing(ctx);
  // Find-or-create by phone (the noah_deduplicate_lead trigger merges/cancels
  // an insert whose phone already exists, so resolve the canonical row by phone).
  let leadId: string | null = null;
  let resolvedName = name;
  let existed = false;
  const { data: existing } = await ctx.supabase
    .from("leads").select("id, full_name, email")
    .eq("organization_id", ctx.organizationId).eq("phone", phone).maybeSingle();
  if (existing) {
    leadId = existing.id; resolvedName = existing.full_name || name; existed = true;
    // Backfill the email if the existing lead didn't have one, so the showing
    // confirmation can go out.
    if (email && !existing.email) {
      await ctx.supabase.from("leads").update({ email }).eq("id", leadId);
    }
  } else {
    await ctx.supabase.from("leads").insert({
      organization_id: ctx.organizationId,
      full_name: name,
      phone,
      email,
      source: "manual",
      status: "new",
    });
    const { data: after } = await ctx.supabase
      .from("leads").select("id, full_name")
      .eq("organization_id", ctx.organizationId).eq("phone", phone).maybeSingle();
    leadId = after?.id ?? null;
    resolvedName = after?.full_name || name;
  }
  if (!leadId) { await send(ctx, "❌ No pude crear el lead. Probá de nuevo o mandá <b>menu</b>."); return; }

  const data = { ...(session.data || {}), lead_id: leadId, lead_name: resolvedName, lead_phone: phone, lead_email: email };
  const prefix = existed ? `ℹ️ Ese teléfono ya existía — uso el lead <b>${escapeHtml(resolvedName)}</b>.` : `✅ Lead creado: <b>${escapeHtml(resolvedName)}</b>.`;

  if (data.slot_id || data.custom_slot) {
    // Mid-schedule: property + slot (preset or custom) already chosen → confirm.
    await setSession(ctx, "confirm", data);
    await send(ctx, `${prefix}\n\n🏠 ${escapeHtml(data.property_label)}\n📅 ${escapeHtml(data.slot_label)}\n📞 ${escapeHtml(prettyPhone(phone))}\n\n¿Agendo el showing?`,
      [[{ text: "✅ Sí, agendar", callback_data: "ok" }], [{ text: "❌ No", callback_data: "m:x" }]]);
  } else {
    // From the menu: offer to start scheduling for this lead.
    await setSession(ctx, "offer_schedule", data);
    await send(ctx, `${prefix}\n📞 ${escapeHtml(prettyPhone(phone))}\n\n¿Querés agendarle un showing?`,
      [[{ text: "📅 Sí, agendar", callback_data: "os:y" }], [{ text: "❌ No", callback_data: "os:n" }]]);
  }
}

async function offerScheduleYes(ctx: Ctx, messageId?: number) {
  // Lead is already in the session → go pick a property (lead-first).
  await startSchedule(ctx, messageId);
}

// ── Confirm + book ───────────────────────────────────────────────────────────────
async function showConfirm(ctx: Ctx, messageId: number | undefined, data: Record<string, any>) {
  const msg = [
    `📋 <b>Confirmar showing</b>`,
    ``,
    `👤 <b>${escapeHtml(data.lead_name)}</b>`,
    `📞 ${escapeHtml(prettyPhone(data.lead_phone))}`,
    `🏠 ${escapeHtml(data.property_label)}`,
    `📅 ${escapeHtml(data.slot_label)}`,
  ].join("\n");
  await editOrSend(ctx, messageId, msg, [
    [{ text: "✅ Confirmar", callback_data: "ok" }],
    [{ text: "❌ Cancelar", callback_data: "m:x" }],
  ]);
}

async function confirmBooking(ctx: Ctx, messageId?: number) {
  const session = await getSession(ctx);
  const d = session?.data || {};
  if (!d.property_id || !d.slot_date || !d.slot_time || !d.lead_id || !d.lead_phone) {
    await editOrSend(ctx, messageId, "⌛ La reserva expiró. Mandá <b>menu</b> para empezar de nuevo.");
    await clearSession(ctx);
    return;
  }

  // Re-validate the time at confirm — a slot that was future when picked can go
  // past if the operator idles on the confirm screen (session TTL is 30 min).
  const confirmCutoffMs = await leadTimeCutoffMs(ctx.supabase, ctx.organizationId);
  if (slotToUtcMs(d.slot_date, d.slot_time) <= confirmCutoffMs) {
    await setSession(ctx, "choose_time", { ...d, slot_id: undefined, slot_time: undefined, slot_label: undefined, custom_slot: undefined });
    await editOrSend(ctx, messageId, "⏰ Ese horario ya pasó. Elegí otro:");
    await renderTimes(ctx, undefined, 0);
    return;
  }

  // Custom time: book-public-showing only books against an existing enabled slot
  // row. FIND-OR-CREATE one (the table is UNIQUE on org+property+date+time, so a
  // blind INSERT would collide with a preset/disabled row at that time).
  let createdSlotId: string | null = null;
  if (d.custom_slot) {
    const findOpen = () => ctx.supabase
      .from("showing_available_slots")
      .select("id, is_enabled, is_booked")
      .eq("organization_id", ctx.organizationId).eq("property_id", d.property_id)
      .eq("slot_date", d.slot_date).eq("slot_time", d.slot_time).maybeSingle();
    const reoffer = async (msg: string) => {
      await setSession(ctx, "choose_time", { ...d, slot_id: undefined, slot_time: undefined, slot_label: undefined, custom_slot: undefined });
      await editOrSend(ctx, messageId, msg);
      await renderTimes(ctx, undefined, 0);
    };
    const { data: ex } = await findOpen();
    if (ex?.is_booked) { await reoffer("❌ Justo se ocupó esa hora. Elegí otra:"); return; }
    if (ex) {
      // Reuse a pre-existing open/disabled row (re-enable if needed). Do NOT set
      // createdSlotId — we must never delete a row we didn't create.
      if (!ex.is_enabled) await ctx.supabase.from("showing_available_slots").update({ is_enabled: true }).eq("id", ex.id);
    } else {
      const { data: ns, error: nsErr } = await ctx.supabase
        .from("showing_available_slots")
        .insert({
          organization_id: ctx.organizationId, property_id: d.property_id,
          slot_date: d.slot_date, slot_time: d.slot_time,
          duration_minutes: 30, is_enabled: true, is_booked: false,
        })
        .select("id").single();
      if (nsErr || !ns) {
        // Likely a unique-violation race — re-fetch and reuse if still open.
        const { data: ex2 } = await findOpen();
        if (!ex2 || ex2.is_booked) { await reoffer("❌ No pude abrir ese horario. Elegí otro:"); return; }
        if (!ex2.is_enabled) await ctx.supabase.from("showing_available_slots").update({ is_enabled: true }).eq("id", ex2.id);
      } else {
        createdSlotId = ns.id;
      }
    }
  }

  let resp: Response;
  let result: any = {};
  try {
    resp = await fetch(`${ctx.supabaseUrl}/functions/v1/book-public-showing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}` },
      body: JSON.stringify({
        property_id: d.property_id,
        organization_id: ctx.organizationId,
        slot_date: d.slot_date,
        slot_time: d.slot_time,
        full_name: d.lead_name,
        phone: d.lead_phone,
        email: d.lead_email || undefined,
        lead_id: d.lead_id,
        booking_source: "telegram_bot",
      }),
    });
    result = await resp.json().catch(() => ({}));
  } catch (_fetchErr) {
    // Network throw — clean up a slot we just opened so it can't orphan.
    if (createdSlotId) {
      await ctx.supabase.from("showing_available_slots").delete().eq("id", createdSlotId).eq("is_booked", false);
    }
    await editOrSend(ctx, messageId, "❌ Error de red al agendar. Probá de nuevo.",
      [[{ text: "🔁 Reintentar", callback_data: "ok" }], [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }

  if (resp.ok && result?.success) {
    await clearSession(ctx);
    const emailLine =
      result.email_status === "sent"
        ? `\n✉️ Confirmación enviada a ${escapeHtml(result.emailed_to || d.lead_email || "")}`
        : result.email_status === "failed"
        ? `\n⚠️ No se pudo enviar el email de confirmación al inquilino.`
        : `\n⚠️ El lead no tiene email — no se le envió confirmación.`;
    await editOrSend(ctx, messageId,
      `✅ <b>¡Showing agendado!</b>\n\n👤 ${escapeHtml(d.lead_name)}\n📞 ${escapeHtml(prettyPhone(d.lead_phone))}\n🏠 ${escapeHtml(d.property_label)}\n📅 ${escapeHtml(d.slot_label)}${emailLine}`,
      [[{ text: "📅 Agendar otro", callback_data: "m:sch" }, { text: "🏠 Menú", callback_data: "m:menu" }]]);
    return;
  }

  // Booking failed → clean up a slot we opened for a custom time (only if still
  // unbooked; a successful claim above already flipped it to is_booked=true).
  if (createdSlotId) {
    await ctx.supabase.from("showing_available_slots").delete().eq("id", createdSlotId).eq("is_booked", false);
  }

  if (resp.status === 409) {
    // Slot got taken (or the agent hour was booked elsewhere) — re-offer times.
    await setSession(ctx, "choose_time", { ...d, slot_id: undefined, slot_time: undefined, slot_label: undefined, custom_slot: undefined });
    await editOrSend(ctx, messageId, "❌ Ese horario ya fue tomado. Elegí otro:");
    await renderTimes(ctx, undefined, 0);
    return;
  }

  const errMsg = escapeHtml(result?.error || "error desconocido");
  await editOrSend(ctx, messageId, `❌ No se pudo agendar: ${errMsg}\nProbá de nuevo o mandá <b>menu</b>.`,
    [[{ text: "🔁 Reintentar", callback_data: "ok" }], [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}

// ── Report passthrough ───────────────────────────────────────────────────────────
async function runReport(ctx: Ctx) {
  const resp = await fetch(`${ctx.supabaseUrl}/functions/v1/agent-hourly-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}` },
    body: JSON.stringify({ organization_id: ctx.organizationId, bot: ctx.bot }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || result.error) {
    await send(ctx, `❌ Error generando el reporte: ${escapeHtml(result.error || "desconocido")}`);
  }
  // agent-hourly-report sends the report itself, to the bot we told it to.
}

// ── Leasing report (PDF) ─────────────────────────────────────────────────────────
async function startLeasingReport(ctx: Ctx, messageId?: number) {
  await setSession(ctx, "leasing_search", {});
  await editOrSend(ctx, messageId,
    "📄 <b>Reporte de leasing</b>\n\nEscribí la <b>dirección</b> o <b>ciudad</b> de la propiedad (ej: <code>117th</code> o <code>Cleveland</code>):",
    [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}

async function handleLeasingSearch(ctx: Ctx, _session: Session, rawQuery: string) {
  const q = rawQuery.trim();
  if (q.length < 2) { await send(ctx, "Escribí al menos 2 letras de la dirección o ciudad."); return; }
  await typing(ctx);
  const resp = await fetch(`${ctx.supabaseUrl}/functions/v1/leasing-tracker-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}` },
    body: JSON.stringify({ query: q }),
  });
  const result = await resp.json().catch(() => ({}));
  const matches = (result?.matches || []) as any[];
  if (!matches.length) {
    await send(ctx, `🔎 No encontré propiedades para «${escapeHtml(rawQuery)}». Probá otra búsqueda.`,
      [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
    return;
  }
  // Store the building list in the session; buttons carry only the index (the
  // groupKey/address can exceed Telegram's 64-byte callback_data limit).
  const buildings = matches.slice(0, 8).map((m) => ({
    key: m.key, label: `${m.address}${m.city ? ` · ${m.city}` : ""}`,
  }));
  await setSession(ctx, "leasing_search", { buildings });
  const rows = buildings.map((b, i) => [{ text: b.label.slice(0, 62), callback_data: `lr:${i}` }]);
  rows.push([{ text: "❌ Cancelar", callback_data: "m:x" }]);
  await send(ctx, "🏠 <b>Elegí la propiedad para el reporte:</b>", rows);
}

async function chooseLeasingBuilding(ctx: Ctx, messageId: number | undefined, idx: number) {
  const session = await getSession(ctx);
  const buildings = session?.data?.buildings as { key: string; label: string }[] | undefined;
  const b = buildings?.[idx];
  if (!b) { await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo."); return; }
  await setSession(ctx, "leasing_lang", { group_key: b.key, group_label: b.label });
  await editOrSend(ctx, messageId,
    `📄 <b>${escapeHtml(b.label)}</b>\n\n¿En qué idioma generás el reporte?`,
    [[{ text: "🇪🇸 Español", callback_data: "lrl:es" }, { text: "🇺🇸 English", callback_data: "lrl:en" }],
     [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}

async function generateLeasingReport(ctx: Ctx, messageId: number | undefined, lang: "es" | "en") {
  const session = await getSession(ctx);
  const gk = session?.data?.group_key;
  const label = session?.data?.group_label || "";
  if (!gk) { await editOrSend(ctx, messageId, "⌛ Esa selección expiró. Mandá <b>menu</b> para empezar de nuevo."); return; }
  await editOrSend(ctx, messageId, `📄 Generando el reporte de <b>${escapeHtml(label)}</b>…`);
  await typing(ctx);
  const resp = await fetch(`${ctx.supabaseUrl}/functions/v1/leasing-report-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}` },
    body: JSON.stringify({ organization_id: ctx.organizationId, groupKey: gk, lang, chat_id: ctx.chatId, bot: ctx.bot }),
  });
  const result = await resp.json().catch(() => ({}));
  if (resp.ok && result?.ok) {
    // The PDF itself is delivered by leasing-report-pdf via sendDocument.
    await clearSession(ctx);
    await send(ctx, "✅ Reporte enviado 📄",
      [[{ text: "📄 Otro reporte", callback_data: "m:lr" }, { text: "🏠 Menú", callback_data: "m:menu" }]]);
  } else {
    // Keep the session so "Reintentar" still has the group_key.
    await send(ctx, `❌ No pude generar el reporte: ${escapeHtml(result?.error || "error")}.\nProbá de nuevo o mandá <b>menu</b>.`,
      [[{ text: "🔁 Reintentar", callback_data: `lrl:${lang}` }, { text: "🏠 Menú", callback_data: "m:menu" }]]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session helpers
// ═══════════════════════════════════════════════════════════════════════════════
// Session key is namespaced by bot: both bots DM the same chat id, so keying by
// chat_id alone would let one bot's flow clobber the other's in-flight session.
function skey(ctx: Ctx): string { return `${ctx.bot}:${ctx.chatId}`; }

async function getSession(ctx: Ctx): Promise<Session | null> {
  const { data } = await ctx.supabase
    .from("telegram_bot_sessions").select("*").eq("chat_id", skey(ctx)).maybeSingle();
  if (!data) return null;
  const ageMin = (Date.now() - new Date(data.updated_at).getTime()) / 60000;
  if (ageMin > SESSION_TTL_MIN) return null; // stale — treat as gone
  return data as Session;
}
async function setSession(ctx: Ctx, step: string, data: Record<string, any>) {
  await ctx.supabase.from("telegram_bot_sessions").upsert({
    chat_id: skey(ctx),
    bot: ctx.bot,
    organization_id: ctx.organizationId,
    step,
    data,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chat_id" });
}
async function clearSession(ctx: Ctx) {
  await ctx.supabase.from("telegram_bot_sessions").delete().eq("chat_id", skey(ctx));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Telegram API helpers
// ═══════════════════════════════════════════════════════════════════════════════
async function tg(ctx: Ctx, method: string, payload: Record<string, unknown>) {
  return await fetch(`https://api.telegram.org/bot${ctx.botToken}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    // Redact: Deno fetch errors embed the request URL, which contains the token.
  }).catch((e) => { console.warn(`tg ${method} failed`, redactToken((e as Error)?.message)); return undefined; });
}
async function send(ctx: Ctx, text: string, keyboard?: any[][]) {
  await tg(ctx, "sendMessage", {
    chat_id: ctx.chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}
async function edit(ctx: Ctx, messageId: number | undefined, text: string, keyboard?: any[][]) {
  if (!messageId) { await send(ctx, text, keyboard); return; }
  const r = await tg(ctx, "editMessageText", {
    chat_id: ctx.chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  // If the message can't be edited (too old / identical), fall back to a new one.
  if (!r || !r.ok) await send(ctx, text, keyboard);
}
// Prefer editing the message the button was on; otherwise send fresh.
async function editOrSend(ctx: Ctx, messageId: number | undefined, text: string, keyboard?: any[][]) {
  await edit(ctx, messageId, text, keyboard);
}
async function answerCbq(ctx: Ctx, cbqId: string, text?: string) {
  await tg(ctx, "answerCallbackQuery", { callback_query_id: cbqId, ...(text ? { text } : {}) });
}
async function typing(ctx: Ctx) {
  await tg(ctx, "sendChatAction", { chat_id: ctx.chatId, action: "typing" });
}
async function sendChunks(ctx: Ctx, text: string) {
  const LIMIT = 3800;
  if (text.length <= LIMIT) { await send(ctx, text); return; }
  const lines = text.split("\n");
  let buf = "";
  for (const line of lines) {
    if (buf.length + line.length + 1 > LIMIT) { await send(ctx, buf); buf = ""; }
    buf += (buf ? "\n" : "") + line;
  }
  if (buf) await send(ctx, buf);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatting helpers
// ═══════════════════════════════════════════════════════════════════════════════
function propLabel(p: any): string {
  const unit = p.unit_number ? ` ${p.unit_number}` : "";
  const city = p.city ? ` · ${p.city}` : "";
  return `${p.address || "—"}${unit}${city}`;
}
function leadName(l: any): string {
  return l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Lead";
}
function prettyPhone(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(raw ?? "").trim();
}
// "YYYY-MM-DD" → "mié 16 jul" (NY-safe: noon UTC avoids day-shift)
function slotDayLabel(date: string): string {
  return cap(new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
    timeZone: NY, weekday: "short", day: "numeric", month: "short",
  }));
}
// PostgREST .or() splits on commas; strip characters that would break the filter.
function sanitizeLike(s: string): string {
  return String(s).replace(/[,%()*]/g, " ").trim();
}
// Pull the first email out of arbitrary pasted text (blob-tolerant).
function extractEmail(raw: string): string | null {
  const m = raw.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}
// Pull a US phone (10 digits) out of arbitrary pasted text. Only digit groups
// joined by phone-ish separators count, so a street number + rent + date on
// separate lines can't fuse into a fake "number".
function extractPhone10(raw: string): string | null {
  const candidates = raw.match(/\+?1?[\s.\-()]*\d{3}[\s.\-()]*\d{3}[\s.\-()]*\d{4}/g) || [];
  for (const c of candidates) {
    const d = c.replace(/\D/g, "");
    if (d.length === 10) return d;
    if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  }
  return null;
}
// Strip emojis, symbols and digits so a pasted "Janetta Pace — 🎫" degrades to a
// clean name query (keeps Unicode letters + spaces).
function cleanNameQuery(raw: string): string {
  return raw.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function todayNY(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: NY });
}
// NY-local "YYYY-MM-DD" + "HH:MM:SS" → UTC epoch ms (DST-aware; same offset
// method book-public-showing uses to build scheduled_at).
function slotToUtcMs(dateStr: string, timeStr: string): number {
  const ref = new Date(`${dateStr}T12:00:00Z`);
  const utcRepr = new Date(ref.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzRepr = new Date(ref.toLocaleString("en-US", { timeZone: NY }));
  const offH = Math.round((tzRepr.getTime() - utcRepr.getTime()) / 3600000);
  const sign = offH >= 0 ? "+" : "-";
  const abs = String(Math.abs(offH)).padStart(2, "0");
  return new Date(`${dateStr}T${timeStr}${sign}${abs}:00`).getTime();
}
// Earliest bookable instant for the LeasingAgent bot = NOW. The bot is
// admin-driven, so the operator can book ANY future time (even 15 min out). The
// renter-facing `showing_lead_time_minutes` buffer (e.g. 180) does NOT apply
// here — it only gates same-hour PUBLIC bookings on the website. We just hide
// slots already in the past. (Kept async + same signature so callers don't change.)
async function leadTimeCutoffMs(_supabase?: any, _organizationId?: string): Promise<number> {
  return Date.now();
}

// ── Existing agenda/report rendering (unchanged) ─────────────────────────────────
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
    .not("status", "in", "(cancelled,no_show,completed,rescheduled)")
    .order("scheduled_at", { ascending: true })
    .limit(60);

  if (error) return `❌ No pude leer los showings: ${escapeHtml(error.message)}`;
  const list = (shows as any[]) || [];
  if (list.length === 0) return await buildAvailability(supabase, organizationId);

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

async function buildAvailability(supabase: any, organizationId: string): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: NY });
  const slots: any[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 60000; from += PAGE) {
    const { data, error } = await supabase
      .from("showing_available_slots")
      .select("slot_date, slot_time, properties:property_id(city)")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true).eq("is_booked", false)
      .gte("slot_date", today)
      .order("slot_date", { ascending: true }).order("slot_time", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return `📅 <b>No hay showings próximos.</b>\n❌ No pude leer la disponibilidad: ${escapeHtml(error.message)}`;
    slots.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  // Hide slots already in the past / inside the same-day lead-time buffer.
  const cutoffMs = await leadTimeCutoffMs(supabase, organizationId);
  const futureSlots = slots.filter((s: any) => slotToUtcMs(s.slot_date, s.slot_time) > cutoffMs);
  if (futureSlots.length === 0) return `📭 <b>No hay showings próximos ni horarios disponibles configurados.</b>`;

  const byDate = new Map<string, { times: Set<string>; cities: Set<string> }>();
  for (const s of futureSlots) {
    const g = byDate.get(s.slot_date) || { times: new Set(), cities: new Set() };
    g.times.add(s.slot_time);
    const city = s.properties?.city;
    if (city) g.cities.add(city);
    byDate.set(s.slot_date, g);
  }

  const out: string[] = [
    `📭 <b>No hay showings confirmados próximos.</b>`, ``,
    `🟢 <b>Agenda abierta para reservar (por día y ciudad):</b>`,
  ];
  let days = 0;
  for (const [date, g] of byDate) {
    if (days++ >= 14) { out.push(`<i>…y más días con disponibilidad</i>`); break; }
    const times = [...g.times].sort();
    const range = times.length <= 10
      ? times.map(fmtSlotTime).join(", ")
      : `${fmtSlotTime(times[0])}–${fmtSlotTime(times[times.length - 1])}`;
    const cities = [...g.cities].sort().join(", ") || "—";
    const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
      timeZone: NY, weekday: "short", day: "numeric", month: "short",
    });
    out.push(`• <b>${cap(dayLabel)}</b> — ${range}\n   📍 ${escapeHtml(cities)}`);
  }
  return out.join("\n");
}

function fmtSlotTime(t: string): string {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  const ampm = h >= 12 ? "PM" : "AM";
  const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${disp}:${String(m).padStart(2, "0")} ${ampm}`;
}
// Parse a free-text time ("2:30 PM", "14:30", "10 am", "9") → "HH:MM:SS" or null.
function parseTime(raw: string): string | null {
  const s = String(raw).trim().toLowerCase().replace(/\./g, "");
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3] || "";
  if (min > 59) return null;
  // A meridiem only makes sense on a 1–12 clock hour ("15 am" is nonsense).
  if (mer && (h < 1 || h > 12)) return null;
  if (mer === "am") { if (h === 12) h = 0; }
  else if (mer === "pm") { if (h !== 12) h += 12; }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
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

  const bits: string[] = [];
  if (l.has_voucher) bits.push(`🎟️ Voucher${l.voucher_amount ? ` $${Number(l.voucher_amount).toLocaleString()}` : ""}`);
  if (l.housing_authority) bits.push(escapeHtml(l.housing_authority));
  if (l.move_in_date) bits.push(`Move-in ${escapeHtml(l.move_in_date)}`);
  if (l.budget_min || l.budget_max) bits.push(`Budget $${l.budget_min ?? "?"}–${l.budget_max ?? "?"}`);
  if (l.preferred_language) bits.push(l.preferred_language === "es" ? "ES" : "EN");
  if (bits.length) lines.push(`   ${bits.join(" · ")}`);

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
// Redact any api.telegram.org bot token before logging a raw error/URL.
function redactToken(v: unknown): string {
  return String(v ?? "").replace(/bot\d+:[\w-]+/g, "bot<redacted>");
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
