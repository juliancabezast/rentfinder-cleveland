import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { full_name, email, phone } = body;

    // Validate required fields
    if (!full_name || !email || !phone) {
      return new Response(
        JSON.stringify({ error: "Full name, email, and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailLc = email.toLowerCase();

    // Identical response for both the insert and the update path — the old
    // "Request updated" vs "Demo request submitted" split let anyone probe
    // whether an email already existed in the table (enumeration).
    const okResponse = new Response(
      JSON.stringify({ success: true, message: "Demo request submitted" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    // Capture the SMS-consent evidence the public forms send (best-effort; the
    // form spreads buildConsentPayload). Stored on the row so there's a trail.
    const consentMeta = body.sms_consent === true
      ? {
          sms_consent: true,
          consent_method: body.consent_method ?? "web",
          consent_source_url: body.consent_source_url ?? null,
          consent_language: body.consent_language ?? null,
          consent_version: body.consent_version ?? null,
          user_agent: body.user_agent ?? req.headers.get("user-agent") ?? null,
          consent_at: body.consent_at ?? new Date().toISOString(),
        }
      : null;

    // Persist consent_meta best-effort — never fail the request if the column
    // isn't present yet.
    const persistConsent = async (id: string) => {
      if (!consentMeta) return;
      const { error } = await supabase
        .from("demo_requests")
        .update({ consent_meta: consentMeta })
        .eq("id", id);
      if (error) console.warn("consent_meta persist skipped:", error.message);
    };

    // Check for existing request with same email
    const { data: existing } = await supabase
      .from("demo_requests")
      .select("id, full_name, phone")
      .eq("email", emailLc)
      .maybeSingle();

    if (existing) {
      // Extend, never replace: only fill fields that are currently empty so an
      // unauthenticated caller who knows an email cannot corrupt existing data.
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (!existing.full_name && full_name) update.full_name = full_name;
      if (!existing.phone && phone) update.phone = phone;

      const { error: updateError } = await supabase
        .from("demo_requests")
        .update(update)
        .eq("id", existing.id);
      if (updateError) throw updateError;

      await persistConsent(existing.id);
      return okResponse;
    }

    // Insert new demo request
    const { data: insertedRow, error: insertError } = await supabase
      .from("demo_requests")
      .insert({
        full_name,
        email: emailLc,
        phone,
        status: "new",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    if (insertedRow?.id) await persistConsent(insertedRow.id);

    console.log(`New demo request from ${emailLc}`);

    return okResponse;
  } catch (error) {
    console.error("Error processing demo request:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});