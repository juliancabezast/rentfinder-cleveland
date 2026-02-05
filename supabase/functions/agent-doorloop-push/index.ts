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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { task_id, lead_id, organization_id, context } = await req.json();
    const { trigger, new_status } = context || {};

    console.log(`[Mordecai] Starting Doorloop push for lead ${lead_id}`);

    // Update task to in_progress
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "in_progress", executed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${leadError?.message}`);
    }

    // Fetch org credentials
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("doorloop_api_key")
      .eq("organization_id", organization_id)
      .single();

    const doorloopApiKey = creds?.doorloop_api_key;

    // Graceful degradation if no Doorloop key
    if (!doorloopApiKey) {
      console.log(`[Mordecai] No Doorloop API key configured, skipping push`);

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "doorloop_push",
        p_action: "skip_push",
        p_status: "success",
        p_message: "No Doorloop API key configured, push skipped",
        p_related_lead_id: lead_id,
      });

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_api_key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = {
      "Authorization": `bearer ${doorloopApiKey}`,
      "Content-Type": "application/json",
    };

    // Fetch interested property for notes
    let propertyNote = "";
    if (lead.interested_property_id) {
      const { data: property } = await supabase
        .from("properties")
        .select("address, city")
        .eq("id", lead.interested_property_id)
        .single();
      
      if (property) {
        propertyNote = ` Interested in: ${property.address}, ${property.city}`;
      }
    }

    const tenantData = {
      firstName: lead.first_name || "",
      lastName: lead.last_name || "",
      email: lead.email || "",
      phone: lead.phone,
      type: "PROSPECT_TENANT",
      notes: `Source: ${lead.source}, Score: ${lead.lead_score || "N/A"}${propertyNote}`,
    };

    let doorloopProspectId = lead.doorloop_prospect_id;
    let action = "create";

    if (doorloopProspectId) {
      // UPDATE existing prospect (tenant with type PROSPECT_TENANT)
      action = "update";
      console.log(`[Mordecai] Updating Doorloop tenant ${doorloopProspectId}`);

      const updateResponse = await fetch(
        `${DOORLOOP_API_BASE}/tenants/${doorloopProspectId}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify(tenantData),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        
        // If tenant not found, create new one
        if (updateResponse.status === 404) {
          doorloopProspectId = null;
          action = "create";
        } else {
          throw new Error(`Doorloop update error: ${updateResponse.status} - ${errorText}`);
        }
      }
    }

    if (!doorloopProspectId) {
      // CREATE new prospect (tenant with type PROSPECT_TENANT)
      console.log(`[Mordecai] Creating new Doorloop tenant (prospect)`);

      const createResponse = await fetch(`${DOORLOOP_API_BASE}/tenants`, {
        method: "POST",
        headers,
        body: JSON.stringify(tenantData),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Doorloop create error: ${createResponse.status} - ${errorText}`);
      }

      const createData = await createResponse.json();
      doorloopProspectId = createData.data?.id || createData.id;

      // Store Doorloop prospect ID on lead
      await supabase
        .from("leads")
        .update({ doorloop_prospect_id: doorloopProspectId })
        .eq("id", lead_id);
    }

    // Log sync
    await supabase.from("doorloop_sync_log").insert({
      organization_id,
      entity_type: "prospect",
      sync_direction: "push",
      doorloop_id: doorloopProspectId,
      local_id: lead_id,
      status: "success",
      action_taken: action === "create" ? "Created new prospect" : "Updated existing prospect",
      details: { lead_id, doorloop_prospect_id: doorloopProspectId, trigger },
    });

    // Log activity
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "doorloop_push",
      p_action: action === "create" ? "create_prospect" : "update_prospect",
      p_status: "success",
      p_message: `${action === "create" ? "Created" : "Updated"} Doorloop prospect ${doorloopProspectId}`,
      p_related_lead_id: lead_id,
      p_details: { doorloop_prospect_id: doorloopProspectId, trigger, new_status },
    });

    // Mark task completed
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        doorloop_prospect_id: doorloopProspectId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Mordecai] Error:", errorMessage);

    // Log error
    try {
      const { task_id, lead_id, organization_id } = await req.json().catch(() => ({}));
      
      if (organization_id) {
        await supabase.from("doorloop_sync_log").insert({
          organization_id,
          entity_type: "prospect",
          sync_direction: "push",
          local_id: lead_id,
          status: "error",
          error_message: errorMessage,
        });

        await supabase.rpc("log_agent_activity", {
          p_organization_id: organization_id,
          p_agent_key: "doorloop_push",
          p_action: "push_error",
          p_status: "error",
          p_message: errorMessage,
          p_related_lead_id: lead_id,
        });
      }

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
    } catch (e) {
      console.error("[Mordecai] Failed to log error:", e);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
