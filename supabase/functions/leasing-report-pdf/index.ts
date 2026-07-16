import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// leasing-report-pdf — generates a de-identified owner-facing leasing PDF for a
// building and delivers it to a Telegram chat via sendDocument. Internal-only:
// the caller (the Telegram scheduling bot) must present the service-role key.
// Reuses leasing-tracker-lookup {groupKey} for all data + de-identification.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NY = "America/New_York";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aB = enc.encode(a), bB = enc.encode(b);
  const len = Math.max(aB.length, bB.length);
  let diff = aB.length ^ bB.length;
  for (let i = 0; i < len; i++) diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  return diff === 0;
}

// WinAnsi-safe text (pdf-lib's standard fonts throw on unencodable chars).
function san(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

const STATUS_LABELS: Record<string, { es: string; en: string }> = {
  available: { es: "Disponible", en: "Available" },
  coming_soon: { es: "Próximamente", en: "Coming soon" },
  in_leasing_process: { es: "En proceso", en: "In leasing process" },
  rented: { es: "Rentado", en: "Rented" },
  scheduled: { es: "Agendado", en: "Scheduled" },
  confirmed: { es: "Confirmado", en: "Confirmed" },
  completed: { es: "Completado", en: "Completed" },
  no_show: { es: "No asistió", en: "No-show" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
  rescheduled: { es: "Reprogramado", en: "Rescheduled" },
};
function statusLabel(s: string, lang: "es" | "en"): string {
  return STATUS_LABELS[s]?.[lang] || s.replace(/_/g, " ");
}

const INTEREST_LABELS: Record<string, { es: string; en: string }> = {
  high: { es: "interés alto", en: "high interest" },
  medium: { es: "interés medio", en: "medium interest" },
  low: { es: "interés bajo", en: "low interest" },
  not_interested: { es: "sin interés", en: "not interested" },
};
function interestLabel(level: string, lang: "es" | "en"): string {
  return INTEREST_LABELS[level]?.[lang] || level.replace(/_/g, " ");
}

function fmtDate(iso: string | null, lang: "es" | "en"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
      timeZone: NY, weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  } catch { return "—"; }
}
function fmtTime(iso: string | null, lang: "es" | "en"): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(lang === "es" ? "es-ES" : "en-US", {
      timeZone: NY, hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return ""; }
}
function fmtSlotTime(t: string): string {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  const ampm = h >= 12 ? "PM" : "AM";
  const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${disp}:${String(m).padStart(2, "0")} ${ampm}`;
}
function money(n: unknown): string {
  const v = Number(n);
  return isFinite(v) && v > 0 ? `$${v.toLocaleString("en-US")}` : "—";
}
function range(min: unknown, max: unknown, fmt: (n: unknown) => string): string {
  const a = fmt(min), b = fmt(max);
  if (a === "—" && b === "—") return "—";
  return a === b ? a : `${a}–${b}`;
}

function labels(lang: "es" | "en") {
  return lang === "en" ? {
    title: "Leasing Report", generated: "Generated", units: "units", section8: "Section 8 accepted",
    rent: "Rent", beds: "Beds", baths: "Baths", sqft: "Sq ft", dom: "Days on market",
    keyMetrics: "KEY METRICS", totalLeads: "Total leads", showingsDone: "Showings done",
    booked: "booked", response: "Response speed", median: "median", underH: "under 1h",
    recent: "Recent prospects (30d)", upcoming: "Upcoming showings", openSlots: "Open slots",
    pipeline: "LEAD PIPELINE", sources: "LEAD SOURCES", overTime: "LEADS OVER TIME",
    byStatus: "SHOWINGS BY STATUS", availability: "OPEN AVAILABILITY", tl: "SHOWINGS & AGENT NOTES",
    up: "Upcoming", hist: "History", note: "Agent note", none: "No data yet.", minutes: "min",
    slotsUp: "upcoming open slots", interest: "interest", unit: "Unit",
    privacy: "This report is de-identified: no prospect names or contact details are shown, prospects in the application stage are excluded, and agent notes are redacted of any personal information.",
  } : {
    title: "Reporte de Leasing", generated: "Generado", units: "unidades", section8: "Acepta Sección 8",
    rent: "Renta", beds: "Hab", baths: "Baños", sqft: "Pies²", dom: "Días en el mercado",
    keyMetrics: "MÉTRICAS CLAVE", totalLeads: "Leads totales", showingsDone: "Showings hechos",
    booked: "agendados", response: "Velocidad de respuesta", median: "mediana", underH: "bajo 1h",
    recent: "Prospectos recientes (30d)", upcoming: "Showings próximos", openSlots: "Cupos abiertos",
    pipeline: "EMBUDO DE LEADS", sources: "FUENTES DE LEADS", overTime: "LEADS EN EL TIEMPO",
    byStatus: "SHOWINGS POR ESTADO", availability: "DISPONIBILIDAD ABIERTA", tl: "SHOWINGS Y NOTAS DEL AGENTE",
    up: "Próximos", hist: "Historial", note: "Nota del agente", none: "Sin datos aún.", minutes: "min",
    slotsUp: "cupos abiertos próximos", interest: "interés", unit: "Unidad",
    privacy: "Este reporte es de-identificado: no se muestran nombres ni datos de contacto de prospectos, se excluyen los prospectos en etapa de aplicación, y las notas del agente están redactadas de cualquier dato personal.",
  };
}

async function buildPdf(data: any, lang: "es" | "en"): Promise<Uint8Array> {
  const T = labels(lang);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const INDIGO = rgb(0.31, 0.275, 0.898);
  const GOLD = rgb(1, 0.698, 0.173);
  const GRAY = rgb(0.42, 0.45, 0.5);
  const DARK = rgb(0.11, 0.12, 0.15);
  const LIGHTBG = rgb(0.953, 0.957, 0.965);
  const BAR = rgb(0.39, 0.4, 0.95);

  const W = 595.28, H = 841.89, M = 42;
  const CW = W - M * 2;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const need = (h: number) => { if (y - h < M + 24) { page = doc.addPage([W, H]); y = H - M; } };
  const tw = (s: string, size: number, f = font) => f.widthOfTextAtSize(s, size);
  const draw = (s: string, x: number, size: number, f = font, c = DARK) =>
    page.drawText(san(s), { x, y, size, font: f, color: c });

  const heading = (t: string) => {
    need(34);
    y -= 20;
    draw(t, M, 11, bold, INDIGO);
    y -= 6;
    page.drawRectangle({ x: M, y, width: CW, height: 1.4, color: INDIGO, opacity: 0.25 });
    y -= 12;
  };
  const wrap = (s: string, size: number, maxW: number): string[] => {
    const words = san(s).split(" ");
    const lines: string[] = []; let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (tw(test, size) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const paragraph = (s: string, size: number, c = DARK, x = M, maxW = CW) => {
    for (const ln of wrap(s, size, maxW)) { need(size + 4); draw(ln, x, size, font, c); y -= size + 4; }
  };
  const hbar = (label: string, count: number, max: number) => {
    need(16);
    const labelW = 150, barX = M + labelW, barMaxW = CW - labelW - 40;
    draw(label, M, 9, font, DARK);
    page.drawRectangle({ x: barX, y: y - 1, width: barMaxW, height: 9, color: LIGHTBG });
    const w = max > 0 ? Math.max(count > 0 ? 3 : 0, (count / max) * barMaxW) : 0;
    if (w > 0) page.drawRectangle({ x: barX, y: y - 1, width: w, height: 9, color: BAR });
    draw(String(count), barX + barMaxW + 8, 9, bold, DARK);
    y -= 16;
  };

  // ── Header band ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: INDIGO });
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 4, color: GOLD });
  y = H - 34;
  draw(T.title, M, 18, bold, rgb(1, 1, 1));
  y = H - 56;
  const p = data.property || {};
  draw(`${p.address || "—"}`, M, 13, bold, GOLD);
  y = H - 74;
  const loc = [p.city, p.state, p.zip_code].filter(Boolean).join(", ");
  draw(loc, M, 10, font, rgb(0.9, 0.91, 0.98));
  const genStr = `${T.generated}: ${fmtDate(new Date().toISOString(), lang)}`;
  page.drawText(san(genStr), { x: W - M - tw(genStr, 9), y: H - 74, size: 9, font, color: rgb(0.85, 0.87, 0.96) });
  y = H - 92 - 18;

  // ── Property summary ───────────────────────────────────────────────────────
  const s = data.summary || {};
  const chips: string[] = [];
  chips.push(statusLabel(p.status || "", lang));
  if ((p.units || 1) > 1) chips.push(`${p.units} ${T.units}`);
  if (p.section_8_accepted) chips.push(T.section8);
  need(16);
  draw(chips.map(san).join("   •   "), M, 10, bold, INDIGO);
  y -= 18;

  const facts: [string, string][] = [
    [T.rent, range(p.rent_min, p.rent_max, money)],
    [T.beds, range(p.bedrooms_min, p.bedrooms_max, (n) => (n == null ? "—" : String(n)))],
    [T.baths, range(p.bathrooms_min, p.bathrooms_max, (n) => (n == null ? "—" : String(n)))],
    [T.sqft, p.square_feet_total ? Number(p.square_feet_total).toLocaleString("en-US") : "—"],
    [T.dom, s.days_on_market != null ? String(s.days_on_market) : "—"],
  ];
  const colW = CW / facts.length;
  need(30);
  facts.forEach(([k, v], i) => {
    const x = M + i * colW;
    page.drawText(san(k), { x, y, size: 8, font, color: GRAY });
    page.drawText(san(v), { x, y: y - 13, size: 12, font: bold, color: DARK });
  });
  y -= 34;

  // Per-unit statuses (multi-unit only)
  if (Array.isArray(p.unit_statuses) && p.unit_statuses.length > 1) {
    for (const u of p.unit_statuses) {
      need(12);
      const line = `${T.unit} ${u.unit_number || "—"}:  ${statusLabel(u.status || "", lang)}  ·  ${money(u.rent_price)}`;
      draw(line, M + 6, 9, font, GRAY);
      y -= 12;
    }
    y -= 4;
  }

  // ── Key metrics ─────────────────────────────────────────────────────────────
  heading(T.keyMetrics);
  const respTxt = s.response_median_minutes != null
    ? `${Math.round(s.response_median_minutes)} ${T.minutes} ${T.median}` : "—";
  const respSub = s.response_pct_under_1h != null ? `${Math.round(s.response_pct_under_1h)}% ${T.underH}` : "";
  const metrics: [string, string, string][] = [
    [T.totalLeads, String(s.total_leads ?? 0), ""],
    [T.showingsDone, String(s.showings_completed ?? 0), `${s.showings_total ?? 0} ${T.booked}`],
    [T.response, respTxt, respSub],
    [T.recent, String(s.leads_last_30d ?? 0), ""],
    [T.upcoming, String(s.showings_upcoming ?? 0), ""],
    [T.openSlots, String(s.open_slots_upcoming ?? 0), ""],
  ];
  const perRow = 3, boxW = CW / perRow, boxH = 46;
  for (let i = 0; i < metrics.length; i++) {
    if (i % perRow === 0) { need(boxH + 6); y -= (i === 0 ? 0 : 6); }
    const col = i % perRow;
    const bx = M + col * boxW;
    const by = y - boxH;
    page.drawRectangle({ x: bx, y: by, width: boxW - 8, height: boxH, color: LIGHTBG });
    page.drawText(san(metrics[i][0]), { x: bx + 8, y: y - 14, size: 7.5, font, color: GRAY });
    page.drawText(san(metrics[i][1]), { x: bx + 8, y: y - 32, size: 16, font: bold, color: INDIGO });
    if (metrics[i][2]) page.drawText(san(metrics[i][2]), { x: bx + 8, y: by + 6, size: 7, font, color: GRAY });
    if (col === perRow - 1) y -= boxH;
  }
  y -= 4;

  // ── Lead pipeline ────────────────────────────────────────────────────────────
  const funnel = data.funnel || [];
  heading(T.pipeline);
  const fMax = Math.max(1, ...funnel.map((f: any) => f.count || 0));
  if (funnel.length) for (const f of funnel) hbar(f.stage, f.count || 0, fMax);
  else paragraph(T.none, 9, GRAY);

  // ── Lead sources ───────────────────────────────────────────────────────────
  const sources = data.lead_sources || [];
  if (sources.length) {
    heading(T.sources);
    const sMax = Math.max(1, ...sources.map((x: any) => x.count || 0));
    for (const src of sources) hbar(String(src.source || "—"), src.count || 0, sMax);
  }

  // ── Leads over time ──────────────────────────────────────────────────────────
  const lot = data.leads_over_time || [];
  if (lot.length) {
    heading(T.overTime);
    const lMax = Math.max(1, ...lot.map((x: any) => x.count || 0));
    for (const m of lot.slice(-12)) hbar(String(m.label || m.month), m.count || 0, lMax);
  }

  // ── Showings by status ───────────────────────────────────────────────────────
  const sbs = data.showings_by_status || [];
  if (sbs.length) {
    heading(T.byStatus);
    const bMax = Math.max(1, ...sbs.map((x: any) => x.count || 0));
    for (const st of sbs) hbar(statusLabel(st.status, lang), st.count || 0, bMax);
  }

  // ── Open availability ────────────────────────────────────────────────────────
  const os = data.open_slots || {};
  heading(T.availability);
  paragraph(`${os.upcoming_count ?? 0} ${T.slotsUp}`, 9, DARK);
  // Dedupe by date+time: a building with N units has N slot rows per time.
  const seenSlots = new Set<string>();
  for (const slot of (os.upcoming || [])) {
    const k = `${slot.slot_date} ${slot.slot_time}`;
    if (seenSlots.has(k)) continue;
    seenSlots.add(k);
    if (seenSlots.size > 20) break;
    need(12);
    const line = `• ${fmtDate(slot.slot_date + "T12:00:00Z", lang)}  ·  ${fmtSlotTime(slot.slot_time)}  (${slot.duration_minutes || 30} min)`;
    draw(line, M + 6, 9, font, GRAY);
    y -= 12;
  }

  // ── Showings & agent notes timeline ──────────────────────────────────────────
  const tl = data.showings_timeline || [];
  const comments: any[] = data.agent_comments || [];
  const commentById = new Map(comments.map((c) => [c.id, c]));
  heading(T.tl);
  const upcoming = tl.filter((x: any) => x.is_upcoming);
  const history = tl.filter((x: any) => !x.is_upcoming);
  const renderShow = (x: any) => {
    need(14);
    const when = `${fmtDate(x.scheduled_at, lang)} ${fmtTime(x.scheduled_at, lang)}`.trim();
    const bits = [when, statusLabel(x.status, lang)];
    if (x.interest_level) bits.push(interestLabel(x.interest_level, lang));
    draw(`• ${bits.join("  ·  ")}`, M + 6, 9, font, DARK);
    y -= 13;
    const c = commentById.get(x.id);
    if (c && c.comment) {
      const head = `   ${T.note}${c.unit_number ? ` (${T.unit} ${c.unit_number})` : ""}:`;
      need(12); draw(head, M + 6, 8, bold, GRAY); y -= 11;
      for (const ln of wrap(c.comment, 8.5, CW - 24)) { need(11); draw(ln, M + 18, 8.5, font, GRAY); y -= 11; }
      y -= 2;
    }
  };
  if (!upcoming.length && !history.length) {
    paragraph(T.none, 9, GRAY);
  } else {
    if (upcoming.length) { need(14); draw(T.up, M, 9.5, bold, DARK); y -= 14; upcoming.forEach(renderShow); }
    if (history.length) { need(16); y -= 4; draw(T.hist, M, 9.5, bold, DARK); y -= 14; history.slice(0, 25).forEach(renderShow); }
  }

  // ── Privacy footnote ─────────────────────────────────────────────────────────
  need(40);
  y -= 8;
  page.drawRectangle({ x: M, y: y - 2, width: CW, height: 1, color: GRAY, opacity: 0.3 });
  y -= 12;
  for (const ln of wrap(T.privacy, 7.5, CW)) { need(10); draw(ln, M, 7.5, font, GRAY); y -= 10; }

  return await doc.save();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Internal-only: this generates + delivers a document to a Telegram chat, so
  // only a caller holding the service-role key may use it.
  if (!timingSafeEqual(req.headers.get("Authorization") || "", `Bearer ${serviceKey}`)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { organization_id, groupKey, chat_id } = body as Record<string, any>;
    const lang: "es" | "en" = body.lang === "en" ? "en" : "es";
    const bot = body.bot === "general" ? "general" : "showings";
    if (!organization_id || !groupKey || !chat_id) {
      return json({ ok: false, error: "missing organization_id, groupKey or chat_id" }, 400);
    }

    // Fetch the de-identified tracker data (reuses all redaction server-side).
    const lookupResp = await fetch(`${supabaseUrl}/functions/v1/leasing-tracker-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ groupKey }),
    });
    const data = await lookupResp.json().catch(() => ({}));
    if (!lookupResp.ok || data?.error || !data?.property) {
      return json({ ok: false, error: `lookup failed: ${data?.error || lookupResp.status}` }, 502);
    }

    const pdf = await buildPdf(data, lang);

    // Resolve the delivery bot token (atomic showings→general fallback).
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("telegram_bot_token, telegram_showings_bot_token")
      .eq("organization_id", organization_id)
      .maybeSingle();
    const botToken = bot === "showings"
      ? (creds?.telegram_showings_bot_token || creds?.telegram_bot_token)
      : creds?.telegram_bot_token;
    if (!botToken) return json({ ok: false, error: "no bot token" }, 400);

    const addr = san(data.property.address || "propiedad").replace(/[^\w -]/g, "").slice(0, 60).trim() || "reporte";
    const caption = lang === "en"
      ? `📄 <b>Leasing report</b>\n${san(data.property.address || "")}, ${san(data.property.city || "")}`
      : `📄 <b>Reporte de leasing</b>\n${san(data.property.address || "")}, ${san(data.property.city || "")}`;

    const form = new FormData();
    form.append("chat_id", String(chat_id));
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("document", new Blob([pdf], { type: "application/pdf" }), `${addr}.pdf`);

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST", body: form,
    });
    if (!tgResp.ok) {
      const t = await tgResp.text().catch(() => "");
      console.warn(`sendDocument failed ${tgResp.status}: ${t.slice(0, 200)}`);
      return json({ ok: false, error: "send_failed" }, 502);
    }
    return json({ ok: true, bytes: pdf.length });
  } catch (err) {
    console.error("leasing-report-pdf error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
