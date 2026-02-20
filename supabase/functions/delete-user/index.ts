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

    // ── 1. Authenticate the caller ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client with caller's token (for auth check)
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

    // Service role client (for admin operations)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 2. Get caller's user record and verify admin/super_admin ────
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
        JSON.stringify({ error: "Only admins can delete users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Parse request body ───────────────────────────────────────
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Get the target user record ───────────────────────────────
    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id, auth_user_id, full_name, email, role, organization_id")
      .eq("id", user_id)
      .single();

    if (targetErr || !targetUser) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Safety checks ────────────────────────────────────────────
    // Cannot delete yourself
    if (targetUser.id === callerRecord.id) {
      return new Response(
        JSON.stringify({ error: "You cannot delete your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Must be in same organization
    if (targetUser.organization_id !== callerRecord.organization_id) {
      return new Response(
        JSON.stringify({ error: "User not in your organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Non-super_admin cannot delete super_admin
    if (targetUser.role === "super_admin" && callerRecord.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Only super admins can delete other super admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 6. Nullify all FK references to this user ───────────────────
    const nullifyOps = [
      supabase.from("leads").update({ assigned_leasing_agent_id: null }).eq("assigned_leasing_agent_id", user_id),
      supabase.from("leads").update({ human_controlled_by: null }).eq("human_controlled_by", user_id),
      supabase.from("showings").update({ leasing_agent_id: null }).eq("leasing_agent_id", user_id),
      supabase.from("agent_tasks").update({ paused_by: null }).eq("paused_by", user_id),
      supabase.from("property_alerts").update({ read_by: null }).eq("read_by", user_id),
      supabase.from("lead_score_history").update({ changed_by_user_id: null }).eq("changed_by_user_id", user_id),
      supabase.from("system_logs").update({ resolved_by: null }).eq("resolved_by", user_id),
      supabase.from("system_settings").update({ updated_by: null }).eq("updated_by", user_id),
      supabase.from("users").update({ invited_by: null }).eq("invited_by", user_id),
    ];

    const nullifyResults = await Promise.all(nullifyOps);
    const nullifyErrors = nullifyResults.filter(r => r.error).map(r => r.error?.message);
    if (nullifyErrors.length > 0) {
      console.error("Nullify errors (non-fatal):", nullifyErrors);
    }

    // Delete investor_property_access rows for this user
    await supabase.from("investor_property_access").delete().eq("investor_id", user_id);
    // Also clean up any granted_by references
    await supabase.from("investor_property_access").update({ granted_by: null }).eq("granted_by", user_id);

    // ── 7. Delete the public.users record ───────────────────────────
    const { error: deleteErr } = await supabase
      .from("users")
      .delete()
      .eq("id", user_id);

    if (deleteErr) {
      console.error("Failed to delete public.users row:", deleteErr);
      return new Response(
        JSON.stringify({ error: `Failed to delete user: ${deleteErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 8. Delete the auth.users record ─────────────────────────────
    if (targetUser.auth_user_id) {
      const { error: authDeleteErr } = await supabase.auth.admin.deleteUser(targetUser.auth_user_id);
      if (authDeleteErr) {
        console.error("Failed to delete auth user (public.users already deleted):", authDeleteErr);
        // Non-fatal: the public record is already gone
      }
    }

    // ── 9. Log the deletion ─────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id: callerRecord.organization_id,
      level: "info",
      category: "general",
      event_type: "user_deleted",
      message: `User "${targetUser.full_name}" (${targetUser.email}, role: ${targetUser.role}) was deleted by "${callerRecord.id}"`,
      details: {
        deleted_user_id: targetUser.id,
        deleted_user_name: targetUser.full_name,
        deleted_user_email: targetUser.email,
        deleted_user_role: targetUser.role,
        deleted_by: callerRecord.id,
      },
    });

    console.log(`User ${targetUser.full_name} (${user_id}) deleted successfully by ${callerRecord.id}`);

    return new Response(
      JSON.stringify({ success: true, message: `User "${targetUser.full_name}" has been deleted` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("delete-user error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
