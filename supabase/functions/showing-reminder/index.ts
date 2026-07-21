import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatTime12(isoOrSlotTime: string): string {
  // Handle HH:mm:ss slot_time format
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(isoOrSlotTime)) {
    const [h, m] = isoOrSlotTime.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${display}:${m} ${ampm}`;
  }
  // Handle ISO date string
  const d = new Date(isoOrSlotTime);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// N Cleveland days ahead at 09:00, as UTC ISO. DST-safe: 9 AM is well past the
// 2 AM switch, so the noon-sampled offset of that date is always correct.
function plusDays9amET(days: number): string {
  const TZ = "America/New_York";
  const todayNY = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const t = new Date(`${todayNY}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  const dateStr = t.toISOString().slice(0, 10);
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Date(noon.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = noon.getTime() - localNoon.getTime();
  return new Date(new Date(`${dateStr}T09:00:00Z`).getTime() + offsetMs).toISOString();
}
function nextDay9amET(): string { return plusDays9amET(1); }

// Cleveland midnight (today) as UTC ISO — dedup marker boundary for the daily
// queue summary (noon-sampled offset; ±1h on the 2 DST days is harmless here).
function todayMidnightET(): string {
  const TZ = "America/New_York";
  const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Date(noon.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = noon.getTime() - localNoon.getTime();
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs).toISOString();
}
// Case-insensitive (matches telegram-webhook's copy — the parser has emitted
// both "Hemlane Lead" and "Hemlane lead").
function isShellName(n: unknown): boolean {
  const s = String(n ?? "").trim();
  const low = s.toLowerCase();
  return !s || low.startsWith("hemlane lead") || s.includes("{") ||
    low.startsWith("detail") || /\d{7,}/.test(s);
}

// QUEUE MODEL (2026-07-19): due reminders STAY `pending` until the user works
// them in the Funnel gestión queue — accumulation is inherent, so there are no
// per-card sends and no auto-rollover re-arms anymore. This dispatcher:
// (a) every tick: closes due reminders whose lead died;
// (b) at/after 9 AM Cleveland, once per Cleveland day and per org: sends ONE
//     "⏰ N seguimientos + 🆕 M nuevos → Gestionar" summary. The summary fires
//     even with zero reminders (fresh-leads-only days count too).
async function dispatchLeadReminders(
  supabase: any, supabaseUrl: string, serviceRoleKey: string,
): Promise<number> {
  let sent = 0;
  try {
    const nowIso = new Date().toISOString();

    // ── Cleanup pass (every tick) ──
    const { data: dueReminders } = await supabase
      .from("lead_reminders")
      .select("id, organization_id, leads:lead_id(id, phone, status, is_demo)")
      .eq("status", "pending")
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(100);
    for (const r of dueReminders || []) {
      const l = (r as any).leads;
      const phone = String(l?.phone ?? "").trim();
      if (!l || !phone || ["lost", "converted"].includes(l.status || "") || l.is_demo) {
        await supabase.from("lead_reminders").update({ status: "skipped", sent_at: nowIso }).eq("id", r.id);
      }
    }

    // ── Daily summary: only at/after 9 AM Cleveland (a due_at<=now filter with
    // a midnight marker window would otherwise fire at ~00:00 whenever
    // yesterday's reminders carried over) ──
    const hourET = parseInt(new Date().toLocaleString("en-US", {
      timeZone: "America/New_York", hour: "2-digit", hour12: false,
    }), 10) % 24;
    if (hourET < 9) return 0;

    const todayStartUtc = todayMidnightET();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    // Org set independent of reminders (single tenant in practice).
    const { data: orgs } = await supabase.from("organizations").select("id").limit(5);
    for (const org of orgs || []) {
      const orgId = org.id;
      const { data: marker } = await supabase.from("system_logs").select("id")
        .eq("organization_id", orgId).eq("event_type", "queue_summary_sent")
        .gte("created_at", todayStartUtc).limit(1).maybeSingle();
      if (marker) continue;

      const [remCntRes, freshLeadsRes] = await Promise.all([
        supabase.from("lead_reminders").select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).eq("status", "pending").lte("due_at", nowIso)
          .neq("reason", "closing"),
        supabase.from("leads").select("id, full_name")
          .eq("organization_id", orgId).eq("is_demo", false).eq("status", "new")
          .is("managed_at", null).not("phone", "is", null)
          .gte("created_at", sevenDaysAgo).limit(200),
      ]);
      const reminders = remCntRes.count || 0;
      const fresh = ((freshLeadsRes.data || []) as any[]).filter((l) => !isShellName(l.full_name)).length;
      if (reminders + fresh === 0) continue;

      const resp = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          organization_id: orgId,
          channel: "funnel",
          event: "leads_batch",
          payload: { reminders, fresh },
        }),
      });
      // telegram-notify ALWAYS returns HTTP 200 — real success is the body {ok}.
      const jr = await resp.json().catch(() => ({}));
      if (resp.ok && jr?.ok === true) {
        sent++;
        await supabase.from("system_logs").insert({
          organization_id: orgId, level: "info", category: "general",
          event_type: "queue_summary_sent",
          message: `Queue summary: ${reminders} reminders + ${fresh} fresh leads`,
          details: { reminders, fresh },
        });
      }
    }
  } catch (remErr) {
    console.error("lead_reminders dispatch error:", remErr);
  }

  // ── 🚀 Closing cadence: toured-but-not-applied pushes (D+1 · D+3 · D+7) ───
  // Chained 'closing' reminders → a push card on the Showings (field) bot with
  // the apply toolkit. Self-cleaning: applied/lost/converted leads are skipped.
  // Push 3 carries the archive-or-recapture decision.
  try {
    const nowIso2 = new Date().toISOString();
    const { data: dueClosing } = await supabase.from("lead_reminders")
      .select("id, organization_id, attempt, lead_id, leads:lead_id(id, full_name, first_name, last_name, phone, status)")
      .eq("status", "pending").eq("reason", "closing")
      .lte("due_at", nowIso2)
      .order("due_at", { ascending: true }).limit(30);
    const credsCache = new Map<string, { tok?: string; chat?: string }>();
    for (const r of (dueClosing || []) as any[]) {
      const l = r.leads;
      const phone = String(l?.phone ?? "").trim();
      // Exit conditions: applied, converted, lost, phoneless, gone.
      if (!l || !phone || ["in_application", "converted", "lost"].includes(l.status || "")) {
        await supabase.from("lead_reminders").update({ status: "skipped", sent_at: nowIso2 }).eq("id", r.id);
        continue;
      }
      if (!credsCache.has(r.organization_id)) {
        const { data: c } = await supabase.from("organization_credentials")
          .select("telegram_showings_bot_token, telegram_showings_chat_id")
          .eq("organization_id", r.organization_id).maybeSingle();
        credsCache.set(r.organization_id, { tok: c?.telegram_showings_bot_token, chat: c?.telegram_showings_chat_id });
      }
      const cc = credsCache.get(r.organization_id)!;
      if (!cc.tok || !cc.chat) continue;

      const { data: sh } = await supabase.from("showings")
        .select("scheduled_at, properties:property_id(address)")
        .eq("lead_id", l.id).eq("status", "completed")
        .order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
      const days = sh ? Math.max(1, Math.round((Date.now() - new Date(sh.scheduled_at).getTime()) / 86400000)) : Number(r.attempt) || 1;
      const nm = (x: any) => x?.full_name || [x?.first_name, x?.last_name].filter(Boolean).join(" ") || "Lead";
      const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const attempt = Number(r.attempt) || 1;
      const lines = [
        `🚀 <b>Cierre ${attempt}/3</b> — ${esc(nm(l))}`,
        `Toureó${sh?.properties?.address ? ` ${esc(sh.properties.address)}` : ""} hace ${days} día${days === 1 ? "" : "s"} y todavía no aplica.`,
        `📞 ${esc(phone)}`,
      ];
      if (attempt >= 3) lines.push(``, `Último push — si no responde, decidí abajo 👇`);
      const kb: any[][] = [
        [{ text: "✉️ Email para aplicar", callback_data: `aem:${l.id}:ap2` }],
        [{ text: "💬 SMS para aplicar", callback_data: `asms:${l.id}:ap` }],
        [{ text: "📋 Más acciones", callback_data: `act:menu:${l.id}` }],
      ];
      if (attempt >= 3) {
        kb.push([{ text: "☠️ Archivar", callback_data: `cz:arch:${l.id}` },
                 { text: "🔄 Devolver a 🎯", callback_data: `cz:back:${l.id}` }]);
      }
      const resp = await fetch(`https://api.telegram.org/bot${cc.tok}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cc.chat, text: lines.join("\n"), parse_mode: "HTML",
          disable_web_page_preview: true, reply_markup: { inline_keyboard: kb },
        }),
      }).catch(() => undefined);
      if (resp?.ok) {
        await supabase.from("lead_reminders").update({ status: "sent", sent_at: nowIso2 }).eq("id", r.id);
        // Chain the next push: D+1 → D+3 (+2 days) → D+7 (+4 days). Push 3 ends
        // the chain — the decision buttons take over.
        if (attempt < 3) {
          await supabase.from("lead_reminders").insert({
            organization_id: r.organization_id, lead_id: l.id,
            due_at: plusDays9amET(attempt === 1 ? 2 : 4), reason: "closing",
            attempt: attempt + 1, status: "pending",
          });
        }
      }
    }
  } catch (czErr) {
    console.error("closing cadence error:", czErr);
  }

  // ── 8 PM day recap on the Showings (field-assistant) bot ──────────────────
  // "Después de que acaba el día, cuenta qué pasó": today's showings with
  // asistió/no-show/unresolved, plus one-tap resolution buttons (psw:) for the
  // unresolved ones. Once per Cleveland day, only when there WERE showings.
  try {
    const hourET2 = parseInt(new Date().toLocaleString("en-US", {
      timeZone: "America/New_York", hour: "2-digit", hour12: false,
    }), 10) % 24;
    if (hourET2 >= 20) {
      const TZ2 = "America/New_York";
      const dayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ2 });
      const noon = new Date(`${dayStr}T12:00:00Z`);
      const offsetMs = noon.getTime() - new Date(noon.toLocaleString("en-US", { timeZone: TZ2 })).getTime();
      const dayStart = new Date(new Date(`${dayStr}T00:00:00Z`).getTime() + offsetMs).toISOString();
      const dayEnd = new Date(new Date(`${dayStr}T00:00:00Z`).getTime() + offsetMs + 86400000).toISOString();

      const { data: orgs2 } = await supabase.from("organizations").select("id").limit(5);
      for (const org of orgs2 || []) {
        const orgId = org.id;
        const { data: marker } = await supabase.from("system_logs").select("id")
          .eq("organization_id", orgId).eq("event_type", "day_recap_sent")
          .gte("created_at", dayStart).limit(1).maybeSingle();
        if (marker) continue;

        const { data: shows } = await supabase.from("showings")
          .select(`id, scheduled_at, status,
            leads:lead_id ( id, full_name, first_name, last_name ),
            properties:property_id ( address )`)
          .eq("organization_id", orgId)
          .gte("scheduled_at", dayStart).lt("scheduled_at", dayEnd)
          .not("status", "in", "(cancelled,rescheduled)")
          .order("scheduled_at", { ascending: true }).limit(15);
        const rows = (shows || []) as any[];
        if (!rows.length) continue; // no showings today → no recap

        const { data: creds } = await supabase.from("organization_credentials")
          .select("telegram_showings_bot_token, telegram_showings_chat_id")
          .eq("organization_id", orgId).maybeSingle();
        if (!creds?.telegram_showings_bot_token || !creds?.telegram_showings_chat_id) continue;

        const nm = (l: any) => l?.full_name || [l?.first_name, l?.last_name].filter(Boolean).join(" ") || "Lead";
        const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const done = rows.filter((r) => r.status === "completed").length;
        const ghost = rows.filter((r) => r.status === "no_show").length;
        const open = rows.filter((r) => !["completed", "no_show"].includes(r.status));
        const lines = [
          `📊 <b>Así terminó el día</b> — ${rows.length} showing${rows.length === 1 ? "" : "s"}`,
          `✅ ${done} asistieron · 👻 ${ghost} no fueron${open.length ? ` · 🕒 ${open.length} sin resolver` : ""}`,
          ``,
        ];
        for (const r of rows) {
          const time = new Date(r.scheduled_at).toLocaleTimeString("en-US", { timeZone: TZ2, hour: "numeric", minute: "2-digit", hour12: true });
          const st = r.status === "completed" ? "✅" : r.status === "no_show" ? "👻" : "🕒";
          lines.push(`${st} <b>${time}</b> — ${esc(nm(r.leads))} · ${esc(r.properties?.address ?? "")}`);
        }
        if (open.length) lines.push(``, `👇 Resolvé los pendientes — un tap:`);
        const kb: any[][] = open.slice(0, 8).map((r) => [{
          text: `🕒 ${nm(r.leads)} · ¿asistió?`.slice(0, 62), callback_data: `psw:${r.id}`,
        }]);
        kb.push([{ text: "🏁 Showings recientes", callback_data: "m:ps" }]);

        const resp = await fetch(`https://api.telegram.org/bot${creds.telegram_showings_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: creds.telegram_showings_chat_id, text: lines.join("\n"),
            parse_mode: "HTML", disable_web_page_preview: true,
            reply_markup: { inline_keyboard: kb },
          }),
        }).catch(() => undefined);
        if (resp?.ok) {
          await supabase.from("system_logs").insert({
            organization_id: orgId, level: "info", category: "general",
            event_type: "day_recap_sent",
            message: `Day recap: ${rows.length} showings (${done} ok, ${ghost} no-show, ${open.length} open)`,
            details: { total: rows.length, completed: done, no_show: ghost, open: open.length },
          });
        }
      }
    }
  } catch (recapErr) {
    console.error("day recap error:", recapErr);
  }
  return sent;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Require service-role or admin authenticated caller ─────────
  {
    const _srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const _ak = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const _tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (_tok !== _srk) {
      if (!_tok || _tok === _ak) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, _srk);
      const { data: _auth } = await _sb.auth.getUser(_tok);
      if (!_auth?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: _u } = await _sb.from("users").select("role, is_active").eq("auth_user_id", _auth.user.id).maybeSingle();
      if (!_u || _u.is_active === false || !["super_admin","admin"].includes(_u.role || "")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  }


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Due follow-up reminders run FIRST + unconditionally — they must not be
    // gated by whether any showing happens to be in the 25-35 min window below.
    const remindersSent = await dispatchLeadReminders(supabase, supabaseUrl, serviceRoleKey);

    // Get current time in Cleveland (America/New_York)
    const now = new Date();

    // Calculate the window: showings between 25 and 35 minutes from now
    const windowStart = new Date(now.getTime() + 25 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 35 * 60 * 1000);

    // Convert to Cleveland date/time for slot matching
    const toCleDateStr = (d: Date) =>
      d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const toCleTimeStr = (d: Date) =>
      d.toLocaleTimeString("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + ":00";

    // We need to find showings where scheduled_at is in the window
    const { data: showings, error: showingsErr } = await supabase
      .from("showings")
      .select(`
        id, scheduled_at, status, duration_minutes, lead_id, property_id, organization_id,
        properties(address, unit_number, city, state, zip_code, rent_price, bedrooms, bathrooms, section_8_accepted),
        leads(full_name, phone, email, has_voucher)
      `)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString());

    if (showingsErr) {
      console.error("Error fetching showings:", showingsErr);
      return new Response(JSON.stringify({ error: showingsErr.message, reminders_sent: remindersSent }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!showings || showings.length === 0) {
      console.log("Showing reminder: no showings in the 25-35 min window");
      return new Response(JSON.stringify({ sent: 0, message: "No showings in window", reminders_sent: remindersSent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Showing reminder: found ${showings.length} showing(s) in window`);

    let sent = 0;

    // Group by organization
    const orgShowings = new Map<string, typeof showings>();
    for (const s of showings) {
      const orgId = s.organization_id;
      if (!orgShowings.has(orgId)) orgShowings.set(orgId, []);
      orgShowings.get(orgId)!.push(s);
    }

    for (const [orgId, orgShows] of orgShowings) {
      // Check if already reminded (look in system_logs)
      const showingIds = orgShows.map((s: any) => s.id);
      const { data: existingLogs } = await supabase
        .from("system_logs")
        .select("details")
        .eq("organization_id", orgId)
        .eq("event_type", "showing_reminder_sent")
        .gte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());

      const alreadyReminded = new Set<string>();
      for (const log of existingLogs || []) {
        if ((log.details as any)?.showing_id) {
          alreadyReminded.add((log.details as any).showing_id);
        }
      }

      // Resolve the SHOWINGS (field-assistant) bot — the 30-min card belongs
      // with the rest of the showing-day flow (closing cadence, 8 PM recap,
      // post-tour resolution), not on the Setter, whose job is booking
      // (owner decision 2026-07-21). Falls back to the general bot — never to
      // the Setter. Values may be JSON-encoded.
      const [{ data: creds }, { data: settings }] = await Promise.all([
        supabase
          .from("organization_credentials")
          .select("telegram_bot_token, telegram_chat_id, telegram_showings_bot_token, telegram_showings_chat_id")
          .eq("organization_id", orgId)
          .maybeSingle(),
        // Legacy fallback only — bot creds moved into organization_credentials.
        supabase
          .from("organization_settings")
          .select("key, value")
          .eq("organization_id", orgId)
          .in("key", ["telegram_showings_bot_token", "telegram_showings_chat_id"]),
      ]);

      const unwrapVal = (v: unknown) => {
        if (v == null) return undefined;
        const str = String(v);
        try { const p = JSON.parse(str); return typeof p === "string" ? p : str; } catch { return str; }
      };
      const settingsMap = new Map((settings || []).map((s: any) => [s.key, unwrapVal(s.value)]));
      // Pair token+chat ATOMICALLY — never mix one bot's token with another's chat.
      const shwTok = creds?.telegram_showings_bot_token || settingsMap.get("telegram_showings_bot_token");
      const shwChat = creds?.telegram_showings_chat_id || settingsMap.get("telegram_showings_chat_id");
      const useShowings = !!shwTok && !!shwChat;
      const botToken = (useShowings ? shwTok : creds?.telegram_bot_token) as string;
      const chatId = (useShowings ? shwChat : creds?.telegram_chat_id) as string;
      // rmd:/act: buttons are only wired on the Showings bot — omit them on the
      // general-bot fallback rather than shipping taps that silently redirect.
      const canAct = useShowings;

      if (!botToken || !chatId) {
        console.log(`Showing reminder: org ${orgId} has no showings bot configured, skipping`);
        continue;
      }

      for (const showing of orgShows) {
        if (alreadyReminded.has(showing.id)) {
          console.log(`Showing reminder: ${showing.id} already reminded, skipping`);
          continue;
        }

        const prop = showing.properties as any;
        const lead = showing.leads as any;
        const d = new Date(showing.scheduled_at);
        const timeStr = formatTime12(showing.scheduled_at);
        const dateStr = formatDateShort(
          d.toLocaleDateString("en-CA", { timeZone: "America/New_York" })
        );

        const address = prop?.address || "Unknown";
        const unit = prop?.unit_number ? ` #${prop.unit_number}` : "";
        const city = prop?.city || "";
        const fullAddr = `${address}${unit}${city ? `, ${city}` : ""}`;
        const rentStr = prop?.rent_price
          ? `$${Number(prop.rent_price).toLocaleString()}/mo`
          : "";
        const beds = prop?.bedrooms ? `${prop.bedrooms}bd` : "";
        const baths = prop?.bathrooms ? `${Number(prop.bathrooms)}ba` : "";
        const specs = [beds, baths, rentStr].filter(Boolean).join(" · ");
        const s8 = prop?.section_8_accepted ? "✅ Section 8" : "";

        const leadName = lead?.full_name || "Unknown";
        const leadPhone = lead?.phone || "—";
        const leadEmail = lead?.email || "";
        const voucher = lead?.has_voucher === true ? "🎫 Voucher" : lead?.has_voucher === false ? "💵 Self-pay" : "";

        const mapsQuery = encodeURIComponent(
          `${prop?.address || ""}, ${prop?.city || ""}, ${prop?.state || ""} ${prop?.zip_code || ""}`
        );

        const msg = [
          `⏰ <b>Showing in 30 min!</b>`,
          ``,
          `📍 <b>${fullAddr}</b>`,
          specs ? `🏠 ${specs}` : "",
          s8 || "",
          `📅 ${dateStr} at ${timeStr}`,
          ``,
          `👤 <b>${leadName}</b>${voucher ? ` — ${voucher}` : ""}`,
          `📞 ${leadPhone}`,
          leadEmail ? `✉️ ${leadEmail}` : "",
          ``,
          `🗺 <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}">Navigate with Google Maps</a>`,
          `📱 <a href="tel:${leadPhone}">Call ${leadName.split(" ")[0]}</a>`,
        ]
          .filter(Boolean)
          .join("\n");

        // The confirmation call has two outcomes — resolve it with one tap.
        // `rmd:` lives in telegram-webhook (Showings bot); `act:vc:` is the
        // shared save-contact action, allowed on every bot.
        const keyboard = canAct
          ? [
              [{ text: "✅ Confirmó", callback_data: `rmd:c:${showing.id}` },
               { text: "🔄 Reagendar", callback_data: `rmd:r:${showing.id}` }],
              // A lead-less showing (rare, but the FK is nullable) gets no
              // save-contact row — the callback would be a dead tap.
              ...(showing.lead_id
                ? [[{ text: "👤 Agregar contacto", callback_data: `act:vc:${showing.lead_id}` }]]
                : []),
            ]
          : undefined;

        const tgResp = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: msg,
              parse_mode: "HTML",
              disable_web_page_preview: true,
              ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
            }),
          }
        );

        if (tgResp.ok) {
          sent++;
          console.log(`Showing reminder sent for ${showing.id}: ${leadName} at ${address}`);

          // Log to prevent duplicate reminders
          await supabase.from("system_logs").insert({
            organization_id: orgId,
            level: "info",
            category: "general",
            event_type: "showing_reminder_sent",
            message: `30-min reminder sent: ${leadName} at ${address} (${timeStr})`,
            related_lead_id: showing.lead_id,
            related_showing_id: showing.id,
            details: { showing_id: showing.id },
          });
        } else {
          const errText = await tgResp.text();
          console.error(`Telegram send failed for ${showing.id}: ${errText}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ sent, total: showings.length, reminders_sent: remindersSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Showing reminder error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
