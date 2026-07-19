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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    let { organization_id } = await req.json();

    // ── Authenticate caller ─────────────────────────────────────────
    // Called by a cron (service-role key) AND by the frontend recalculate
    // button (supabase.functions.invoke sends the logged-in user's JWT as
    // Authorization). Preserve BOTH: accept an internal service-role call OR
    // a logged-in user; reject anon/invalid tokens. For user callers, force
    // the org from THEIR record — never trust a body-supplied organization_id.
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isServiceRole = callerToken.length > 0 && callerToken === serviceRoleKey;
    if (!isServiceRole) {
      if (!callerToken || callerToken === anonKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: authData, error: authErr } = await supabase.auth.getUser(callerToken);
      if (authErr || !authData?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: callerRec } = await supabase
        .from("users")
        .select("organization_id, is_active")
        .eq("auth_user_id", authData.user.id)
        .single();
      if (!callerRec || callerRec.is_active === false || !callerRec.organization_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Force org from the caller's own record — override any body value.
      organization_id = callerRec.organization_id;
    }

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Milestone model (2026-07-19) ────────────────────────────────
    // The legacy history-replay engine is retired. Scores are a pure
    // function of verifiable facts (agendó 50 / asistió 80 / aplicó 100,
    // intentó 10, normal 0), owned by the DB milestone engine. This
    // endpoint now just triggers the set-based recompute-all RPC.
    const { data: recompute, error: rpcErr } = await supabase.rpc("recalculate_lead_scores", {
      p_org: organization_id, // org-scoped: never recompute other tenants
    });
    if (rpcErr) throw rpcErr;
    const row = Array.isArray(recompute) ? recompute[0] : recompute;
    const checked = row?.leads_checked ?? 0;
    const updated = row?.leads_updated ?? 0;

    // Log the operation
    await supabase.from("system_logs").insert({
      organization_id,
      level: "info",
      category: "general",
      event_type: "score_recalculation",
      message: `Milestone recompute: ${updated} updated of ${checked} leads`,
      details: { updated, total: checked, engine: "milestone_v1" },
    });

    return new Response(
      JSON.stringify({ success: true, updated, failed: 0, total: checked }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("recalculate-scores error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
