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
    const { call_id } = context || {};

    if (!task_id || !lead_id || !organization_id || !call_id) {
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

    // Fetch the call record
    const { data: callRecord, error: callError } = await supabase
      .from("calls")
      .select("*")
      .eq("id", call_id)
      .single();

    if (callError || !callRecord) {
      throw new Error(`Call not found: ${call_id}`);
    }

    if (!callRecord.transcript) {
      // No transcript to analyze
      await supabase
        .from("agent_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);

      return new Response(JSON.stringify({ 
        success: true, 
        message: "No transcript to analyze",
        analysis_id: null 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead context
    const { data: leadContext, error: contextError } = await supabase
      .rpc("get_lead_full_context", { p_lead_id: lead_id });

    if (contextError) {
      console.error("Error fetching lead context:", contextError);
    }

    // Fetch associated property
    let propertyInfo = { address: "Unknown", rent_price: 0, bedrooms: 0 };
    if (callRecord.property_id) {
      const { data: property } = await supabase
        .from("properties")
        .select("address, city, rent_price, bedrooms")
        .eq("id", callRecord.property_id)
        .single();
      
      if (property) {
        propertyInfo = {
          address: `${property.address}, ${property.city}`,
          rent_price: property.rent_price || 0,
          bedrooms: property.bedrooms || 0,
        };
      }
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

    // Get lead score from context
    const leadScore = leadContext?.lead?.lead_score || 50;
    const leadStatus = leadContext?.lead?.status || "unknown";

    const systemPrompt = `You are a real estate market analyst for a property management company.
Analyze this call transcript for business intelligence.

Return JSON with these fields:
{
  "competitor_mentions": [
    {
      "name": "Name of competitor or competing property",
      "address": "Address if mentioned",
      "feature_mentioned": "What they liked about competitor",
      "context": "Brief relevant quote context (paraphrased)"
    }
  ],
  "pricing_feedback": [
    {
      "sentiment": "too_high" | "fair" | "good_deal",
      "detail": "What they said about price",
      "suggested_action": "Consider lowering by $X" or "Price is competitive"
    }
  ],
  "feature_requests": [
    {
      "feature": "in-unit laundry",
      "importance": "high" | "medium" | "low",
      "context": "They specifically asked about..."
    }
  ],
  "objections": [
    {
      "type": "price" | "location" | "condition" | "timing" | "process" | "other",
      "detail": "Specific objection",
      "severity": "dealbreaker" | "concern" | "minor"
    }
  ],
  "location_feedback": [
    {
      "sentiment": "positive" | "neutral" | "negative",
      "detail": "What they said about the area"
    }
  ],
  "loss_risk_level": "none" | "low" | "medium" | "high",
  "loss_risk_reasons": [
    {
      "reason_code": "price_objection",
      "reason_text": "Lead expressed the rent was above their budget"
    }
  ],
  "wants_showing": boolean,
  "wants_application": boolean,
  "wants_callback": boolean,
  "mentioned_timeline": "string or null"
}

Guidelines:
- Extract actual intelligence, not generic observations
- Competitor mentions include other properties, landlords, or management companies
- Pricing feedback should include their comparison basis if available
- Feature requests = things they asked about that the property may not have
- Only flag loss risk if there are concrete signals, not speculation
- Do NOT extract or analyze protected class information`;

    const userMessage = `Transcript:
${callRecord.transcript}

Property: ${propertyInfo.address}, $${propertyInfo.rent_price}/mo, ${propertyInfo.bedrooms}BR
Lead Status: ${leadStatus}, Score: ${leadScore}`;

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
    const analysisContent = openaiData.choices[0]?.message?.content;
    
    if (!analysisContent) {
      throw new Error("No analysis content returned from OpenAI");
    }

    const analysis = JSON.parse(analysisContent);

    // Insert into transcript_analyses table
    const { data: analysisRecord, error: insertError } = await supabase
      .from("transcript_analyses")
      .insert({
        organization_id,
        call_id,
        lead_id,
        competitor_mentions: analysis.competitor_mentions || [],
        pricing_feedback: analysis.pricing_feedback || [],
        feature_requests: analysis.feature_requests || [],
        objections: analysis.objections || [],
        location_feedback: analysis.location_feedback || [],
        loss_risk_level: analysis.loss_risk_level || "none",
        loss_risk_reasons: analysis.loss_risk_reasons || [],
        wants_showing: analysis.wants_showing || false,
        wants_application: analysis.wants_application || false,
        wants_callback: analysis.wants_callback || false,
        mentioned_timeline: analysis.mentioned_timeline,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting analysis:", insertError);
      throw new Error(`Failed to save analysis: ${insertError.message}`);
    }

    // Calculate and record OpenAI cost
    const inputTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
    const outputTokens = Math.ceil(analysisContent.length / 4);
    const inputCost = (inputTokens / 1000000) * 0.15;
    const outputCost = (outputTokens / 1000000) * 0.60;
    const totalCost = inputCost + outputCost;

    await supabase.rpc("zacchaeus_record_cost", {
      p_organization_id: organization_id,
      p_service: "openai",
      p_usage_quantity: inputTokens + outputTokens,
      p_usage_unit: "tokens",
      p_unit_cost: 0.000000375, // Blended rate
      p_total_cost: totalCost,
      p_lead_id: lead_id,
      p_call_id: call_id,
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
      p_agent_key: "transcript_analyst",
      p_action: "analyze_transcript",
      p_status: "success",
      p_message: `Analyzed transcript for call ${call_id}. Loss risk: ${analysis.loss_risk_level}`,
      p_details: {
        call_id,
        analysis_id: analysisRecord?.id,
        competitor_count: (analysis.competitor_mentions || []).length,
        objection_count: (analysis.objections || []).length,
        loss_risk_level: analysis.loss_risk_level,
      },
      p_related_lead_id: lead_id,
      p_related_call_id: call_id,
      p_related_showing_id: null,
      p_related_property_id: callRecord.property_id,
      p_related_task_id: task_id,
      p_execution_ms: executionMs,
      p_cost_incurred: totalCost,
    });

    return new Response(JSON.stringify({
      success: true,
      analysis_id: analysisRecord?.id,
      loss_risk_level: analysis.loss_risk_level,
      competitor_count: (analysis.competitor_mentions || []).length,
      objection_count: (analysis.objections || []).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("agent-transcript-analyst error:", error);

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
          p_agent_key: "transcript_analyst",
          p_action: "analyze_transcript",
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
