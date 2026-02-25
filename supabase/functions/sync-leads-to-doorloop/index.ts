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

    // Get org + DoorLoop API key
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single();

    if (!org) {
      return new Response(
        JSON.stringify({ error: "No organization found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("doorloop_api_key")
      .eq("organization_id", org.id)
      .single();

    if (!creds?.doorloop_api_key) {
      return new Response(
        JSON.stringify({ error: "No DoorLoop API key configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = creds.doorloop_api_key.replace(/[\s\r\n\t\x00-\x1f\x7f-\x9f]/g, "");
    console.log("API key length:", apiKey.length, "first 10:", apiKey.slice(0, 10));
    const dlHeaders: Record<string, string> = {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    };

    // Get all leads without a DoorLoop prospect ID
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, full_name, phone, email, status")
      .eq("organization_id", org.id)
      .is("doorloop_prospect_id", null)
      .not("phone", "is", null)
      .order("created_at", { ascending: false });

    if (leadsErr) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch leads: ${leadsErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ message: "All leads already synced to DoorLoop", synced: 0, skipped: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map lead status to DoorLoop prospect status
    const statusMap: Record<string, string> = {
      new: "NEW",
      contacted: "CONTACT_MADE",
      engaged: "CONTACT_MADE",
      nurturing: "CONTACT_MADE",
      qualified: "CONTACT_MADE",
      showing_scheduled: "SHOWING_SCHEDULED",
      showed: "SHOWING_SCHEDULED",
      in_application: "APPLICATION_SENT",
      converted: "APPROVED",
      lost: "CLOSED",
    };

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        // Clean phone
        const cleanPhone = (lead.phone || "").replace(/\D/g, "");
        if (!cleanPhone || cleanPhone.length < 10) {
          skipped++;
          continue;
        }

        const phoneForSearch = cleanPhone.length === 11 && cleanPhone.startsWith("1")
          ? cleanPhone.slice(1)
          : cleanPhone;

        // Search for existing prospect by phone
        const searchResp = await fetch(
          `https://app.doorloop.com/api/tenants?filter_phone=${encodeURIComponent(phoneForSearch)}&page_size=1`,
          { headers: new Headers(dlHeaders) }
        );

        let doorloopId: string | null = null;

        if (searchResp.ok) {
          const searchData = await searchResp.json();
          if (searchData?.data?.length > 0) {
            doorloopId = String(searchData.data[0].id);
          }
        }

        // Create if not found
        if (!doorloopId) {
          const nameParts = (lead.full_name || "Lead").trim().split(/\s+/);
          const firstName = nameParts[0] || "Lead";
          const lastName = nameParts.slice(1).join(" ") || firstName;

          const dlStatus = statusMap[lead.status] || "NEW";

          const createResp = await fetch("https://app.doorloop.com/api/tenants", {
            method: "POST",
            headers: new Headers(dlHeaders),
            body: JSON.stringify({
              firstName,
              lastName,
              phones: [{ type: "Mobile", number: phoneForSearch }],
              ...(lead.email ? { emails: [{ type: "Primary", address: lead.email }] } : {}),
              prospectInfo: {
                status: dlStatus,
              },
            }),
          });

          if (createResp.ok) {
            const createData = await createResp.json();
            doorloopId = String(createData.id);
          } else {
            const errText = await createResp.text();
            errors.push(`${lead.full_name}: ${createResp.status} ${errText.slice(0, 100)}`);
            failed++;
            continue;
          }
        }

        // Update lead with DoorLoop ID
        if (doorloopId) {
          await supabase
            .from("leads")
            .update({ doorloop_prospect_id: doorloopId })
            .eq("id", lead.id);
          synced++;
        }

        // Rate limiting: small delay between requests
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        errors.push(`${lead.full_name}: ${String(err).slice(0, 100)}`);
        failed++;
      }
    }

    // Log the sync
    await supabase.from("system_logs").insert({
      organization_id: org.id,
      level: "info",
      category: "general",
      event_type: "doorloop_bulk_sync",
      message: `Bulk sync to DoorLoop: ${synced} synced, ${skipped} skipped, ${failed} failed out of ${leads.length} leads`,
      details: { synced, skipped, failed, total: leads.length, errors: errors.slice(0, 20) },
    });

    return new Response(
      JSON.stringify({
        message: "Bulk sync complete",
        total: leads.length,
        synced,
        skipped,
        failed,
        errors: errors.slice(0, 10),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-leads-to-doorloop error:", err);
    return new Response(
      JSON.stringify({ error: `Internal error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
