import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Time helpers ──────────────────────────────────────────────────────
function formatTimeHuman(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDateHuman(d: string): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const date = new Date(d + "T12:00:00");
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
    const {
      action,
      organization_id,
      lead_id,
      property_id,
      property_address,
      lead_email,
      lead_name,
      selected_slot,
      callback_time,
      callback_window,
      call_id,
    } = body;

    if (!action || !organization_id || !lead_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: action, organization_id, lead_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── ACTION: fetch_available_slots ──────────────────────────────────
    if (action === "fetch_available_slots") {
      if (!property_id) {
        return new Response(
          JSON.stringify({ has_slots: false, slots: [], error: "No property_id" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      const todayStr = today.toISOString().split("T")[0];
      const nextWeekStr = nextWeek.toISOString().split("T")[0];

      const { data: slots } = await supabase
        .from("showing_available_slots")
        .select("slot_date, slot_time, duration_minutes")
        .eq("property_id", property_id)
        .eq("organization_id", organization_id)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .gte("slot_date", todayStr)
        .lte("slot_date", nextWeekStr)
        .order("slot_date")
        .order("slot_time")
        .limit(6);

      if (!slots || slots.length === 0) {
        return new Response(
          JSON.stringify({
            has_slots: false,
            slots: [],
            message: "No available slots in the next 7 days.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const formatted = slots.map((s) => {
        const dateStr = formatDateHuman(s.slot_date);
        const timeStr = formatTimeHuman(s.slot_time);
        return `${dateStr} at ${timeStr}`;
      });

      return new Response(
        JSON.stringify({ has_slots: true, slots: formatted }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── ACTION: reserve_showing ───────────────────────────────────────
    if (action === "reserve_showing") {
      if (!property_id || !selected_slot) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing property_id or selected_slot",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Parse the selected slot back into date + time
      // Expected format from Bland: "Wednesday, February 14, 2026 at 10:00 AM"
      const slotMatch = selected_slot.match(
        /(\w+, \w+ \d+, \d+) at (\d+:\d+ [AP]M)/i
      );

      let slotDate: string;
      let slotTime: string;

      if (slotMatch) {
        const parsedDate = new Date(slotMatch[1]);
        slotDate = parsedDate.toISOString().split("T")[0];
        // Convert "10:00 AM" to "10:00:00"
        const [time, period] = slotMatch[2].split(" ");
        const [hStr, mStr] = time.split(":");
        let h = parseInt(hStr, 10);
        if (period === "PM" && h < 12) h += 12;
        if (period === "AM" && h === 12) h = 0;
        slotTime = `${String(h).padStart(2, "0")}:${mStr}:00`;
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Could not parse selected slot time",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check slot availability
      const { data: slot } = await supabase
        .from("showing_available_slots")
        .select("id, duration_minutes")
        .eq("property_id", property_id)
        .eq("organization_id", organization_id)
        .eq("slot_date", slotDate)
        .eq("slot_time", slotTime)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .maybeSingle();

      if (!slot) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "That time slot is no longer available. Please choose another.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Create showing
      const scheduledAt = `${slotDate}T${slotTime}-05:00`; // EST
      const { data: showing, error: showingErr } = await supabase
        .from("showings")
        .insert({
          organization_id,
          lead_id,
          property_id,
          scheduled_at: scheduledAt,
          duration_minutes: slot.duration_minutes || 30,
          status: "scheduled",
          confirmation_status: "pending",
          source: "bland_pathway",
          notes: "Booked during outbound callback via Bland.ai pathway",
        })
        .select("id")
        .single();

      if (showingErr) throw showingErr;

      // Mark slot as booked
      await supabase
        .from("showing_available_slots")
        .update({
          is_booked: true,
          booked_showing_id: showing.id,
          booked_at: new Date().toISOString(),
        })
        .eq("id", slot.id);

      // Update lead status
      await supabase
        .from("leads")
        .update({
          status: "showing_scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead_id);

      // Schedule Samuel confirmation task (24h before)
      const confirmAt = new Date(scheduledAt);
      confirmAt.setHours(confirmAt.getHours() - 24);

      await supabase.from("agent_tasks").insert({
        organization_id,
        agent_key: "samuel",
        action_type: "confirm_showing",
        lead_id,
        showing_id: showing.id,
        property_id,
        scheduled_for: confirmAt.toISOString(),
        status: "pending",
        metadata: { source: "bland_pathway", call_id: call_id || null },
      });

      // Send confirmation email if we have lead_email
      if (lead_email) {
        try {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              to: lead_email,
              subject: `Showing Confirmed — ${property_address || "Property Tour"}`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
                  <h1 style="margin:0;color:#ffb22c;font-size:20px;">Showing Confirmed</h1>
                </div>
                <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                  <p>Hi <strong>${lead_name || "there"}</strong>, your showing is confirmed!</p>
                  <p><strong>Property:</strong> ${property_address}</p>
                  <p><strong>Date:</strong> ${formatDateHuman(slotDate)}</p>
                  <p><strong>Time:</strong> ${formatTimeHuman(slotTime)}</p>
                  <p><strong>Duration:</strong> ${slot.duration_minutes || 30} minutes</p>
                  <br>
                  <p style="color:#666;font-size:14px;">We'll send you a reminder 24 hours before your showing.</p>
                </div>
              </div>`,
              notification_type: "showing_confirmation",
              organization_id,
              related_entity_id: showing.id,
              related_entity_type: "showing",
            },
          });
        } catch {
          // Non-blocking email
        }
      }

      // Log showing booked
      try {
        await supabase.from("system_logs").insert({
          organization_id,
          level: "info",
          category: "bland_ai",
          event_type: "pathway_showing_booked",
          message: `Showing booked via Bland pathway: ${property_address || "property"} on ${formatDateHuman(slotDate)} at ${formatTimeHuman(slotTime)}`,
          details: { showing_id: showing.id, lead_id, property_id, slot: selected_slot, call_id: call_id || null },
          related_lead_id: lead_id,
          related_showing_id: showing.id,
        });
      } catch { /* non-blocking */ }

      return new Response(
        JSON.stringify({
          success: true,
          showing_id: showing.id,
          message: `Showing booked for ${formatDateHuman(slotDate)} at ${formatTimeHuman(slotTime)}.`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── ACTION: send_application ──────────────────────────────────────
    if (action === "send_application") {
      // Create agent task for Caleb (DoorLoop push) to send application
      await supabase.from("agent_tasks").insert({
        organization_id,
        agent_key: "ezra",
        action_type: "send_application",
        lead_id,
        property_id: property_id || null,
        scheduled_for: new Date().toISOString(),
        status: "pending",
        metadata: {
          source: "bland_pathway",
          lead_email: lead_email || null,
          lead_name: lead_name || null,
          property_address: property_address || null,
          call_id: call_id || null,
        },
      });

      // Send application link email if we have lead_email
      if (lead_email) {
        try {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              to: lead_email,
              subject: `Apply Now — ${property_address || "Rental Application"}`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
                  <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rental Application</h1>
                </div>
                <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                  <p>Hi <strong>${lead_name || "there"}</strong>,</p>
                  <p>Thank you for your interest in <strong>${property_address || "our property"}</strong>!</p>
                  <p>Our team will send you the application link within the next few minutes via email.</p>
                  <p>If you have any questions, feel free to call us back.</p>
                  <br>
                  <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
                </div>
              </div>`,
              notification_type: "application_link",
              organization_id,
              related_entity_id: lead_id,
              related_entity_type: "lead",
            },
          });
        } catch {
          // Non-blocking
        }
      }

      // Log application request
      try {
        await supabase.from("system_logs").insert({
          organization_id,
          level: "info",
          category: "bland_ai",
          event_type: "pathway_application_sent",
          message: `Application request via Bland pathway for ${lead_name || "lead"} — ${property_address || "property"}`,
          details: { lead_id, property_id, lead_email, call_id: call_id || null },
          related_lead_id: lead_id,
        });
      } catch { /* non-blocking */ }

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Application request received. We'll send the application link to your email shortly.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── ACTION: create_callback ───────────────────────────────────────
    if (action === "create_callback") {
      if (!callback_time) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "No callback time provided.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Parse callback_time — Bland may send various formats
      let scheduledFor: string;
      try {
        const parsed = new Date(callback_time);
        if (isNaN(parsed.getTime())) throw new Error("Invalid date");
        scheduledFor = parsed.toISOString();
      } catch {
        // If parsing fails, schedule 24h from now as fallback
        const fallback = new Date();
        fallback.setHours(fallback.getHours() + 24);
        scheduledFor = fallback.toISOString();
      }

      await supabase.from("agent_tasks").insert({
        organization_id,
        agent_key: "elijah",
        action_type: "outbound_callback",
        lead_id,
        property_id: property_id || null,
        scheduled_for: scheduledFor,
        status: "pending",
        metadata: {
          source: "bland_pathway",
          callback_window: callback_window || null,
          property_address: property_address || null,
          call_id: call_id || null,
        },
      });

      // Log callback scheduled
      try {
        await supabase.from("system_logs").insert({
          organization_id,
          level: "info",
          category: "bland_ai",
          event_type: "pathway_callback_scheduled",
          message: `Callback scheduled via Bland pathway for ${scheduledFor}`,
          details: { lead_id, property_id, callback_time, scheduled_for: scheduledFor, call_id: call_id || null },
          related_lead_id: lead_id,
        });
      } catch { /* non-blocking */ }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Callback scheduled. We'll call you back at the requested time.`,
          scheduled_for: scheduledFor,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Unknown action ────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("pathway-webhook error:", error);

    // Log error
    try {
      await supabase.from("system_logs").insert({
        organization_id: body?.organization_id || null,
        level: "error",
        category: "bland_ai",
        event_type: "pathway_webhook_error",
        message: `Pathway webhook error: ${error.message || "Unknown error"}`,
        details: { error: String(error), action: body?.action },
        related_lead_id: body?.lead_id || null,
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
