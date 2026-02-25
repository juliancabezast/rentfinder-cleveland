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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Accept optional organization_id from request body
    let targetOrgId: string | null = null;
    try {
      const body = await req.json();
      targetOrgId = body.organization_id || null;
    } catch {
      // No body or invalid JSON — process all orgs
    }

    // Get organizations to process
    let orgsQuery = supabase.from("organizations").select("id");
    if (targetOrgId) {
      orgsQuery = orgsQuery.eq("id", targetOrgId);
    }
    const { data: orgs } = await orgsQuery;

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No organizations found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allResults: any[] = [];

    for (const org of orgs) {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("doorloop_api_key")
        .eq("organization_id", org.id)
        .single();

      if (!creds?.doorloop_api_key) {
        allResults.push({ org_id: org.id, error: "No DoorLoop API key", synced: 0 });
        continue;
      }

      const apiKey = creds.doorloop_api_key.replace(/[\s\r\n\t\x00-\x1f\x7f-\x9f]/g, "");
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
        .order("created_at", { ascending: false });

      if (leadsErr) {
        allResults.push({ org_id: org.id, error: leadsErr.message, synced: 0 });
        continue;
      }

      if (!leads || leads.length === 0) {
        allResults.push({ org_id: org.id, message: "All leads already synced", synced: 0, skipped: 0, failed: 0 });
        continue;
      }

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
          const cleanPhone = (lead.phone || "").replace(/\D/g, "");
          const phoneForCreate = cleanPhone.length === 11 && cleanPhone.startsWith("1")
            ? cleanPhone.slice(1)
            : cleanPhone;

          const nameParts = (lead.full_name || "Lead").trim().split(/\s+/);
          const firstName = nameParts[0] || "Lead";
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "N/A";

          const dlStatus = statusMap[lead.status] || "NEW";

          const createResp = await fetch("https://app.doorloop.com/api/tenants", {
            method: "POST",
            headers: new Headers(dlHeaders),
            body: JSON.stringify({
              firstName,
              lastName,
              ...(phoneForCreate.length >= 10
                ? { phones: [{ type: "Mobile", number: phoneForCreate }] }
                : {}),
              ...(lead.email ? { emails: [{ type: "Primary", address: lead.email }] } : {}),
              prospectInfo: {
                status: dlStatus,
              },
            }),
          });

          if (createResp.ok) {
            const createData = await createResp.json();
            const doorloopId = String(createData.id);

            const { error: updateErr } = await supabase
              .from("leads")
              .update({ doorloop_prospect_id: doorloopId })
              .eq("id", lead.id);

            if (updateErr) {
              console.warn(`Lead ${lead.id} DoorLoop created (${doorloopId}) but update failed:`, updateErr.message);
              errors.push(`${lead.full_name}: Created in DoorLoop but failed to save ID`);
              failed++;
            } else {
              synced++;
            }
          } else {
            const errText = await createResp.text();
            errors.push(`${lead.full_name}: ${createResp.status} ${errText.slice(0, 100)}`);
            failed++;
          }

          await new Promise((r) => setTimeout(r, 200));
        } catch (err) {
          errors.push(`${lead.full_name}: ${String(err).slice(0, 100)}`);
          failed++;
        }
      }

      // Log the sync
      try {
        await supabase.from("system_logs").insert({
          organization_id: org.id,
          level: failed > 0 ? "warning" : "info",
          category: "general",
          event_type: "doorloop_bulk_sync",
          message: `Bulk sync to DoorLoop: ${synced} synced, ${skipped} skipped, ${failed} failed out of ${leads.length} leads`,
          details: { synced, skipped, failed, total: leads.length, errors: errors.slice(0, 20) },
        });
      } catch (logErr) {
        console.warn("System log insert failed:", logErr);
      }

      allResults.push({ org_id: org.id, synced, skipped, failed, total: leads.length, errors: errors.slice(0, 10) });
    }

    return new Response(
      JSON.stringify({ message: "Bulk sync complete", results: allResults }),
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
