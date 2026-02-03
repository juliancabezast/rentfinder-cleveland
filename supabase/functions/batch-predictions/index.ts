import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    // Get organizations to process
    let orgsQuery = supabase.from("organizations").select("id").eq("is_active", true);
    if (organization_id) {
      orgsQuery = orgsQuery.eq("id", organization_id);
    }
    
    const { data: organizations, error: orgsError } = await orgsQuery;

    if (orgsError) {
      console.error("Error fetching organizations:", orgsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch organizations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalProcessed = 0;
    let totalErrors = 0;
    const results: { org_id: string; processed: number; errors: number }[] = [];

    for (const org of organizations || []) {
      // Fetch active leads that need prediction refresh
      // (no prediction, or prediction expired, or prediction older than 7 days)
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", org.id)
        .not("status", "in", '("converted","lost")')
        .limit(100);

      if (leadsError) {
        console.error(`Error fetching leads for org ${org.id}:`, leadsError);
        totalErrors++;
        continue;
      }

      let orgProcessed = 0;
      let orgErrors = 0;

      // Get existing predictions to avoid unnecessary refreshes
      const { data: existingPredictions } = await supabase
        .from("lead_predictions")
        .select("lead_id, expires_at")
        .eq("organization_id", org.id)
        .in("lead_id", leads?.map(l => l.id) || []);

      const existingMap = new Map(
        (existingPredictions || []).map(p => [p.lead_id, new Date(p.expires_at)])
      );

      // Process each lead
      for (const lead of leads || []) {
        // Skip if prediction exists and not expired
        const existingExpiry = existingMap.get(lead.id);
        if (existingExpiry && existingExpiry > new Date()) {
          continue;
        }

        try {
          // Call the predict-conversion function
          const response = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/predict-conversion`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                organization_id: org.id,
                lead_id: lead.id,
              }),
            }
          );

          if (response.ok) {
            orgProcessed++;
            totalProcessed++;
          } else {
            orgErrors++;
            totalErrors++;
            console.error(`Failed to predict for lead ${lead.id}:`, await response.text());
          }
        } catch (err) {
          orgErrors++;
          totalErrors++;
          console.error(`Error predicting for lead ${lead.id}:`, err);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      results.push({
        org_id: org.id,
        processed: orgProcessed,
        errors: orgErrors,
      });
    }

    console.log(`Batch predictions complete: ${totalProcessed} processed, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total_processed: totalProcessed,
        total_errors: totalErrors,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in batch-predictions:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
