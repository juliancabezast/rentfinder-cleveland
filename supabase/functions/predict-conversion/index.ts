import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Rule-based conversion prediction ────────────────────────────────
function predictConversion(lead: Record<string, unknown>, stats: {
  callCount: number;
  messageCount: number;
  showingCount: number;
  showingsAttended: number;
  daysSinceCreation: number;
  daysSinceLastContact: number;
}) {
  let probability = 0.15; // Base 15%
  const factors: Array<{ factor: string; impact: string; weight: number }> = [];

  // Lead score impact
  const score = (lead.lead_score as number) || 0;
  if (score >= 80) {
    probability += 0.25;
    factors.push({ factor: "High lead score", impact: "positive", weight: 0.25 });
  } else if (score >= 60) {
    probability += 0.15;
    factors.push({ factor: "Good lead score", impact: "positive", weight: 0.15 });
  } else if (score < 30) {
    probability -= 0.1;
    factors.push({ factor: "Low lead score", impact: "negative", weight: -0.1 });
  }

  // Status progression
  const status = lead.status as string;
  const statusWeights: Record<string, number> = {
    new: 0,
    contacted: 0.05,
    engaged: 0.1,
    nurturing: 0.08,
    qualified: 0.15,
    showing_scheduled: 0.2,
    showed: 0.3,
    in_application: 0.4,
  };
  const statusWeight = statusWeights[status] || 0;
  if (statusWeight > 0.1) {
    probability += statusWeight;
    factors.push({
      factor: `Status: ${status.replace("_", " ")}`,
      impact: "positive",
      weight: statusWeight,
    });
  }

  // Engagement signals
  if (stats.callCount >= 2) {
    probability += 0.1;
    factors.push({ factor: "Multiple calls", impact: "positive", weight: 0.1 });
  }
  if (stats.showingCount > 0) {
    probability += 0.15;
    factors.push({ factor: "Has showing scheduled", impact: "positive", weight: 0.15 });
  }
  if (stats.showingsAttended > 0) {
    probability += 0.2;
    factors.push({ factor: "Attended showing", impact: "positive", weight: 0.2 });
  }

  // Recency decay
  if (stats.daysSinceLastContact > 14) {
    probability -= 0.15;
    factors.push({
      factor: "No contact in 14+ days",
      impact: "negative",
      weight: -0.15,
    });
  } else if (stats.daysSinceLastContact > 7) {
    probability -= 0.08;
    factors.push({
      factor: "No contact in 7+ days",
      impact: "negative",
      weight: -0.08,
    });
  }

  // Voucher is a strong signal for commitment
  if (lead.has_voucher) {
    probability += 0.1;
    factors.push({
      factor: "Has housing voucher",
      impact: "positive",
      weight: 0.1,
    });
  }

  // Budget clarity
  if (lead.budget_max) {
    probability += 0.05;
    factors.push({
      factor: "Budget defined",
      impact: "positive",
      weight: 0.05,
    });
  }

  // Clamp to 0-1
  probability = Math.max(0.01, Math.min(0.99, probability));

  // Determine outcome
  let predicted_outcome: string;
  if (probability >= 0.6) predicted_outcome = "likely_convert";
  else if (probability >= 0.35) predicted_outcome = "possible_convert";
  else predicted_outcome = "unlikely_convert";

  return {
    conversion_probability: Math.round(probability * 100) / 100,
    predicted_outcome,
    factors: factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    model: "rule_based_v1",
    generated_at: new Date().toISOString(),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { organization_id, lead_id } = await req.json();

    if (!organization_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id or lead_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get lead ───────────────────────────────────────────────────
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get engagement stats ───────────────────────────────────────
    const [callsRes, msgsRes, showingsRes] = await Promise.all([
      supabase
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead_id),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead_id),
      supabase
        .from("showings")
        .select("id, status")
        .eq("lead_id", lead_id),
    ]);

    const daysSinceCreation = Math.floor(
      (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLastContact = lead.last_contact_at
      ? Math.floor(
          (Date.now() - new Date(lead.last_contact_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : daysSinceCreation;

    const showingsAttended = (showingsRes.data || []).filter(
      (s) => s.status === "completed" || s.status === "showed"
    ).length;

    const stats = {
      callCount: callsRes.count || 0,
      messageCount: msgsRes.count || 0,
      showingCount: (showingsRes.data || []).length,
      showingsAttended,
      daysSinceCreation,
      daysSinceLastContact,
    };

    // ── Run prediction ─────────────────────────────────────────────
    const prediction = predictConversion(lead, stats);

    // ── Save prediction ────────────────────────────────────────────
    await supabase
      .from("leads")
      .update({
        conversion_probability: prediction.conversion_probability,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    return new Response(
      JSON.stringify({ success: true, prediction }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("predict-conversion error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Failed to generate prediction",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
