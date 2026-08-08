import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mark a showing as attended / no-show straight from the Leasing Agent calendar
// feed, without logging into the panel.
//
// A subscribed iCal feed is READ-ONLY — no calendar client will ever show
// accept/decline buttons for it — so the two links in each event's DESCRIPTION
// are the way to record an outcome from there.
//
// ⚠️ TWO STEPS ON PURPOSE. The link opens a confirmation page; the button POSTs.
// Mail scanners, link previewers and calendar clients PREFETCH URLs, so a GET
// that mutated would mark showings as attended that nobody ever touched.
//
// Returns JSON, not HTML. Supabase coerces any text/html served from the
// functions domain to text/plain and adds nosniff (anti-phishing policy on
// *.supabase.co) — verified live: text/calendar and application/json survive,
// text/html does not. So the page lives on the app domain and calls this.
// (Same policy silently breaks supabase/functions/unsubscribe, which still
// tries to serve an HTML page — worth fixing separately.)
//
// Deploy with --no-verify-jwt (opened from a calendar, no Supabase session).

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("LEAD_TOKEN_SECRET") || Deno.env.get("UNSUBSCRIBE_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Token shape: <showingId>.<action>.<exp>.<sig>, minted by showings-ics.
 * Signature is verified BEFORE any DB work — a forged token costs one HMAC.
 */
async function verify(token: string): Promise<{ showingId: string; action: string } | null> {
  if (!TOKEN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [showingId, action, expStr, sig] = parts;
  if (action !== "showed" && action !== "no_show") return null;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const msg = `${showingId}.${action}.${expStr}`;
  const expected = b64url(new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)),
  ));
  if (!timingSafeEqual(sig, expected)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return { showingId, action };
}

// Duplicated from src/lib/showingReports.ts — Deno cannot import from src/.
// ⚠️ Also duplicated in telegram-webhook. This text is NOT internal: it flows to
// the public Leasing Tracker where the property owner reads it verbatim. Change
// one, change all three.
const quickReportText = (attended: boolean): string =>
  attended
    ? "Asistió ✅"
    : "No asistió 👻 — en seguimiento para confirmar la visita";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let token = url.searchParams.get("t") || "";
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (body?.t) token = String(body.t);
  } else if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const parsed = await verify(token);
  if (!parsed) return json({ error: "invalid_or_expired" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: showing } = await supabase
    .from("showings")
    .select(`id, scheduled_at, status, agent_report, organization_id,
             leads(full_name), properties(address, city)`)
    .eq("id", parsed.showingId)
    .maybeSingle();

  if (!showing) return json({ error: "not_found" }, 404);

  const lead = (showing as any).leads || {};
  const prop = (showing as any).properties || {};
  const who = String(lead.full_name || "el prospecto");
  const where = [prop.address, prop.city].filter(Boolean).join(", ");
  const whenEt = new Date((showing as any).scheduled_at).toLocaleString("es-CO", {
    timeZone: "America/New_York", weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit",
  });
  const attended = parsed.action === "showed";

  const showingInfo = {
    who, where, when: whenEt, action: parsed.action,
    attended,
    already_reported: (showing as any).agent_report || null,
  };

  // ── Already recorded: say so instead of silently rewriting it ──────────
  if ((showing as any).agent_report) {
    return json({ ...showingInfo, state: "already_reported" });
  }

  // ── GET: describe only. Never mutate on a GET — mail scanners, link
  // previewers and calendar clients prefetch URLs, and a mutating GET would
  // mark showings attended that nobody ever touched.
  if (req.method === "GET") {
    return json({ ...showingInfo, state: "confirm" });
  }

  // ── POST: record it. Same fields the Telegram button writes. ───────────
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = attended
    ? { status: "completed", completed_at: nowIso, followed_up_at: nowIso }
    : { status: "no_show", followed_up_at: nowIso };
  update.agent_report = quickReportText(attended);

  const { error } = await supabase.from("showings").update(update).eq("id", parsed.showingId);
  if (error) {
    console.error("showing-attendance update failed:", error.message);
    return json({ error: "save_failed" }, 500);
  }

  return json({
    ...showingInfo,
    state: "saved",
    report: quickReportText(attended),
  });
});
