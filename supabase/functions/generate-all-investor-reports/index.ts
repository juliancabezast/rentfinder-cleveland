import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    
    // Default to previous month
    const now = new Date();
    const targetMonth = body.month || (now.getMonth() === 0 ? 12 : now.getMonth());
    const targetYear = body.year || (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
    const organizationId = body.organization_id;

    console.log(`Generating reports for ${targetMonth}/${targetYear}`);

    // Get all organizations (or specific one)
    let orgsQuery = supabase.from("organizations").select("id, name").eq("is_active", true);
    if (organizationId) {
      orgsQuery = orgsQuery.eq("id", organizationId);
    }
    
    const { data: organizations, error: orgsError } = await orgsQuery;

    if (orgsError) {
      console.error("Error fetching organizations:", orgsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch organizations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalGenerated = 0;
    let totalErrors = 0;
    const results: { org_id: string; investor_id: string; success: boolean; error?: string }[] = [];

    for (const org of organizations || []) {
      // Check if investor reports are enabled for this org
      const { data: settingData } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", org.id)
        .eq("key", "investor_reports_enabled")
        .single();

      // Default to enabled if not set
      const reportsEnabled = settingData?.value !== false;

      if (!reportsEnabled) {
        console.log(`Investor reports disabled for org ${org.id}`);
        continue;
      }

      // Get all investors with property access in this org
      const { data: investorAccess } = await supabase
        .from("investor_property_access")
        .select("investor_id")
        .eq("organization_id", org.id);

      // Deduplicate investor IDs
      const investorIds = [...new Set((investorAccess || []).map((a) => a.investor_id))];

      for (const investorId of investorIds) {
        try {
          // Call the single report generator
          const response = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-investor-report`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                organization_id: org.id,
                investor_id: investorId,
                month: targetMonth,
                year: targetYear,
                send_email: true,
              }),
            }
          );

          const result = await response.json();

          if (response.ok && result.success) {
            totalGenerated++;
            results.push({ org_id: org.id, investor_id: investorId, success: true });
          } else {
            totalErrors++;
            results.push({
              org_id: org.id,
              investor_id: investorId,
              success: false,
              error: result.error || "Unknown error",
            });
          }
        } catch (err) {
          totalErrors++;
          results.push({
            org_id: org.id,
            investor_id: investorId,
            success: false,
            error: String(err),
          });
        }

        // Small delay between reports
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`Batch complete: ${totalGenerated} generated, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        month: targetMonth,
        year: targetYear,
        total_generated: totalGenerated,
        total_errors: totalErrors,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-all-investor-reports:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
