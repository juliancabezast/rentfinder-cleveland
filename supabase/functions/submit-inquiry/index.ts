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

/**
 * Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if not 10/11 digits.
 * The leads.phone column is stored E.164 (the noah dedup trigger canonicalizes
 * NEW.phone on INSERT), so we MUST match against the normalized value — matching
 * the raw user-typed string ("(216) 555-0100") never hits an existing lead.
 */
function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

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
      const { data: any1 } = await supabase
        .from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      orgId = any1?.id ?? null;
    }
    if (!orgId) return json({ error: "Organization not found." }, 500);

    const propertyId = body.propertyId && UUID_RE.test(body.propertyId) ? body.propertyId : null;
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = body.userAgent || req.headers.get("user-agent") || "unknown";
    const now = new Date().toISOString();
    const withConsent = !!body.consent && !!phone;
    // Canonicalize the phone BEFORE matching/inserting. leads.phone is stored
    // E.164 (noah dedup trigger), so raw-string matching always missed and a
    // repeat phone-only inquirer 500'd. When the phone can't be normalized we
    // fall back to the raw value on insert (the trigger will canonicalize it).
    const phoneE164 = toE164(phone);
    const phoneForDb = phoneE164 || phone || null;

    const detail = `Question${body.propertyLabel ? ` about ${body.propertyLabel}` : ""}: ${message}`.slice(0, 1000);

    // Find-or-create by phone, then email, within the org. A blind INSERT used
    // to be canceled by the noah dedup trigger (BEFORE INSERT → RETURN NULL),
    // which made .single() see zero rows and this endpoint 500 even though the
    // lead existed. Property interest is recorded as a lead_property_interests
    // TAG via the add_lead_property_tag RPC (tags accumulate — asking about a
    // second property ADDS a tag, it never replaces the first).
    const findExisting = async () => {
      if (phoneE164) {
        const { data } = await supabase
          .from("leads")
          .select("id, full_name, email, phone, source_detail")
          .eq("organization_id", orgId)
          .eq("phone", phoneE164)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data) return data;
      }
      if (email) {
        const { data } = await supabase
          .from("leads")
          .select("id, full_name, email, phone, source_detail")
          .eq("organization_id", orgId)
          .eq("email", email)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data) return data;
      }
      return null;
    };

    let leadId: string;
    let isNewLead = false;
    const existing = await findExisting();

    if (existing) {
      leadId = existing.id;
      const update: Record<string, unknown> = {
        updated_at: now,
        last_contact_at: now,
        last_contact_channel: "web_form", // inbound website inquiry
        source_detail: existing.source_detail
          ? `${existing.source_detail} | Also: ${detail}`.slice(0, 2000)
          : detail,
      };
      if (!existing.full_name && fullName) update.full_name = fullName;
      if (!existing.email && email) update.email = email;
      if (!existing.phone && phoneForDb) update.phone = phoneForDb;
      // Only upgrade consent — never revoke on an email-only follow-up.
      if (withConsent) {
        update.sms_consent = true;
        update.sms_consent_at = now;
        update.call_consent = true;
        update.call_consent_at = now;
      }
      const { error: updateError } = await supabase.from("leads").update(update).eq("id", leadId);
      if (updateError) console.error("submit-inquiry enrichment error:", updateError);
    } else {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          organization_id: orgId,
          full_name: fullName || null,
          email: email || null,
          phone: phoneForDb,
          source: "website",
          source_detail: detail,
          status: "new",
          sms_consent: withConsent,
          sms_consent_at: withConsent ? now : null,
          call_consent: withConsent,
          call_consent_at: withConsent ? now : null,
        })
        .select("id")
        .single();

      if (leadError || !lead) {
        // The dedup trigger may have canceled the insert in a race — re-resolve.
        const raced = await findExisting();
        if (raced) {
          leadId = raced.id;
          // The insert we attempted carried consent; the merge kept the existing
          // row, so re-apply the consent upgrade here (never revoke).
          if (withConsent) {
            await supabase.from("leads").update({
              sms_consent: true, sms_consent_at: now,
              call_consent: true, call_consent_at: now,
              last_contact_at: now, last_contact_channel: "web_form",
            }).eq("id", leadId);
          }
        } else {
          console.error("submit-inquiry lead error:", leadError);
          return json({ error: "Failed to submit your question." }, 500);
        }
      } else {
        leadId = lead.id;
        isNewLead = true;
      }
    }

    // Property-interest tag (accumulates; bumps recency when asked again).
    if (propertyId) {
      const { error: tagError } = await supabase.rpc("add_lead_property_tag", {
        p_lead_id: leadId,
        p_property_id: propertyId,
        p_source: "website_inquiry",
      });
      if (tagError) console.error("Property tag error:", tagError);
    }

    // Best-effort real-time new-lead alert (RFC Report bot) — never blocks
    if (isNewLead) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            channel: "report", event: "new_lead",
            payload: { name: fullName || "Website inquiry", source: "website (ask a question)", phone, interest: body.propertyLabel },
          }),
        });
      } catch (_) { /* ignore */ }
    }

    // TCPA evidence — only when a phone was given with consent.
    if (withConsent) {
      const evidence = body.consentText || "Consent given via website inquiry form.";
      for (const consent_type of ["sms_marketing", "automated_calls"]) {
        await supabase.from("consent_log").insert({
          organization_id: orgId,
          lead_id: leadId,
          consent_type,
          granted: true,
          method: "web_form",
          evidence_text: evidence,
          ip_address: clientIP,
          user_agent: userAgent,
        });
      }
    }

    return json({ ok: true, leadId }, 200);
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
