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
    const { organization_id, images } = await req.json();

    if (!organization_id || !images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id or images array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get OpenAI key from organization_credentials ──────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", organization_id)
      .single();

    const openaiKey = creds?.openai_api_key;
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Add it in Settings → Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build OpenAI Vision request ───────────────────────────────
    const imageContent = images.slice(0, 4).map((img: string) => ({
      type: "image_url" as const,
      image_url: {
        url: img.startsWith("data:") ? img : `data:image/png;base64,${img}`,
        detail: "high" as const,
      },
    }));

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content: `You are a property data extractor. Analyze the screenshot(s) of a rental property listing and extract all available property details. Return ONLY a JSON object with the fields you can identify. Only include fields where you are confident about the value. Do not guess.

Return format (include only fields found):
{
  "bedrooms": number,
  "bathrooms": number,
  "sqft": number,
  "rent_price": number (monthly rent in dollars, no cents),
  "property_type": "house" | "apartment" | "duplex" | "condo" | "townhouse",
  "pet_policy": "string describing pet policy",
  "description": "brief property description",
  "deposit": number,
  "application_fee": number
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all property details from these rental listing screenshots. Return only a JSON object.",
              },
              ...imageContent,
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("OpenAI Vision error:", aiResp.status, errText);
      throw new Error(`OpenAI API error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // ── Parse JSON from AI response ───────────────────────────────
    let extracted: Record<string, unknown> = {};
    try {
      // Handle markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      extracted = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "AI could not extract structured data from the image" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Record cost (Zacchaeus) ───────────────────────────────────
    try {
      const inputTokens = aiData.usage?.prompt_tokens || 0;
      const outputTokens = aiData.usage?.completion_tokens || 0;
      const cost = (inputTokens * 0.0025 + outputTokens * 0.01) / 1000;

      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: organization_id,
        p_service: "openai",
        p_usage_quantity: 1,
        p_usage_unit: "vision_extraction",
        p_unit_cost: cost,
        p_total_cost: cost,
        p_lead_id: null,
      });
    } catch {
      // Non-blocking
    }

    return new Response(
      JSON.stringify({ success: true, extracted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("extract-property-from-image error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Failed to extract property data" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
