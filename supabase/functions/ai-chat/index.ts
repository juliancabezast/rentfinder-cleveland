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
    // ── Authenticate user ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user record with organization_id
    const { data: userRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!userRecord?.organization_id) {
      return new Response(
        JSON.stringify({ error: "User organization not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = userRecord.organization_id;

    // ── Parse request ───────────────────────────────────────────────
    const { question, history } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get OpenAI key ──────────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", orgId)
      .single();

    const openaiKey = creds?.openai_api_key;
    if (!openaiKey) {
      return new Response(
        JSON.stringify({
          answer: "The OpenAI API key is not configured for your organization. Please go to **Settings \u2192 Integration Keys** and add your OpenAI API key.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Gather org data for context ─────────────────────────────────
    const [
      leadsResult,
      propertiesResult,
      callsResult,
      showingsResult,
    ] = await Promise.all([
      supabase
        .from("leads")
        .select("id, full_name, phone, email, status, lead_score, source, has_voucher, preferred_language, budget_min, budget_max, bedrooms_needed, interested_zip_codes, created_at, last_contact_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("properties")
        .select("id, address, city, state, zip_code, rent_amount, bedrooms, bathrooms, status, property_type, is_section8_eligible")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("calls")
        .select("id, lead_id, direction, status, duration_seconds, ai_summary, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("showings")
        .select("id, lead_id, property_id, status, scheduled_at, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const leads = leadsResult.data || [];
    const properties = propertiesResult.data || [];
    const calls = callsResult.data || [];
    const showings = showingsResult.data || [];

    // ── Build data summary for context ──────────────────────────────
    const dataSummary = {
      total_leads: leads.length,
      leads_by_status: groupBy(leads, "status"),
      leads_by_source: groupBy(leads, "source"),
      leads_by_language: groupBy(leads, "preferred_language"),
      leads_with_voucher: leads.filter((l) => l.has_voucher).length,
      avg_lead_score: leads.length > 0
        ? Math.round(leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / leads.length)
        : 0,
      total_properties: properties.length,
      properties_by_zip: groupBy(properties, "zip_code"),
      properties_by_status: groupBy(properties, "status"),
      total_calls: calls.length,
      calls_by_direction: groupBy(calls, "direction"),
      calls_by_status: groupBy(calls, "status"),
      total_showings: showings.length,
      showings_by_status: groupBy(showings, "status"),
    };

    // ── Build system prompt ─────────────────────────────────────────
    const systemPrompt = `You are PAIp, an AI data analyst assistant for a property management company. You help analyze leads, properties, calls, and showings data.

CURRENT DATA SUMMARY:
${JSON.stringify(dataSummary, null, 2)}

PROPERTIES (${properties.length}):
${JSON.stringify(properties.map((p) => ({
  address: p.address,
  city: p.city,
  zip: p.zip_code,
  rent: p.rent_amount,
  beds: p.bedrooms,
  baths: p.bathrooms,
  status: p.status,
  type: p.property_type,
  section8: p.is_section8_eligible,
})), null, 2)}

LEADS (${leads.length}):
${JSON.stringify(leads.map((l) => ({
  name: l.full_name,
  status: l.status,
  score: l.lead_score,
  source: l.source,
  language: l.preferred_language,
  voucher: l.has_voucher,
  budget: l.budget_min || l.budget_max ? "$" + (l.budget_min || "?") + "-$" + (l.budget_max || "?") : null,
  beds: l.bedrooms_needed,
  zips: l.interested_zip_codes,
  created: l.created_at?.substring(0, 10),
  last_contact: l.last_contact_at?.substring(0, 10),
})), null, 2)}

RECENT CALLS (${calls.length}):
${JSON.stringify(calls.map((c) => ({
  direction: c.direction,
  status: c.status,
  duration: c.duration_seconds,
  summary: c.ai_summary?.substring(0, 150),
  date: c.created_at?.substring(0, 10),
})), null, 2)}

SHOWINGS (${showings.length}):
${JSON.stringify(showings.map((s) => ({
  status: s.status,
  scheduled: s.scheduled_at?.substring(0, 10),
})), null, 2)}

INSTRUCTIONS:
- Answer the user's question based on the data above.
- Be specific with numbers, names, and details.
- If the data is insufficient to answer, say so clearly.
- Respond in the same language as the user's question.
- Format your response with markdown for readability.
- Keep responses concise but complete.`;

    // ── Build messages array ────────────────────────────────────────
    const chatMessages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history (last 10 messages max)
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          chatMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    chatMessages.push({ role: "user", content: question });

    // ── Call OpenAI ─────────────────────────────────────────────────
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chatMessages,
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!aiResp.ok) {
      const errBody = await aiResp.text();
      console.error("OpenAI API error:", aiResp.status, errBody);
      throw new Error(`OpenAI API error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const answer =
      aiData.choices?.[0]?.message?.content || "I was unable to generate a response. Please try again.";

    // ── Record cost ─────────────────────────────────────────────────
    try {
      const promptTokens = aiData.usage?.prompt_tokens || 0;
      const completionTokens = aiData.usage?.completion_tokens || 0;
      const totalCost =
        (promptTokens * 0.00000015) + (completionTokens * 0.0000006);

      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: orgId,
        p_service: "openai",
        p_usage_quantity: 1,
        p_usage_unit: "ai_chat_query",
        p_unit_cost: totalCost,
        p_total_cost: totalCost,
        p_lead_id: null,
      });
    } catch {
      // Non-blocking
    }

    // ── Log ─────────────────────────────────────────────────────────
    try {
      await supabase.from("system_logs").insert({
        organization_id: orgId,
        level: "info",
        category: "openai",
        event_type: "ai_chat_query",
        message: `AI Chat query: "${question.substring(0, 100)}"`,
        details: {
          question_length: question.length,
          answer_length: answer.length,
          tokens: aiData.usage,
        },
      });
    } catch {
      // Non-blocking
    }

    return new Response(
      JSON.stringify({ answer }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-chat error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Failed to process chat query",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────
function groupBy(
  items: Record<string, unknown>[],
  key: string
): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const item of items) {
    const val = String(item[key] || "unknown");
    groups[val] = (groups[val] || 0) + 1;
  }
  return groups;
}
