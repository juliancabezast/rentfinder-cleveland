import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Insight {
  insight_type: string;
  headline: string;
  narrative: string;
  confidence_score: number;
  is_highlighted: boolean;
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let propertiesAnalyzed = 0;
  let insightsGenerated = 0;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "on_demand";
    const targetOrgId = body.organization_id;
    const targetPropertyId = body.property_id;

    // Calculate date range (last 7 days)
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Determine which orgs/properties to process
    let orgsToProcess: { id: string }[] = [];

    if (mode === "weekly") {
      // Process all active organizations
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id")
        .eq("status", "active");
      orgsToProcess = orgs || [];
    } else if (targetOrgId) {
      orgsToProcess = [{ id: targetOrgId }];
    } else {
      throw new Error("organization_id required for on_demand mode");
    }

    for (const org of orgsToProcess) {
      const orgId = org.id;

      // Get properties for this org
      let propertiesQuery = supabase
        .from("properties")
        .select("id, address")
        .eq("organization_id", orgId)
        .in("status", ["available", "coming_soon", "rented"]);

      if (targetPropertyId) {
        propertiesQuery = propertiesQuery.eq("id", targetPropertyId);
      }

      const { data: properties } = await propertiesQuery;

      if (!properties || properties.length === 0) continue;

      // Fetch org's OpenAI API key
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("openai_api_key")
        .eq("organization_id", orgId)
        .single();

      const openaiKey = creds?.openai_api_key || Deno.env.get("OPENAI_API_KEY");

      if (!openaiKey) {
        console.log(`Org ${orgId}: No OpenAI API key configured, skipping`);
        continue;
      }

      for (const property of properties) {
        try {
          // Get property performance data
          const { data: perfData, error: perfError } = await supabase.rpc(
            "get_property_performance",
            {
              p_organization_id: orgId,
              p_property_id: property.id,
              p_start_date: startDate,
              p_end_date: endDate,
            }
          );

          if (perfError) {
            console.error(`Error getting performance for ${property.id}:`, perfError);
            continue;
          }

          // Skip if no activity
          const totalActivity =
            (perfData?.leads_count || 0) +
            (perfData?.calls_count || 0) +
            (perfData?.showings_count || 0);

          if (totalActivity === 0) {
            console.log(`Property ${property.id}: No activity, skipping`);
            continue;
          }

          propertiesAnalyzed++;

          // Generate insights via OpenAI
          const systemPrompt = `You are a real estate investment analyst writing insights for property investors.
Your job is to analyze performance data and generate 2-5 actionable narrative insights.

Write like a trusted advisor, not a data dump. Each insight should:
1. Have a compelling headline (max 80 chars)
2. Tell a story with data backing (the narrative, 2-4 sentences)
3. Include a recommendation when applicable
4. Be classified by type

Insight types:
- lead_loss_reason: Why leads didn't convert
- pricing_feedback: Price signals from conversations
- location_feedback: Area-related comments
- feature_request: Amenities leads asked about
- competitive_insight: Mentions of competing properties
- seasonal_trend: Time-based patterns
- recommendation: AI suggestion for improvement

Return JSON:
{
  "insights": [
    {
      "insight_type": "pricing_feedback",
      "headline": "3 leads mentioned rent was above their budget",
      "narrative": "Over the past week, 3 of 8 callers for this property explicitly mentioned that $1,200/mo was higher than expected for the area. Two compared it to a similar 2BR on Cedar Ave at $1,050. Consider a modest rent adjustment or highlighting premium features to justify the price.",
      "confidence_score": 0.85,
      "is_highlighted": true
    }
  ]
}

Guidelines:
- Only generate insights backed by actual data in the performance report
- Don't fabricate data points
- If there's not enough data for an insight, skip it
- Prioritize actionable insights over generic observations
- Highlight positive trends too, not just problems
- Never reference protected class information`;

          const openaiResponse = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                  { role: "system", content: systemPrompt },
                  {
                    role: "user",
                    content: `Property: ${property.address}\n\nPerformance Data:\n${JSON.stringify(perfData, null, 2)}`,
                  },
                ],
                response_format: { type: "json_object" },
                max_tokens: 2000,
              }),
            }
          );

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error(`OpenAI error for ${property.id}:`, errorText);
            continue;
          }

          const openaiData = await openaiResponse.json();
          const content = openaiData.choices?.[0]?.message?.content;

          if (!content) {
            console.error(`No content from OpenAI for ${property.id}`);
            continue;
          }

          // Parse insights
          let parsed: { insights: Insight[] };
          try {
            parsed = JSON.parse(content);
          } catch {
            console.error(`Failed to parse OpenAI response for ${property.id}`);
            continue;
          }

          // Insert insights
          for (const insight of parsed.insights || []) {
            const { error: insertError } = await supabase
              .from("investor_insights")
              .insert({
                organization_id: orgId,
                property_id: property.id,
                insight_type: insight.insight_type,
                headline: insight.headline,
                narrative: insight.narrative,
                data_points: perfData,
                confidence_score: insight.confidence_score,
                is_highlighted: insight.is_highlighted,
                period_start: startDate,
                period_end: endDate,
              });

            if (insertError) {
              console.error(`Failed to insert insight:`, insertError);
            } else {
              insightsGenerated++;
            }
          }

          // Record OpenAI cost
          const inputTokens = openaiData.usage?.prompt_tokens || 0;
          const outputTokens = openaiData.usage?.completion_tokens || 0;
          // GPT-4o: $2.50/1M input, $10.00/1M output
          const cost = (inputTokens * 2.5 + outputTokens * 10) / 1_000_000;

          await supabase.rpc("zacchaeus_record_cost", {
            p_organization_id: orgId,
            p_service: "openai",
            p_usage_quantity: inputTokens + outputTokens,
            p_usage_unit: "tokens",
            p_unit_cost: cost / (inputTokens + outputTokens || 1),
            p_total_cost: cost,
          });

        } catch (propError) {
          console.error(`Error processing property ${property.id}:`, propError);
        }
      }
    }

    // Log summary
    await supabase.rpc("log_agent_activity", {
      p_organization_id: targetOrgId || orgsToProcess[0]?.id,
      p_agent_key: "insight_generator",
      p_action: "generate_complete",
      p_status: "success",
      p_message: `Generated ${insightsGenerated} insights for ${propertiesAnalyzed} properties`,
      p_details: {
        mode,
        properties_analyzed: propertiesAnalyzed,
        insights_generated: insightsGenerated,
        period_start: startDate,
        period_end: endDate,
      },
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({
        success: true,
        properties_analyzed: propertiesAnalyzed,
        insights_generated: insightsGenerated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Insight generator error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
