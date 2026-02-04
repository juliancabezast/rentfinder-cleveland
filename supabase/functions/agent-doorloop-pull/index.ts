import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://glzzzthgotfwoiaranmp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOORLOOP_API_BASE = "https://api.doorloop.com/api";

interface DoorloopProspect {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DoorloopApplication {
  id: string;
  prospectId?: string;
  status?: string;
  propertyId?: string;
  unitId?: string;
}

interface DoorloopLease {
  id: string;
  status?: string;
  propertyId?: string;
  unitId?: string;
  tenantIds?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let orgsSynced = 0;
  let leadsUpdated = 0;
  let errors = 0;

  try {
    console.log("[Esther] Starting Doorloop pull sync");

    // Fetch all active organizations with Doorloop configured
    const { data: orgsWithDoorloop, error: orgsError } = await supabase
      .from("organization_credentials")
      .select("organization_id, doorloop_api_key")
      .not("doorloop_api_key", "is", null);

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
    }

    if (!orgsWithDoorloop || orgsWithDoorloop.length === 0) {
      console.log("[Esther] No organizations with Doorloop configured");
      return new Response(
        JSON.stringify({ success: true, orgs_synced: 0, leads_updated: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const org of orgsWithDoorloop) {
      const { organization_id, doorloop_api_key } = org;

      try {
        console.log(`[Esther] Syncing org ${organization_id}`);

        const headers = {
          "Authorization": `Bearer ${doorloop_api_key}`,
          "Content-Type": "application/json",
        };

        // 1. Fetch prospects from Doorloop
        let prospectsPage = 1;
        let hasMoreProspects = true;

        while (hasMoreProspects) {
          const prospectsResponse = await fetch(
            `${DOORLOOP_API_BASE}/prospects?page=${prospectsPage}&limit=100`,
            { headers }
          );

          if (!prospectsResponse.ok) {
            if (prospectsResponse.status === 429) {
              // Rate limited, wait and retry
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }
            throw new Error(`Doorloop prospects API error: ${prospectsResponse.status}`);
          }

          const prospectsData = await prospectsResponse.json();
          const prospects: DoorloopProspect[] = prospectsData.data || [];

          if (prospects.length === 0) {
            hasMoreProspects = false;
            break;
          }

          for (const prospect of prospects) {
            // Try to match to our lead
            const { data: lead } = await supabase
              .from("leads")
              .select("id, status, doorloop_prospect_id")
              .eq("organization_id", organization_id)
              .or(`doorloop_prospect_id.eq.${prospect.id},phone.eq.${prospect.phone || ""},email.eq.${prospect.email || ""}`)
              .maybeSingle();

            if (lead) {
              // Map Doorloop status to our status
              const { data: mappedStatus } = await supabase.rpc("map_doorloop_status", {
                doorloop_status: prospect.status || "new",
              });

              const newStatus = mappedStatus || lead.status;

              if (newStatus !== lead.status) {
                await supabase
                  .from("leads")
                  .update({
                    status: newStatus,
                    doorloop_prospect_id: prospect.id,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", lead.id);

                // Log sync
                await supabase.from("doorloop_sync_log").insert({
                  organization_id,
                  entity_type: "prospect",
                  sync_direction: "pull",
                  doorloop_id: prospect.id,
                  local_id: lead.id,
                  status: "success",
                  action_taken: `Updated status from ${lead.status} to ${newStatus}`,
                  details: { prospect },
                });

                leadsUpdated++;
              } else if (!lead.doorloop_prospect_id) {
                // Link the prospect ID
                await supabase
                  .from("leads")
                  .update({ doorloop_prospect_id: prospect.id })
                  .eq("id", lead.id);
              }
            }
          }

          prospectsPage++;
          if (prospects.length < 100) {
            hasMoreProspects = false;
          }
        }

        // 2. Fetch applications from Doorloop
        const appsResponse = await fetch(`${DOORLOOP_API_BASE}/applications?limit=100`, { headers });
        
        if (appsResponse.ok) {
          const appsData = await appsResponse.json();
          const applications: DoorloopApplication[] = appsData.data || [];

          for (const app of applications) {
            if (app.prospectId) {
              // Find lead with this prospect ID
              const { data: lead } = await supabase
                .from("leads")
                .select("id, status")
                .eq("organization_id", organization_id)
                .eq("doorloop_prospect_id", app.prospectId)
                .maybeSingle();

              if (lead) {
                let newStatus = lead.status;

                if (app.status === "approved" || app.status === "pending") {
                  newStatus = "in_application";
                } else if (app.status === "denied") {
                  newStatus = "lost";
                }

                if (newStatus !== lead.status) {
                  const updateData: Record<string, any> = {
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  };

                  if (app.status === "denied") {
                    updateData.lost_reason = "does_not_qualify";
                  }

                  await supabase.from("leads").update(updateData).eq("id", lead.id);

                  await supabase.from("doorloop_sync_log").insert({
                    organization_id,
                    entity_type: "application",
                    sync_direction: "pull",
                    doorloop_id: app.id,
                    local_id: lead.id,
                    status: "success",
                    action_taken: `Application ${app.status} - updated lead to ${newStatus}`,
                    details: { application: app },
                  });

                  leadsUpdated++;
                }
              }
            }
          }
        }

        // 3. Fetch leases from Doorloop
        const leasesResponse = await fetch(`${DOORLOOP_API_BASE}/leases?limit=100`, { headers });
        
        if (leasesResponse.ok) {
          const leasesData = await leasesResponse.json();
          const leases: DoorloopLease[] = leasesData.data || [];

          for (const lease of leases) {
            if (lease.status === "active" || lease.status === "signed") {
              // Try to find associated lead via property matching
              // This is a simplified approach - real implementation might need more sophisticated matching
              const { data: leads } = await supabase
                .from("leads")
                .select("id, status")
                .eq("organization_id", organization_id)
                .eq("status", "in_application");

              // For now, we'll log leases for manual review
              await supabase.from("doorloop_sync_log").insert({
                organization_id,
                entity_type: "lease",
                sync_direction: "pull",
                doorloop_id: lease.id,
                status: "success",
                action_taken: `Lease ${lease.status} detected`,
                details: { lease },
              });
            }
          }
        }

        orgsSynced++;

        // Log activity
        await supabase.rpc("log_agent_activity", {
          p_organization_id: organization_id,
          p_agent_key: "doorloop_pull",
          p_action: "sync_complete",
          p_status: "success",
          p_message: `Doorloop sync completed`,
          p_details: { leads_updated: leadsUpdated },
        });

      } catch (orgError: unknown) {
        const errorMessage = orgError instanceof Error ? orgError.message : String(orgError);
        console.error(`[Esther] Error syncing org ${organization_id}:`, errorMessage);
        errors++;

        await supabase.from("doorloop_sync_log").insert({
          organization_id,
          entity_type: "sync",
          sync_direction: "pull",
          status: "error",
          error_message: errorMessage,
        });

        // Check for repeated failures
        const { count } = await supabase
          .from("doorloop_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organization_id)
          .eq("status", "error")
          .gte("created_at", new Date(Date.now() - 3600000).toISOString()); // Last hour

        if (count && count >= 3) {
          // Create notification for admin
          const { data: admins } = await supabase
            .from("users")
            .select("id")
            .eq("organization_id", organization_id)
            .in("role", ["admin", "super_admin"])
            .limit(1);

          if (admins && admins.length > 0) {
            await supabase.from("notifications").insert({
              organization_id,
              user_id: admins[0].id,
              type: "alert",
              title: "Doorloop Sync Failing",
              message: "Doorloop sync has failed 3+ times in the last hour. Please check your API credentials.",
              category: "integration",
            });
          }
        }
      }
    }

    console.log(`[Esther] Sync complete: ${orgsSynced} orgs, ${leadsUpdated} leads updated, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        orgs_synced: orgsSynced,
        leads_updated: leadsUpdated,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Esther] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
