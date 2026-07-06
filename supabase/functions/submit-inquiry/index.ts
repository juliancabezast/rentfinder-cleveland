import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// submit-inquiry — public "Ask a question about this home" lead capture.
// Creates a website lead tied to the property, storing the question in
// source_detail. SMS/call consent is only recorded when the visitor provides a
// phone AND checks the consent box (TCPA); an email-only inquiry needs no
// consent (the team simply replies to a user-initiated question).
// Org is resolved server-side by slug — never trusted from the client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_SLUG = "rent-finder-cleveland";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface InquiryBody {
  full_name?: string;
  email?: string;
  phone?: string;
  message: string;
  propertyId?: string;
  propertyLabel?: string;
  consent?: boolean;
  consentText?: string;
  userAgent?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const body = (await req.json()) as InquiryBody;

    const message = (body.message || "").trim();
    const email = (body.email || "").trim();
    const phone = (body.phone || "").trim();
    const fullName = (body.full_name || "").trim();

    if (!message || message.length < 2) {
      return json({ error: "A question/message is required." }, 400);
    }
    if (!email && !phone) {
      return json({ error: "Provide an email or phone so we can reply." }, 400);
    }
    if (email && !EMAIL_RE.test(email)) {
      return json({ error: "Please enter a valid email address." }, 400);
    }

    // Resolve org server-side (single tenant).
    let orgId: string | null = null;
    const { data: bySlug } = await supabase
      .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
    orgId = bySlug?.id ?? null;
    if (!orgId) {
      const { data: any1 } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
      orgId = any1?.id ?? null;
    }
    if (!orgId) return json({ error: "Organization not found." }, 500);

    const propertyId = body.propertyId && UUID_RE.test(body.propertyId) ? body.propertyId : null;
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = body.userAgent || req.headers.get("user-agent") || "unknown";
    const now = new Date().toISOString();
    const withConsent = !!body.consent && !!phone;

    const detail = `Question${body.propertyLabel ? ` about ${body.propertyLabel}` : ""}: ${message}`.slice(0, 1000);

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        organization_id: orgId,
        full_name: fullName || null,
        email: email || null,
        phone: phone || null,
        source: "website",
        source_detail: detail,
        interested_property_id: propertyId,
        status: "new",
        lead_score: 50,
        sms_consent: withConsent,
        sms_consent_at: withConsent ? now : null,
        call_consent: withConsent,
        call_consent_at: withConsent ? now : null,
      })
      .select("id")
      .single();

    if (leadError) {
      console.error("submit-inquiry lead error:", leadError);
      return json({ error: "Failed to submit your question." }, 500);
    }

    // TCPA evidence — only when a phone was given with consent.
    if (withConsent) {
      const evidence = body.consentText || "Consent given via website inquiry form.";
      for (const consent_type of ["sms_marketing", "automated_calls"]) {
        await supabase.from("consent_log").insert({
          organization_id: orgId,
          lead_id: lead.id,
          consent_type,
          granted: true,
          method: "web_form",
          evidence_text: evidence,
          ip_address: clientIP,
          user_agent: userAgent,
        });
      }
    }

    return json({ ok: true, leadId: lead.id }, 200);
  } catch (e) {
    console.error("submit-inquiry error:", e);
    return json({ error: "Unexpected error." }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
