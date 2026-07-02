import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public CAN-SPAM unsubscribe endpoint.
// Accepts a token of the form `<leadUuid>.<base64url(HMAC-SHA256(leadUuid))>`
// signed with UNSUBSCRIBE_SECRET. Handles both:
//   - GET  → human clicks the link in an email → returns an HTML confirmation
//   - POST → RFC 8058 List-Unsubscribe One-Click from the mail client
// Deploy with --no-verify-jwt (this must be reachable without auth).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signLeadId(leadId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(leadId),
  );
  return base64urlEncode(new Uint8Array(sig));
}

// Constant-time compare to avoid leaking signature validity via timing.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function htmlPage(title: string, message: string, status = 200): Response {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#6366F1 100%);padding:28px 30px;text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${title}</h1>
          <div style="width:56px;height:3px;background:#ffb22c;margin:14px auto 0;border-radius:2px;"></div>
        </td></tr>
        <tr><td style="padding:30px;text-align:center;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#333;">${message}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return htmlPage("Unsubscribe", "Method not allowed.", 405);
  }

  // Fail closed: without the signing secret we cannot verify tokens.
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") || "";
  if (!secret) {
    console.error("UNSUBSCRIBE_SECRET is not set — failing closed.");
    return htmlPage(
      "Unsubscribe unavailable",
      "This unsubscribe link is temporarily unavailable. Please reply to any of our emails and we'll remove you right away.",
      503,
    );
  }

  // Token can arrive on the query string (GET link, and Resend appends it to
  // the One-Click POST URL) or in the POST body.
  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";
  if (!token && req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") || "";
      if (
        ct.includes("application/x-www-form-urlencoded") ||
        ct.includes("multipart/form-data")
      ) {
        const form = await req.formData();
        token = String(form.get("token") || "");
      } else if (ct.includes("application/json")) {
        const j = await req.json();
        token = String(j?.token || "");
      }
    } catch (_) {
      /* fall through to invalid-token handling */
    }
  }

  if (!token) {
    return htmlPage("Invalid link", "This unsubscribe link is missing its token.", 400);
  }

  // Format: <leadId>.<signature>. UUIDs and base64url both exclude ".".
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot >= token.length - 1) {
    return htmlPage("Invalid link", "This unsubscribe link is malformed.", 400);
  }
  const leadId = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = await signLeadId(leadId, secret);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    return htmlPage("Invalid link", "This unsubscribe link could not be verified.", 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("leads")
    .update({ unsubscribed_at: nowIso, email_marketing_consent: false })
    .eq("id", leadId)
    .select("id, organization_id, email")
    .maybeSingle();

  if (updErr) {
    console.error("Unsubscribe update failed:", updErr.message);
    return htmlPage(
      "Something went wrong",
      "We couldn't process your request right now. Please try again in a few minutes.",
      500,
    );
  }

  // Valid signature but the lead no longer exists: report success (the intent
  // — not receiving mail — is satisfied) and avoid leaking existence.
  if (!updated) {
    return htmlPage(
      "You're unsubscribed",
      "You will no longer receive marketing emails from us.",
      200,
    );
  }

  // Best-effort CAN-SPAM / TCPA audit trail. Never block the opt-out on this.
  try {
    await supabase.from("consent_log").insert({
      organization_id: updated.organization_id,
      lead_id: updated.id,
      consent_type: "email_marketing",
      granted: false,
      method: "unsubscribe_link",
      evidence_text: `Recipient unsubscribed from marketing email via ${req.method === "POST" ? "one-click" : "link"} at ${nowIso}`,
      withdrawal_method: "email_link",
      withdrawn_at: nowIso,
    });
  } catch (logErr) {
    console.warn("consent_log insert failed:", logErr);
  }

  return htmlPage(
    "You're unsubscribed",
    "You will no longer receive marketing emails from us. If this was a mistake, just reply to any of our emails and we'll help.",
    200,
  );
});
