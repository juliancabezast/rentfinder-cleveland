import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: run a supabase query and log errors without throwing
async function safe(label: string, promise: PromiseLike<{ error: any }>) {
  try {
    const { error } = await promise;
    if (error) console.warn(`[${label}] ${error.message}`);
  } catch (e) {
    console.warn(`[${label}] exception: ${(e as Error).message}`);
  }
}

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

    // 5. Get all showing IDs for this lead (needed to clean up showing FK deps)
    const { data: showings } = await supabase
      .from("showings")
      .select("id")
      .eq("lead_id", lead_id);

    const showingIds = (showings || []).map((s: any) => s.id);

    // 6. Clean up FK references to showings BEFORE deleting showings
    if (showingIds.length > 0) {
      await Promise.all([
        safe("slots.booked_showing_id", supabase.from("showing_available_slots").update({ booked_showing_id: null }).in("booked_showing_id", showingIds)),
        safe("cost_records.related_showing_id", supabase.from("cost_records").update({ related_showing_id: null }).in("related_showing_id", showingIds)),
        safe("agent_activity_log.related_showing_id", supabase.from("agent_activity_log").update({ related_showing_id: null }).in("related_showing_id", showingIds)),
        safe("lead_notes.related_showing_id", supabase.from("lead_notes").update({ related_showing_id: null }).in("related_showing_id", showingIds)),
        safe("notifications.related_showing_id", supabase.from("notifications").update({ related_showing_id: null }).in("related_showing_id", showingIds)),
        safe("system_logs.related_showing_id", supabase.from("system_logs").update({ related_showing_id: null }).in("related_showing_id", showingIds)),
        safe("showings.rescheduled_to_id", supabase.from("showings").update({ rescheduled_to_id: null }).in("rescheduled_to_id", showingIds)),
      ]);
    }

    // 7. Now delete showings (their FK deps are cleared)
    await safe("showings", supabase.from("showings").delete().eq("lead_id", lead_id));

    // 8. Delete other RESTRICT FK tables referencing the lead
    await Promise.all([
      safe("cost_records", supabase.from("cost_records").delete().eq("lead_id", lead_id)),
      safe("lead_notes", supabase.from("lead_notes").delete().eq("lead_id", lead_id)),
      safe("lead_field_changes", supabase.from("lead_field_changes").delete().eq("lead_id", lead_id)),
      safe("campaign_recipients", supabase.from("campaign_recipients").delete().eq("lead_id", lead_id)),
      safe("conversion_predictions", supabase.from("conversion_predictions").delete().eq("lead_id", lead_id)),
      safe("email_events", supabase.from("email_events").delete().eq("lead_id", lead_id)),
      safe("transcript_analyses", supabase.from("transcript_analyses").delete().eq("lead_id", lead_id)),
      safe("lead_property_interests", supabase.from("lead_property_interests").delete().eq("lead_id", lead_id)),
    ]);

    // 9. Nullify lead references in other tables
    await Promise.all([
      safe("calls.lead_id", supabase.from("calls").update({ lead_id: null }).eq("lead_id", lead_id)),
      safe("communications.lead_id", supabase.from("communications").update({ lead_id: null }).eq("lead_id", lead_id)),
      safe("competitor_mentions.lead_id", supabase.from("competitor_mentions").update({ lead_id: null }).eq("lead_id", lead_id)),
      safe("agent_activity_log.related_lead_id", supabase.from("agent_activity_log").update({ related_lead_id: null }).eq("related_lead_id", lead_id)),
      safe("notifications.related_lead_id", supabase.from("notifications").update({ related_lead_id: null }).eq("related_lead_id", lead_id)),
      safe("system_logs.related_lead_id", supabase.from("system_logs").update({ related_lead_id: null }).eq("related_lead_id", lead_id)),
    ]);

    // 10. Delete the lead (CASCADE handles agent_tasks, consent_log, score_history, predictions, referrals)
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

    // 11. Log the deletion
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
