import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const {
      property_id,
      organization_id,
      slot_date,
      slot_time,
      full_name,
      phone,
      email,
      consent,
    } = body;

    // ── Validation ────────────────────────────────────────────────────
    if (!property_id || !organization_id || !slot_date || !slot_time || !full_name || !phone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: property_id, organization_id, slot_date, slot_time, full_name, phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verify slot is still available ────────────────────────────────
    const { data: slot, error: slotErr } = await supabase
      .from("showing_available_slots")
      .select("id, is_booked, is_enabled, duration_minutes")
      .eq("property_id", property_id)
      .eq("slot_date", slot_date)
      .eq("slot_time", slot_time)
      .single();

    if (slotErr || !slot) {
      return new Response(
        JSON.stringify({ error: "This time slot is no longer available. Please select another." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (slot.is_booked || !slot.is_enabled) {
      return new Response(
        JSON.stringify({ error: "This slot was just booked by someone else. Please pick a different time." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get property info ─────────────────────────────────────────────
    const { data: property } = await supabase
      .from("properties")
      .select("address, city, state, zip_code")
      .eq("id", property_id)
      .single();

    const propertyAddress = property
      ? `${property.address}, ${property.city}, ${property.state} ${property.zip_code}`
      : "Property";

    // ── Find or create lead ───────────────────────────────────────────
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;

    let leadId: string;

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, status")
      .eq("organization_id", organization_id)
      .eq("phone", formattedPhone)
      .maybeSingle();

    if (existingLead) {
      leadId = existingLead.id;
    } else {
      const { data: newLead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          organization_id,
          full_name: full_name.trim(),
          phone: formattedPhone,
          email: email || null,
          source: "web_schedule",
          status: "new",
          sms_consent: consent?.sms_consent ?? false,
          call_consent: consent?.call_consent ?? false,
        })
        .select("id")
        .single();

      if (leadErr || !newLead) {
        console.error("Lead creation error:", leadErr);
        return new Response(
          JSON.stringify({ error: "Failed to register your information. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      leadId = newLead.id;
    }

    // ── Log consent ───────────────────────────────────────────────────
    if (consent) {
      await supabase.from("consent_log").insert({
        organization_id,
        lead_id: leadId,
        consent_type: "sms_and_call",
        granted: consent.sms_consent ?? false,
        method: consent.consent_method ?? "web",
        source_url: consent.consent_source_url ?? null,
        consent_language: consent.consent_language ?? null,
        consent_version: consent.consent_version ?? null,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        user_agent: consent.user_agent ?? null,
      });
    }

    // ── Build scheduled_at datetime ───────────────────────────────────
    // slot_time is "HH:MM:SS", slot_date is "YYYY-MM-DD"
    const scheduledAt = `${slot_date}T${slot_time}-05:00`; // America/New_York (EST)

    // ── Create showing ────────────────────────────────────────────────
    const { data: showing, error: showingErr } = await supabase
      .from("showings")
      .insert({
        organization_id,
        lead_id: leadId,
        property_id,
        scheduled_at: scheduledAt,
        duration_minutes: slot.duration_minutes || 30,
        status: "scheduled",
      })
      .select("id")
      .single();

    if (showingErr || !showing) {
      console.error("Showing creation error:", showingErr);
      return new Response(
        JSON.stringify({ error: "Failed to create showing. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mark slot as booked ───────────────────────────────────────────
    await supabase
      .from("showing_available_slots")
      .update({
        is_booked: true,
        booked_showing_id: showing.id,
        booked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.id);

    // ── Mark buffer slot (next 30-min slot on same date) ──────────────
    const [hStr, mStr] = slot_time.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const bufferMinutes = m + 30;
    const bufferH = h + Math.floor(bufferMinutes / 60);
    const bufferM = bufferMinutes % 60;
    const bufferTime = `${String(bufferH).padStart(2, "0")}:${String(bufferM).padStart(2, "0")}:00`;

    // Try to mark the buffer slot — if it exists
    await supabase
      .from("showing_available_slots")
      .update({
        is_booked: true,
        booked_showing_id: showing.id,
        booked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("property_id", property_id)
      .eq("slot_date", slot_date)
      .eq("slot_time", bufferTime)
      .eq("is_booked", false);

    // ── Update lead status to showing_scheduled ───────────────────────
    await supabase
      .from("leads")
      .update({ status: "showing_scheduled", updated_at: new Date().toISOString() })
      .eq("id", leadId);

    // ── Schedule Samuel confirmation task (24h before showing) ────────
    const showingDate = new Date(scheduledAt);
    const confirmationTime = new Date(showingDate.getTime() - 24 * 60 * 60 * 1000);

    await supabase.from("agent_tasks").insert({
      organization_id,
      lead_id: leadId,
      agent_type: "showing_confirmation",
      action_type: "call",
      scheduled_for: confirmationTime.toISOString(),
      max_attempts: 2,
      status: "pending",
      context: {
        showing_id: showing.id,
        property_id,
        property_address: propertyAddress,
        scheduled_at: scheduledAt,
        source: "web_schedule",
      },
    });

    // ── Return success ────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        showing_id: showing.id,
        message: "Showing booked successfully.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("book-public-showing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
