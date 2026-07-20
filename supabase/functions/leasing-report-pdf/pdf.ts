// leasing-report-pdf / pdf.ts — the PDF renderer for the owner-facing,
// de-identified leasing report. Split out from index.ts so it can be rendered
// and eyeballed locally (see scratchpad/pdf-render.ts) without deploying.
//
// Design: Montserrat (embedded via fontkit, Helvetica fallback), an indigo/gold
// identity, numbered sections each with a plain-language subtitle, a written
// executive summary, and real charts — a donut for showing outcomes, columns
// for the lead trend, and pill bars for the pipeline & sources.
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
// fontkit ships a runtime default export but its type defs don't declare one,
// so import as a namespace and unwrap.
import * as fontkitNS from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
const fontkit: any = (fontkitNS as any).default ?? fontkitNS;

// ── Montserrat (static TTFs, cached across warm invocations) ─────────────────
const FONT_BASE = "https://cdn.jsdelivr.net/npm/@expo-google-fonts/montserrat@0.2.3";
let _fontCache: { reg: Uint8Array; med: Uint8Array; semi: Uint8Array; bold: Uint8Array } | null = null;
async function loadMontserrat() {
  if (_fontCache) return _fontCache;
  const grab = async (f: string) => {
    const r = await fetch(`${FONT_BASE}/${f}.ttf`);
    if (!r.ok) throw new Error(`font ${f} ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const [reg, med, semi, bold] = await Promise.all([
    grab("Montserrat_400Regular"), grab("Montserrat_500Medium"),
    grab("Montserrat_600SemiBold"), grab("Montserrat_700Bold"),
  ]);
  _fontCache = { reg, med, semi, bold };
  return _fontCache;
}

const NY = "America/New_York";

// Keep text encodable by both Montserrat and the Helvetica fallback: normalize
// smart punctuation to ASCII and drop anything outside Latin-1. Visual markers
// (bullets, arrows) are drawn as shapes, never glyphs.
export function san(s: unknown): string {
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
  coming_soon: { es: "Proximamente", en: "Coming soon" },
  in_leasing_process: { es: "En proceso", en: "In leasing process" },
  rented: { es: "Rentado", en: "Rented" },
  scheduled: { es: "Agendado", en: "Scheduled" },
  confirmed: { es: "Confirmado", en: "Confirmed" },
  completed: { es: "Completado", en: "Completed" },
  no_show: { es: "No asistio", en: "No-show" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
  rescheduled: { es: "Reprogramado", en: "Rescheduled" },
};
function statusLabel(s: string, lang: "es" | "en"): string {
  return STATUS_LABELS[s]?.[lang] || s.replace(/_/g, " ");
}

const INTEREST_LABELS: Record<string, { es: string; en: string }> = {
  high: { es: "interes alto", en: "high interest" },
  medium: { es: "interes medio", en: "medium interest" },
  low: { es: "interes bajo", en: "low interest" },
  not_interested: { es: "sin interes", en: "not interested" },
};
function interestLabel(level: string, lang: "es" | "en"): string {
  return INTEREST_LABELS[level]?.[lang] || level.replace(/_/g, " ");
}

function fmtDate(iso: string | null, lang: "es" | "en"): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
      timeZone: NY, weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  } catch { return "-"; }
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
  return isFinite(v) && v > 0 ? `$${v.toLocaleString("en-US")}` : "-";
}
function range(min: unknown, max: unknown, fmt: (n: unknown) => string): string {
  const a = fmt(min), b = fmt(max);
  if (a === "-" && b === "-") return "-";
  return a === b ? a : `${a}-${b}`;
}

// ── Palette (indigo primary, gold accent, accent-biased neutrals) ────────────
const INDIGO = rgb(0.31, 0.275, 0.898);
const INDIGO_DEEP = rgb(0.192, 0.176, 0.573);
const GOLD = rgb(1, 0.698, 0.173);
const INK = rgb(0.086, 0.094, 0.169);
const BODY = rgb(0.353, 0.373, 0.431);
const MUTED = rgb(0.55, 0.57, 0.63);
const HAIRLINE = rgb(0.898, 0.906, 0.945);
const CARD = rgb(0.965, 0.969, 0.984);
const TRACK = rgb(0.925, 0.929, 0.965);
const WHITE = rgb(1, 1, 1);

const STATUS_COLOR: Record<string, ReturnType<typeof rgb>> = {
  scheduled: rgb(0.231, 0.51, 0.965),
  confirmed: rgb(0.31, 0.275, 0.898),
  completed: rgb(0.133, 0.773, 0.369),
  no_show: rgb(0.937, 0.267, 0.267),
  cancelled: rgb(0.58, 0.639, 0.722),
  rescheduled: rgb(0.961, 0.62, 0.043),
};
function statusColor(s: string) { return STATUS_COLOR[s] || MUTED; }

function labels(lang: "es" | "en") {
  return lang === "en" ? {
    eyebrow: "RENT FINDER  ·  LEASING INTELLIGENCE", title: "Leasing Report", generated: "Generated",
    units: "units", section8: "Section 8 accepted", summary: "Executive summary",
    rent: "Rent", beds: "Beds", baths: "Baths", sqft: "Sq ft", dom: "Days on mkt",
    keyMetrics: "Key metrics", totalLeads: "Total leads", showingsDone: "Showings completed",
    booked: "of", response: "Median response", underH: "under 1h",
    recent: "Leads (30d)", upcoming: "Upcoming showings", openSlots: "Open slots",
    pipeline: "Lead pipeline", sources: "Lead sources", overTime: "Leads over time",
    byStatus: "Showings by outcome", availability: "Open availability", tl: "Showings & agent notes",
    up: "Upcoming", hist: "History", note: "Agent note", none: "No data yet.", minutes: "min",
    slotsUp: "upcoming open slots", interest: "interest", unit: "Unit", total: "total", conv: "conv.",
    footer: "Rent Finder  ·  Leasing Report",
    sub: {
      keyMetrics: "A snapshot of acquisition and conversion performance for this property.",
      pipeline: "How prospects progress through each stage of the leasing funnel.",
      sources: "Where prospects are discovering this property.",
      overTime: "New leads captured per period - the demand trend.",
      byStatus: "The outcome of every booked showing.",
      availability: "Time slots currently open for prospects to book a tour.",
      tl: "A chronological record of tours with de-identified agent observations.",
    },
    privacy: "This report is de-identified: no prospect names or contact details are shown, prospects in the application stage are excluded, and agent notes are redacted of any personal information.",
  } : {
    eyebrow: "RENT FINDER  ·  INTELIGENCIA DE LEASING", title: "Reporte de Leasing", generated: "Generado",
    units: "unidades", section8: "Acepta Seccion 8", summary: "Resumen ejecutivo",
    rent: "Renta", beds: "Hab", baths: "Banos", sqft: "Pies2", dom: "Dias en mkt",
    keyMetrics: "Metricas clave", totalLeads: "Leads totales", showingsDone: "Showings completados",
    booked: "de", response: "Respuesta mediana", underH: "bajo 1h",
    recent: "Leads (30d)", upcoming: "Showings proximos", openSlots: "Cupos abiertos",
    pipeline: "Embudo de leads", sources: "Fuentes de leads", overTime: "Leads en el tiempo",
    byStatus: "Showings por resultado", availability: "Disponibilidad abierta", tl: "Showings y notas del agente",
    up: "Proximos", hist: "Historial", note: "Nota del agente", none: "Sin datos aun.", minutes: "min",
    slotsUp: "cupos abiertos proximos", interest: "interes", unit: "Unidad", total: "total", conv: "conv.",
    footer: "Rent Finder  ·  Reporte de Leasing",
    sub: {
      keyMetrics: "Un vistazo al rendimiento de captacion y conversion de esta propiedad.",
      pipeline: "Como avanzan los prospectos por cada etapa del embudo de leasing.",
      sources: "Desde donde estan descubriendo esta propiedad los prospectos.",
      overTime: "Leads nuevos captados por periodo - la tendencia de demanda.",
      byStatus: "El resultado de cada showing agendado.",
      availability: "Cupos actualmente abiertos para que los prospectos agenden.",
      tl: "Registro cronologico de visitas con observaciones de-identificadas del agente.",
    },
    privacy: "Este reporte es de-identificado: no se muestran nombres ni datos de contacto de prospectos, se excluyen los prospectos en etapa de aplicacion, y las notas del agente estan redactadas de cualquier dato personal.",
  };
}

function execSummary(p: any, s: any, lang: "es" | "en"): string {
  const n = (v: any) => Number(v ?? 0);
  const resp = s.response_median_minutes != null ? Math.round(s.response_median_minutes) : null;
  if (lang === "en") {
    const kind = (p.units || 1) > 1 ? `${p.units}-unit building` : "home";
    let t = `Over the last 30 days this ${kind} drew ${n(s.leads_last_30d)} new lead${n(s.leads_last_30d) === 1 ? "" : "s"}. `;
    t += `${n(s.showings_completed)} of ${n(s.showings_total)} booked showing${n(s.showings_total) === 1 ? "" : "s"} were completed`;
    t += resp != null ? `, with a median first-response time of ${resp} minutes. ` : ". ";
    t += `There ${n(s.open_slots_upcoming) === 1 ? "is" : "are"} ${n(s.open_slots_upcoming)} open slot${n(s.open_slots_upcoming) === 1 ? "" : "s"} for booking and ${n(s.showings_upcoming)} upcoming showing${n(s.showings_upcoming) === 1 ? "" : "s"}.`;
    return t;
  }
  const kind = (p.units || 1) > 1 ? `propiedad de ${p.units} unidades` : "propiedad";
  let t = `En los ultimos 30 dias esta ${kind} atrajo ${n(s.leads_last_30d)} lead${n(s.leads_last_30d) === 1 ? "" : "s"} nuevo${n(s.leads_last_30d) === 1 ? "" : "s"}. `;
  t += `Se completaron ${n(s.showings_completed)} de ${n(s.showings_total)} showing${n(s.showings_total) === 1 ? "" : "s"} agendado${n(s.showings_total) === 1 ? "" : "s"}`;
  t += resp != null ? `, con una velocidad de primera respuesta mediana de ${resp} minutos. ` : ". ";
  t += `Hay ${n(s.open_slots_upcoming)} cupo${n(s.open_slots_upcoming) === 1 ? "" : "s"} abierto${n(s.open_slots_upcoming) === 1 ? "" : "s"} para agendar y ${n(s.showings_upcoming)} showing${n(s.showings_upcoming) === 1 ? "" : "s"} proximo${n(s.showings_upcoming) === 1 ? "" : "s"}.`;
  return t;
}

// Page geometry (A4)
const W = 595.28, H = 841.89, M = 44;
const CW = W - M * 2;
const FOOT = 46; // reserved footer band

export async function buildPdf(data: any, lang: "es" | "en"): Promise<Uint8Array> {
  const T = labels(lang);
  const doc = await PDFDocument.create();

  // Fonts: Montserrat if reachable, else Helvetica so a report always renders.
  let reg: PDFFont, med: PDFFont, semi: PDFFont, bold: PDFFont;
  try {
    doc.registerFontkit(fontkit);
    const raw = await loadMontserrat();
    reg = await doc.embedFont(raw.reg, { subset: true });
    med = await doc.embedFont(raw.med, { subset: true });
    semi = await doc.embedFont(raw.semi, { subset: true });
    bold = await doc.embedFont(raw.bold, { subset: true });
  } catch (e) {
    console.warn("Montserrat unavailable, using Helvetica:", (e as Error).message);
    reg = await doc.embedFont(StandardFonts.Helvetica);
    med = reg;
    semi = await doc.embedFont(StandardFonts.HelveticaBold);
    bold = semi;
  }

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const tw = (s: string, size: number, f: PDFFont = reg) => f.widthOfTextAtSize(san(s), size);
  const at = (s: string, x: number, yy: number, size: number, f: PDFFont = reg, c = INK) =>
    page.drawText(san(s), { x, y: yy, size, font: f, color: c });
  const draw = (s: string, x: number, size: number, f: PDFFont = reg, c = INK) => at(s, x, y, size, f, c);
  const centered = (s: string, cx: number, yy: number, size: number, f: PDFFont = reg, c = INK) =>
    page.drawText(san(s), { x: cx - tw(s, size, f) / 2, y: yy, size, font: f, color: c });
  const rightAt = (s: string, xr: number, yy: number, size: number, f: PDFFont = reg, c = INK) =>
    page.drawText(san(s), { x: xr - tw(s, size, f), y: yy, size, font: f, color: c });

  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < FOOT + 6) newPage(); };

  const wrap = (s: string, size: number, maxW: number, f: PDFFont = reg): string[] => {
    const words = san(s).split(" ");
    const lines: string[] = []; let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (tw(test, size, f) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const paragraph = (s: string, size: number, c = BODY, x = M, maxW = CW, lh = size + 4.5) => {
    for (const ln of wrap(s, size, maxW)) { need(lh); draw(ln, x, size, reg, c); y -= lh; }
  };

  // Numbered section header with a plain-language subtitle underneath.
  let sectionNo = 0;
  const section = (titleKey: keyof ReturnType<typeof labels>["sub"], titleText: string) => {
    sectionNo++;
    need(46);
    y -= 22;
    // gold index chip
    const chip = String(sectionNo).padStart(2, "0");
    page.drawRectangle({ x: M, y: y - 3, width: 22, height: 15, color: INDIGO });
    centered(chip, M + 11, y + 1, 8.5, bold, WHITE);
    draw(titleText.toUpperCase(), M + 30, 11.5, bold, INK);
    y -= 15;
    const sub = (T.sub as Record<string, string>)[titleKey];
    if (sub) { draw(sub, M + 30, 8, reg, MUTED); }
    y -= 8;
    page.drawRectangle({ x: M, y, width: CW, height: 1, color: HAIRLINE });
    y -= 14;
  };

  // A rounded pill (rect capped by two circles) — used for bars & tracks.
  const pill = (x: number, yy: number, w: number, h: number, c: ReturnType<typeof rgb>) => {
    const r = h / 2;
    if (w <= h) { page.drawCircle({ x: x + r, y: yy + r, size: r, color: c }); return; }
    page.drawRectangle({ x: x + r, y: yy, width: w - h, height: h, color: c });
    page.drawCircle({ x: x + r, y: yy + r, size: r, color: c });
    page.drawCircle({ x: x + w - r, y: yy + r, size: r, color: c });
  };

  // Horizontal pill bar: [label] [track+fill] [%] [count] in fixed, non-
  // overlapping columns. The count sits flush right; the optional % sits just
  // to its left; the bar fills the remaining width; long labels are truncated.
  const bar = (label: string, count: number, max: number, opts?: { pct?: string; color?: ReturnType<typeof rgb> }) => {
    need(19);
    const h = 8, labelW = 126, countW = 26, pctW = opts?.pct ? 34 : 0;
    const barX = M + labelW;
    const barMaxW = CW - labelW - countW - pctW - 12;
    let lbl = san(label);
    if (tw(lbl, 9, med) > labelW - 6) {
      while (lbl.length > 2 && tw(lbl + ".", 9, med) > labelW - 6) lbl = lbl.slice(0, -1);
      lbl += ".";
    }
    draw(lbl, M, 9, med, INK);
    pill(barX, y - 1, barMaxW, h, TRACK);
    const w = max > 0 ? Math.max(count > 0 ? h : 0, (count / max) * barMaxW) : 0;
    if (w > 0) pill(barX, y - 1, w, h, opts?.color || INDIGO);
    rightAt(String(count), M + CW, y - 0.5, 9, bold, INK);
    if (opts?.pct) rightAt(opts.pct, M + CW - countW - 4, y - 0.5, 7, med, MUTED);
    y -= 19;
  };

  // Donut chart via dense radial segments (no arc math / SVG y-flip pitfalls).
  const donut = (cx: number, cy: number, rOut: number, rIn: number, slices: { value: number; color: ReturnType<typeof rgb> }[]) => {
    const total = slices.reduce((a, s) => a + s.value, 0) || 1;
    let ang = -Math.PI / 2;
    const step = (0.5 * Math.PI) / 180;
    const th = rOut * step * 2.2 + 0.6;
    for (const sl of slices) {
      const a1 = ang + (sl.value / total) * 2 * Math.PI;
      for (let a = ang; a < a1; a += step) {
        page.drawLine({
          start: { x: cx + Math.cos(a) * rIn, y: cy + Math.sin(a) * rIn },
          end: { x: cx + Math.cos(a) * rOut, y: cy + Math.sin(a) * rOut },
          thickness: th, color: sl.color,
        });
      }
      ang = a1;
    }
  };

  // Vertical column chart with baseline + value/period labels.
  const columns = (x0: number, yBase: number, w: number, h: number, pts: { label: string; value: number }[]) => {
    const max = Math.max(1, ...pts.map((p) => p.value));
    const n = Math.max(1, pts.length);
    const gap = n > 8 ? 4 : 7;
    const colW = Math.max(6, (w - gap * (n - 1)) / n);
    // faint gridlines (0/50/100%)
    for (const g of [0, 0.5, 1]) {
      const gy = yBase + g * h;
      page.drawLine({ start: { x: x0, y: gy }, end: { x: x0 + w, y: gy }, thickness: 0.5, color: g === 0 ? HAIRLINE : rgb(0.95, 0.955, 0.98) });
    }
    pts.forEach((p, i) => {
      const bx = x0 + i * (colW + gap);
      const bh = p.value > 0 ? Math.max(2.5, (p.value / max) * h) : 0;
      if (bh > 0) {
        page.drawRectangle({ x: bx, y: yBase, width: colW, height: bh, color: INDIGO });
        page.drawRectangle({ x: bx, y: yBase + bh - 2, width: colW, height: 2, color: GOLD }); // gold cap
      }
      if (p.value > 0) centered(String(p.value), bx + colW / 2, yBase + bh + 3, 6.5, semi, INK);
      centered(p.label, bx + colW / 2, yBase - 10, 6, reg, MUTED);
    });
  };

  // ── Header band ─────────────────────────────────────────────────────────────
  const bandH = 112;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: INDIGO });
  page.drawRectangle({ x: 0, y: H - bandH + 34, width: W * 0.62, height: bandH - 34, color: INDIGO_DEEP, opacity: 0.55 });
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: GOLD });
  // decorative gold ring on the right
  page.drawCircle({ x: W - 30, y: H - 34, size: 46, color: GOLD, opacity: 0.10 });
  page.drawCircle({ x: W - 30, y: H - 34, size: 26, color: GOLD, opacity: 0.14 });

  at(T.eyebrow, M, H - 30, 7.5, semi, GOLD);
  at(T.title, M, H - 54, 21, bold, WHITE);
  const p = data.property || {};
  at(p.address || "-", M, H - 76, 13, semi, GOLD);
  const loc = [p.city, p.state, p.zip_code].filter(Boolean).join(", ");
  at(loc, M, H - 92, 9.5, reg, rgb(0.88, 0.89, 0.98));
  rightAt(`${T.generated}  ${fmtDate(new Date().toISOString(), lang)}`, W - M, H - 92, 8, reg, rgb(0.82, 0.84, 0.96));
  y = H - bandH - 20;

  // ── Property snapshot: status pills + fact tiles ─────────────────────────────
  const s = data.summary || {};
  // status pill(s)
  {
    const pillLabel = statusLabel(p.status || "", lang);
    const col = statusColor(p.status || "");
    const pad = 8, ph = 15, tsz = 8.5;
    const pw = tw(pillLabel, tsz, semi) + pad * 2;
    pill(M, y - 3, pw, ph, rgb(
      Math.min(1, col.red + (1 - col.red) * 0.85),
      Math.min(1, col.green + (1 - col.green) * 0.85),
      Math.min(1, col.blue + (1 - col.blue) * 0.85),
    ));
    at(pillLabel, M + pad, y + 1, tsz, semi, col);
    let cx = M + pw + 8;
    const extra: string[] = [];
    if ((p.units || 1) > 1) extra.push(`${p.units} ${T.units}`);
    if (p.section_8_accepted) extra.push(T.section8);
    for (const ex of extra) {
      const ew = tw(ex, tsz, semi) + pad * 2;
      pill(cx, y - 3, ew, ph, CARD);
      at(ex, cx + pad, y + 1, tsz, semi, BODY);
      cx += ew + 8;
    }
    y -= 24;
  }

  const facts: [string, string][] = [
    [T.rent, range(p.rent_min, p.rent_max, money)],
    [T.beds, range(p.bedrooms_min, p.bedrooms_max, (n) => (n == null ? "-" : String(n)))],
    [T.baths, range(p.bathrooms_min, p.bathrooms_max, (n) => (n == null ? "-" : String(n)))],
    [T.sqft, p.square_feet_total ? Number(p.square_feet_total).toLocaleString("en-US") : "-"],
    [T.dom, s.days_on_market != null ? String(s.days_on_market) : "-"],
  ];
  {
    const gap = 8, tileW = (CW - gap * (facts.length - 1)) / facts.length, tileH = 40;
    need(tileH);
    facts.forEach(([k, v], i) => {
      const x = M + i * (tileW + gap);
      page.drawRectangle({ x, y: y - tileH, width: tileW, height: tileH, color: CARD });
      page.drawRectangle({ x, y: y - tileH, width: tileW, height: 2.4, color: GOLD });
      at(k.toUpperCase(), x + 9, y - 15, 6.5, semi, MUTED);
      at(v, x + 9, y - 31, 13, bold, INDIGO);
    });
    y -= tileH + 12;
  }

  // Per-unit statuses (multi-unit only)
  if (Array.isArray(p.unit_statuses) && p.unit_statuses.length > 1) {
    for (const u of p.unit_statuses) {
      need(12);
      page.drawCircle({ x: M + 3, y: y + 3, size: 2, color: statusColor(u.status || "") });
      draw(`${T.unit} ${u.unit_number || "-"}:  ${statusLabel(u.status || "", lang)}  -  ${money(u.rent_price)}`, M + 10, 8.5, reg, BODY);
      y -= 12;
    }
    y -= 2;
  }

  // ── Executive summary card ───────────────────────────────────────────────────
  {
    const txt = execSummary(p, s, lang);
    const lines = wrap(txt, 9, CW - 24);
    const boxH = 22 + lines.length * 13 + 8;
    need(boxH);
    const top = y;
    page.drawRectangle({ x: M, y: top - boxH, width: CW, height: boxH, color: rgb(0.949, 0.953, 0.996) });
    page.drawRectangle({ x: M, y: top - boxH, width: 3, height: boxH, color: INDIGO });
    at(T.summary.toUpperCase(), M + 14, top - 15, 8, bold, INDIGO);
    let ty = top - 30;
    for (const ln of lines) { at(ln, M + 14, ty, 9, reg, BODY); ty -= 13; }
    y = top - boxH - 4;
  }

  // ── 1. Key metrics ───────────────────────────────────────────────────────────
  section("keyMetrics", T.keyMetrics);
  {
    const respTxt = s.response_median_minutes != null ? `${Math.round(s.response_median_minutes)} ${T.minutes}` : "-";
    const respSub = s.response_pct_under_1h != null ? `${Math.round(s.response_pct_under_1h)}% ${T.underH}` : "";
    const metrics: [string, string, string][] = [
      [T.totalLeads, String(s.total_leads ?? 0), ""],
      [T.showingsDone, String(s.showings_completed ?? 0), `${T.booked} ${s.showings_total ?? 0}`],
      [T.response, respTxt, respSub],
      [T.recent, String(s.leads_last_30d ?? 0), ""],
      [T.upcoming, String(s.showings_upcoming ?? 0), ""],
      [T.openSlots, String(s.open_slots_upcoming ?? 0), ""],
    ];
    const perRow = 3, gap = 8, boxW = (CW - gap * (perRow - 1)) / perRow, boxH = 50;
    for (let i = 0; i < metrics.length; i++) {
      const col = i % perRow;
      if (col === 0) { need(boxH + (i === 0 ? 0 : 8)); if (i > 0) y -= boxH + 8; }
      const bx = M + col * (boxW + gap);
      page.drawRectangle({ x: bx, y: y - boxH, width: boxW, height: boxH, color: CARD });
      page.drawRectangle({ x: bx, y: y - boxH, width: 2.4, height: boxH, color: INDIGO });
      at(metrics[i][0].toUpperCase(), bx + 12, y - 15, 6.8, semi, MUTED);
      at(metrics[i][1], bx + 12, y - 36, 18, bold, INDIGO);
      if (metrics[i][2]) at(metrics[i][2], bx + 12, y - 46, 6.8, med, BODY);
    }
    y -= boxH + 4;
  }

  // ── 2. Lead pipeline (with stage-to-stage conversion) ────────────────────────
  const funnel = data.funnel || [];
  section("pipeline", T.pipeline);
  if (funnel.length) {
    const fMax = Math.max(1, ...funnel.map((f: any) => f.count || 0));
    const first = funnel[0]?.count || 0;
    funnel.forEach((f: any, i: number) => {
      const pct = i > 0 && first > 0 ? `${Math.round(((f.count || 0) / first) * 100)}%` : "";
      // graduate indigo -> lighter periwinkle down the funnel (clean, not muddy)
      const t = funnel.length > 1 ? i / (funnel.length - 1) : 0;
      const c = rgb(0.31 + 0.30 * t, 0.275 + 0.31 * t, 0.9);
      bar(f.stage, f.count || 0, fMax, { pct, color: c });
    });
  } else paragraph(T.none, 9, MUTED);

  // ── 3. Lead sources ──────────────────────────────────────────────────────────
  const sources = data.lead_sources || [];
  section("sources", T.sources);
  if (sources.length) {
    const sMax = Math.max(1, ...sources.map((x: any) => x.count || 0));
    const totalSrc = sources.reduce((a: number, x: any) => a + (x.count || 0), 0) || 1;
    for (const src of sources) {
      const pct = `${Math.round(((src.count || 0) / totalSrc) * 100)}%`;
      bar(String(src.source || "-"), src.count || 0, sMax, { pct, color: INDIGO });
    }
  } else paragraph(T.none, 9, MUTED);

  // ── 4. Leads over time (column chart) ────────────────────────────────────────
  const lot = (data.leads_over_time || []).slice(-12);
  section("overTime", T.overTime);
  if (lot.length) {
    const chartH = 74;
    need(chartH + 20);
    columns(M + 4, y - chartH, CW - 8, chartH, lot.map((m: any) => ({ label: String(m.label || m.month || ""), value: m.count || 0 })));
    y -= chartH + 18;
  } else paragraph(T.none, 9, MUTED);

  // ── 5. Showings by outcome (donut + legend) ──────────────────────────────────
  const sbs = (data.showings_by_status || []).filter((x: any) => (x.count || 0) > 0);
  section("byStatus", T.byStatus);
  if (sbs.length) {
    const chartH = 120;
    need(chartH);
    const total = sbs.reduce((a: number, x: any) => a + (x.count || 0), 0) || 1;
    const cx = M + 62, cy = y - chartH / 2;
    donut(cx, cy, 52, 33, sbs.map((x: any) => ({ value: x.count || 0, color: statusColor(x.status) })));
    centered(String(total), cx, cy + 1, 20, bold, INK);
    centered(T.total, cx, cy - 15, 7.5, med, MUTED);
    // legend
    let ly = y - 14;
    const lx = M + 150;
    for (const x of sbs) {
      const pct = Math.round(((x.count || 0) / total) * 100);
      page.drawCircle({ x: lx + 4, y: ly + 3, size: 4, color: statusColor(x.status) });
      at(statusLabel(x.status, lang), lx + 14, ly, 9, med, INK);
      rightAt(`${x.count}   ${pct}%`, M + CW, ly, 9, semi, BODY);
      ly -= 18;
    }
    y -= chartH;
  } else paragraph(T.none, 9, MUTED);

  // ── 6. Open availability ─────────────────────────────────────────────────────
  const os = data.open_slots || {};
  section("availability", T.availability);
  {
    draw(`${os.upcoming_count ?? 0} ${T.slotsUp}`, M, 9.5, semi, INDIGO);
    y -= 15;
    const seen = new Set<string>();
    let shown = 0;
    for (const slot of (os.upcoming || [])) {
      const k = `${slot.slot_date} ${slot.slot_time}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (shown >= 18) break;
      shown++;
      need(12);
      page.drawCircle({ x: M + 3, y: y + 3, size: 1.6, color: GOLD });
      draw(`${fmtDate(slot.slot_date + "T12:00:00Z", lang)}   ${fmtSlotTime(slot.slot_time)}   (${slot.duration_minutes || 30} ${T.minutes})`, M + 10, 8.8, reg, BODY);
      y -= 12;
    }
    if (!shown) paragraph(T.none, 9, MUTED);
  }

  // ── 7. Showings & agent notes timeline ───────────────────────────────────────
  const tl = data.showings_timeline || [];
  const comments: any[] = data.agent_comments || [];
  const commentById = new Map(comments.map((c) => [c.id, c]));
  section("tl", T.tl);
  const upcoming = tl.filter((x: any) => x.is_upcoming);
  const history = tl.filter((x: any) => !x.is_upcoming);
  const renderShow = (x: any) => {
    need(15);
    page.drawCircle({ x: M + 3, y: y + 3.5, size: 3, color: statusColor(x.status) });
    const when = `${fmtDate(x.scheduled_at, lang)} ${fmtTime(x.scheduled_at, lang)}`.trim();
    draw(when, M + 12, 9, semi, INK);
    const bits = [statusLabel(x.status, lang)];
    if (x.interest_level) bits.push(interestLabel(x.interest_level, lang));
    draw(bits.join("  -  "), M + 12 + tw(when, 9, semi) + 8, 9, reg, MUTED);
    y -= 13;
    const c = commentById.get(x.id);
    if (c && c.comment) {
      const head = `${T.note}${c.unit_number ? ` (${T.unit} ${c.unit_number})` : ""}:`;
      need(12); draw(head, M + 12, 8, bold, MUTED); y -= 11;
      for (const ln of wrap(c.comment, 8.5, CW - 30)) { need(11); draw(ln, M + 22, 8.5, reg, BODY); y -= 11; }
      y -= 3;
    }
  };
  if (!upcoming.length && !history.length) {
    paragraph(T.none, 9, MUTED);
  } else {
    if (upcoming.length) { need(16); draw(T.up, M, 9.5, bold, INDIGO); y -= 15; upcoming.forEach(renderShow); }
    if (history.length) { need(18); y -= 4; draw(T.hist, M, 9.5, bold, INDIGO); y -= 15; history.slice(0, 24).forEach(renderShow); }
  }

  // ── Privacy footnote ─────────────────────────────────────────────────────────
  need(38);
  y -= 8;
  page.drawRectangle({ x: M, y: y - 2, width: CW, height: 1, color: HAIRLINE });
  y -= 12;
  for (const ln of wrap(T.privacy, 7.5, CW)) { need(10); draw(ln, M, 7.5, reg, MUTED); y -= 10; }

  // ── Footers (page N / M + brand) on every page ───────────────────────────────
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 32 }, end: { x: W - M, y: 32 }, thickness: 0.6, color: HAIRLINE });
    pg.drawText(san(T.footer), { x: M, y: 22, size: 7, font: reg, color: MUTED });
    const pn = `${i + 1} / ${pages.length}`;
    pg.drawText(pn, { x: W - M - reg.widthOfTextAtSize(pn, 7), y: 22, size: 7, font: reg, color: MUTED });
  });

  return await doc.save();
}
