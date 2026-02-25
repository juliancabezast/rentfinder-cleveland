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

    // 1. Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerAuth }, error: authError } = await callerClient.auth.getUser();
    if (authError || !callerAuth) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service role client (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 2. Get caller's user record and verify admin role
    const { data: callerRecord, error: callerErr } = await supabase
      .from("users")
      .select("id, role, organization_id")
      .eq("auth_user_id", callerAuth.id)
      .single();

    if (callerErr || !callerRecord) {
      return new Response(
        JSON.stringify({ error: "Caller user record not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "super_admin"].includes(callerRecord.role)) {
      return new Response(
        JSON.stringify({ error: "Only admins can delete leads" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request body
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Get the lead and verify same org
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, full_name, first_name, last_name, phone, organization_id")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lead.organization_id !== callerRecord.organization_id) {
      return new Response(
        JSON.stringify({ error: "Lead not in your organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadName = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.phone;

    // 5. Delete all related records (RESTRICT FK tables first)
    const deleteOps = [
      supabase.from("showings").delete().eq("lead_id", lead_id),
      supabase.from("cost_records").delete().eq("lead_id", lead_id),
      supabase.from("lead_notes").delete().eq("lead_id", lead_id),
      supabase.from("lead_field_changes").delete().eq("lead_id", lead_id),
      supabase.from("campaign_recipients").delete().eq("lead_id", lead_id),
      supabase.from("conversion_predictions").delete().eq("lead_id", lead_id),
      supabase.from("email_events").delete().eq("lead_id", lead_id),
      supabase.from("transcript_analyses").delete().eq("lead_id", lead_id),
      supabase.from("lead_property_interests").delete().eq("lead_id", lead_id),
    ];

    const deleteResults = await Promise.all(deleteOps);
    const deleteErrors = deleteResults.filter(r => r.error).map(r => r.error?.message);
    if (deleteErrors.length > 0) {
      console.warn("Non-fatal delete errors (tables may not exist):", deleteErrors);
    }

    // 6. Nullify SET NULL / RESTRICT FK reference columns
    const nullifyOps = [
      supabase.from("calls").update({ lead_id: null }).eq("lead_id", lead_id),
      supabase.from("communications").update({ lead_id: null }).eq("lead_id", lead_id),
      supabase.from("competitor_mentions").update({ lead_id: null }).eq("lead_id", lead_id),
      supabase.from("agent_activity_log").update({ related_lead_id: null }).eq("related_lead_id", lead_id),
      supabase.from("notifications").update({ related_lead_id: null }).eq("related_lead_id", lead_id),
      supabase.from("system_logs").update({ related_lead_id: null }).eq("related_lead_id", lead_id),
    ];

    const nullifyResults = await Promise.all(nullifyOps);
    const nullifyErrors = nullifyResults.filter(r => r.error).map(r => r.error?.message);
    if (nullifyErrors.length > 0) {
      console.warn("Non-fatal nullify errors:", nullifyErrors);
    }

    // 7. Delete the lead (CASCADE handles agent_tasks, consent_log, score_history, predictions, referrals)
    const { error: deleteLeadErr } = await supabase
      .from("leads")
      .delete()
      .eq("id", lead_id);

    if (deleteLeadErr) {
      console.error("Failed to delete lead:", deleteLeadErr);
      return new Response(
        JSON.stringify({ error: `Failed to delete lead: ${deleteLeadErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Log the deletion
    await supabase.from("system_logs").insert({
      organization_id: callerRecord.organization_id,
      level: "info",
      category: "general",
      event_type: "lead_deleted",
      message: `Lead "${leadName}" was deleted by user ${callerRecord.id}`,
      details: {
        deleted_lead_id: lead_id,
        deleted_lead_name: leadName,
        deleted_by: callerRecord.id,
      },
    });

    console.log(`Lead ${leadName} (${lead_id}) deleted successfully by ${callerRecord.id}`);

    return new Response(
      JSON.stringify({ success: true, message: `Lead "${leadName}" has been deleted` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("delete-lead error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
