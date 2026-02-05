import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScoreAdjustment {
  reason_code: string;
  reason_text: string;
  points: number;
}

interface ScoringAnalysis {
  urgency_level: number;
  interest_level: number;
  sentiment: string;
  key_questions: string[];
  unanswered_questions: string[];
  section_8_mentioned: boolean;
  voucher_status: string | null;
  move_in_timeline: string | null;
  budget_mentioned: string | null;
  name_captured: string | null;
  email_captured: string | null;
  consent_given_followup: boolean;
  wants_showing: boolean;
  score_adjustments: ScoreAdjustment[];
  total_recommended_adjustment: number;
  red_flags: string[];
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight
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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Parse request
    const { task_id, lead_id, organization_id, context } = await req.json();
    const callId = context?.call_id;

    if (!lead_id || !organization_id || !callId) {
      throw new Error("Missing required fields: lead_id, organization_id, context.call_id");
    }

    console.log(`Scoring task: lead=${lead_id}, call=${callId}`);

    // Fetch call record
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("transcript, summary, duration_seconds, agent_type, direction")
      .eq("id", callId)
      .single();

    if (callError || !call) {
      throw new Error(`Call not found: ${callId}`);
    }

    // Fetch lead record
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("lead_score, status, has_voucher, voucher_status, budget_min, budget_max, is_priority")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${lead_id}`);
    }

    const currentScore = lead.lead_score || 50;

    // Fetch org's OpenAI API key
    const { data: credentials } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", organization_id)
      .single();

    if (!credentials?.openai_api_key) {
      console.log("No OpenAI key, using default scoring");
      // Default scoring: +5 for any completed call
      const newScore = Math.min(100, currentScore + 5);
      
      await supabase.from("lead_score_history").insert({
        organization_id,
        lead_id,
        previous_score: currentScore,
        new_score: newScore,
        change_amount: 5,
        reason_code: "completed_call_default",
        reason_text: "Call completed (default scoring - no AI analysis)",
        triggered_by: "call_analysis",
        related_call_id: callId,
        changed_by_agent: "solomon_scoring",
      });

      await supabase
        .from("leads")
        .update({ lead_score: newScore })
        .eq("id", lead_id);

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "scoring",
        p_action: "default_scoring",
        p_status: "success",
        p_message: `Applied default scoring: ${currentScore} → ${newScore}`,
        p_details: { reason: "no_openai_key" },
        p_lead_id: lead_id,
        p_call_id: callId,
        p_task_id: task_id,
        p_execution_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ success: true, new_score: newScore, adjustments_count: 1, priority_flagged: newScore >= 85 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we have a transcript to analyze
    if (!call.transcript || call.transcript.trim().length < 50) {
      console.log("Transcript too short, using default scoring");
      const newScore = Math.min(100, currentScore + 3);
      
      await supabase.from("lead_score_history").insert({
        organization_id,
        lead_id,
        previous_score: currentScore,
        new_score: newScore,
        change_amount: 3,
        reason_code: "short_call_default",
        reason_text: "Brief call with minimal transcript",
        triggered_by: "call_analysis",
        related_call_id: callId,
        changed_by_agent: "solomon_scoring",
      });

      await supabase.from("leads").update({ lead_score: newScore }).eq("id", lead_id);

      return new Response(
        JSON.stringify({ success: true, new_score: newScore, adjustments_count: 1, priority_flagged: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get priority threshold from settings
    const { data: thresholdSetting } = await supabase.rpc("get_org_setting", {
      p_organization_id: organization_id,
      p_key: "priority_threshold",
      p_default: "85",
    });
    const priorityThreshold = parseInt(String(thresholdSetting).replace(/"/g, "")) || 85;

    // Call OpenAI for analysis
    const systemPrompt = `You are a lead scoring analyst for a property management company.
Analyze this call transcript between an AI leasing agent and a prospective tenant.

Extract the following as JSON:
{
  "urgency_level": 1-5,
  "interest_level": 1-5,
  "sentiment": "positive" | "neutral" | "negative",
  "key_questions": ["list of questions the lead asked"],
  "unanswered_questions": ["questions the AI couldn't answer"],
  "section_8_mentioned": boolean,
  "voucher_status": "active" | "pending" | "expiring_soon" | null,
  "move_in_timeline": "string or null",
  "budget_mentioned": "string or null",
  "name_captured": "string or null",
  "email_captured": "string or null",
  "consent_given_followup": boolean,
  "wants_showing": boolean,
  "score_adjustments": [
    {
      "reason_code": "urgency_high",
      "reason_text": "Lead mentioned needing to move within 2 weeks",
      "points": 15
    }
  ],
  "total_recommended_adjustment": -30 to +30,
  "red_flags": ["list or empty"]
}

Score adjustment guidelines:
- High urgency (moving soon): +10 to +15
- High interest (asking specific questions): +5 to +10
- Positive sentiment: +5
- Negative sentiment: -5
- Has active voucher: +10
- Wants to schedule showing: +15
- Gave consent for follow-up: +5
- Captured email: +5
- Red flags (rude, unrealistic expectations): -10 to -15
- Brief/unengaged call: -5

CRITICAL: Do NOT score based on race, ethnicity, national origin, religion, sex, gender, familial status, disability, or age. Only use behavioral and engagement signals.

Return ONLY valid JSON, no markdown.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.openai_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: call.transcript },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const analysisText = openaiData.choices?.[0]?.message?.content;

    if (!analysisText) {
      throw new Error("No analysis returned from OpenAI");
    }

    // Parse the JSON response
    let analysis: ScoringAnalysis;
    try {
      // Clean up potential markdown formatting
      const cleanJson = analysisText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", analysisText);
      throw new Error("Failed to parse AI analysis");
    }

    // Calculate token usage for cost tracking
    const inputTokens = Math.ceil(call.transcript.length / 4);
    const outputTokens = Math.ceil(analysisText.length / 4);
    // GPT-4o-mini: $0.15/1M input, $0.60/1M output
    const openaiCost = (inputTokens * 0.00000015) + (outputTokens * 0.0000006);

    // Record OpenAI cost
    await supabase.rpc("zacchaeus_record_cost", {
      p_organization_id: organization_id,
      p_service: "openai",
      p_usage_quantity: inputTokens + outputTokens,
      p_usage_unit: "tokens",
      p_unit_cost: 0.0000003, // Average
      p_total_cost: openaiCost,
      p_lead_id: lead_id,
      p_call_id: callId,
    });

    // Calculate new score
    const totalAdjustment = Math.max(-30, Math.min(30, analysis.total_recommended_adjustment || 0));
    let runningScore = currentScore;
    const adjustments = analysis.score_adjustments || [];

    // Insert score history for each adjustment
    for (const adj of adjustments) {
      const newScore = Math.max(0, Math.min(100, runningScore + adj.points));
      
      await supabase.from("lead_score_history").insert({
        organization_id,
        lead_id,
        previous_score: runningScore,
        new_score: newScore,
        change_amount: adj.points,
        reason_code: adj.reason_code,
        reason_text: adj.reason_text,
        triggered_by: "call_analysis",
        related_call_id: callId,
        changed_by_agent: "solomon_scoring",
      });

      runningScore = newScore;
    }

    // If no adjustments but we have a total, apply it as a single adjustment
    if (adjustments.length === 0 && totalAdjustment !== 0) {
      const newScore = Math.max(0, Math.min(100, currentScore + totalAdjustment));
      
      await supabase.from("lead_score_history").insert({
        organization_id,
        lead_id,
        previous_score: currentScore,
        new_score: newScore,
        change_amount: totalAdjustment,
        reason_code: "ai_analysis",
        reason_text: `AI analysis: ${analysis.sentiment} sentiment, interest level ${analysis.interest_level}/5`,
        triggered_by: "call_analysis",
        related_call_id: callId,
        changed_by_agent: "solomon_scoring",
      });

      runningScore = newScore;
    }

    const finalScore = runningScore;
    const isPriority = finalScore >= priorityThreshold && !lead.is_priority;

    // Update lead with new score
    const leadUpdate: Record<string, any> = {
      lead_score: finalScore,
    };

    if (isPriority) {
      leadUpdate.is_priority = true;
      leadUpdate.priority_reason = `Score reached priority threshold (${finalScore})`;
    }

    await supabase.from("leads").update(leadUpdate).eq("id", lead_id);

    // Update call record with analysis data
    await supabase.from("calls").update({
      sentiment: analysis.sentiment,
      key_questions: analysis.key_questions,
      unanswered_questions: analysis.unanswered_questions,
      agent_quality_score: Math.round((analysis.interest_level + analysis.urgency_level) / 2 * 20), // Convert to 0-100
      agent_quality_details: {
        urgency_level: analysis.urgency_level,
        interest_level: analysis.interest_level,
        red_flags: analysis.red_flags,
        wants_showing: analysis.wants_showing,
      },
      score_change: finalScore - currentScore,
    }).eq("id", callId);

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "scoring",
      p_action: "transcript_scored",
      p_status: "success",
      p_message: `Score updated: ${currentScore} → ${finalScore} (${adjustments.length} adjustments)`,
      p_details: {
        previous_score: currentScore,
        new_score: finalScore,
        adjustments_count: adjustments.length || 1,
        sentiment: analysis.sentiment,
        interest_level: analysis.interest_level,
        urgency_level: analysis.urgency_level,
        priority_flagged: isPriority,
        openai_cost: openaiCost,
      },
      p_lead_id: lead_id,
      p_call_id: callId,
      p_task_id: task_id,
      p_execution_ms: Date.now() - startTime,
      p_cost: openaiCost,
    });

    return new Response(
      JSON.stringify({
        success: true,
        new_score: finalScore,
        previous_score: currentScore,
        adjustments_count: adjustments.length || 1,
        priority_flagged: isPriority,
        sentiment: analysis.sentiment,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Scoring agent error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure
    try {
      const { lead_id, organization_id, context } = await req.clone().json().catch(() => ({}));
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "scoring",
        p_action: "scoring_failed",
        p_status: "failure",
        p_message: `Scoring error: ${errorMessage}`,
        p_details: { error: String(error) },
        p_lead_id: lead_id,
        p_call_id: context?.call_id,
        p_execution_ms: Date.now() - startTime,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
