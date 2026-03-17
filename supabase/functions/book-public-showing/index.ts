import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── City → Timezone mapping ──────────────────────────────────────────
const CITY_TZ: Record<string, string> = {
  "Cleveland": "America/New_York", "Akron": "America/New_York",
  "Elyria": "America/New_York", "Lorain": "America/New_York",
  "Canton": "America/New_York", "Toledo": "America/New_York",
  "Columbus": "America/New_York", "Parma": "America/New_York",
  "Milwaukee": "America/Chicago", "Madison": "America/Chicago",
  "Green Bay": "America/Chicago", "Kenosha": "America/Chicago",
  "Saint Louis": "America/Chicago", "St. Louis": "America/Chicago",
  "Kansas City": "America/Chicago", "Chicago": "America/Chicago",
  "Springfield": "America/Chicago", "Racine": "America/Chicago",
  "Detroit": "America/Detroit", "Pittsburgh": "America/New_York",
};
function getTimezoneForCity(city: string | null): string {
  if (!city) return "America/New_York";
  return CITY_TZ[city] || "America/New_York";
}

// ── Email template ────────────────────────────────────────────────────
function showingConfirmationEmail(data: {
  leadName: string;
  propertyAddress: string;
  dateFormatted: string;
  timeFormatted: string;
  duration: number;
  googleCalUrl: string;
  icsDataUri: string;
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
      <div style="text-align:center;margin:20px 0;">
        <a href="${data.googleCalUrl}" target="_blank" style="display:inline-block;background-color:#370d4b;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;margin:0 6px 8px;">
          Add to Google Calendar
        </a>
        <a href="${data.icsDataUri}" download="showing.ics" style="display:inline-block;background-color:#ffffff;color:#370d4b;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid #370d4b;margin:0 6px 8px;">
          Download .ics
        </a>
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

function formatDateHuman(d: string, tz = "America/New_York"): string {
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Calendar helpers ─────────────────────────────────────────────────
function buildGoogleCalUrl(data: {
  title: string;
  location: string;
  slotDate: string;
  slotTime: string;
  durationMin: number;
  timezone?: string;
}): string {
  // slotDate: "YYYY-MM-DD", slotTime: "HH:MM:SS"
  const start = data.slotDate.replace(/-/g, "") + "T" + data.slotTime.replace(/:/g, "").slice(0, 6);
  const [h, m] = data.slotTime.split(":").map(Number);
  const endTotal = h * 60 + m + data.durationMin;
  const eH = String(Math.floor(endTotal / 60)).padStart(2, "0");
  const eM = String(endTotal % 60).padStart(2, "0");
  const end = data.slotDate.replace(/-/g, "") + "T" + eH + eM + "00";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: data.title,
    dates: `${start}/${end}`,
    details: `Property showing at ${data.location}`,
    location: data.location,
    ctz: data.timezone || "America/New_York",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcsDataUri(data: {
  title: string;
  location: string;
  slotDate: string;
  slotTime: string;
  durationMin: number;
  timezone?: string;
}): string {
  const tz = data.timezone || "America/New_York";
  const start = data.slotDate.replace(/-/g, "") + "T" + data.slotTime.replace(/:/g, "").slice(0, 6);
  const [h, m] = data.slotTime.split(":").map(Number);
  const endTotal = h * 60 + m + data.durationMin;
  const eH = String(Math.floor(endTotal / 60)).padStart(2, "0");
  const eM = String(endTotal % 60).padStart(2, "0");
  const end = data.slotDate.replace(/-/g, "") + "T" + eH + eM + "00";
  const uid = crypto.randomUUID();
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RentFinderCleveland//Showing//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${start}`,
    `DTEND;TZID=${tz}:${end}`,
    `SUMMARY:${data.title}`,
    `LOCATION:${data.location}`,
    `DESCRIPTION:Property showing at ${data.location}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
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
      has_voucher,
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
      .eq("organization_id", organization_id)
      .eq("property_id", property_id)
      .eq("slot_date", slot_date)
      .eq("slot_time", slot_time)
      .eq("is_enabled", true)
      .eq("is_booked", false)
      .maybeSingle();

    if (slotErr) {
      console.error("Slot lookup error:", slotErr);
      return new Response(
        JSON.stringify({ error: "Error checking slot availability. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!slot) {
      return new Response(
        JSON.stringify({ error: "This time slot is no longer available. Please select another." }),
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
      // Update lead with property + email if needed
      const leadUpdate: Record<string, any> = {
        interested_property_id: property_id,
        updated_at: new Date().toISOString(),
      };
      if (email && !existingLead.email) leadUpdate.email = email;
      if (has_voucher !== undefined) leadUpdate.has_voucher = !!has_voucher;
      await supabase.from("leads").update(leadUpdate).eq("id", leadId);
    } else {
      const { data: newLead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          organization_id,
          full_name: full_name.trim(),
          phone: formattedPhone,
          email: leadEmail,
          source: "website",
          status: "new",
          interested_property_id: property_id,
          has_voucher: has_voucher !== undefined ? !!has_voucher : null,
          sms_consent: consent?.sms_consent ?? false,
          call_consent: consent?.call_consent ?? false,
        })
        .select("id")
        .single();

      if (leadErr || !newLead) {
        console.error("Lead creation error:", leadErr);
        return new Response(
          JSON.stringify({ error: `Failed to register: ${leadErr?.message || "Unknown error"}. Please try again.` }),
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
    // Compute UTC offset using difference method (works in any runtime tz)
    const orgTz = getTimezoneForCity(property?.city || null);
    const refDate = new Date(`${slot_date}T12:00:00Z`);
    const utcRepr = new Date(refDate.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzRepr = new Date(refDate.toLocaleString("en-US", { timeZone: orgTz }));
    const offsetHours = Math.round((tzRepr.getTime() - utcRepr.getTime()) / 3600000);
    const offsetSign = offsetHours >= 0 ? "+" : "-";
    const offsetAbs = String(Math.abs(offsetHours)).padStart(2, "0");
    const tzOffset = `${offsetSign}${offsetAbs}:00`;
    const scheduledAt = `${slot_date}T${slot_time}${tzOffset}`;
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
        booking_source: "public_link",
      })
      .select("id")
      .single();

    if (showingErr || !showing) {
      console.error("Showing creation error:", showingErr);
      return new Response(
        JSON.stringify({ error: `Failed to create showing: ${showingErr?.message || "Unknown error"}. Please try again.` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mark slot as booked (with race condition protection) ──────────
    const { data: bookedSlot, error: bookErr } = await supabase
      .from("showing_available_slots")
      .update({
        is_booked: true,
        booked_showing_id: showing.id,
        booked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.id)
      .eq("is_booked", false)  // Only update if still available (atomic check)
      .select("id")
      .single();

    if (bookErr || !bookedSlot) {
      // Slot was taken by another request — delete the showing we just created
      await supabase.from("showings").delete().eq("id", showing.id);
      return new Response(
        JSON.stringify({ error: "That time slot was just taken. Please choose another." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Block ALL properties at this time slot (single-agent model) ────
    // Only one leasing agent — when a time is booked, block it across
    // every property so no one else can book the same hour.
    const bookingUpdate = {
      is_booked: true,
      booked_showing_id: showing.id,
      booked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Block the booked time on ALL properties (not just the one booked)
    await supabase
      .from("showing_available_slots")
      .update(bookingUpdate)
      .eq("organization_id", organization_id)
      .eq("slot_date", slot_date)
      .eq("slot_time", slot_time)
      .eq("is_booked", false);

    // Read buffer setting from org settings (default 0 = no buffer)
    const { data: bufferSetting } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("organization_id", organization_id)
      .eq("key", "buffer_minutes")
      .maybeSingle();

    const bufferMinutes = bufferSetting?.value != null ? Number(bufferSetting.value) : 0;

    if (bufferMinutes > 0) {
      const [hStr, mStr] = slot_time.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);

      // Buffer AFTER: block slots within buffer range
      const bufferSlots = Math.ceil(bufferMinutes / 30);
      for (let i = 1; i <= bufferSlots; i++) {
        const totalMin = h * 60 + m + (i * 30);
        const bH = Math.floor(totalMin / 60);
        const bM = totalMin % 60;
        if (bH >= 24) break;
        const bufferTime = `${String(bH).padStart(2, "0")}:${String(bM).padStart(2, "0")}:00`;
        await supabase
          .from("showing_available_slots")
          .update(bookingUpdate)
          .eq("organization_id", organization_id)
          .eq("slot_date", slot_date)
          .eq("slot_time", bufferTime)
          .eq("is_booked", false);
      }

      // Buffer BEFORE
      const beforeTotal = h * 60 + m - 30;
      if (beforeTotal >= 0) {
        const beforeH = Math.floor(beforeTotal / 60);
        const beforeM = beforeTotal % 60;
        const bufferBefore = `${String(beforeH).padStart(2, "0")}:${String(beforeM).padStart(2, "0")}:00`;
        await supabase
          .from("showing_available_slots")
          .update(bookingUpdate)
          .eq("organization_id", organization_id)
          .eq("slot_date", slot_date)
          .eq("slot_time", bufferBefore)
          .eq("is_booked", false);
      }
    }

    // ── Update lead status + boost score +30 (Hot Lead) ────────────────
    const { data: currentLead } = await supabase
      .from("leads")
      .select("lead_score")
      .eq("id", leadId)
      .single();

    const previousScore = currentLead?.lead_score ?? 50;
    const newScore = Math.min(previousScore + 30, 100);

    await supabase
      .from("leads")
      .update({
        status: "showing_scheduled",
        lead_score: newScore,
        is_priority: true,
        priority_reason: "Showing requested (+30 pts)",
        interested_property_id: property_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Record score change in audit trail
    await supabase.from("lead_score_history").insert({
      lead_id: leadId,
      organization_id,
      previous_score: previousScore,
      new_score: newScore,
      change_amount: 30,
      reason_code: "showing_requested",
      reason_text: "Lead requested a property showing — automatic Hot Lead boost",
      triggered_by: "engagement",
      related_showing_id: showing.id,
      changed_by_agent: "book-public-showing",
    });

    // ── Schedule Samuel confirmation task (24h before showing) ────────
    const showingDate = new Date(scheduledAt);
    const confirmationTime = new Date(showingDate.getTime() - 24 * 60 * 60 * 1000);

    await supabase.from("agent_tasks").insert({
      organization_id,
      lead_id: leadId,
      agent_type: "showing_confirmation",
      action_type: "email",
      scheduled_for: confirmationTime.toISOString(),
      max_attempts: 2,
      status: "pending",
      context: {
        showing_id: showing.id,
        property_id,
        property_address: propertyAddress,
        scheduled_at: scheduledAt,
        source: "website",
      },
    });

    // ── Send confirmation email (if lead has email) ───────────────────
    if (leadEmail) {
      try {
        const calTitle = `Property Showing — ${property?.address || "Tour"}`;
        const propTz = getTimezoneForCity(property?.city || null);
        const calData = {
          title: calTitle,
          location: propertyAddress,
          slotDate: slot_date,
          slotTime: slot_time,
          durationMin: durationMinutes,
          timezone: propTz,
        };

        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: leadEmail,
            subject: `Showing Confirmed — ${property?.address || "Property Tour"}`,
            html: showingConfirmationEmail({
              leadName: full_name.trim(),
              propertyAddress,
              dateFormatted: formatDateHuman(slot_date, propTz),
              timeFormatted: formatTimeHuman(slot_time),
              duration: durationMinutes,
              googleCalUrl: buildGoogleCalUrl(calData),
              icsDataUri: buildIcsDataUri(calData),
            }),
            notification_type: "showing_confirmation",
            organization_id,
            related_entity_id: showing.id,
            related_entity_type: "showing",
            queue: false,
          },
        });
      } catch (emailErr) {
        // Don't fail the booking if email fails
        console.error("Confirmation email failed:", emailErr);
      }
    }

    // ── DoorLoop: Create prospect (if API key configured & not already synced) ──
    try {
      // Check if lead already has a DoorLoop prospect ID
      const { data: leadForDl } = await supabase
        .from("leads")
        .select("doorloop_prospect_id")
        .eq("id", leadId)
        .single();

      if (!leadForDl?.doorloop_prospect_id) {
        // Get DoorLoop API key
        const { data: creds } = await supabase
          .from("organization_credentials")
          .select("doorloop_api_key")
          .eq("organization_id", organization_id)
          .single();

        if (creds?.doorloop_api_key) {
          const dlApiKey = creds.doorloop_api_key.trim();
          const dlHeaders = {
            "Authorization": `Bearer ${dlApiKey}`,
            "Content-Type": "application/json",
          };

          // Search for existing prospect by phone to avoid duplicates
          const searchResp = await fetch(
            `https://app.doorloop.com/api/tenants?filter_phone=${encodeURIComponent(formattedPhone)}&page_size=1`,
            { headers: dlHeaders }
          );

          let doorloopProspectId: string | null = null;

          if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData?.data?.length > 0) {
              doorloopProspectId = String(searchData.data[0].id);
              console.log("DoorLoop: Found existing prospect:", doorloopProspectId);
            }
          }

          // Create new prospect if not found
          if (!doorloopProspectId) {
            const nameParts = full_name.trim().split(/\s+/);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";

            const createResp = await fetch("https://app.doorloop.com/api/tenants", {
              method: "POST",
              headers: dlHeaders,
              body: JSON.stringify({
                firstName,
                lastName: lastName || firstName,
                phones: [{ type: "Mobile", number: formattedPhone }],
                ...(leadEmail ? { emails: [{ type: "Primary", address: leadEmail }] } : {}),
                prospectInfo: {
                  status: "SHOWING_SCHEDULED",
                },
              }),
            });

            if (createResp.ok) {
              const createData = await createResp.json();
              doorloopProspectId = String(createData.id);
              console.log("DoorLoop: Created prospect:", doorloopProspectId);
            } else {
              const errText = await createResp.text();
              console.error("DoorLoop prospect creation failed:", createResp.status, errText);
            }
          }

          // Store the DoorLoop prospect ID on the lead
          if (doorloopProspectId) {
            await supabase
              .from("leads")
              .update({ doorloop_prospect_id: doorloopProspectId })
              .eq("id", leadId);

            // Log the sync
            await supabase.from("doorloop_sync_log").insert({
              organization_id,
              entity_type: "prospect",
              sync_direction: "push",
              local_id: leadId,
              doorloop_id: doorloopProspectId,
              status: "success",
              action_taken: "Created/linked prospect from public showing booking",
              details: { property_id, showing_id: showing.id },
            });
          }
        }
      }
    } catch (dlErr) {
      // Don't fail the booking if DoorLoop sync fails
      console.error("DoorLoop sync error:", dlErr);
    }

    // ── Campaign attribution ──────────────────────────────────────────
    let campaignId: string | null = null;
    try {
      const { data: campaignLink } = await supabase
        .from("campaign_leads")
        .select("campaign_id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (campaignLink) {
        campaignId = campaignLink.campaign_id;
      }
    } catch (_) { /* non-critical */ }

    // ── System log ────────────────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id,
      level: "info",
      category: "general",
      event_type: "public_showing_booked",
      message: `Showing booked via public page: ${full_name.trim()} at ${propertyAddress} on ${formatDateHuman(slot_date, getTimezoneForCity(property?.city || null))} ${formatTimeHuman(slot_time)}${campaignId ? " (from campaign)" : ""}`,
      details: {
        showing_id: showing.id,
        lead_id: leadId,
        property_id,
        slot_date,
        slot_time,
        source: campaignId ? "campaign" : "website",
        campaign_id: campaignId,
        lead_is_new: !existingLead,
      },
      related_lead_id: leadId,
      related_showing_id: showing.id,
    });

    // ── Telegram notification ─────────────────────────────────────────
    try {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("telegram_bot_token, telegram_chat_id")
        .eq("organization_id", organization_id)
        .single();

      if (creds?.telegram_bot_token && creds?.telegram_chat_id) {
        const tz = getTimezoneForCity(property?.city || null);
        const dateHuman = formatDateHuman(slot_date, tz);
        const timeHuman = formatTimeHuman(slot_time);
        const addr = `${propertyAddress}`;
        const rentStr = property?.rent_price ? `$${Number(property.rent_price).toLocaleString()}/mo` : "";
        const leadPhone = phone?.trim() || "—";
        const leadEmail = email?.trim() || "—";
        const mapsQuery = encodeURIComponent(`${property?.address || ""}, ${property?.city || ""}, ${property?.state || ""} ${property?.zip_code || ""}`);

        const msg = [
          `🏠 <b>New Showing Booked!</b>`,
          ``,
          `📍 <b>${addr}</b>${rentStr ? ` — ${rentStr}` : ""}`,
          `📅 ${dateHuman} at ${timeHuman}`,
          ``,
          `👤 <b>${full_name.trim()}</b>`,
          `📞 ${leadPhone}`,
          `✉️ ${leadEmail}`,
          `🔗 Source: Public booking page`,
          ``,
          `🗺 <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}">Open in Google Maps</a>`,
        ].join("\n");

        await fetch(`https://api.telegram.org/bot${creds.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: creds.telegram_chat_id,
            text: msg,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
      }
    } catch (tgErr) {
      console.warn("Telegram notification failed:", tgErr);
    }

    // ── Cost record (Zacchaeus) ───────────────────────────────────────
    // Record minimal platform cost for the booking interaction
    const now = new Date();
    await supabase.from("cost_records").insert({
      organization_id,
      recorded_at: now.toISOString(),
      period_start: now.toISOString(),
      period_end: now.toISOString(),
      service: "platform",
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
        lead_id: leadId,
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
