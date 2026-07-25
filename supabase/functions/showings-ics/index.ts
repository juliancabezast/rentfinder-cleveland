import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public iCalendar (.ics) feed of scheduled showings — for Google Calendar
// "Add from URL" (a read-only subscription that auto-updates). Google fetches
// this server-side with NO auth headers, and showings carry lead PII, so the
// feed is gated by a SECRET TOKEN in the URL query string (?token=...) compared
// constant-time against a per-org secret in organization_settings.
// Deploy with --no-verify-jwt (must be reachable without a Supabase JWT).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG_SLUG = "rent-finder-cleveland";

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

function jsonErr(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

  // Showings: recent (−7d) → future, only the real "agendados" (scheduled/confirmed).
  const now = new Date();
  const windowStart = new Date(now.getTime() - 7 * 86400000).toISOString();
  const { data: showings } = await supabase
    .from("showings")
    .select(`
      id, scheduled_at, status, duration_minutes,
      properties(address, unit_number, city, state, zip_code),
      leads(full_name, phone, email)
    `)
    .eq("organization_id", orgId)
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", windowStart)
    .order("scheduled_at", { ascending: true });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rent Finder Cleveland//Showings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Rent Finder — Showings",
    "X-WR-TIMEZONE:America/New_York",
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  const dtstamp = icsUtc(now);
  for (const s of (showings || []) as any[]) {
    const start = new Date(s.scheduled_at);
    if (isNaN(start.getTime())) continue;
    const dur = Number(s.duration_minutes) || 30;
    const end = new Date(start.getTime() + dur * 60000);
    const prop = s.properties || {};
    const lead = s.leads || {};
    const addr = [prop.address, prop.unit_number ? `#${prop.unit_number}` : "", prop.city, prop.state, prop.zip_code]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const leadName = (lead.full_name || "Lead").trim();
    const desc = [
      lead.phone ? `📞 ${lead.phone}` : "",
      lead.email ? `✉️ ${lead.email}` : "",
      `Estado: ${s.status}`,
    ].filter(Boolean).join("\n");
    // NOTE: intentionally NO VALARM → subscribed calendars fire zero notifications.
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:showing-${s.id}@rentfindercleveland.com`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${icsUtc(start)}`);
    lines.push(`DTEND:${icsUtc(end)}`);
    lines.push(`SUMMARY:🏠 ${icsText(leadName)} — ${icsText(addr || "Showing")}`);
    if (addr) lines.push(`LOCATION:${icsText(addr)}`);
    lines.push(`DESCRIPTION:${icsText(desc)}`);
    lines.push(`STATUS:${s.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF line endings.
  const body = lines.join("\r\n") + "\r\n";
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="rentfinder-showings.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
});
