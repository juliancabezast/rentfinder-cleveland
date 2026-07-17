// resolve-lead-token
//
// Public (--no-verify-jwt) resolver for the per-recipient prefill token that
// campaign emails carry as ?t=<token>. It lets the public booking page auto-fill
// a KNOWN lead's name/phone/email so they don't re-type anything (audit finding:
// ~3,000 recipients are existing leads forced to re-enter their own details).
//
// Token format:  <leadId>.<exp>.<sigBase64url>
//   sig = HMAC-SHA256( "<leadId>.<exp>", secret )
//   exp = unix seconds; the token is refused once expired.
// Signed + minted server-side in process-email-queue (the HMAC secret never
// touches the client). Same secret family as the unsubscribe token.
//
// Returns ONLY the minimal fields needed to prefill the form — first_name,
// full_name, phone, email — never scores, notes, or the full lead record.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(msg: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64urlEncode(new Uint8Array(sig));
}

// Constant-time string compare.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const secret =
      Deno.env.get("LEAD_TOKEN_SECRET") || Deno.env.get("UNSUBSCRIBE_SECRET") || "";
    if (!secret) return json({ error: "not_configured" }, 200);

    const { token } = await req.json().catch(() => ({ token: "" }));
    if (!token || typeof token !== "string") return json({ error: "missing_token" }, 200);

    const parts = token.split(".");
    if (parts.length !== 3) return json({ error: "bad_token" }, 200);
    const [leadId, expStr, sig] = parts;

    // Verify signature (constant-time) before touching the DB.
    const expected = await sign(`${leadId}.${expStr}`, secret);
    if (!timingSafeEqual(sig, expected)) return json({ error: "bad_signature" }, 200);

    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return json({ error: "expired" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: lead, error } = await supabase
      .from("leads")
      .select("first_name, full_name, phone, email")
      .eq("id", leadId)
      .maybeSingle();

    if (error || !lead) return json({ error: "not_found" }, 200);

    // Derive a friendly first name when only full_name is on file.
    const firstName =
      (lead.first_name && String(lead.first_name).trim()) ||
      (lead.full_name ? String(lead.full_name).trim().split(/\s+/)[0] : "") ||
      null;

    return json({
      first_name: firstName,
      full_name: lead.full_name || null,
      phone: lead.phone || null,
      email: lead.email || null,
    });
  } catch (err) {
    console.error("resolve-lead-token error:", err);
    return json({ error: "internal" }, 200);
  }
});
