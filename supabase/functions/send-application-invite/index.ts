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
      .select("id, full_name, email, phone, doorloop_prospect_id, applied_at")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (leadErr || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Abuse gate ─────────────────────────────────────────────────────
    // This function is anon-invokable (CORS *, no JWT). The only legitimate
    // caller is the public ScheduleShowing "Apply Now" flow, which always runs
    // AFTER the lead booked a showing. Require an existing showing for this lead
    // so an attacker with the anon key can't spam application invites / create
    // DoorLoop prospects for arbitrary lead_ids.
    const { count: showingCount } = await supabase
      .from("showings")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead_id)
      .eq("organization_id", organization_id);

    if (!showingCount || showingCount < 1) {
      return new Response(
        JSON.stringify({ error: "No showing on record for this lead." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get property info ──────────────────────────────────────────────
    const { data: property } = await supabase
      .from("properties")
      .select("address, city, state, zip_code, doorloop_property_id")
      .eq("id", property_id)
      .eq("organization_id", organization_id)
      .single();

    const propertyAddress = property
      ? `${property.address}, ${property.city}, ${property.state} ${property.zip_code}`
      : "Property";

    // ── Ensure DoorLoop prospect exists ────────────────────────────────
    let doorloopProspectId = lead.doorloop_prospect_id;

    try {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("doorloop_api_key")
        .eq("organization_id", organization_id)
        .single();

      if (creds?.doorloop_api_key) {
        const dlApiKey = creds.doorloop_api_key.replace(/[\s\r\n\t\x00-\x1f\x7f-\x9f]/g, "");
        const dlHeaders = {
          "Authorization": `Bearer ${dlApiKey}`,
          "Content-Type": "application/json",
        };

        // Create prospect in DoorLoop if not already synced
        if (!doorloopProspectId) {
          const nameParts = (lead.full_name || "").trim().split(/\s+/);
          const firstName = nameParts[0] || "Lead";
          const lastName = nameParts.slice(1).join(" ") || firstName;

          const createResp = await fetch("https://app.doorloop.com/api/tenants", {
            method: "POST",
            headers: dlHeaders,
            body: JSON.stringify({
              firstName,
              lastName,
              phones: lead.phone ? [{ type: "Mobile", number: lead.phone }] : [],
              ...(lead.email ? { emails: [{ type: "Primary", address: lead.email }] } : {}),
              prospectInfo: {
                status: "APPLICATION_SENT",
              },
            }),
          });

          if (createResp.ok) {
            const createData = await createResp.json();
            doorloopProspectId = String(createData.id);
            console.log("DoorLoop: Created prospect:", doorloopProspectId);

            // Store on lead
            await supabase
              .from("leads")
              .update({ doorloop_prospect_id: doorloopProspectId })
              .eq("id", lead_id);

            // Log sync
            await supabase.from("doorloop_sync_log").insert({
              organization_id,
              entity_type: "prospect",
              sync_direction: "push",
              local_id: lead_id,
              doorloop_id: doorloopProspectId,
              status: "success",
              action_taken: "Created prospect from Apply Now button",
              details: { property_id, property_address: propertyAddress },
            });
          } else {
            const errText = await createResp.text();
            console.error("DoorLoop prospect creation failed:", createResp.status, errText);
          }
        }
      }
    } catch (dlErr) {
      console.error("DoorLoop error:", dlErr);
    }

    // ── Create Samuel agent task to send application from DoorLoop portal ──
    const { error: taskErr } = await supabase.from("agent_tasks").insert({
      organization_id,
      lead_id,
      agent_type: "doorloop_pull",
      action_type: "send_application",
      scheduled_for: new Date().toISOString(),
      status: "pending",
      context: {
        source: "public_booking_page",
        property_id,
        lead_email: lead.email || null,
        lead_name: lead.full_name || null,
        lead_phone: lead.phone || null,
        property_address: propertyAddress,
        doorloop_prospect_id: doorloopProspectId || null,
      },
    });
    if (taskErr) {
      console.error("Failed to create send_application agent task:", taskErr);
    }

    // ── Send notification to leasing team with direct DoorLoop link ────
    const doorloopLink = doorloopProspectId
      ? `https://homeguard.app.doorloop.com/prospects/${doorloopProspectId}/rental-applications/new`
      : null;

    // (The Requests Kanban was removed 2026-07-25. This function still sends the
    // application invite below. Since this writer promotes the lead to
    // in_application, it also stamps applied_at — every applicant surface keys
    // off that tag, so status and tag must move together.)

    // ── Send notification email to lead ────────────────────────────────
    if (lead.email) {
      try {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: lead.email,
            subject: `Apply Now — ${property?.address || "Rental Application"}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
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
            queue: true,
          },
        });
      } catch (emailErr) {
        console.error("Application invite email failed:", emailErr);
      }
    }

    // ── Update lead status (+ applicant tag, stamped once) ─────────────
    const statusUpdate: Record<string, unknown> = {
      status: "in_application",
      updated_at: new Date().toISOString(),
    };
    if (!lead.applied_at) statusUpdate.applied_at = new Date().toISOString();
    await supabase.from("leads").update(statusUpdate).eq("id", lead_id);

    // ── Leasing Tracker: typed activity row (best-effort) ──────────────
    {
      const { error: activityErr } = await supabase.from("leasing_activity").insert({
        organization_id,
        lead_id,
        property_id,
        action: "application_generated",
        source: "web_form",
      });
      if (activityErr) console.error("leasing_activity insert error:", activityErr);
    }

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
        doorloop_prospect_id: doorloopProspectId || null,
        email_sent: !!lead.email,
      },
      related_lead_id: lead_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        prospect_created: !!doorloopProspectId,
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
