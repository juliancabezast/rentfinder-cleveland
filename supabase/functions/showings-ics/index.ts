import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// "Leasing Agent" — iCalendar (.ics) feed of every showing, for Google Calendar
// "Add from URL" and Apple Calendar "New Subscription" (read-only, auto-updating).
// The client fetches this server-side with NO auth headers, and showings carry
// lead PII, so the feed is gated by a SECRET TOKEN in the query string compared
// constant-time against a per-org secret in organization_settings.
//
// ⚠️ The feed URL is a CREDENTIAL: anyone holding it sees every applicant's
// name, phone, email and notes. That is inherent to iCal (Google and Apple both
// work this way) — it is why the subscribe dialog says so in those words.
//
// Deploy with --no-verify-jwt. Pinned in supabase/config.toml so a redeploy
// without the flag can't silently 401 every subscriber (calendar clients fail
// their refresh without surfacing an error).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_SLUG = "rent-finder-cleveland";
// Same secret family as resolve-lead-token / unsubscribe.
const TOKEN_SECRET = Deno.env.get("LEAD_TOKEN_SECRET") || Deno.env.get("UNSUBSCRIBE_SECRET") || "";
// Attendance links stay valid well past the showing — the owner marks late.
const ATTENDANCE_TTL_DAYS = 120;

// Constant-time compare (from unsubscribe/index.ts) — don't leak token validity via timing.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ── Signed attendance links ──
// Same HMAC shape as resolve-lead-token: <showingId>.<action>.<exp>.<sig>.
// Stateless, carries an expiry, and the signature is checked before any DB hit.
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signAttendance(showingId: string, action: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const msg = `${showingId}.${action}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return `${msg}.${b64url(new Uint8Array(sig))}`;
}

// ── iCalendar (RFC 5545) helpers ──
// Escape TEXT values: backslash, semicolon, comma, and newlines → literal \n.
function icsText(s: unknown): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
// A Date → iCal UTC stamp YYYYMMDDTHHMMSSZ (built from UTC parts; no regex).
function icsUtc(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    p(d.getUTCFullYear(), 4) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z"
  );
}
// RFC 5545 §3.1: content lines are folded at 75 OCTETS, continuations begin
// with a space. This must count bytes, not characters — the descriptions below
// are full of emoji and accented Spanish, and splitting mid-codepoint is
// exactly how a feed renders as mojibake or gets rejected outright.
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a UTF-8 continuation byte (10xxxxxx) from its leader.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join("\r\n ");
}

function jsonErr(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Human labels (mirrors telegram-webhook so the two never disagree) ──
// A bare YYYY-MM-DD is UTC midnight; parsing it at noon avoids rendering the
// PREVIOUS day in Cleveland.
function moveInLabel(d: unknown): string {
  const raw = String(d ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const dt = new Date(`${raw}T12:00:00Z`);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("es-CO", {
    timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short",
  });
}
// Tri-state on purpose: guessing "self-pay" for a voucher holder wastes the
// showing, so an unknown says so instead of picking a side.
function paymentLabel(hasVoucher: unknown, amount: unknown): string {
  if (hasVoucher === true) {
    const amt = Number(amount);
    return amt > 0 ? `🎟️ Voucher ($${amt.toLocaleString()})` : "🎟️ Voucher";
  }
  if (hasVoucher === false) return "💵 Paga por su cuenta";
  return "❔ Forma de pago sin especificar";
}
const SOURCE_LABEL: Record<string, string> = {
  public_link: "Página pública de reservas",
  telegram_bot: "Bot de Telegram",
  admin: "Cargado desde el panel",
  campaign: "Campaña de correo",
};
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Asistió",
  no_show: "No asistió",
  cancelled: "Cancelado",
  rescheduled: "Reagendado",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Some calendar clients HEAD before GET — treat HEAD like GET (client drops the body).
  if (req.method !== "GET" && req.method !== "HEAD") return jsonErr({ error: "method_not_allowed" }, 405);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Resolve org (single tenant): by slug → first org.
  let orgId: string | null = null;
  const { data: bySlug } = await supabase.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
  orgId = bySlug?.id ?? null;
  if (!orgId) {
    const { data: any1 } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
    orgId = any1?.id ?? null;
  }
  if (!orgId) return jsonErr({ error: "no_org" }, 500);

  // Validate the URL token against the stored feed secret.
  const provided = new URL(req.url).searchParams.get("token") || "";
  const { data: setting } = await supabase.from("organization_settings")
    .select("value").eq("organization_id", orgId).eq("key", "ical_feed_token").maybeSingle();
  let expected = "";
  if (setting?.value != null) {
    const raw = setting.value as any; // jsonb → supabase-js parses to a JS value
    expected = (typeof raw === "string" ? raw : String(raw)).replace(/^"|"$/g, "");
  }
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return jsonErr({ error: "unauthorized" }, 401);
  }

  // Every real showing, whole history. `is_demo` is excluded: seeded demo rows
  // on the owner's own calendar would be indistinguishable from real visits.
  const { data: showings } = await supabase
    .from("showings")
    .select(`
      id, scheduled_at, status, duration_minutes, booking_source, booked_by_name,
      agent_report, cancellation_reason, lead_id,
      properties(address, unit_number, city, state, zip_code, rent_price, bedrooms, bathrooms),
      leads(full_name, phone, email, has_voucher, voucher_amount, housing_authority, move_in_date)
    `)
    .eq("organization_id", orgId)
    .or("is_demo.is.null,is_demo.eq.false")
    .order("scheduled_at", { ascending: true });

  const rows = (showings || []) as any[];

  // The visitor's own words, tied to THIS showing. `showings` has no notes
  // column: the booking form writes it to lead_notes stamped with
  // related_showing_id (mirrors telegram-webhook loadShowing). One batched
  // query instead of one per showing.
  const notesByShowing = new Map<string, string>();
  if (rows.length) {
    const { data: notes } = await supabase
      .from("lead_notes")
      .select("content, related_showing_id")
      .eq("organization_id", orgId)
      .eq("note_type", "booking_request")
      .not("related_showing_id", "is", null);
    for (const n of (notes || []) as any[]) {
      if (n.related_showing_id && !notesByShowing.has(n.related_showing_id)) {
        notesByShowing.set(n.related_showing_id, String(n.content || ""));
      }
    }
  }

  // Attendance links point at the APP, not at the functions domain: Supabase
  // coerces text/html there to text/plain (anti-phishing), so a confirmation
  // page served from the function would render as raw source. The app page
  // calls the function over JSON.
  const { data: domainSetting } = await supabase.from("organization_settings")
    .select("value").eq("organization_id", orgId).eq("key", "sender_domain").maybeSingle();
  const appDomain = String(
    (domainSetting?.value as any) ?? "rentfindercleveland.com",
  ).replace(/^"|"$/g, "").replace(/^https?:\/\//, "").trim() || "rentfindercleveland.com";
  const attendanceBase = `https://${appDomain}/showing/attendance`;
  const attendanceExp = Math.floor(Date.now() / 1000) + ATTENDANCE_TTL_DAYS * 86400;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rent Finder Cleveland//Leasing Agent//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Leasing Agent",
    "X-WR-CALDESC:Showings de Rent Finder Cleveland — con datos del aplicante y marcado de asistencia",
    "X-WR-TIMEZONE:America/New_York",
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  const now = new Date();
  const dtstamp = icsUtc(now);

  for (const s of rows) {
    const start = new Date(s.scheduled_at);
    if (isNaN(start.getTime())) continue;
    const dur = Number(s.duration_minutes) || 30;
    const end = new Date(start.getTime() + dur * 60000);
    const prop = s.properties || {};
    const lead = s.leads || {};

    const addr = [prop.address, prop.unit_number ? `#${prop.unit_number}` : "", prop.city, prop.state, prop.zip_code]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const leadName = String(lead.full_name || "Lead").trim();
    const mapsQuery = encodeURIComponent(
      `${prop.address || ""}, ${prop.city || ""}, ${prop.state || ""} ${prop.zip_code || ""}`,
    );

    const specs = [
      prop.bedrooms != null ? `${prop.bedrooms} hab` : "",
      prop.bathrooms != null ? `${prop.bathrooms} baños` : "",
      prop.rent_price != null ? `$${Number(prop.rent_price).toLocaleString()}/mes` : "",
    ].filter(Boolean).join(" · ");

    const moveIn = moveInLabel(lead.move_in_date);
    const note = notesByShowing.get(s.id) || "";
    const isPast = start.getTime() < now.getTime();
    const reported = Boolean(s.agent_report);

    const desc: string[] = [];
    desc.push(`👤 ${leadName}`);
    if (lead.phone) desc.push(`📞 ${lead.phone}`);
    if (lead.email) desc.push(`✉️ ${lead.email}`);
    desc.push("");
    if (specs) desc.push(`🏠 ${specs}`);
    if (prop.city) desc.push(`📍 ${addr}`);
    desc.push("");
    if (moveIn) desc.push(`📆 Se muda: ${moveIn}`);
    desc.push(paymentLabel(lead.has_voucher, lead.voucher_amount));
    if (lead.housing_authority) desc.push(`🏛️ ${lead.housing_authority}`);
    if (note) {
      desc.push("");
      desc.push(`📝 Dijo al reservar: ${note}`);
    }
    desc.push("");
    desc.push(`Estado: ${STATUS_LABEL[s.status] || s.status}`);
    desc.push(`Reservó por: ${SOURCE_LABEL[s.booking_source] || s.booking_source}${
      s.booked_by_name ? ` (${s.booked_by_name})` : ""
    }`);
    if (s.cancellation_reason) desc.push(`Motivo de cancelación: ${s.cancellation_reason}`);
    if (s.agent_report) desc.push(`Reporte: ${s.agent_report}`);
    desc.push("");
    desc.push(`🗺 Mapa: https://www.google.com/maps/search/?api=1&query=${mapsQuery}`);

    // Attendance links — only for past showings that still have no report, and
    // only when a signing secret exists. Emitting a link we cannot verify would
    // be worse than emitting none.
    if (TOKEN_SECRET && isPast && !reported && s.status !== "cancelled") {
      const showedTok = await signAttendance(s.id, "showed", attendanceExp);
      const noShowTok = await signAttendance(s.id, "no_show", attendanceExp);
      desc.push("");
      desc.push(`✅ Sí asistió: ${attendanceBase}?t=${showedTok}`);
      desc.push(`👻 No asistió: ${attendanceBase}?t=${noShowTok}`);
    }

    const cityTag = prop.city ? ` [${prop.city}]` : "";
    const mark = s.status === "completed" ? "✅ " : s.status === "no_show" ? "👻 " : s.status === "cancelled" ? "❌ " : "🏠 ";

    // NOTE: intentionally NO VALARM → subscribed calendars fire zero
    // notifications, so this never doubles up on the Telegram reminders.
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:showing-${s.id}@rentfindercleveland.com`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${icsUtc(start)}`);
    lines.push(`DTEND:${icsUtc(end)}`);
    lines.push(foldLine(`SUMMARY:${mark}${icsText(leadName)} — ${icsText(addr || "Showing")}${icsText(cityTag)}`));
    if (addr) lines.push(foldLine(`LOCATION:${icsText(addr)}`));
    lines.push(foldLine(`DESCRIPTION:${icsText(desc.join("\n"))}`));
    // A cancelled showing gets a TOMBSTONE rather than vanishing from the body:
    // clients key on UID, and some (Apple, Outlook) keep an event they can no
    // longer see in the feed. STATUS:CANCELLED is the RFC 5545 way to retract.
    lines.push(
      `STATUS:${
        s.status === "cancelled" ? "CANCELLED"
        : s.status === "confirmed" || s.status === "completed" ? "CONFIRMED"
        : "TENTATIVE"
      }`,
    );
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF line endings, and EVERY content line folded at 75
  // octets — including the calendar headers, one of which (X-WR-CALDESC) is
  // long enough in Spanish to break the rule on its own.
  const body = lines.map(foldLine).join("\r\n") + "\r\n";
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="leasing-agent.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
});
