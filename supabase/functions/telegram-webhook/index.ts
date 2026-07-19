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

El reporte diario llega a las 5:00 AM y el digest del día a las 9:00 PM (bot RFC).`;

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
    } else if (message?.photo) {
      await handlePhoto(ctx, message);
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
  // Showings (Hot Leads) stays push-only → redirect. The RFC (general) bot has
  // its own reports menu. Everything else (scheduling, leads, agenda) lives in
  // LeasingAgent.
  if (ctx.bot === "showings") { await redirectToLeasing(ctx); return; }
  if (ctx.bot === "general") { await handleRfcText(ctx, rawText); return; }

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
    if (session.step === "sr_text") { await handleShowingReportText(ctx, session, raw); return; }
    if (session.step === "sr_photo") { await send(ctx, "📷 Enviá una <b>foto</b>, o tocá <b>Volver</b>."); return; }
    // Button-only steps: nudge instead of dumping the agenda on a stray text.
    if (["choose_day", "choose_time", "confirm", "offer_schedule", "leasing_lang", "sr_pick", "sr_attend", "sr_review"].includes(session.step)) {
      await send(ctx, "👆 Usá los botones de arriba, o mandá <b>menu</b> para reiniciar.");
      return;
    }
  }

  // Commands.
  if (REPORT_TRIGGERS.has(t)) { await runReport(ctx); return; }
  if (HELP_TRIGGERS.has(t)) { await send(ctx, HELP_TEXT); return; }

  // Default (incl. UPDATE_TRIGGERS and anything else): the upcoming agenda + the
  // per-lead "enviar mensaje" picker.
  await showAgenda(ctx);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Callback queries (button presses)
// ═══════════════════════════════════════════════════════════════════════════════
async function handleCallback(ctx: Ctx, cbq: any) {
  const data: string = cbq.data || "";
  const messageId: number | undefined = cbq.message?.message_id;
  const answer = (text?: string) => answerCbq(ctx, cbq.id, text);

  // LeasingAgent owns the operational menu. Two exceptions: `act:*` (Registrar
  // acción) also works on the Hot Leads (showings) bot, and `rp:*` (reports
  // menu) belongs to the RFC (general) bot. Everything else redirects.
  if (ctx.bot !== "leasing" && !data.startsWith("act:") && !(ctx.bot === "general" && data.startsWith("rp:"))) {
    await answer(); await redirectToLeasing(ctx, messageId); return;
  }

  try {
    if (data.startsWith("act:")) { await handleAction(ctx, cbq, data); return; }
    if (data.startsWith("rp:")) { await handleRfcCallback(ctx, cbq, data); return; }
    if (data.startsWith("msg:")) { await answer(); await chooseSmsLead(ctx, messageId, data.slice(4)); return; }
    if (data.startsWith("sms:")) { await answer(); await sendSmsTemplate(ctx, messageId, data.slice(4)); return; }
    if (data === "m:sch") { await answer(); await startSchedule(ctx, messageId); return; }
    if (data === "m:new") { await answer(); await startCreateLead(ctx, messageId, true); return; }
    if (data === "m:ag")  { await answer("Cargando agenda…"); await showAgenda(ctx); return; }
    if (data === "m:rp")  { await answer("Generando reporte…"); await typing(ctx); await runReport(ctx); return; }
    if (data === "m:lr")  { await answer(); await startLeasingReport(ctx, messageId); return; }
    if (data === "m:sr")  { await answer(); await startShowingReport(ctx, messageId); return; }
    if (data.startsWith("srx:")) { await answer(); await chooseShowingToReport(ctx, messageId, data.slice(4)); return; }
    if (data === "sra:show") { await answer(); await setReportAttendance(ctx, messageId, true); return; }
    if (data === "sra:no")   { await answer(); await setReportAttendance(ctx, messageId, false); return; }
    if (data === "sre")   { await answer("Enriqueciendo…"); await enrichReport(ctx, messageId); return; }
    if (data === "srp")   { await answer(); await askForPhoto(ctx, messageId); return; }
    if (data === "srb")   { await answer(); await showReportReview(ctx, messageId); return; }
    if (data === "srs")   { await answer("Guardando…"); await saveShowingReport(ctx, messageId); return; }
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
    [{ text: "📝 Reporte de showing", callback_data: "m:sr" }],
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
// RFC (general) bot — interactive reports menu
// ═══════════════════════════════════════════════════════════════════════════════
function rfcMenuKeyboard() {
  return [
    [{ text: "📈 Hoy", callback_data: "rp:today" }, { text: "📅 Semana", callback_data: "rp:week" }, { text: "🗓️ Mes", callback_data: "rp:month" }],
    [{ text: "🧭 Funnel + hot pendientes", callback_data: "rp:funnel" }],
    [{ text: "🏠 Top propiedades + 💰 costos", callback_data: "rp:props" }],
    [{ text: "🤖 Pregunta libre (IA)", callback_data: "rp:ai" }],
    [{ text: "📊 Reporte completo", callback_data: "rp:full" }],
  ];
}
const RFC_GREETING =
  "📊 Soy <b>RFC Report</b>, tu bot de datos.\n" +
  "Automático: reporte diario <b>5:00 AM</b> · digest del día <b>9:00 PM</b>.\n\n¿Qué querés ver ahora?";
const RFC_BACK = [[{ text: "🏠 Menú", callback_data: "rp:menu" }]];

async function handleRfcText(ctx: Ctx, rawText: string) {
  const raw = String(rawText).trim();
  const t = raw.toLowerCase();
  if (CANCEL_TRIGGERS.has(t)) {
    await clearSession(ctx);
    await send(ctx, "❌ Listo, cancelado.\n\n" + RFC_GREETING, rfcMenuKeyboard());
    return;
  }
  if (MENU_TRIGGERS.has(t)) {
    await clearSession(ctx);
    await send(ctx, RFC_GREETING, rfcMenuKeyboard());
    return;
  }
  const session = await getSession(ctx);
  if (session?.step === "rfc_ai") { await handleRfcAiQuestion(ctx, session, raw); return; }
  if (REPORT_TRIGGERS.has(t)) { await typing(ctx); await runReport(ctx); return; }
  // Anything else: show the menu (the agenda lives in LeasingAgent).
  await send(ctx, RFC_GREETING, rfcMenuKeyboard());
}

async function handleRfcCallback(ctx: Ctx, cbq: any, data: string) {
  const messageId: number | undefined = cbq.message?.message_id;
  const answer = (text?: string) => answerCbq(ctx, cbq.id, text);
  if (data === "rp:menu")  { await answer(); await clearSession(ctx); await editOrSend(ctx, messageId, RFC_GREETING, rfcMenuKeyboard()); return; }
  if (data === "rp:today" || data === "rp:week" || data === "rp:month") {
    await answer("Generando…"); await typing(ctx); await rfcPeriodReport(ctx, data.slice(3) as "today" | "week" | "month"); return;
  }
  if (data === "rp:funnel") { await answer("Generando…"); await typing(ctx); await rfcFunnelReport(ctx); return; }
  if (data === "rp:props")  { await answer("Generando…"); await typing(ctx); await rfcPropsCostsReport(ctx); return; }
  if (data === "rp:ai")     { await answer(); await startRfcAi(ctx, messageId); return; }
  if (data === "rp:full")   { await answer("Generando reporte completo…"); await typing(ctx); await runReport(ctx); return; }
  await answer();
}

// "YYYY-MM-DD" + n días (UTC-noon-safe, no day-shift).
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Cleveland midnight of a local date, as UTC ISO. NOT slotToUtcMs: that samples
// the offset at noon, which is wrong for midnight on the two DST-transition
// days (switch happens at 2 AM). Round-trip-verify the candidate instant.
function nyMidnightUtcIso(dateStr: string): string {
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Date(noon.toLocaleString("en-US", { timeZone: NY }));
  const guessOffset = noon.getTime() - localNoon.getTime();
  const base = new Date(`${dateStr}T00:00:00Z`).getTime();
  for (const off of [guessOffset, guessOffset - 3600000, guessOffset + 3600000]) {
    const cand = new Date(base + off);
    const rendered = cand.toLocaleString("sv-SE", { timeZone: NY }); // "YYYY-MM-DD HH:mm:ss"
    if (rendered.startsWith(`${dateStr} 00:00`)) return cand.toISOString();
  }
  return new Date(base + guessOffset).toISOString(); // unreachable fallback
}
function rfcDelta(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? "🆙 nuevo" : "=";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return "=";
  return pct > 0 ? `▲ +${pct}%` : `▼ ${pct}%`;
}
const RFC_SOURCE_LABELS: Record<string, string> = {
  inbound_call: "inbound call", hemlane_email: "Hemlane", hemlane: "Hemlane",
  website: "website", referral: "referral", manual: "manual", sms: "SMS",
  campaign: "campaign", csv_import: "CSV import",
};
// Renders a report_source_breakdown RPC result. Sources are lead-supplied via a
// public endpoint → escaped (a stray "<" would make Telegram reject the message).
function rfcRenderSources(rows: { source?: string | null; cnt?: number }[], n = 4): string {
  return (rows || []).slice(0, n)
    .map((r) => `${escapeHtml(RFC_SOURCE_LABELS[r.source || ""] || String(r.source || "otro").replace(/_/g, " "))} ${Number(r.cnt) || 0}`)
    .join(" · ");
}

// 📈 Hoy / 📅 Semana / 🗓️ Mes — con comparación vs el período anterior.
async function rfcPeriodReport(ctx: Ctx, period: "today" | "week" | "month") {
  const today = todayNY();

  // Period bounds (Cleveland-local, DST-aware).
  let curStart: string, curEnd: string, prevStart: string, prevEnd: string, title: string, note: string;
  if (period === "today") {
    curStart = today; curEnd = shiftDay(today, 1);
    prevStart = shiftDay(today, -1); prevEnd = today;
    title = `📈 Hoy — ${slotDayLabel(today)}`; note = "vs ayer completo";
  } else if (period === "week") {
    curStart = shiftDay(today, -6); curEnd = shiftDay(today, 1);
    prevStart = shiftDay(today, -13); prevEnd = curStart;
    title = "📅 Semana — últimos 7 días"; note = "vs los 7 anteriores";
  } else {
    curStart = `${today.slice(0, 7)}-01`; curEnd = shiftDay(today, 1);
    const prevAnchor = shiftDay(curStart, -3);
    prevStart = `${prevAnchor.slice(0, 7)}-01`;
    // Same day-span of the previous month, derived by LENGTH (never builds an
    // invalid date like "06-31" when the previous month is shorter). Clamped to
    // the current month start so a short previous month can't bleed into it
    // (e.g. Jul 31 → prev would otherwise reach Jul 2).
    prevEnd = shiftDay(prevStart, parseInt(today.slice(8, 10), 10));
    if (prevEnd > curStart) prevEnd = curStart;
    title = `🗓️ Mes — ${slotDayLabel(curStart).split(" ").slice(-1)[0]} (al día ${parseInt(today.slice(8, 10), 10)})`;
    note = "vs mismo tramo del mes pasado";
  }
  const curStartUtc = nyMidnightUtcIso(curStart);
  const curEndUtc = nyMidnightUtcIso(curEnd);
  const prevStartUtc = nyMidnightUtcIso(prevStart);
  const prevEndUtc = nyMidnightUtcIso(prevEnd);

  const [seriesRes, curSourcesRes, hotRes, hotPrevRes, emailsRes, emailsPrevRes,
    smsRes, smsPrevRes, convRes, convPrevRes, costsRes, costsPrevRes] = await Promise.all([
    ctx.supabase.rpc("report_time_series", { p_org: ctx.organizationId, p_days: 70 }),
    // Source breakdown grouped in the DB (raw selects cap at 1000 rows silently).
    ctx.supabase.rpc("report_source_breakdown", { p_org: ctx.organizationId, p_since: curStartUtc, p_until: curEndUtc, p_limit: 4 }),
    ctx.supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId)
      .eq("is_demo", false).gte("lead_score", 50).gte("created_at", curStartUtc).lt("created_at", curEndUtc),
    ctx.supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId)
      .eq("is_demo", false).gte("lead_score", 50).gte("created_at", prevStartUtc).lt("created_at", prevEndUtc),
    // Counts queue-drained sends too (event_type='sent' alone misses ~99%).
    ctx.supabase.rpc("report_emails_sent", { p_org: ctx.organizationId, p_since: curStartUtc, p_until: curEndUtc }),
    ctx.supabase.rpc("report_emails_sent", { p_org: ctx.organizationId, p_since: prevStartUtc, p_until: prevEndUtc }),
    ctx.supabase.from("communications").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId)
      .eq("channel", "sms").eq("direction", "outbound").gte("sent_at", curStartUtc).lt("sent_at", curEndUtc),
    ctx.supabase.from("communications").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId)
      .eq("channel", "sms").eq("direction", "outbound").gte("sent_at", prevStartUtc).lt("sent_at", prevEndUtc),
    // converted_at = real conversion moment (updated_at re-counts old conversions).
    ctx.supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId)
      .eq("is_demo", false).gte("converted_at", curStartUtc).lt("converted_at", curEndUtc),
    ctx.supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId)
      .eq("is_demo", false).gte("converted_at", prevStartUtc).lt("converted_at", prevEndUtc),
    ctx.supabase.rpc("report_costs_summary", { p_org: ctx.organizationId, p_since: curStartUtc, p_until: curEndUtc }),
    ctx.supabase.rpc("report_costs_summary", { p_org: ctx.organizationId, p_since: prevStartUtc, p_until: prevEndUtc }),
  ]);

  const series = (seriesRes.data || []).map((r: any) => ({
    day: String(r.day), leads: Number(r.leads) || 0, showings: Number(r.showings) || 0,
  }));
  const sumRange = (from: string, toExcl: string) => {
    let l = 0, s = 0;
    for (const r of series) if (r.day >= from && r.day < toExcl) { l += r.leads; s += r.showings; }
    return { l, s };
  };
  const cur = sumRange(curStart, curEnd);
  const prev = sumRange(prevStart, prevEnd);

  const costSum = (rows: any[]) => (rows || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  const curCost = costSum(costsRes.data);
  const prevCost = costSum(costsPrevRes.data);
  const costParts = ((costsRes.data || []) as any[])
    .filter((r) => Number(r.total) > 0)
    .map((r) => `${escapeHtml(r.service)} $${Number(r.total).toFixed(2)}`)
    .join(" · ");
  const srcLine = rfcRenderSources(curSourcesRes.data || []);
  const curEmails = Number(emailsRes.data) || 0;
  const prevEmails = Number(emailsPrevRes.data) || 0;

  const lines = [
    `<b>${title}</b> <i>(${note})</i>`,
    ``,
    `👥 <b>${cur.l} leads</b> (${rfcDelta(cur.l, prev.l)})${srcLine ? ` — ${srcLine}` : ""}`,
    `🔥 ${hotRes.count || 0} hot (${rfcDelta(hotRes.count || 0, hotPrevRes.count || 0)})`,
    `🏠 ${cur.s} showings (${rfcDelta(cur.s, prev.s)})`,
    `✉️ ${curEmails} emails (${rfcDelta(curEmails, prevEmails)}) · 💬 ${smsRes.count || 0} SMS (${rfcDelta(smsRes.count || 0, smsPrevRes.count || 0)})`,
    `🎉 ${convRes.count || 0} convertidos (${rfcDelta(convRes.count || 0, convPrevRes.count || 0)})`,
    `💰 Costo: <b>$${curCost.toFixed(2)}</b> (${rfcDelta(Math.round(curCost * 100), Math.round(prevCost * 100))})${costParts ? `\n   ${costParts}` : ""}`,
  ];
  await send(ctx, lines.join("\n"), RFC_BACK);
}

// 🧭 Funnel + hot pendientes
async function rfcFunnelReport(ctx: Ctx) {
  const now = new Date();
  const dayAgoIso = new Date(now.getTime() - 86400000).toISOString();
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 86400000).toISOString();
  const [funnelRes, hotListRes] = await Promise.all([
    ctx.supabase.rpc("report_status_funnel", { p_org: ctx.organizationId }),
    ctx.supabase.from("leads")
      .select("id, full_name, first_name, last_name, phone, lead_score, source")
      .eq("organization_id", ctx.organizationId).eq("is_demo", false)
      .gte("lead_score", 50).not("status", "in", "(lost,converted)")
      .or(`last_contact_at.is.null,last_contact_at.lt.${dayAgoIso}`)
      .gte("created_at", sevenDaysAgoIso)
      .not("phone", "is", null)
      .order("lead_score", { ascending: false })
      .limit(10),
  ]);
  const funnel = new Map<string, number>(
    ((funnelRes.data || []) as any[]).map((r) => [String(r.status), Number(r.cnt) || 0])
  );
  const fn = (s: string) => funnel.get(s) || 0;
  const FLOW: [string, string][] = [
    ["🆕", "new"], ["📞", "contacted"], ["💬", "engaged"], ["🌱", "nurturing"], ["✅", "qualified"],
    ["📅", "showing_scheduled"], ["🏠", "showed"], ["🧾", "in_application"], ["🎉", "converted"], ["❌", "lost"],
  ];
  const lines: string[] = [`🧭 <b>Funnel del pipeline</b> (histórico vivo)`, ``];
  for (const [em, st] of FLOW) lines.push(`${em} ${st.replace(/_/g, " ")}: <b>${fn(st)}</b>`);

  const hot = hotListRes.data || [];
  lines.push(``, `━━ <b>🔥 HOT PENDIENTES</b> (7d, sin contactar) ━━`);
  if (!hot.length) lines.push(`✅ Nada pendiente — todo contactado.`);
  hot.forEach((l: any, i: number) => {
    lines.push(`${i + 1}. <b>${escapeHtml(leadName(l))}</b> · ${l.lead_score} pts\n   📞 ${escapeHtml(l.phone || "—")}`);
  });
  await sendChunks(ctx, lines.join("\n"));
  await send(ctx, "¿Algo más?", RFC_BACK);
}

// 🏠 Top propiedades + 💰 costos
async function rfcPropsCostsReport(ctx: Ctx) {
  const today = todayNY();
  const monthStartUtc = nyMidnightUtcIso(`${today.slice(0, 7)}-01`);
  const todayStartUtc = nyMidnightUtcIso(today);
  const nowIso = new Date().toISOString();
  const [topRes, costsMonthRes, costsTodayRes] = await Promise.all([
    ctx.supabase.rpc("report_top_properties", { p_org: ctx.organizationId, p_since: monthStartUtc, p_limit: 10 }),
    ctx.supabase.rpc("report_costs_summary", { p_org: ctx.organizationId, p_since: monthStartUtc, p_until: nowIso }),
    ctx.supabase.rpc("report_costs_summary", { p_org: ctx.organizationId, p_since: todayStartUtc, p_until: nowIso }),
  ]);
  const top = (topRes.data || []) as any[];
  const monthRows = (costsMonthRes.data || []) as any[];
  const todayRows = (costsTodayRes.data || []) as any[];
  const monthTotal = monthRows.reduce((s, r) => s + Number(r.total || 0), 0);
  const todayTotal = todayRows.reduce((s, r) => s + Number(r.total || 0), 0);

  const lines: string[] = [`🏠 <b>Top propiedades del mes</b> (por interés)`, ``];
  if (!top.length) lines.push(`Sin datos este mes.`);
  top.forEach((p: any, i: number) => lines.push(`${i + 1}. ${escapeHtml(p.address || "—")} — <b>${Number(p.cnt) || 0}</b> leads`));
  lines.push(``, `━━ <b>💰 COSTOS</b> ━━`, `Hoy: <b>$${todayTotal.toFixed(2)}</b> · Mes: <b>$${monthTotal.toFixed(2)}</b>`);
  monthRows.filter((r) => Number(r.total) > 0).forEach((r) => {
    lines.push(`• ${escapeHtml(r.service)}: $${Number(r.total).toFixed(2)} (mes)`);
  });
  await send(ctx, lines.join("\n"), RFC_BACK);
}

// 🤖 Pregunta libre (IA) — free-text Q&A over real org data via ai-chat.
async function startRfcAi(ctx: Ctx, messageId?: number) {
  await setSession(ctx, "rfc_ai", { history: [] });
  await editOrSend(ctx, messageId,
    "🤖 <b>Pregunta libre</b>\n\nPreguntame lo que quieras sobre tus datos, en tu idioma. Ejemplos:\n" +
    "• <i>¿Cuántos leads entraron esta semana y de dónde?</i>\n" +
    "• <i>¿Qué propiedad tiene más interesados últimamente?</i>\n" +
    "• <i>¿Cómo viene este mes vs el pasado?</i>\n\nEscribí tu pregunta 👇 (seguimos acá hasta que vuelvas al menú)",
    RFC_BACK);
}

async function handleRfcAiQuestion(ctx: Ctx, session: Session, raw: string) {
  if (raw.length < 3) { await send(ctx, "Contame un poco más 🙂", RFC_BACK); return; }
  await typing(ctx);
  const history = Array.isArray(session.data?.history) ? session.data.history : [];
  const resp = await fetch(`${ctx.supabaseUrl}/functions/v1/ai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}` },
    body: JSON.stringify({ organization_id: ctx.organizationId, question: raw, history, format: "telegram" }),
  });
  const result = await resp.json().catch(() => ({}));
  const answer = String(result?.answer || result?.error || "No pude generar la respuesta — probá de nuevo.");
  const newHistory = [...history, { role: "user", content: raw }, { role: "assistant", content: answer }].slice(-8);
  await setSession(ctx, "rfc_ai", { history: newHistory });
  const text = escapeHtml(answer);
  if (text.length <= 3800) {
    await send(ctx, `🤖 ${text}\n\n<i>Seguí preguntando, o volvé al menú.</i>`, RFC_BACK);
  } else {
    await sendChunks(ctx, `🤖 ${text}`);
    await send(ctx, "<i>Seguí preguntando, o volvé al menú.</i>", RFC_BACK);
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
  const lines: string[] = [];
  // Hard-split any single line longer than LIMIT (an unbroken AI answer would
  // otherwise produce an empty send + a >4096 chunk Telegram rejects silently).
  for (const raw of text.split("\n")) {
    let line = raw;
    while (line.length > LIMIT) { lines.push(line.slice(0, LIMIT)); line = line.slice(LIMIT); }
    lines.push(line);
  }
  let buf = "";
  for (const line of lines) {
    if (buf && buf.length + line.length + 1 > LIMIT) { await send(ctx, buf); buf = ""; }
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

// ═══════════════════════════════════════════════════════════════════════════════
// Hot Leads — "Registrar acción" (runs on the showings bot too; stateless)
// ═══════════════════════════════════════════════════════════════════════════════
function actionMenuKeyboard(leadId: string) {
  return [
    [{ text: "📵 Llamé, no contestó", callback_data: `act:noans:${leadId}` }],
    [{ text: "🔁 Quiere seguimiento (mañana 9am)", callback_data: `act:fu:${leadId}` }],
    [{ text: "📅 Quiere agendar showing", callback_data: `act:sch:${leadId}` }],
    [{ text: "👋 Ya lo contacté", callback_data: `act:done:${leadId}` }],
    [{ text: "❌ No interesado", callback_data: `act:lost:${leadId}` }],
  ];
}
// Insert a lead_notes row for a Telegram-logged action (created_by is null —
// there's no app user behind a Telegram tap; the origin marker lives in content).
async function logLeadNote(ctx: Ctx, leadId: string, noteType: string, content: string) {
  await ctx.supabase.from("lead_notes").insert({
    organization_id: ctx.organizationId, lead_id: leadId,
    content: `${content} · via Telegram`, note_type: noteType,
  });
}
// Next day 09:00 America/New_York as a UTC ISO string (DST-aware via slotToUtcMs).
function nextDay9amET(): string {
  const todayNy = todayNY();
  const tomorrowNy = new Date(new Date(`${todayNy}T12:00:00Z`).getTime() + 86400000)
    .toLocaleDateString("en-CA", { timeZone: NY });
  return new Date(slotToUtcMs(tomorrowNy, "09:00:00")).toISOString();
}
async function handleAction(ctx: Ctx, cbq: any, data: string) {
  const answer = (t?: string) => answerCbq(ctx, cbq.id, t);
  const messageId: number | undefined = cbq.message?.message_id;
  const [, verb = "", leadId = ""] = data.split(":");
  if (!leadId) { await answer(); return; }

  const { data: lead } = await ctx.supabase
    .from("leads")
    .select("id, full_name, first_name, last_name, phone, status")
    .eq("organization_id", ctx.organizationId).eq("id", leadId).maybeSingle();
  if (!lead) { await answer("Lead no encontrado."); return; }
  const name = leadName(lead);
  const tel = String(lead.phone ?? "").replace(/[^\d+]/g, "");

  // Open the action submenu as a NEW message (keeps the call-now card intact).
  if (verb === "menu") {
    await answer();
    await send(ctx, `📋 <b>Registrar acción</b> — ${escapeHtml(name)}`, actionMenuKeyboard(leadId));
    return;
  }

  const again = [[{ text: "📋 Otra acción", callback_data: `act:menu:${leadId}` }]];
  // Any registered action EXCEPT "quiere seguimiento" stops the daily rollover
  // (the reminder cron re-arms a pending card every morning until acted on).
  const stopRollover = () =>
    ctx.supabase.from("lead_reminders").update({ status: "cancelled" })
      .eq("organization_id", ctx.organizationId).eq("lead_id", leadId).eq("status", "pending");
  try {
    if (verb === "noans") {
      await answer("Anotado ✅");
      await logLeadNote(ctx, leadId, "call_summary", "📞 Llamé — no contestó");
      await stopRollover();
      await editOrSend(ctx, messageId, `✅ Anotado: <b>no contestó</b> — ${escapeHtml(name)}`, again);
    } else if (verb === "fu") {
      await answer("Seguimiento agendado ✅");
      await logLeadNote(ctx, leadId, "follow_up", "🔁 Llamé — pidió seguimiento");
      // Idempotent: at most one pending reminder per lead (a double-tap, or the
      // "Otra acción" re-tap path, must not create duplicate morning cards).
      const { data: existingRem } = await ctx.supabase.from("lead_reminders")
        .select("id").eq("organization_id", ctx.organizationId).eq("lead_id", leadId)
        .eq("status", "pending").limit(1).maybeSingle();
      if (!existingRem) {
        await ctx.supabase.from("lead_reminders").insert({
          organization_id: ctx.organizationId, lead_id: leadId,
          due_at: nextDay9amET(), reason: "follow_up", status: "pending",
        });
      }
      await editOrSend(ctx, messageId, `✅ <b>Seguimiento agendado</b> para mañana 9am ⏰ — ${escapeHtml(name)}`, again);
    } else if (verb === "sch") {
      await answer();
      await logLeadNote(ctx, leadId, "general", "📅 Quiere agendar showing");
      await stopRollover();
      await editOrSend(ctx, messageId,
        `📅 Anotado. Abrí <b>LeasingAgent</b> → 📅 Agendar showing y pegá este teléfono para encontrarlo:\n📞 ${escapeHtml(tel)}`, again);
    } else if (verb === "done") {
      await answer("Anotado ✅");
      await logLeadNote(ctx, leadId, "call_summary", "👋 Ya contactado");
      await stopRollover();
      await editOrSend(ctx, messageId, `✅ Anotado: <b>ya contactado</b> — ${escapeHtml(name)}`, again);
    } else if (verb === "lost") {
      await answer("Marcado ✅");
      await ctx.supabase.from("leads").update({ status: "lost" })
        .eq("organization_id", ctx.organizationId).eq("id", leadId);
      await logLeadNote(ctx, leadId, "objection", "❌ No interesado — marcado lost");
      await stopRollover();
      await editOrSend(ctx, messageId, `✅ Marcado <b>no interesado</b> (lost) — ${escapeHtml(name)}`, again);
    } else {
      await answer();
    }
  } catch (err) {
    console.error("handleAction error:", err);
    await editOrSend(ctx, messageId, "❌ No pude registrar la acción. Probá de nuevo.", again);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LeasingAgent agenda — quick SMS (opens the phone's native Messages app)
// ═══════════════════════════════════════════════════════════════════════════════
async function upcomingTargets(ctx: Ctx): Promise<any[]> {
  const nowIso = new Date().toISOString();
  const { data } = await ctx.supabase
    .from("showings")
    .select(`scheduled_at, lead_id,
      leads:lead_id ( full_name, first_name, last_name, phone ),
      properties:property_id ( address, unit_number, city )`)
    .eq("organization_id", ctx.organizationId)
    .gte("scheduled_at", nowIso)
    .not("status", "in", "(cancelled,no_show,completed,rescheduled)")
    .order("scheduled_at", { ascending: true }).limit(20);
  return (data || []).map((s: any) => {
    const l = s.leads || {}; const p = s.properties || {};
    return {
      lead_id: s.lead_id,
      name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Lead",
      phone: String(l.phone ?? "").replace(/[^\d+]/g, ""),
      addr: p.address ? `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}${p.city ? `, ${p.city}` : ""}` : "the property",
      time: new Date(s.scheduled_at).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit", hour12: true }),
      day: new Date(s.scheduled_at).toLocaleDateString("en-US", { timeZone: NY, weekday: "short", month: "short", day: "numeric" }),
    };
  }).filter((t: any) => t.phone);
}
async function showAgenda(ctx: Ctx) {
  await typing(ctx);
  const agenda = await buildShowingsAgenda(ctx.supabase, ctx.organizationId);
  await sendChunks(ctx, agenda);
  const targets = await upcomingTargets(ctx);
  if (!targets.length) return;
  // Stash targets in the session — MERGE (don't wipe an in-flight booking flow;
  // a lingering "Ver agenda" tap must not clobber a confirm-step session).
  const s = await getSession(ctx);
  await setSession(ctx, s?.step ?? "idle", { ...(s?.data ?? {}), sms_targets: targets });
  // Buttons carry the lead_id (stable), not a positional index — the target list
  // is regenerated on every agenda refresh, so an index could point at a
  // different lead. A UUID keeps callback_data well under Telegram's 64 bytes.
  const rows = targets.slice(0, 10).map((t: any) => [{
    text: `📩 ${t.name} · ${t.day} ${t.time}`.slice(0, 62), callback_data: `msg:${t.lead_id}`,
  }]);
  await send(ctx, "📩 <b>Enviar mensaje a un inquilino:</b>", rows);
}
async function chooseSmsLead(ctx: Ctx, messageId: number | undefined, leadId: string) {
  const session = await getSession(ctx);
  const t = (session?.data?.sms_targets || []).find((x: any) => x.lead_id === leadId);
  if (!t) { await editOrSend(ctx, messageId, "⌛ Esa lista expiró. Mandá <b>update</b> para ver la agenda de nuevo."); return; }
  const rows = [
    [{ text: "✅ Confirmar showing (en 30 min)", callback_data: `sms:${leadId}:conf` }],
    [{ text: "🚗 Estoy a 5 min", callback_data: `sms:${leadId}:5min` }],
    [{ text: "📍 Ya llegué", callback_data: `sms:${leadId}:here` }],
    [{ text: "📝 Link para aplicar (post-showing)", callback_data: `sms:${leadId}:apply` }],
  ];
  await editOrSend(ctx, messageId,
    `📩 <b>Mensaje para ${escapeHtml(t.name)}</b>\n📞 ${escapeHtml(t.phone)}\n🏠 ${escapeHtml(t.addr)}\n\nElegí el mensaje:`, rows);
}
const APPLY_LINK = "https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=CompanyLink";
function smsBody(tmpl: string, t: any): string {
  const first = String(t.name || "there").split(/\s+/)[0];
  const addr = t.addr || "the property";
  const time = t.time || "";
  switch (tmpl) {
    case "conf": return `Hi ${first}, confirming your showing today at ${time} — ${addr}. See you soon! Text me back if anything changes.`;
    case "5min": return `Hi ${first}, I'm about 5 minutes away from ${addr}. See you shortly!`;
    case "here": return `Hi ${first}, I'm here at ${addr} for your showing whenever you're ready.`;
    case "apply": return `Thanks for visiting ${addr}, ${first}! Ready to apply? Start here: ${APPLY_LINK}`;
    default: return `Hi ${first}!`;
  }
}
async function sendSmsTemplate(ctx: Ctx, messageId: number | undefined, rest: string) {
  // rest = "<lead_id>:<tmpl>" — lead_id is a UUID (no colon), so split on the first ":".
  const sep = rest.indexOf(":");
  const leadId = sep >= 0 ? rest.slice(0, sep) : rest;
  const tmpl = sep >= 0 ? rest.slice(sep + 1) : "";
  const session = await getSession(ctx);
  const t = (session?.data?.sms_targets || []).find((x: any) => x.lead_id === leadId);
  if (!t) { await editOrSend(ctx, messageId, "⌛ Esa lista expiró. Mandá <b>update</b> de nuevo."); return; }
  const body = smsBody(tmpl || "", t);
  const tel = String(t.phone).replace(/[^\d+]/g, "");
  // Telegram treats sms: links as a call on iOS and rejects sms: in URL buttons,
  // so the button points at a redirect page on the SITE domain (Supabase edge
  // fns are forced to text/plain and can't serve renderable HTML). That page
  // runs in a real browser where sms: works → opens Messages prefilled.
  const openUrl = `https://rentfindercleveland.com/sms-redirect.html?to=${encodeURIComponent(tel)}&body=${encodeURIComponent(body)}`;
  const msg = [
    `📩 <b>${escapeHtml(t.name)}</b> — mensaje listo:`,
    ``,
    `<code>${escapeHtml(body)}</code>`,
    ``,
    `👇 Tocá el botón: abre <b>Mensajes</b> con el texto ya escrito.`,
  ].join("\n");
  await send(ctx, msg, [[{ text: "📲 Abrir Mensajes", url: openUrl }]]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reporte de showing (previos): pick → text → AI enrich → optional photo → save
// ═══════════════════════════════════════════════════════════════════════════════
async function startShowingReport(ctx: Ctx, messageId: number | undefined) {
  const nowIso = new Date().toISOString();
  const { data: shows } = await ctx.supabase
    .from("showings")
    .select(`id, scheduled_at, status, lead_id,
      leads:lead_id ( full_name, first_name, last_name ),
      properties:property_id ( address, unit_number, city )`)
    .eq("organization_id", ctx.organizationId)
    .lt("scheduled_at", nowIso)
    .not("status", "in", "(cancelled,rescheduled)")
    .order("scheduled_at", { ascending: false })
    .limit(10);
  const list = (shows || []).map((s: any) => {
    const l = s.leads || {}; const p = s.properties || {};
    return {
      id: s.id,
      lead_id: s.lead_id,
      name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Lead",
      addr: p.address ? `${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}${p.city ? `, ${p.city}` : ""}` : "—",
      when: `${new Date(s.scheduled_at).toLocaleDateString("en-US", { timeZone: NY, month: "short", day: "numeric" })} ${new Date(s.scheduled_at).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit", hour12: true })}`,
    };
  });
  if (!list.length) { await editOrSend(ctx, messageId, "📭 No hay showings previos para reportar."); return; }
  await setSession(ctx, "sr_pick", { sr_list: list });
  // A button chip truncates the address, so full details go in the TEXT and the
  // buttons are just compact numbers (rows of 4). Address is always readable.
  const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
  const shown = list.slice(0, 8);
  const lines = ["📝 <b>Reporte de showing</b> — elegí cuál (por número):"];
  const rows: any[][] = [];
  let btnRow: any[] = [];
  shown.forEach((s: any, i: number) => {
    lines.push("", `${nums[i]} 🏠 <b>${escapeHtml(s.addr)}</b>`, `      👤 ${escapeHtml(s.name)} · 📅 ${escapeHtml(s.when)}`);
    btnRow.push({ text: nums[i], callback_data: `srx:${s.id}` });
    if (btnRow.length === 4) { rows.push(btnRow); btnRow = []; }
  });
  if (btnRow.length) rows.push(btnRow);
  rows.push([{ text: "❌ Cancelar", callback_data: "m:x" }]);
  await editOrSend(ctx, messageId, lines.join("\n"), rows);
}
async function chooseShowingToReport(ctx: Ctx, messageId: number | undefined, showingId: string) {
  const session = await getSession(ctx);
  const s = (session?.data?.sr_list || []).find((x: any) => x.id === showingId);
  if (!s) { await editOrSend(ctx, messageId, "⌛ Esa lista expiró. Mandá <b>menu</b> y probá de nuevo."); return; }
  await setSession(ctx, "sr_attend", { ...session.data, sr_id: s.id, sr_lead_id: s.lead_id, sr_name: s.name, sr_addr: s.addr, sr_report: undefined, sr_photo: undefined, sr_status: undefined });
  await editOrSend(ctx, messageId,
    `📝 <b>${escapeHtml(s.name)}</b>\n🏠 ${escapeHtml(s.addr)}\n\n¿El prospecto <b>asistió</b> al showing?`,
    [[{ text: "✅ Sí, asistió", callback_data: "sra:show" }], [{ text: "❌ No asistió (no-show)", callback_data: "sra:no" }], [{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}
async function setReportAttendance(ctx: Ctx, messageId: number | undefined, attended: boolean) {
  const session = await getSession(ctx);
  const d = session?.data || {};
  if (!d.sr_id) { await editOrSend(ctx, messageId, "⌛ Se perdió la selección. Mandá <b>menu</b>."); return; }
  await setSession(ctx, "sr_text", { ...d, sr_status: attended ? "completed" : "no_show" });
  const prompt = attended
    ? "✍️ Escribí cómo estuvo (interés del prospecto, objeciones, próximos pasos…)."
    : "✍️ Escribí qué pasó (no-show, intentos de contacto, próximos pasos…).";
  await editOrSend(ctx, messageId,
    `📝 <b>${escapeHtml(d.sr_name)}</b> · ${attended ? "✅ Asistió" : "❌ No asistió"}\n\n${prompt}`,
    [[{ text: "❌ Cancelar", callback_data: "m:x" }]]);
}
async function handleShowingReportText(ctx: Ctx, session: Session, raw: string) {
  const text = String(raw).trim().slice(0, 3000);
  if (text.length < 3) { await send(ctx, "Escribí un poco más de detalle 🙂"); return; }
  await setSession(ctx, "sr_review", { ...(session.data || {}), sr_report: text });
  await showReportReview(ctx, undefined);
}
async function showReportReview(ctx: Ctx, messageId: number | undefined) {
  const session = await getSession(ctx);
  const d = session?.data || {};
  if (!d.sr_report) { await editOrSend(ctx, messageId, "⌛ Se perdió el reporte. Mandá <b>menu</b>."); return; }
  // Centralize the step invariant so EVERY entry (incl. "◀️ Volver" from photo)
  // lands on sr_review — otherwise a stray text got the wrong nudge.
  if (session?.step !== "sr_review") await setSession(ctx, "sr_review", d);
  const rows = [
    [{ text: "✨ Enriquecer con IA", callback_data: "sre" }],
    [{ text: d.sr_photo ? "📷 Cambiar foto" : "📷 Agregar foto", callback_data: "srp" }],
    [{ text: "💾 Guardar en el showing", callback_data: "srs" }],
    [{ text: "❌ Cancelar", callback_data: "m:x" }],
  ];
  const attend = d.sr_status === "completed" ? "\n✅ Asistió" : d.sr_status === "no_show" ? "\n❌ No asistió (no-show)" : "";
  await editOrSend(ctx, messageId,
    `📝 <b>Reporte — ${escapeHtml(d.sr_name)}</b>\n🏠 ${escapeHtml(d.sr_addr)}${attend}${d.sr_photo ? "\n📷 Foto adjunta ✓" : ""}\n\n${escapeHtml(d.sr_report)}`, rows);
}
async function enrichReport(ctx: Ctx, messageId: number | undefined) {
  const session = await getSession(ctx);
  const d = session?.data || {};
  if (!d.sr_report) { await editOrSend(ctx, messageId, "No hay texto para enriquecer."); return; }
  await editOrSend(ctx, messageId, "✨ Enriqueciendo con IA…");
  try {
    const resp = await fetch(`${ctx.supabaseUrl}/functions/v1/enhance-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}` },
      body: JSON.stringify({ report_text: d.sr_report, property_address: d.sr_addr, organization_id: ctx.organizationId }),
    });
    const j = await resp.json().catch(() => ({}));
    const enhanced = resp.ok ? j.enhanced_text : null;
    if (!enhanced) { await setSession(ctx, "sr_review", d); await showReportReview(ctx, undefined); await send(ctx, "⚠️ No pude enriquecer ahora; te dejo el texto original."); return; }
    await setSession(ctx, "sr_review", { ...d, sr_report: enhanced });
    await showReportReview(ctx, undefined);
  } catch (e) {
    console.error("enrichReport", e);
    await setSession(ctx, "sr_review", d);
    await showReportReview(ctx, undefined);
  }
}
async function askForPhoto(ctx: Ctx, messageId: number | undefined) {
  const session = await getSession(ctx);
  if (!session?.data?.sr_id) { await editOrSend(ctx, messageId, "⌛ Se perdió el reporte. Mandá <b>menu</b>."); return; }
  await setSession(ctx, "sr_photo", { ...session.data });
  await editOrSend(ctx, messageId, "📷 Enviá la <b>foto</b> ahora (como imagen).", [[{ text: "◀️ Volver", callback_data: "srb" }]]);
}
async function handlePhoto(ctx: Ctx, message: any) {
  const session = await getSession(ctx);
  if (session?.step !== "sr_photo" || !session?.data?.sr_id) return; // only during the report flow
  const photos = message.photo || [];
  const largest = photos[photos.length - 1];
  if (!largest?.file_id) { await send(ctx, "No pude leer la foto. Probá de nuevo."); return; }
  await typing(ctx);
  try {
    const gf = await fetch(`https://api.telegram.org/bot${ctx.botToken}/getFile?file_id=${largest.file_id}`);
    const filePath = (await gf.json())?.result?.file_path;
    if (!filePath) throw new Error("no file_path");
    const dl = await fetch(`https://api.telegram.org/file/bot${ctx.botToken}/${filePath}`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const ext = (String(filePath).split(".").pop() || "jpg").toLowerCase();
    const key = `showing-reports/${session.data.sr_id}-${Date.now()}.${ext === "png" ? "png" : "jpg"}`;
    const { error: upErr } = await ctx.supabase.storage.from("property-photos")
      .upload(key, bytes, { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = ctx.supabase.storage.from("property-photos").getPublicUrl(key);
    await setSession(ctx, "sr_review", { ...session.data, sr_photo: pub?.publicUrl });
    await send(ctx, "📷 Foto agregada ✓");
    await showReportReview(ctx, undefined);
  } catch (e) {
    console.error("handlePhoto", e);
    await send(ctx, "❌ No pude subir la foto. Probá de nuevo o guardá sin foto.");
  }
}
async function saveShowingReport(ctx: Ctx, messageId: number | undefined) {
  const session = await getSession(ctx);
  const d = session?.data || {};
  if (!d.sr_id || !d.sr_report) { await editOrSend(ctx, messageId, "⌛ Se perdió el reporte. Mandá <b>menu</b>."); return; }
  const upd: Record<string, any> = { agent_report: d.sr_report };
  if (d.sr_photo) upd.agent_report_photo_url = d.sr_photo;
  // Flip the showing status from 'scheduled' so it stops showing as "agendado"
  // in the leasing tracker. Attended → completed (+ completed_at); else no_show.
  if (d.sr_status === "completed") { upd.status = "completed"; upd.completed_at = new Date().toISOString(); }
  else if (d.sr_status === "no_show") { upd.status = "no_show"; }
  const { error } = await ctx.supabase.from("showings").update(upd)
    .eq("organization_id", ctx.organizationId).eq("id", d.sr_id);
  if (error) { await editOrSend(ctx, messageId, `❌ No pude guardar: ${escapeHtml(error.message)}`); return; }
  // When attended, advance the lead lifecycle out of showing_scheduled → showed.
  if (d.sr_status === "completed") {
    await ctx.supabase.from("leads").update({ status: "showed" })
      .eq("organization_id", ctx.organizationId).eq("id", d.sr_lead_id ?? "00000000-0000-0000-0000-000000000000")
      .eq("status", "showing_scheduled");
  }
  await clearSession(ctx);
  const statusLine = d.sr_status === "completed" ? " · marcado ✅ asistió" : d.sr_status === "no_show" ? " · marcado ❌ no-show" : "";
  await editOrSend(ctx, messageId,
    `✅ <b>Reporte guardado</b> en el showing de ${escapeHtml(d.sr_name)}${statusLine}.${d.sr_photo ? "\n📷 Con foto." : ""}`,
    [[{ text: "📝 Otro reporte", callback_data: "m:sr" }, { text: "🏠 Menú", callback_data: "m:menu" }]]);
}

// ── Existing agenda/report rendering ─────────────────────────────────────────────
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
    // Blank line between leads within a day (they were cramped edge-to-edge).
    items.forEach((s: any, i: number) => { if (i > 0) out.push(""); out.push(renderShowing(s)); });
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

  if (l.source_detail) lines.push(`   📝 ${escapeHtml(String(l.source_detail).slice(0, 300))}`);
  // Form answers as clean, ordered bullets (was a raw JSONB dump).
  for (const b of prefsLines(l.intake_preferences)) lines.push(`   • ${escapeHtml(b)}`);
  if (s.agent_report) lines.push(`   💬 ${escapeHtml(String(s.agent_report).slice(0, 300))}`);
  return lines.join("\n");
}

// Clean, ordered render of the intake-form quiz answers. Budget + voucher +
// move-in already appear in `bits` above, so they're not repeated here.
// Adapted from submit-application's buildIntakeNote.
function prefsLines(prefs: unknown): string[] {
  if (!prefs || typeof prefs !== "object") return [];
  const p = prefs as Record<string, any>;
  const out: string[] = [];
  if (p.household_size != null) out.push(`👥 ${p.household_size} en el hogar`);
  if (Array.isArray(p.property_types) && p.property_types.length) out.push(`🏘️ ${p.property_types.join(", ")}`);
  if (p.pets) out.push(`🐾 Mascotas: ${p.pets}`);
  if (p.income_source) out.push(`💼 ${p.income_source}`);
  if (p.move_urgency) out.push(`⏱️ ${p.move_urgency}`);
  if (p.fee_acknowledged) out.push(`✅ Aceptó fee $50 + Términos`);
  return out;
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
