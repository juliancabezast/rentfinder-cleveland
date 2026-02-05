import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PredictionFactor {
  factor: string;
  impact: string;
  direction: "positive" | "negative";
}

interface PredictionResult {
  conversion_probability: number;
  predicted_days_to_convert: number;
  predicted_outcome: "likely_convert" | "needs_nurturing" | "likely_lost" | "insufficient_data";
  factors: PredictionFactor[];
}

// Simple heuristic prediction (works without OpenAI)
function calculateSimplePrediction(
  lead: any,
  calls: any[] | null,
  showings: any[] | null,
  converted: any[] | null,
  lost: any[] | null
): PredictionResult {
  let probability = 0.30; // Base rate
  const factors: PredictionFactor[] = [];
  
  // Voucher bonus
  if (lead.has_voucher && lead.voucher_status === "active") {
    probability += 0.15;
    factors.push({ factor: "Has active housing voucher", impact: "+15%", direction: "positive" });
  }
  if (lead.voucher_status === "expiring_soon") {
    probability += 0.10;
    factors.push({ factor: "Voucher expiring soon — high urgency", impact: "+10%", direction: "positive" });
  }
  
  // Score bonus
  if (lead.lead_score !== null) {
    if (lead.lead_score >= 80) {
      probability += 0.20;
      factors.push({ factor: `High engagement score (${lead.lead_score})`, impact: "+20%", direction: "positive" });
    } else if (lead.lead_score >= 60) {
      probability += 0.10;
      factors.push({ factor: `Moderate engagement score (${lead.lead_score})`, impact: "+10%", direction: "positive" });
    } else if (lead.lead_score < 40) {
      probability -= 0.05;
      factors.push({ factor: `Low engagement score (${lead.lead_score})`, impact: "-5%", direction: "negative" });
    }
  }
  
  // Showing scheduled
  const hasShowing = showings?.some(s => ["scheduled", "confirmed"].includes(s.status));
  const completedShowing = showings?.some(s => s.status === "completed");
  if (completedShowing) {
    probability += 0.25;
    factors.push({ factor: "Completed a property showing", impact: "+25%", direction: "positive" });
  } else if (hasShowing) {
    probability += 0.15;
    factors.push({ factor: "Has showing scheduled", impact: "+15%", direction: "positive" });
  } else {
    // Only penalize if lead is not brand new (created > 3 days ago)
    const createdAt = new Date(lead.created_at);
    const daysSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated > 3) {
      probability -= 0.10;
      factors.push({ factor: "No showing scheduled after 3+ days", impact: "-10%", direction: "negative" });
    }
  }
  
  // No-show penalty
  const hadNoShow = showings?.some(s => s.status === "no_show");
  if (hadNoShow) {
    probability -= 0.20;
    factors.push({ factor: "Previous no-show on record", impact: "-20%", direction: "negative" });
  }
  
  // Call engagement
  const callCount = calls?.length || 0;
  const positiveCallCount = calls?.filter(c => c.sentiment === "positive").length || 0;
  const negativeCallCount = calls?.filter(c => c.sentiment === "negative").length || 0;
  
  if (callCount >= 3) {
    probability += 0.10;
    factors.push({ factor: `Multiple interactions (${callCount} calls)`, impact: "+10%", direction: "positive" });
  } else if (callCount === 0) {
    probability -= 0.05;
    factors.push({ factor: "No call interactions yet", impact: "-5%", direction: "negative" });
  }
  
  if (positiveCallCount >= 2) {
    probability += 0.08;
    factors.push({ factor: "Multiple positive call sentiments", impact: "+8%", direction: "positive" });
  }
  
  if (negativeCallCount >= 2) {
    probability -= 0.15;
    factors.push({ factor: "Multiple negative call sentiments", impact: "-15%", direction: "negative" });
  }
  
  // Priority lead
  if (lead.is_priority) {
    probability += 0.05;
    factors.push({ factor: "Marked as priority lead", impact: "+5%", direction: "positive" });
  }
  
  // Budget alignment (if budget info exists)
  if (lead.budget_min || lead.budget_max) {
    probability += 0.05;
    factors.push({ factor: "Has budget information on file", impact: "+5%", direction: "positive" });
  }
  
  // Move-in date urgency
  if (lead.move_in_date) {
    const moveInDate = new Date(lead.move_in_date);
    const daysUntilMoveIn = (moveInDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilMoveIn > 0 && daysUntilMoveIn <= 30) {
      probability += 0.12;
      factors.push({ factor: `Move-in date within 30 days`, impact: "+12%", direction: "positive" });
    } else if (daysUntilMoveIn > 30 && daysUntilMoveIn <= 60) {
      probability += 0.06;
      factors.push({ factor: `Move-in date within 60 days`, impact: "+6%", direction: "positive" });
    }
  }
  
  // Historical pattern matching
  const similarConverted = converted?.filter(c => 
    c.has_voucher === lead.has_voucher && 
    c.source === lead.source
  ).length || 0;
  const similarLost = lost?.filter(l => 
    l.has_voucher === lead.has_voucher && 
    l.source === lead.source
  ).length || 0;
  
  if (similarConverted + similarLost > 5) {
    const histRate = similarConverted / (similarConverted + similarLost);
    if (histRate > 0.6) {
      probability += 0.12;
      factors.push({ factor: `Similar leads convert at ${Math.round(histRate * 100)}%`, impact: "+12%", direction: "positive" });
    } else if (histRate > 0.4) {
      probability += 0.05;
      factors.push({ factor: `Similar leads convert at ${Math.round(histRate * 100)}%`, impact: "+5%", direction: "positive" });
    } else if (histRate < 0.25) {
      probability -= 0.08;
      factors.push({ factor: `Similar leads only convert at ${Math.round(histRate * 100)}%`, impact: "-8%", direction: "negative" });
    }
  }
  
  // Clamp probability
  probability = Math.max(0.05, Math.min(0.98, probability));
  
  // Determine outcome
  let predicted_outcome: PredictionResult["predicted_outcome"] = "insufficient_data";
  if (factors.length >= 3) {
    if (probability >= 0.6) predicted_outcome = "likely_convert";
    else if (probability >= 0.3) predicted_outcome = "needs_nurturing";
    else predicted_outcome = "likely_lost";
  }
  
  // Calculate days to convert
  const predicted_days_to_convert = probability >= 0.5 ? Math.round((1 - probability) * 30) : -1;
  
  return {
    conversion_probability: Math.round(probability * 10000) / 10000,
    predicted_days_to_convert,
    predicted_outcome,
    factors,
  };
}

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

    const { organization_id, lead_id } = await req.json();

    if (!organization_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: "organization_id and lead_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch the target lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch historical converted leads (for pattern matching)
    const { data: convertedLeads } = await supabase
      .from("leads")
      .select("source, has_voucher, voucher_amount, budget_min, budget_max, lead_score, created_at, status")
      .eq("organization_id", organization_id)
      .eq("status", "converted")
      .limit(100);

    // 3. Fetch historical lost leads
    const { data: lostLeads } = await supabase
      .from("leads")
      .select("source, has_voucher, voucher_amount, budget_min, budget_max, lead_score, created_at, status, lost_reason")
      .eq("organization_id", organization_id)
      .eq("status", "lost")
      .limit(100);

    // 4. Fetch this lead's activity
    const { data: calls } = await supabase
      .from("calls")
      .select("duration_seconds, sentiment, started_at, agent_type")
      .eq("lead_id", lead_id);

    const { data: showings } = await supabase
      .from("showings")
      .select("status, scheduled_at")
      .eq("lead_id", lead_id);

    // 5. Calculate prediction using heuristics
    // TODO: Connect to OpenAI for more sophisticated predictions
    const prediction = calculateSimplePrediction(
      lead,
      calls,
      showings,
      convertedLeads,
      lostLeads
    );

    // 6. Store prediction in database
    const { data: savedPrediction, error: upsertError } = await supabase
      .from("lead_predictions")
      .upsert({
        organization_id,
        lead_id,
        ...prediction,
        model_version: "v1-heuristic",
        based_on_leads_count: (convertedLeads?.length || 0) + (lostLeads?.length || 0),
        predicted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { 
        onConflict: "lead_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Error saving prediction:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to save prediction", details: upsertError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, prediction: savedPrediction }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in predict-conversion:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
