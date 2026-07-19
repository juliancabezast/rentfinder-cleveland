import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// agent-daily-report
//
// Replaces the hourly Telegram report with two scheduled sends on the RFC
// (general) bot:
//   mode "morning"  → 5:00 AM ET: yesterday's numbers + week/month comparisons
//                     + QuickChart comparison charts (daily/weekly/monthly).
//   mode "evening"  → 9:00 PM ET: day digest — leads in today, Hemlane digest
//                     aggregate (nutridos), live pipeline ("en proceso").
//
// Cron fires at BOTH possible UTC hours (DST shifts them); the Cleveland-hour
// gate below picks the right one and the same-day idempotency guard makes the
// double-fire harmless. Manual runs pass force:true to skip the gate.
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TZ = "America/New_York";

const SOURCE_LABELS: Record<string, string> = {
  inbound_call: "inbound call",
  hemlane_email: "Hemlane",
  hemlane: "Hemlane",
  website: "website",
  referral: "referral",
  manual: "manual",
  sms: "SMS",
  campaign: "campaign",
  csv_import: "CSV import",
};

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// Redact any api.telegram.org bot token before logging a raw error/URL.
function redactToken(v: unknown): string {
  return String(v ?? "").replace(/bot\d+:[\w-]+/g, "bot<redacted>");
}

// ── Time helpers (DST-aware; never a fixed offset) ──────────────────────────
// Cleveland midnight → UTC. The offset is sampled at NOON as a first guess and
// then re-verified AT the candidate midnight instant: on DST-transition days
// (switch at 2 AM) the noon offset is the post-switch one and would land the
// boundary an hour off. The round-trip check picks the true midnight.
function localMidnightToUtc(dateStr: string): string {
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Date(noon.toLocaleString("en-US", { timeZone: TZ }));
  const guessOffset = noon.getTime() - localNoon.getTime();
  const base = new Date(`${dateStr}T00:00:00Z`).getTime();
  // Candidates: noon-sampled offset and its DST neighbors (±1h).
  for (const off of [guessOffset, guessOffset - 3600000, guessOffset + 3600000]) {
    const cand = new Date(base + off);
    const rendered = cand.toLocaleString("sv-SE", { timeZone: TZ }); // "YYYY-MM-DD HH:mm:ss"
    if (rendered.startsWith(`${dateStr} 00:00`)) return cand.toISOString();
  }
  return new Date(base + guessOffset).toISOString(); // unreachable fallback
}
function clevelandDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}
function clevelandHour(d: Date): number {
  return parseInt(d.toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }), 10) % 24;
}
function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDayEs(dateStr: string): string {
  const s = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("es-ES", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtMonthEs(ym: string): string {
  return new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: TZ, month: "short" });
}

// ▲ +12% / ▼ -8% / = vs a previous value.
function deltaBadge(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? "🆙 nuevo" : "=";
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return "=";
  return pct > 0 ? `▲ +${pct}%` : `▼ ${pct}%`;
}

// Render a report_source_breakdown RPC result. Sources are lead-supplied via a
// public endpoint → escape them (parse_mode:HTML would reject the message).
function renderSources(rows: { source?: string | null; cnt?: number }[], n = 4): string {
  return (rows || [])
    .slice(0, n)
    .map((r) => `${escapeHtml(SOURCE_LABELS[r.source || ""] || String(r.source || "otro").replace(/_/g, " "))} ${Number(r.cnt) || 0}`)
    .join(" · ");
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── QuickChart ──────────────────────────────────────────────────────────────
const INDIGO = "#4F46E5";
const GOLD = "#FFB22C";

function chartUrl(cfg: Record<string, unknown>, w = 900, h = 460): string {
  return `https://quickchart.io/chart?w=${w}&h=${h}&devicePixelRatio=2&format=png&backgroundColor=white&c=${encodeURIComponent(JSON.stringify(cfg))}`;
}

function dailyChart(series: { day: string; leads: number; showings: number }[]): string {
  // Drop the partial current day (sent at 5 AM it would chart as a fake collapse).
  const rows = series.slice(0, -1).slice(-14);
  return chartUrl({
    type: "bar",
    data: {
      labels: rows.map((r) => fmtDayEs(r.day).replace(",", "")),
      datasets: [
        { label: "Leads", data: rows.map((r) => r.leads), backgroundColor: INDIGO },
        { type: "line", label: "Showings", data: rows.map((r) => r.showings), borderColor: GOLD, backgroundColor: "rgba(255,178,44,.25)", fill: false, lineTension: 0.3 },
      ],
    },
    options: {
      title: { display: true, text: "Últimos 14 días — leads y showings" },
      legend: { position: "bottom" },
      scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }] },
    },
  });
}

function weeklyChart(series: { day: string; leads: number; showings: number }[]): string {
  // Group full Cleveland days into Monday-start weeks; drop the (partial) current day.
  const closed = series.slice(0, -1);
  const weeks: { label: string; leads: number; showings: number }[] = [];
  const byWeek: Record<string, { label: string; leads: number; showings: number }> = {};
  for (const r of closed) {
    const d = new Date(`${r.day}T12:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = shiftDateStr(r.day, -dow);
    if (!byWeek[monday]) {
      byWeek[monday] = { label: fmtDayEs(monday).replace(",", ""), leads: 0, showings: 0 };
      weeks.push(byWeek[monday]);
    }
    byWeek[monday].leads += r.leads;
    byWeek[monday].showings += r.showings;
  }
  const rows = weeks.slice(-8);
  return chartUrl({
    type: "bar",
    data: {
      labels: rows.map((r) => `Sem ${r.label}`),
      datasets: [
        { label: "Leads", data: rows.map((r) => r.leads), backgroundColor: INDIGO },
        { label: "Showings", data: rows.map((r) => r.showings), backgroundColor: GOLD },
      ],
    },
    options: {
      title: { display: true, text: "Comparación semanal — últimas 8 semanas" },
      legend: { position: "bottom" },
      scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }] },
    },
  });
}

function monthlyChart(months: { month: string; leads: number; showings: number }[]): string {
  return chartUrl({
    type: "bar",
    data: {
      // The current month is in-progress — star its label.
      labels: months.map((m, i) => fmtMonthEs(m.month) + (i === months.length - 1 ? "*" : "")),
      datasets: [
        { label: "Leads", data: months.map((m) => m.leads), backgroundColor: INDIGO },
        { label: "Showings", data: months.map((m) => m.showings), backgroundColor: GOLD },
      ],
    },
    options: {
      title: { display: true, text: "Comparación mensual — últimos 6 meses" },
      legend: { position: "bottom" },
      scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }] },
    },
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Internal-only: cron + telegram-webhook call with the service key. Accept it
  // from Authorization OR apikey (functions.invoke puts it in apikey — see the
  // send-notification-email 401 outage).
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") || "";
  if (bearer !== serviceRoleKey && apikey !== serviceRoleKey) {
    return json({ error: "unauthorized" }, 401);
  }

  let organizationId = "";
  let mode = "";
  try {
    const body = await req.json().catch(() => ({}));
    organizationId = body.organization_id || "";
    mode = body.mode === "evening" ? "evening" : "morning";
    const force = body.force === true;

    if (!organizationId) return json({ error: "Missing organization_id" }, 400);

    const now = new Date();
    const hourNY = clevelandHour(now);
    const targetHour = mode === "morning" ? 5 : 21;
    if (!force && hourNY !== targetHour) {
      return json({ skipped: "wrong_hour", cleveland_hour: hourNY, target: targetHour });
    }

    // Same-Cleveland-day idempotency (the cron fires at both candidate UTC hours).
    const eventType = mode === "morning" ? "daily_report_sent" : "evening_digest_sent";
    const today = clevelandDate(now);
    const todayStartUtc = localMidnightToUtc(today);
    if (!force) {
      const { data: dup } = await supabase
        .from("system_logs")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("event_type", eventType)
        .gte("created_at", todayStartUtc)
        .limit(1)
        .maybeSingle();
      if (dup) return json({ skipped: "already_sent_today" });
    }

    // ── RFC (general) bot credentials ──
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("organization_id", organizationId)
      .single();
    if (!creds?.telegram_bot_token || !creds?.telegram_chat_id) {
      return json({ error: "Telegram credentials not configured" }, 400);
    }
    const botToken = creds.telegram_bot_token as string;
    const chatId = creds.telegram_chat_id as string;

    const tg = async (method: string, payload: Record<string, unknown>) => {
      // fetch() rejections embed the URL — which contains the bot token — so
      // catch and redact instead of letting them reach logs/system_logs.
      const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((e) => {
        console.warn(`telegram ${method} network error:`, redactToken((e as Error)?.message));
        return undefined;
      });
      if (!r) return { ok: false, description: "network error" };
      const b = await r.json().catch(() => ({}));
      if (!b.ok) console.warn(`telegram ${method} failed:`, b.description || r.status);
      return b;
    };

    // ════════════════════════════════════════════════════════════════════
    if (mode === "morning") {
      const yday = shiftDateStr(today, -1);
      const ydayStartUtc = localMidnightToUtc(yday);

      const [seriesRes, monthsRes, ydaySourcesRes, ydayHotRes, ydayShowCompRes, ydayShowNSRes,
        ydayEmailsRes, ydaySmsRes, ydayConvRes, ydayCostsRes, hotAwaitingRes, backlogRes] = await Promise.all([
        supabase.rpc("report_time_series", { p_org: organizationId, p_days: 70 }),
        supabase.rpc("report_monthly_series", { p_org: organizationId, p_months: 6 }),
        // Source breakdown grouped in the DB (raw selects cap at 1000 rows silently).
        supabase.rpc("report_source_breakdown", { p_org: organizationId, p_since: ydayStartUtc, p_until: todayStartUtc, p_limit: 4 }),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .not("is_demo", "is", true).gte("lead_score", 50).gte("created_at", ydayStartUtc).lt("created_at", todayStartUtc),
        supabase.from("showings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .eq("status", "completed").gte("scheduled_at", ydayStartUtc).lt("scheduled_at", todayStartUtc),
        supabase.from("showings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .eq("status", "no_show").gte("scheduled_at", ydayStartUtc).lt("scheduled_at", todayStartUtc),
        // Counts queue-drained sends too (event_type='sent' alone misses ~99%).
        supabase.rpc("report_emails_sent", { p_org: organizationId, p_since: ydayStartUtc, p_until: todayStartUtc }),
        supabase.from("communications").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .eq("channel", "sms").eq("direction", "outbound").gte("sent_at", ydayStartUtc).lt("sent_at", todayStartUtc),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .not("is_demo", "is", true).gte("converted_at", ydayStartUtc).lt("converted_at", todayStartUtc),
        supabase.rpc("report_costs_summary", { p_org: organizationId, p_since: ydayStartUtc, p_until: todayStartUtc }),
        // Needs-attention, bounded to actionable (same scoping as the on-demand report).
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .not("is_demo", "is", true).gte("lead_score", 50).not("status", "in", "(lost,converted)")
          .or(`last_contact_at.is.null,last_contact_at.lt.${new Date(now.getTime() - 86400000).toISOString()}`)
          .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString()),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
          .not("is_demo", "is", true).eq("status", "new")
          .gte("created_at", new Date(now.getTime() - 2 * 86400000).toISOString()),
      ]);

      const series = (seriesRes.data || []).map((r: any) => ({
        day: String(r.day), leads: Number(r.leads) || 0, showings: Number(r.showings) || 0,
      }));
      const months = (monthsRes.data || []).map((r: any) => ({
        month: String(r.month), leads: Number(r.leads) || 0, showings: Number(r.showings) || 0,
      }));
      const byDay = new Map(series.map((r: any) => [r.day, r]));
      const dayLeads = (d: string) => byDay.get(d)?.leads ?? 0;
      const dayShowings = (d: string) => byDay.get(d)?.showings ?? 0;

      // Headline count from the series RPC (uncapped, is_demo-consistent).
      const ydayLeadCount = dayLeads(yday);
      const dayBeforeCount = dayLeads(shiftDateStr(today, -2));
      const ydaySourcesLine = renderSources(ydaySourcesRes.data || []);

      // Rolling 7 full days (yesterday inclusive) vs the 7 before.
      let w7 = 0, w7prev = 0, s7 = 0, s7prev = 0;
      for (let i = 1; i <= 7; i++) { const d = shiftDateStr(today, -i); w7 += dayLeads(d); s7 += dayShowings(d); }
      for (let i = 8; i <= 14; i++) { const d = shiftDateStr(today, -i); w7prev += dayLeads(d); s7prev += dayShowings(d); }

      // Month-to-date (through yesterday) vs the same day-span last month.
      const dayOfMonth = parseInt(yday.slice(8, 10), 10);
      const thisMonthKey = yday.slice(0, 7);
      const prevMonthAnchor = shiftDateStr(`${thisMonthKey}-01`, -3);
      const prevMonthKey = prevMonthAnchor.slice(0, 7);
      let mtd = 0, mtdPrev = 0, mtdShow = 0, mtdShowPrev = 0;
      for (const r of series) {
        const dom = parseInt(r.day.slice(8, 10), 10);
        if (r.day.slice(0, 7) === thisMonthKey && r.day <= yday) { mtd += r.leads; mtdShow += r.showings; }
        if (r.day.slice(0, 7) === prevMonthKey && dom <= dayOfMonth) { mtdPrev += r.leads; mtdShowPrev += r.showings; }
      }

      const costRows = (ydayCostsRes.data || []) as { service: string; total: number }[];
      const costTotal = costRows.reduce((s, r) => s + Number(r.total || 0), 0);
      const costParts = costRows.filter((r) => Number(r.total) > 0)
        .map((r) => `${r.service} ${money(Number(r.total))}`).join(" · ");

      const hotAwaiting = hotAwaitingRes.count || 0;
      const backlog = backlogRes.count || 0;
      const todayShowings = dayShowings(today);

      const lines: string[] = [
        `☀️ <b>Reporte diario — ${fmtDayEs(yday)}</b>`,
        ``,
        `━━ <b>AYER</b> ━━`,
        `👥 <b>${ydayLeadCount} leads</b> (${deltaBadge(ydayLeadCount, dayBeforeCount)} vs anteayer)${ydaySourcesLine ? ` — ${ydaySourcesLine}` : ""}`,
        `🔥 ${ydayHotRes.count || 0} hot (milestone)`,
        `🏠 ${dayShowings(yday)} showings · ✅ ${ydayShowCompRes.count || 0} completados${(ydayShowNSRes.count || 0) > 0 ? ` · 👻 ${ydayShowNSRes.count} no-show` : ""}`,
        `✉️ ${Number(ydayEmailsRes.data) || 0} emails · 💬 ${ydaySmsRes.count || 0} SMS`,
        `${(ydayConvRes.count || 0) > 0 ? `🎉 ${ydayConvRes.count} convertidos\n` : ""}💰 Costo: <b>${money(costTotal)}</b>${costParts ? ` (${costParts})` : ""}`,
        ``,
        `━━ <b>SEMANA</b> (últimos 7d vs anteriores) ━━`,
        `👥 ${w7} leads (${deltaBadge(w7, w7prev)}) · 🏠 ${s7} showings (${deltaBadge(s7, s7prev)})`,
        ``,
        `━━ <b>MES</b> (al día ${dayOfMonth} vs mes pasado) ━━`,
        `👥 ${mtd} leads (${deltaBadge(mtd, mtdPrev)}) · 🏠 ${mtdShow} showings (${deltaBadge(mtdShow, mtdShowPrev)})`,
      ];
      if (hotAwaiting > 0 || backlog > 0) {
        lines.push(``, `━━ <b>⚡ PARA HOY</b> ━━`);
        if (hotAwaiting > 0) lines.push(`🔥 ${hotAwaiting} hot sin contactar (últimos 7d)`);
        if (backlog > 0) lines.push(`📋 ${backlog} nuevos sin primer contacto (48h)`);
      }
      lines.push(``, `📅 Hoy: ${todayShowings} showing${todayShowings === 1 ? "" : "s"} en agenda`);

      const sent = await tg("sendMessage", {
        chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true,
      });
      if (!sent.ok) {
        // Do NOT record daily_report_sent — the sibling cron hour (or a manual
        // run) should retry instead of finding a false idempotency marker.
        return json({ error: `telegram send failed: ${sent.description || "unknown"}` }, 500);
      }
      // Comparison charts as an album (Telegram fetches the QuickChart URLs).
      const media = [
        { type: "photo", media: dailyChart(series), caption: "📊 Comparación diaria, semanal y mensual (* mes en curso)" },
        { type: "photo", media: weeklyChart(series) },
        { type: "photo", media: monthlyChart(months) },
      ];
      const mg = await tg("sendMediaGroup", { chat_id: chatId, media });
      if (!mg.ok) {
        // Album failed (e.g. QuickChart hiccup) — degrade to individual photos.
        for (const m of media) await tg("sendPhoto", { chat_id: chatId, photo: m.media });
      }

      await supabase.from("system_logs").insert({
        organization_id: organizationId, level: "info", category: "general",
        event_type: "daily_report_sent",
        message: `Daily 5am report: ${ydayLeadCount} leads yesterday, ${w7} last 7d, cost ${money(costTotal)}`,
        details: { yday: { leads: ydayLeadCount, showings: dayShowings(yday), cost: costTotal }, week: { leads: w7, prev: w7prev }, mtd: { leads: mtd, prev: mtdPrev } },
      });

      return json({ success: true, mode, yday: { leads: ydayLeadCount }, week: { leads: w7 }, mtd: { leads: mtd } });
    }

    // ════════════════════════════════════════════════════════════════════
    // EVENING — 9pm day digest
    const tomorrowStartUtc = localMidnightToUtc(shiftDateStr(today, 1));
    const dayAfterStartUtc = localMidnightToUtc(shiftDateStr(today, 2));

    const [todayCountRes, todaySourcesRes, todayHotRes, digestLogsRes, funnelRes, tomorrowShowRes,
      todayEmailsRes, todaySmsRes, todayCostsRes] = await Promise.all([
      // Exact headline count (raw row selects cap at 1000 silently).
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .not("is_demo", "is", true).gte("created_at", todayStartUtc),
      supabase.rpc("report_source_breakdown", { p_org: organizationId, p_since: todayStartUtc, p_until: tomorrowStartUtc, p_limit: 4 }),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .not("is_demo", "is", true).gte("lead_score", 50).gte("created_at", todayStartUtc),
      // Hemlane digests processed today — the parser logs one row per digest email.
      supabase.from("system_logs").select("details").eq("organization_id", organizationId)
        .eq("event_type", "esther_digest_processed").gte("created_at", todayStartUtc).limit(100),
      supabase.rpc("report_status_funnel", { p_org: organizationId }),
      supabase.from("showings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .not("status", "in", "(cancelled,rescheduled)")
        .gte("scheduled_at", tomorrowStartUtc).lt("scheduled_at", dayAfterStartUtc),
      // Counts queue-drained sends too (event_type='sent' alone misses ~99%).
      supabase.rpc("report_emails_sent", { p_org: organizationId, p_since: todayStartUtc, p_until: tomorrowStartUtc }),
      supabase.from("communications").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .eq("channel", "sms").eq("direction", "outbound").gte("sent_at", todayStartUtc),
      supabase.rpc("report_costs_summary", { p_org: organizationId, p_since: todayStartUtc, p_until: tomorrowStartUtc }),
    ]);

    const todayLeadCount = todayCountRes.count || 0;
    const todaySourcesLine = renderSources(todaySourcesRes.data || []);
    const digests = (digestLogsRes.data || []).map((r: any) => r.details || {});
    const dCount = digests.length;
    const dCreated = digests.reduce((s: number, d: any) => s + (Number(d.created) || 0), 0);
    const dUpdated = digests.reduce((s: number, d: any) => s + (Number(d.updated) || 0), 0);
    const dSkipped = digests.reduce((s: number, d: any) => s + (Number(d.skipped) || 0), 0);

    const funnel = new Map<string, number>(
      ((funnelRes.data || []) as any[]).map((r) => [String(r.status), Number(r.cnt) || 0])
    );
    const fn = (s: string) => funnel.get(s) || 0;
    const enProceso = fn("contacted") + fn("engaged") + fn("nurturing") + fn("qualified");

    const costRows = (todayCostsRes.data || []) as { service: string; total: number }[];
    const costTotal = costRows.reduce((s, r) => s + Number(r.total || 0), 0);

    const lines: string[] = [
      `🌙 <b>Digest del día — ${fmtDayEs(today)}</b>`,
      ``,
      `🆕 <b>Entraron hoy: ${todayLeadCount} leads</b>${todaySourcesLine ? ` — ${todaySourcesLine}` : ""}`,
      `🔥 ${todayHotRes.count || 0} hot (milestone)`,
      ``,
      `📧 <b>Hemlane</b>: ${dCount} digest${dCount === 1 ? "" : "s"} procesado${dCount === 1 ? "" : "s"}` +
        (dCount ? ` — ${dCreated} nuevos · 🌱 ${dUpdated} nutridos${dSkipped ? ` · ${dSkipped} omitidos` : ""}` : ""),
      ``,
      `━━ <b>EN PROCESO</b> (pipeline vivo) ━━`,
      `📞 Contactados: ${fn("contacted")} · 💬 Engaged: ${fn("engaged")}`,
      `🌱 Nurturing: ${fn("nurturing")} · ✅ Calificados: ${fn("qualified")}`,
      `📅 Con showing: ${fn("showing_scheduled")} · 🏠 Asistieron: ${fn("showed")} · 🧾 En aplicación: ${fn("in_application")}`,
      `<b>Total en curso: ${enProceso + fn("showing_scheduled") + fn("showed") + fn("in_application")}</b>`,
      ``,
      `✉️ ${Number(todayEmailsRes.data) || 0} emails · 💬 ${todaySmsRes.count || 0} SMS · 💰 ${money(costTotal)}`,
      `📅 Mañana: ${tomorrowShowRes.count || 0} showing${(tomorrowShowRes.count || 0) === 1 ? "" : "s"} en agenda`,
    ];

    const sent = await tg("sendMessage", {
      chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true,
    });
    if (!sent.ok) {
      // No idempotency marker on failure — the sibling cron hour retries.
      return json({ error: `telegram send failed: ${sent.description || "unknown"}` }, 500);
    }

    await supabase.from("system_logs").insert({
      organization_id: organizationId, level: "info", category: "general",
      event_type: "evening_digest_sent",
      message: `Evening 9pm digest: ${todayLeadCount} leads today, ${dCount} Hemlane digests, ${dUpdated} nutridos`,
      details: { today: { leads: todayLeadCount }, hemlane: { digests: dCount, created: dCreated, updated: dUpdated, skipped: dSkipped }, pipeline: Object.fromEntries(funnel) },
    });

    return json({ success: true, mode, today: { leads: todayLeadCount }, hemlane: { digests: dCount, updated: dUpdated } });
  } catch (err) {
    // Redact everywhere: fetch() errors can embed the bot-token URL.
    const safeMsg = redactToken((err as Error).message || "Unknown error");
    console.error("agent-daily-report error:", redactToken(String(err)));
    try {
      await supabase.from("system_logs").insert({
        organization_id: organizationId || null, level: "error", category: "general",
        event_type: "daily_report_error",
        message: `Daily report (${mode}) failed: ${safeMsg}`,
        details: { error: redactToken(String(err)) },
      });
    } catch { /* non-blocking */ }
    return json({ error: safeMsg || "daily report failed" }, 500);
  }
});
