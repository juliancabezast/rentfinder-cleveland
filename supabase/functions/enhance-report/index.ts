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
    const { report_text, organization_id, property_address } = await req.json();

    if (!report_text || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing report_text or organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OpenAI key
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", organization_id)
      .single();

    const openaiKey = creds?.openai_api_key;
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional leasing agent report writer. Enhance the following showing report to be more professional, complete, and detailed. Rules:
- Do NOT invent facts or add information not implied by the original.
- Keep the same meaning but improve clarity, grammar, and completeness.
- Expand brief notes into complete sentences while preserving all original details.
- Keep the tone professional but warm.
- Output 2-5 sentences.${property_address ? `\n- The property being shown is at: ${property_address}` : ""}`,
          },
          {
            role: "user",
            content: report_text,
          },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`OpenAI API error: ${aiResp.status} — ${errText}`);
    }

    const aiData = await aiResp.json();
    const enhanced = aiData.choices?.[0]?.message?.content || report_text;

    // Record cost
    const promptTokens = aiData.usage?.prompt_tokens || 0;
    const completionTokens = aiData.usage?.completion_tokens || 0;
    const cost = (promptTokens * 0.00000015) + (completionTokens * 0.0000006);

    await supabase.from("cost_records").insert({
      organization_id,
      service: "openai",
      agent_type: "enhance_report",
      action_type: "enhance_report",
      cost_amount: cost,
      usage_unit: "tokens",
      usage_quantity: promptTokens + completionTokens,
      details: { model: "gpt-4o-mini", prompt_tokens: promptTokens, completion_tokens: completionTokens },
    });

    return new Response(
      JSON.stringify({ enhanced_text: enhanced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("enhance-report error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
