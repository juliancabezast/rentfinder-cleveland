import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { lead_id, user_id } = await req.json();

    if (!lead_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "lead_id and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data with related information
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(`
        *,
        properties:interested_property_id (address, city, bedrooms, bathrooms, rent_price)
      `)
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError) {
      console.error("Error fetching lead:", leadError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch lead: " + leadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch recent calls
    const { data: calls } = await supabase
      .from("calls")
      .select("direction, status, duration_seconds, sentiment, summary, started_at")
      .eq("lead_id", lead_id)
      .order("started_at", { ascending: false })
      .limit(5);

    // Fetch showings
    const { data: showings } = await supabase
      .from("showings")
      .select("status, scheduled_at, agent_report, prospect_interest_level")
      .eq("lead_id", lead_id)
      .order("scheduled_at", { ascending: false })
      .limit(5);

    // Fetch score history
    const { data: scoreHistory } = await supabase
      .from("lead_score_history")
      .select("previous_score, new_score, reason_text, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Fetch communications
    const { data: communications } = await supabase
      .from("communications")
      .select("channel, direction, status, body, sent_at")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false })
      .limit(10);

    // Build context for AI
    const leadName = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
    
    const context = `
Lead Information:
- Name: ${leadName}
- Phone: ${lead.phone || "N/A"}
- Email: ${lead.email || "N/A"}
- Status: ${lead.status}
- Score: ${lead.lead_score || 50}/100
- Source: ${lead.source || "Unknown"}
- Language: ${lead.preferred_language === "es" ? "Spanish" : "English"}
- Has Voucher: ${lead.has_voucher ? "Yes" : "No"}${lead.voucher_amount ? ` ($${lead.voucher_amount})` : ""}
- Budget: ${lead.budget_min && lead.budget_max ? `$${lead.budget_min} - $${lead.budget_max}` : "Not specified"}
- Move-in Date: ${lead.move_in_date || "Not specified"}
- Created: ${lead.created_at}
- Last Contact: ${lead.last_contact_at || "Never"}
- Is Priority: ${lead.is_priority ? "Yes" : "No"}
- Is Human Controlled: ${lead.is_human_controlled ? "Yes" : "No"}

${lead.properties ? `Interested Property:
- Address: ${lead.properties.address}, ${lead.properties.city}
- Bedrooms: ${lead.properties.bedrooms}, Bathrooms: ${lead.properties.bathrooms}
- Rent: $${lead.properties.rent_price}/month` : "No specific property interest recorded."}

Recent Calls (${calls?.length || 0}):
${calls?.map(c => `- ${c.direction} call on ${c.started_at}: ${c.status}, ${c.duration_seconds || 0}s, Sentiment: ${c.sentiment || "N/A"}${c.summary ? `, Summary: ${c.summary.substring(0, 100)}...` : ""}`).join("\n") || "No calls recorded."}

Showings (${showings?.length || 0}):
${showings?.map(s => `- ${s.scheduled_at}: ${s.status}${s.prospect_interest_level ? `, Interest: ${s.prospect_interest_level}` : ""}${s.agent_report ? `, Report: ${s.agent_report.substring(0, 100)}...` : ""}`).join("\n") || "No showings recorded."}

Score Changes (${scoreHistory?.length || 0}):
${scoreHistory?.map(h => `- ${h.created_at}: ${h.previous_score} → ${h.new_score} (${h.reason_text})`).join("\n") || "No score history."}

Recent Communications (${communications?.length || 0}):
${communications?.map(c => `- ${c.sent_at}: ${c.channel} ${c.direction} (${c.status}): ${c.body?.substring(0, 50) || "N/A"}...`).join("\n") || "No communications recorded."}
`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert property management assistant. Generate a concise, actionable brief about a rental lead. 
Include:
1. Lead summary (2-3 sentences)
2. Key engagement highlights
3. Current status assessment
4. Recommended next action
Keep it under 300 words. Be specific and actionable. Use professional but friendly tone.`,
          },
          {
            role: "user",
            content: `Generate a brief for this lead:\n\n${context}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted, please add funds" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("Failed to generate brief");
    }

    const aiData = await aiResponse.json();
    const brief = aiData.choices?.[0]?.message?.content;

    if (!brief) {
      throw new Error("No brief content returned from AI");
    }

    // Update lead with the generated brief
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        ai_brief: brief,
        ai_brief_generated_at: new Date().toISOString(),
        ai_brief_generated_by: user_id,
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead:", updateError);
      throw new Error("Failed to save brief");
    }

    return new Response(
      JSON.stringify({ brief, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-lead-brief:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
