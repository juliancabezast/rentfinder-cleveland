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
    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org scoring settings
    const { data: settings } = await supabase
      .from("organization_settings")
      .select("key, value")
      .eq("organization_id", organization_id)
      .eq("category", "scoring");

    const settingsMap: Record<string, unknown> = {};
    for (const s of settings || []) {
      settingsMap[s.key] = s.value;
    }

    const startingScore = Number(settingsMap.starting_score) || 50;
    const rules = (settingsMap.custom_scoring_rules || {}) as Record<string, number>;

    // Fetch all active leads
    const { data: leads, error: leadErr } = await supabase
      .from("leads")
      .select("id, lead_score, status")
      .eq("organization_id", organization_id)
      .neq("status", "lost");

    if (leadErr) throw leadErr;
    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: "No active leads" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For each lead, recalculate score based on their score history
    let updated = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        // Get all score history for this lead
        const { data: history } = await supabase
          .from("lead_score_history")
          .select("change_amount, reason_code")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: true });

        // Recalculate: start from starting_score and replay all changes
        // applying custom rule overrides where applicable
        let newScore = startingScore;

        for (const entry of history || []) {
          const code = entry.reason_code;
          // If there's a custom rule override for this reason code, use it
          if (code && rules[code] !== undefined) {
            newScore += rules[code];
          } else {
            // Otherwise use the original change amount
            newScore += entry.change_amount;
          }
        }

        // Clamp to 0-100
        newScore = Math.max(0, Math.min(100, newScore));

        // Only update if score changed
        if (newScore !== lead.lead_score) {
          const changeAmount = newScore - (lead.lead_score || startingScore);
          await supabase.rpc("log_score_change", {
            _lead_id: lead.id,
            _change_amount: changeAmount,
            _reason_code: "recalculation",
            _reason_text: `Score recalculated from ${lead.lead_score} to ${newScore} (bulk recalculation)`,
            _triggered_by: "system",
            _changed_by_agent: "admin_recalculate",
          });
          updated++;
        }
      } catch (err) {
        console.error(`Failed to recalculate lead ${lead.id}:`, err);
        failed++;
      }
    }

    // Log the operation
    await supabase.from("system_logs").insert({
      organization_id,
      level: "info",
      category: "general",
      event_type: "score_recalculation",
      message: `Bulk score recalculation: ${updated} updated, ${failed} failed out of ${leads.length} leads`,
      details: { updated, failed, total: leads.length },
    });

    return new Response(
      JSON.stringify({ success: true, updated, failed, total: leads.length }),
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
