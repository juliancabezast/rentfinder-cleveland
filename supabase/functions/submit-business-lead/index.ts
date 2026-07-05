import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// submit-business-lead
//
// Public (no-JWT) capture for B2B leads from the marketplace footer and the
// /housing-partners/ (voucher-assistance orgs) and /corporate-leasing/ SEO
// sections. Short form: name / email / phone (+ optional org name & message).
// Writes to `business_leads` (separate from renter `leads`), surfaced in the
// authed "Business" sidebar page. No renter-pipeline side effects.
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORG_SLUG = "rent-finder-cleveland";
const VALID_TYPES = ["housing_partner", "corporate_leasing"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampStr(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function isValidEmail(e: unknown): boolean {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  req.headers.get("cf-connecting-ip") ||
  null;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));

    // Honeypot — bots fill hidden fields; silently accept so they don't retry.
    if (typeof body.company_website === "string" && body.company_website.trim() !== "") {
      return json({ success: true });
    }

    const leadType = clampStr(body.lead_type, 40);
    if (!leadType || !VALID_TYPES.includes(leadType)) {
      return json({ error: "Invalid or missing lead_type." }, 400);
    }

    const fullName = clampStr(body.full_name, 120);
    const email = isValidEmail(body.email) ? String(body.email).trim().slice(0, 160) : null;
    const phone = clampStr(body.phone, 40);

    // Require a name and at least one contact method
    if (!fullName || (!email && !phone)) {
      return json({ error: "Please enter your name and an email or phone number." }, 400);
    }

    // Resolve the single tenant org (by slug, fallback oldest)
    let orgId: string | null = null;
    {
      const { data: org } = await supabase
        .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
      orgId = org?.id ?? null;
      if (!orgId) {
        const { data: fb } = await supabase
          .from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
        orgId = fb?.id ?? null;
      }
    }
    if (!orgId) return json({ error: "org_not_found" }, 500);

    const { data: inserted, error: insErr } = await supabase
      .from("business_leads")
      .insert({
        organization_id: orgId,
        lead_type: leadType,
        full_name: fullName,
        organization_name: clampStr(body.organization_name, 160),
        email,
        phone,
        message: clampStr(body.message, 1500),
        source: clampStr(body.source, 40) || "footer",
        source_detail: clampStr(body.source_detail, 200),
        ip_address: clientIp(req),
        user_agent: clampStr(body.user_agent, 400) || req.headers.get("user-agent"),
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      console.error("business_leads insert error:", insErr);
      return json({ error: "Could not submit. Please try again." }, 500);
    }

    // Best-effort Telegram alert to the team (never fails the request)
    try {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("telegram_bot_token, telegram_chat_id")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (creds?.telegram_bot_token && creds?.telegram_chat_id) {
        const label = leadType === "housing_partner" ? "Housing Partner" : "Corporate Leasing";
        const msg = [
          `🤝 <b>New Business Lead — ${label}</b>`,
          ``,
          `👤 <b>${fullName}</b>${body.organization_name ? ` — ${clampStr(body.organization_name, 160)}` : ""}`,
          `✉️ ${email || "—"}`,
          `📞 ${phone || "—"}`,
          body.message ? `📝 ${clampStr(body.message, 300)}` : ``,
          `🔗 ${clampStr(body.source_detail, 120) || clampStr(body.source, 40) || "footer"}`,
          `➡️ In Business tab.`,
        ].filter(Boolean).join("\n");
        await fetch(`https://api.telegram.org/bot${creds.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: creds.telegram_chat_id, text: msg,
            parse_mode: "HTML", disable_web_page_preview: true,
          }),
        });
      }
    } catch (tgErr) {
      console.warn("Telegram notify failed (non-critical):", tgErr);
    }

    return json({ success: true, id: inserted.id });
  } catch (err) {
    console.error("submit-business-lead error:", err);
    return json({ error: "Internal server error. Please try again later." }, 500);
  }
});
