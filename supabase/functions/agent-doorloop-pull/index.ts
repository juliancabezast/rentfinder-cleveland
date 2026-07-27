import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOORLOOP_API_BASE = "https://app.doorloop.com/api";
const MAX_PAGES = 50; // Safety cap: 50 pages × 100 = 5000 records per endpoint per org
const MAX_RETRIES = 3; // Max 429 retries per page before giving up

interface DoorloopTenant {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  type?: string; // "PROSPECT_TENANT" or "LEASE_TENANT"
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DoorloopApplication {
  id: string;
  tenantId?: string;
  status?: string;
  propertyId?: string;
  unitId?: string;
}

// Our lead status ladder (higher = further along). Pull uses this so it can only
// ever move a lead FORWARD — a DoorLoop prospect status must never demote an
// advanced lead (e.g. in_application/showed) back to 'new'/'engaged'.
const STATUS_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  engaged: 1,
  nurturing: 2,
  qualified: 3,
  showing_scheduled: 4,
  showed: 5,
  in_application: 6,
  converted: 7,
};

// Map a DoorLoop tenant/prospect status to our lead status. Handles BOTH the
// UPPERCASE enums this codebase pushes (sync-leads-to-doorloop:
// NEW/CONTACT_MADE/SHOWING_SCHEDULED/APPLICATION_SENT/APPROVED/CLOSED) and
// DoorLoop's own lowercase values. Returns null when unrecognized so pull
// no-ops instead of defaulting a real lead down to 'engaged'/'new'.
function mapDoorloopStatus(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  switch (s) {
    case "new":
    case "inquiry":
      return "new";
    case "contact_made":
    case "contacted":
    case "tour_scheduled":
      return "contacted";
    case "showing_scheduled":
      return "showing_scheduled";
    case "tour_completed":
    case "showed":
      return "showed";
    case "application_sent":
    case "application_pending":
    case "application_submitted":
    case "in_application":
      return "in_application";
    case "approved":
    case "lease_signed":
    case "converted":
      return "converted";
    case "denied":
    case "cancelled":
    case "closed":
    case "lost":
      return "lost";
    default:
      return null; // unrecognized — leave the lead's status untouched
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Require service-role or admin authenticated caller ─────────
  {
    const _srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const _ak = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const _tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (_tok !== _srk) {
      if (!_tok || _tok === _ak) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, _srk);
      const { data: _auth } = await _sb.auth.getUser(_tok);
      if (!_auth?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: _u } = await _sb.from("users").select("role, is_active").eq("auth_user_id", _auth.user.id).maybeSingle();
      if (!_u || _u.is_active === false || !["super_admin","admin"].includes(_u.role || "")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
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
          "Authorization": `bearer ${doorloop_api_key}`,
          "Content-Type": "application/json",
        };

        // 1. Fetch tenants from Doorloop (filter for PROSPECT_TENANT type)
        let tenantsPage = 1;
        let hasMoreTenants = true;

        while (hasMoreTenants && tenantsPage <= MAX_PAGES) {
          let tenantsResponse: Response;
          let tenantsRetries = 0;
          while (true) {
            tenantsResponse = await fetch(
              `${DOORLOOP_API_BASE}/tenants?page=${tenantsPage}&limit=100`,
              { headers }
            );

            // Rate limited — bounded retry with backoff, then fall through
            if (tenantsResponse.status === 429 && tenantsRetries < MAX_RETRIES) {
              tenantsRetries++;
              console.log(`[Esther] Rate limited on tenants page ${tenantsPage}, retry ${tenantsRetries}/${MAX_RETRIES} after ${5 * tenantsRetries}s...`);
              await new Promise(resolve => setTimeout(resolve, 5000 * tenantsRetries));
              continue;
            }
            break;
          }

          if (!tenantsResponse.ok) {
            throw new Error(`Doorloop tenants API error: ${tenantsResponse.status}`);
          }

          const tenantsData = await tenantsResponse.json();
          const allTenants: DoorloopTenant[] = tenantsData.data || [];

          // Filter for prospects only (type === "PROSPECT_TENANT")
          const prospects = allTenants.filter(t => t.type === "PROSPECT_TENANT");

          if (allTenants.length === 0) {
            hasMoreTenants = false;
            break;
          }

          for (const prospect of prospects) {
            // Build match conditions — only include phone/email when non-empty
            // so we never match unrelated leads with a blank phone/email.
            const orConditions: string[] = [];
            if (prospect.id) orConditions.push(`doorloop_prospect_id.eq.${prospect.id}`);
            if (prospect.phone) orConditions.push(`phone.eq.${prospect.phone}`);
            if (prospect.email) orConditions.push(`email.eq.${prospect.email}`);

            // No usable identifier — skip to avoid overwriting the wrong lead
            if (orConditions.length === 0) continue;

            // Try to match to our lead
            const { data: lead } = await supabase
              .from("leads")
              .select("id, status, doorloop_prospect_id, applied_at")
              .eq("organization_id", organization_id)
              .or(orConditions.join(","))
              .maybeSingle();

            if (lead) {
              // Map Doorloop status → ours (case-insensitive, unknown = no-op)
              const mapped = mapDoorloopStatus(prospect.status);

              // Forward-only guard: never demote. 'lost' is terminal and only
              // applied when DoorLoop explicitly denies/closes/cancels — and
              // never un-converts an already-converted lead.
              let newStatus: string | null = null;
              if (mapped && mapped !== lead.status) {
                if (mapped === "lost") {
                  if (lead.status !== "converted") newStatus = "lost";
                } else {
                  const cur = STATUS_RANK[lead.status] ?? 0;
                  const next = STATUS_RANK[mapped] ?? -1;
                  if (next > cur) newStatus = mapped;
                }
              }

              if (newStatus) {
                const updateData: Record<string, unknown> = {
                  status: newStatus,
                  doorloop_prospect_id: prospect.id,
                  updated_at: new Date().toISOString(),
                };
                // Stamp the 'applied' fact the facts-based funnel reads, only
                // when not already set (submit-application stamps it on the site path).
                if ((newStatus === "in_application" || newStatus === "converted") && !lead.applied_at) {
                  updateData.applied_at = new Date().toISOString();
                }

                await supabase.from("leads").update(updateData).eq("id", lead.id);

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

          tenantsPage++;
          if (allTenants.length < 100) {
            hasMoreTenants = false;
          }
        }

        // 2. Fetch rental applications from Doorloop
        let appsPage = 1;
        let hasMoreApps = true;

        while (hasMoreApps && appsPage <= MAX_PAGES) {
          let appsResponse: Response;
          let appsRetries = 0;
          while (true) {
            appsResponse = await fetch(
              `${DOORLOOP_API_BASE}/rental-applications?page=${appsPage}&limit=100`,
              { headers }
            );

            // Rate limited — bounded retry with backoff, then fall through
            if (appsResponse.status === 429 && appsRetries < MAX_RETRIES) {
              appsRetries++;
              console.log(`[Esther] Rate limited on rental-applications page ${appsPage}, retry ${appsRetries}/${MAX_RETRIES} after ${5 * appsRetries}s...`);
              await new Promise(resolve => setTimeout(resolve, 5000 * appsRetries));
              continue;
            }
            break;
          }

          if (!appsResponse.ok) break;

          const appsData = await appsResponse.json();
          const applications: DoorloopApplication[] = appsData.data || [];

          if (applications.length === 0) {
            hasMoreApps = false;
            break;
          }

          for (const app of applications) {
            if (app.tenantId) {
              // Find lead with this tenant ID (stored as doorloop_prospect_id)
              const { data: lead } = await supabase
                .from("leads")
                .select("id, status, applied_at")
                .eq("organization_id", organization_id)
                .eq("doorloop_prospect_id", app.tenantId)
                .maybeSingle();

              if (lead) {
                let newStatus = lead.status;

                if (app.status === "approved" || app.status === "pending") {
                  // Advance only — never demote an already-converted lead.
                  if ((STATUS_RANK[lead.status] ?? 0) < STATUS_RANK["in_application"]) {
                    newStatus = "in_application";
                  }
                } else if (app.status === "denied") {
                  if (lead.status !== "converted") newStatus = "lost";
                }

                if (newStatus !== lead.status) {
                  const updateData: Record<string, unknown> = {
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  };

                  if (newStatus === "in_application" && !lead.applied_at) {
                    updateData.applied_at = new Date().toISOString();
                  }

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

          appsPage++;
          if (applications.length < 100) {
            hasMoreApps = false;
          }
        }

        // 3. Fetch lease tenants from Doorloop (tenants with active leases)
        let leasePage = 1;
        let hasMoreLeaseTenants = true;

        while (hasMoreLeaseTenants && leasePage <= MAX_PAGES) {
          let leaseTenantsResponse: Response;
          let leaseRetries = 0;
          while (true) {
            leaseTenantsResponse = await fetch(
              `${DOORLOOP_API_BASE}/lease-tenants?page=${leasePage}&limit=100`,
              { headers }
            );

            // Rate limited — bounded retry with backoff, then fall through
            if (leaseTenantsResponse.status === 429 && leaseRetries < MAX_RETRIES) {
              leaseRetries++;
              console.log(`[Esther] Rate limited on lease-tenants page ${leasePage}, retry ${leaseRetries}/${MAX_RETRIES} after ${5 * leaseRetries}s...`);
              await new Promise(resolve => setTimeout(resolve, 5000 * leaseRetries));
              continue;
            }
            break;
          }

          if (!leaseTenantsResponse.ok) break;

          const leaseTenantsData = await leaseTenantsResponse.json();
          const leaseTenants: DoorloopTenant[] = leaseTenantsData.data || [];

          if (leaseTenants.length === 0) {
            hasMoreLeaseTenants = false;
            break;
          }

          for (const tenant of leaseTenants) {
            // A tenant appearing in lease-tenants means they converted
            // Match by doorloop_prospect_id
            const { data: lead } = await supabase
              .from("leads")
              .select("id, status, applied_at")
              .eq("organization_id", organization_id)
              .eq("doorloop_prospect_id", tenant.id)
              .maybeSingle();

            if (lead && lead.status !== "converted") {
              // A tenant on an active lease has converted. Stamp applied_at (the
              // facts-based funnel's 'applied' fact) if it was never recorded.
              await supabase
                .from("leads")
                .update({
                  status: "converted",
                  updated_at: new Date().toISOString(),
                  ...(lead.applied_at ? {} : { applied_at: new Date().toISOString() }),
                })
                .eq("id", lead.id);

              await supabase.from("doorloop_sync_log").insert({
                organization_id,
                entity_type: "lease",
                sync_direction: "pull",
                doorloop_id: tenant.id,
                local_id: lead.id,
                status: "success",
                action_taken: `Tenant ${tenant.id} has active lease - marked lead as converted`,
                details: { tenant },
              });

              leadsUpdated++;
            }
          }

          leasePage++;
          if (leaseTenants.length < 100) {
            hasMoreLeaseTenants = false;
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

        // NOTE: doorloop_sync_log CHECK constraints only allow
        // entity_type ∈ (prospect|application|lease|property) and
        // status ∈ (success|failed|skipped|conflict). The previous values
        // ("sync"/"error") were silently rejected, so this outage was invisible.
        const { error: logInsertErr } = await supabase.from("doorloop_sync_log").insert({
          organization_id,
          entity_type: "prospect",
          sync_direction: "pull",
          status: "failed",
          error_message: errorMessage,
        });
        if (logInsertErr) {
          console.error(`[Esther] Failed to write doorloop_sync_log error row:`, logInsertErr.message);
        }

        // Check for repeated failures
        const { count } = await supabase
          .from("doorloop_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organization_id)
          .eq("status", "failed")
          .eq("sync_direction", "pull")
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
