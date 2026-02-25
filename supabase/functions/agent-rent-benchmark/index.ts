import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PropertyRow {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string;
  bedrooms: number | null;
  property_type: string | null;
  rent_price: number | null;
  organization_id: string;
}

interface BenchmarkResult {
  market_avg_rent: number;
  market_low: number;
  market_high: number;
  sample_size: number;
  summary: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    let organizationId: string | null = null;

    // Accept org_id from body (for cron/manual trigger)
    const body = await req.json().catch(() => ({}));
    organizationId = body.organization_id || null;

    // If no org_id in body, authenticate via token
    if (!organizationId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing organization_id or authorization" }),
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

      const { data: userRecord } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      organizationId = userRecord?.organization_id || null;
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Could not determine organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OpenAI API key from organization credentials
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", organizationId)
      .single();

    const openaiKey = creds?.openai_api_key || Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all properties with status = available or in_leasing_process
    const { data: properties, error: propErr } = await supabase
      .from("properties")
      .select("id, address, city, state, zip_code, bedrooms, property_type, rent_price, organization_id")
      .eq("organization_id", organizationId)
      .in("status", ["available", "in_leasing_process", "coming_soon"]);

    if (propErr) throw propErr;
    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ properties_analyzed: 0, message: "No active properties found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let analyzed = 0;

    for (const prop of properties as PropertyRow[]) {
      try {
        const result = await analyzeProperty(prop, openaiKey);
        if (result) {
          // Upsert into rent_benchmarks
          await supabase
            .from("rent_benchmarks")
            .upsert({
              organization_id: organizationId,
              property_id: prop.id,
              our_rent: prop.rent_price,
              market_avg_rent: result.market_avg_rent,
              market_low: result.market_low,
              market_high: result.market_high,
              sample_size: result.sample_size,
              ai_summary: result.summary,
              ai_model: "gpt-4o-mini",
              analyzed_at: new Date().toISOString(),
            }, { onConflict: "property_id" });

          analyzed++;
        }
      } catch (err) {
        console.error(`Error analyzing property ${prop.address}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ properties_analyzed: analyzed, total_properties: properties.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Rent benchmark error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function analyzeProperty(
  prop: PropertyRow,
  openaiKey: string
): Promise<BenchmarkResult | null> {
  const bedrooms = prop.bedrooms || "unknown";
  const type = prop.property_type || "apartment";
  const city = prop.city || "Unknown City";
  const state = prop.state || "OH";
  const address = prop.address;
  const zip = prop.zip_code;
  const currentRent = prop.rent_price ? `$${prop.rent_price}/month` : "unknown";

  const prompt = `You are a real estate market analyst. Analyze the rental market for a ${bedrooms}-bedroom ${type} located at or near "${address}", ${city}, ${state} ${zip}.

Current listed rent: ${currentRent}

Based on your knowledge of the ${city}, ${state} rental market as of early 2026:

1. What is the average monthly rent for comparable ${bedrooms}-bedroom ${type} units within approximately 1 mile of this address?
2. What is the typical low and high range?
3. How many comparable properties would you estimate exist in this radius?
4. A brief 1-sentence market summary for this location.

IMPORTANT: Respond ONLY with a JSON object in this exact format, no other text:
{
  "market_avg_rent": 1200,
  "market_low": 900,
  "market_high": 1500,
  "sample_size": 15,
  "summary": "This area has moderate demand with rents trending upward due to new development."
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a real estate market analyst. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  // Parse JSON from response (handle possible markdown code blocks)
  const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    market_avg_rent: Number(parsed.market_avg_rent) || 0,
    market_low: Number(parsed.market_low) || 0,
    market_high: Number(parsed.market_high) || 0,
    sample_size: Number(parsed.sample_size) || 0,
    summary: String(parsed.summary || ""),
  };
}
