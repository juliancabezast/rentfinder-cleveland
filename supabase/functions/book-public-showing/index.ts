import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Email template ────────────────────────────────────────────────────
function showingConfirmationEmail(data: {
  leadName: string;
  propertyAddress: string;
  dateFormatted: string;
  timeFormatted: string;
  duration: number;
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f1f1;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Showing Confirmed</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;">
        Hi <strong>${data.leadName}</strong>, your showing is confirmed!
      </p>
      <div style="background-color:#f8f8f8;border-left:4px solid #370d4b;padding:16px 20px;border-radius:4px;margin:16px 0;">
        <table style="border-collapse:collapse;width:100%;">
          <tr>
            <td style="padding:6px 0;color:#666;font-size:14px;width:100px;">Property:</td>
            <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${data.propertyAddress}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#666;font-size:14px;">Date:</td>
            <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${data.dateFormatted}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#666;font-size:14px;">Time:</td>
            <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${data.timeFormatted}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#666;font-size:14px;">Duration:</td>
            <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${data.duration} minutes</td>
          </tr>
        </table>
      </div>
      <p style="margin:16px 0 0;color:#666;font-size:13px;line-height:1.5;">
        You'll receive a confirmation call approximately 24 hours before your showing.
        If you need to reschedule or cancel, please call us directly.
      </p>
      <hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />
      <p style="margin:0;color:#999;font-size:11px;text-align:center;">
        Rent Finder Cleveland &bull; HomeGuard Management
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Helper: format time ───────────────────────────────────────────────
function formatTimeHuman(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${mStr} ${ampm}`;
}

function formatDateHuman(d: string): string {
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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
    let leadEmail: string | null = email || null;

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, status, email")
      .eq("organization_id", organization_id)
      .eq("phone", formattedPhone)
      .maybeSingle();

    if (existingLead) {
      leadId = existingLead.id;
      // Use existing email if lead didn't provide one now
      if (!leadEmail && existingLead.email) {
        leadEmail = existingLead.email;
      }
      // Update email if they provided a new one and lead didn't have one
      if (email && !existingLead.email) {
        await supabase.from("leads").update({ email }).eq("id", leadId);
      }
    } else {
      const { data: newLead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          organization_id,
          full_name: full_name.trim(),
          phone: formattedPhone,
          email: leadEmail,
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
    const durationMinutes = slot.duration_minutes || 30;

    // ── Create showing ────────────────────────────────────────────────
    const { data: showing, error: showingErr } = await supabase
      .from("showings")
      .insert({
        organization_id,
        lead_id: leadId,
        property_id,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
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

    // ── Send confirmation email (if lead has email) ───────────────────
    if (leadEmail) {
      try {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: leadEmail,
            subject: `Showing Confirmed — ${property?.address || "Property Tour"}`,
            html: showingConfirmationEmail({
              leadName: full_name.trim(),
              propertyAddress,
              dateFormatted: formatDateHuman(slot_date),
              timeFormatted: formatTimeHuman(slot_time),
              duration: durationMinutes,
            }),
            notification_type: "showing_confirmation",
            organization_id,
            related_entity_id: showing.id,
            related_entity_type: "showing",
          },
        });
      } catch (emailErr) {
        // Don't fail the booking if email fails
        console.error("Confirmation email failed:", emailErr);
      }
    }

    // ── System log ────────────────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id,
      level: "info",
      category: "showing",
      event_type: "public_showing_booked",
      message: `Showing booked via public page: ${full_name.trim()} at ${propertyAddress} on ${formatDateHuman(slot_date)} ${formatTimeHuman(slot_time)}`,
      details: {
        showing_id: showing.id,
        lead_id: leadId,
        property_id,
        slot_date,
        slot_time,
        source: "web_schedule",
        lead_is_new: !existingLead,
      },
      related_lead_id: leadId,
      related_showing_id: showing.id,
    });

    // ── Cost record (Zacchaeus) ───────────────────────────────────────
    // Record minimal platform cost for the booking interaction
    const now = new Date();
    await supabase.from("cost_records").insert({
      organization_id,
      recorded_at: now.toISOString(),
      period_start: now.toISOString(),
      period_end: now.toISOString(),
      service: "openai", // Platform processing cost
      usage_quantity: 1,
      usage_unit: "booking",
      unit_cost: 0.0,
      total_cost: 0.0,
      lead_id: leadId,
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
