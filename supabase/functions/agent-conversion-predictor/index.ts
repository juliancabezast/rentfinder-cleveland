import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.includes(supabaseServiceKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { task_id, lead_id, organization_id, context } = await req.json();

    if (!task_id || !lead_id || !organization_id) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update task status to in_progress
    await supabase
      .from("agent_tasks")
      .update({ status: "in_progress", executed_at: new Date().toISOString() })
      .eq("id", task_id);

    // Fetch full lead context
    const { data: leadContext, error: contextError } = await supabase
      .rpc("get_lead_full_context", { p_lead_id: lead_id });

    if (contextError) {
      throw new Error(`Failed to fetch lead context: ${contextError.message}`);
    }

    if (!leadContext || !leadContext.lead) {
      throw new Error("Lead not found");
    }

    // Fetch org's OpenAI API key
    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", organization_id)
      .single();

    const openaiApiKey = credentials?.openai_api_key;
    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured for organization");
    }

    // Fetch historical conversion data for benchmarks
    const { data: benchmarks } = await supabase
      .from("leads")
      .select("lead_score, created_at, updated_at")
      .eq("organization_id", organization_id)
      .eq("status", "converted")
      .gte("updated_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    let avgScore = 75;
    let avgDays = 14;
    let totalConverted = 0;

    if (benchmarks && benchmarks.length > 0) {
      totalConverted = benchmarks.length;
      avgScore = Math.round(
        benchmarks.reduce((sum, l) => sum + (l.lead_score || 50), 0) / benchmarks.length
      );
      avgDays = Math.round(
        benchmarks.reduce((sum, l) => {
          const created = new Date(l.created_at);
          const updated = new Date(l.updated_at);
          return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / benchmarks.length
      );
    }

    // Mark existing predictions as not current
    await supabase
      .from("conversion_predictions")
      .update({ is_current: false })
      .eq("lead_id", lead_id)
      .eq("is_current", true);

    const systemPrompt = `You are a conversion prediction model for a rental property management platform.
Given a lead's full history and the org's conversion benchmarks, predict the likelihood of this lead signing a lease.

Return JSON:
{
  "conversion_probability": 0.0 to 1.0 (decimal),
  "confidence_level": "low" | "medium" | "high",
  "predicted_days_to_convert": integer or null,
  "positive_factors": [
    { "factor": "high_engagement", "weight": 0.3, "explanation": "Lead has had 3 calls and asked detailed questions" }
  ],
  "negative_factors": [
    { "factor": "no_showing_yet", "weight": 0.2, "explanation": "Lead hasn't scheduled a showing despite 2 weeks in pipeline" }
  ],
  "recommended_action": "schedule_showing" | "call_now" | "send_info" | "nurture" | "deprioritize" | "human_review",
  "action_reasoning": "This lead shows high interest but hasn't converted to a showing. A direct call to help schedule could push them forward.",
  "data_points_used": integer (how many signals you considered)
}

Key factors to consider:
- Lead score and score trajectory (trending up or down?)
- Number and quality of interactions
- Time in pipeline vs org average
- Voucher status (active vouchers = higher urgency)
- Showing attendance vs no-shows
- Response rate to outreach
- Budget alignment with interested property
- Sentiment trend across calls

Do NOT factor in any protected class information.

Org benchmarks:
- Average converted lead score: ${avgScore}
- Average days to convert: ${avgDays}
- Total conversions (90 days): ${totalConverted}`;

    const userMessage = JSON.stringify(leadContext, null, 2);

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const predictionContent = openaiData.choices[0]?.message?.content;
    
    if (!predictionContent) {
      throw new Error("No prediction content returned from OpenAI");
    }

    const prediction = JSON.parse(predictionContent);

    // Insert into conversion_predictions table
    const { data: predictionRecord, error: insertError } = await supabase
      .from("conversion_predictions")
      .insert({
        organization_id,
        lead_id,
        conversion_probability: prediction.conversion_probability || 0.5,
        confidence_level: prediction.confidence_level || "low",
        predicted_days_to_convert: prediction.predicted_days_to_convert,
        positive_factors: prediction.positive_factors || [],
        negative_factors: prediction.negative_factors || [],
        recommended_action: prediction.recommended_action || "nurture",
        action_reasoning: prediction.action_reasoning || "",
        data_points_used: prediction.data_points_used || 0,
        model_used: "gpt-4o-mini",
        is_current: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting prediction:", insertError);
      throw new Error(`Failed to save prediction: ${insertError.message}`);
    }

    // Action triggers based on recommended action
    if (prediction.recommended_action === "call_now") {
      // Check if there's already a pending call task
      const { data: existingTasks } = await supabase
        .from("agent_tasks")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("agent_type", "recapture")
        .eq("status", "pending")
        .limit(1);

      if (!existingTasks || existingTasks.length === 0) {
        // Create a recapture task for Boaz
        await supabase.from("agent_tasks").insert({
          organization_id,
          lead_id,
          agent_type: "recapture",
          action_type: "call",
          scheduled_for: new Date().toISOString(),
          status: "pending",
          context: {
            triggered_by: "conversion_predictor",
            prediction_id: predictionRecord?.id,
            reason: "High conversion probability, recommended immediate call",
          },
        });
      }
    }

    if (prediction.recommended_action === "human_review") {
      // Create a notification task for Aaron
      await supabase.from("agent_tasks").insert({
        organization_id,
        lead_id,
        agent_type: "notification_dispatcher",
        action_type: "send",
        scheduled_for: new Date().toISOString(),
        status: "pending",
        context: {
          notification_type: "human_review_needed",
          prediction_id: predictionRecord?.id,
          reason: prediction.action_reasoning,
        },
      });
    }

    // Calculate and record OpenAI cost
    const inputTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
    const outputTokens = Math.ceil(predictionContent.length / 4);
    const inputCost = (inputTokens / 1000000) * 0.15;
    const outputCost = (outputTokens / 1000000) * 0.60;
    const totalCost = inputCost + outputCost;

    await supabase.rpc("zacchaeus_record_cost", {
      p_organization_id: organization_id,
      p_service: "openai",
      p_usage_quantity: inputTokens + outputTokens,
      p_usage_unit: "tokens",
      p_unit_cost: 0.000000375,
      p_total_cost: totalCost,
      p_lead_id: lead_id,
      p_call_id: null,
      p_communication_id: null,
    });

    // Update task to completed
    await supabase
      .from("agent_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task_id);

    const executionMs = Date.now() - startTime;

    // Log activity
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "conversion_predictor",
      p_action: "predict_conversion",
      p_status: "success",
      p_message: `Predicted conversion for lead. Probability: ${Math.round(prediction.conversion_probability * 100)}%, Action: ${prediction.recommended_action}`,
      p_details: {
        prediction_id: predictionRecord?.id,
        probability: prediction.conversion_probability,
        recommended_action: prediction.recommended_action,
        confidence_level: prediction.confidence_level,
      },
      p_related_lead_id: lead_id,
      p_related_call_id: null,
      p_related_showing_id: null,
      p_related_property_id: null,
      p_related_task_id: task_id,
      p_execution_ms: executionMs,
      p_cost_incurred: totalCost,
    });

    return new Response(JSON.stringify({
      success: true,
      prediction_id: predictionRecord?.id,
      probability: prediction.conversion_probability,
      recommended_action: prediction.recommended_action,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("agent-conversion-predictor error:", error);

    const executionMs = Date.now() - startTime;

    // Try to mark task as failed
    try {
      const { task_id, organization_id, lead_id } = await req.clone().json();
      
      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      if (organization_id) {
        await supabase.rpc("log_agent_activity", {
          p_organization_id: organization_id,
          p_agent_key: "conversion_predictor",
          p_action: "predict_conversion",
          p_status: "error",
          p_message: error instanceof Error ? error.message : "Unknown error",
          p_details: { error: String(error) },
          p_related_lead_id: lead_id || null,
          p_related_call_id: null,
          p_related_showing_id: null,
          p_related_property_id: null,
          p_related_task_id: task_id || null,
          p_execution_ms: executionMs,
          p_cost_incurred: null,
        });
      }
    } catch (logError) {
      console.error("Error logging failure:", logError);
    }

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
