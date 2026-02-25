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

    const { lead_id, property_id, organization_id } = await req.json();

    if (!lead_id || !property_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id, property_id, organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get lead info ──────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, full_name, email, phone, doorloop_prospect_id")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (leadErr || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get property info ──────────────────────────────────────────────
    const { data: property } = await supabase
      .from("properties")
      .select("address, city, state, zip_code, doorloop_property_id")
      .eq("id", property_id)
      .single();

    const propertyAddress = property
      ? `${property.address}, ${property.city}, ${property.state} ${property.zip_code}`
      : "Property";

    // ── Try DoorLoop rental application ────────────────────────────────
    let doorloopAppCreated = false;

    try {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("doorloop_api_key")
        .eq("organization_id", organization_id)
        .single();

      if (creds?.doorloop_api_key && lead.doorloop_prospect_id) {
        const dlHeaders = {
          "Authorization": `Bearer ${creds.doorloop_api_key}`,
          "Content-Type": "application/json",
        };

        const appBody: Record<string, any> = {
          prospect_id: Number(lead.doorloop_prospect_id),
          status: "new",
        };

        // Include DoorLoop property ID if available
        if (property?.doorloop_property_id) {
          appBody.property_id = Number(property.doorloop_property_id);
        }

        const resp = await fetch("https://app.doorloop.com/api/v1/rental-applications", {
          method: "POST",
          headers: dlHeaders,
          body: JSON.stringify(appBody),
        });

        if (resp.ok) {
          doorloopAppCreated = true;
          console.log("DoorLoop: Rental application created for prospect", lead.doorloop_prospect_id);

          // Log the sync
          await supabase.from("doorloop_sync_log").insert({
            organization_id,
            entity_type: "rental_application",
            sync_direction: "push",
            local_id: lead_id,
            doorloop_id: lead.doorloop_prospect_id,
            status: "success",
            action_taken: "Created rental application from public booking page",
            details: { property_id, property_address: propertyAddress },
          });
        } else {
          const errText = await resp.text();
          console.error("DoorLoop rental application failed:", resp.status, errText);
        }
      }
    } catch (dlErr) {
      console.error("DoorLoop application error:", dlErr);
    }

    // ── Create Ezra agent task (backup if DoorLoop direct didn't work) ──
    if (!doorloopAppCreated) {
      await supabase.from("agent_tasks").insert({
        organization_id,
        agent_key: "ezra",
        action_type: "send_application",
        lead_id,
        property_id,
        scheduled_for: new Date().toISOString(),
        status: "pending",
        metadata: {
          source: "public_booking_page",
          lead_email: lead.email || null,
          lead_name: lead.full_name || null,
          property_address: propertyAddress,
        },
      });
    }

    // ── Send notification email to lead ────────────────────────────────
    if (lead.email) {
      try {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: lead.email,
            subject: `Apply Now — ${property?.address || "Rental Application"}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rental Application</h1>
              </div>
              <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                <p>Hi <strong>${lead.full_name || "there"}</strong>,</p>
                <p>Thank you for scheduling a showing at <strong>${propertyAddress}</strong>!</p>
                <p>You'll receive a rental application invitation from <strong>DoorLoop</strong> in the next few minutes. Please check your email (and spam folder) for the application link.</p>
                <p>Completing the application early helps speed up the approval process so you can move in faster!</p>
                <br>
                <p style="color:#666;font-size:14px;">— Rent Finder Cleveland</p>
              </div>
            </div>`,
            notification_type: "application_invite",
            organization_id,
            related_entity_id: lead_id,
            related_entity_type: "lead",
          },
        });
      } catch (emailErr) {
        console.error("Application invite email failed:", emailErr);
      }
    }

    // ── Update lead status ─────────────────────────────────────────────
    await supabase
      .from("leads")
      .update({
        status: "in_application",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    // ── System log ─────────────────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id,
      level: "info",
      category: "general",
      event_type: "application_invite_sent",
      message: `Application invite sent to ${lead.full_name} (${lead.email || lead.phone}) for ${propertyAddress}`,
      details: {
        lead_id,
        property_id,
        doorloop_app_created: doorloopAppCreated,
        email_sent: !!lead.email,
      },
      related_lead_id: lead_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        doorloop_created: doorloopAppCreated,
        email_sent: !!lead.email,
        message: "Application invite sent successfully.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-application-invite error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
