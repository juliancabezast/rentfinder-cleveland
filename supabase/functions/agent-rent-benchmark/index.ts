import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hemlane's public marketplace GraphQL — real, current median rents by city
// (live listing data), used to anchor the AI estimate instead of letting the
// model recall stale training-data numbers. No auth token required.
const HEMLANE_GQL = "https://api.hemlane.com/graphql";
const HEMLANE_HEADERS = {
  "Content-Type": "application/json",
  "Origin": "https://www.hemlane.com",
  "User-Agent": "Mozilla/5.0",
};
const cityKey = (name: string) => String(name || "").split(",")[0].toLowerCase().trim();

interface MarketMedian { median: number; sample: number }

// Build a { normalizedCity -> {median$, sampleCount} } map for Greater Cleveland.
// nearByCities excludes the origin city, so we union cleveland_OH (the suburb
// ring) with a close neighbor (euclid_OH) whose ring includes Cleveland proper.
async function fetchMarketMedians(): Promise<Map<string, MarketMedian>> {
  const map = new Map<string, MarketMedian>();
  const call = async (slug: string, distance: number) => {
    const q = `query{ nearByCities(citySlug:"${slug}", distance:${distance}, pagination:{page:1,limit:80}){ data{ name state rentalsCount medianRentCents } } }`;
    const r = await fetch(HEMLANE_GQL, { method: "POST", headers: HEMLANE_HEADERS, body: JSON.stringify({ query: q }) });
    if (!r.ok) return [] as any[];
    const j = await r.json();
    return (j?.data?.nearByCities?.data as any[]) || [];
  };
  const rows = [...(await call("cleveland_OH", 40)), ...(await call("euclid_OH", 15))];
  for (const row of rows) {
    if (row?.state !== "OH") continue;
    const median = (row.medianRentCents || 0) / 100;
    const sample = row.rentalsCount || 0;
    if (median < 300 || sample < 3) continue; // drop noise (tiny samples / bogus medians)
    const key = cityKey(row.name);
    const prev = map.get(key);
    if (!prev || sample > prev.sample) map.set(key, { median, sample }); // prefer the larger sample on dup
  }
  return map;
}

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
        .eq("auth_user_id", user.id)
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

    // Real market medians once per run (best-effort; AI falls back if unavailable).
    const marketMedians = await fetchMarketMedians().catch((e) => {
      console.error("Hemlane market medians unavailable:", e);
      return new Map<string, MarketMedian>();
    });

    let analyzed = 0;
    let anchored = 0;
    const errors: string[] = [];

    for (const prop of properties as PropertyRow[]) {
      try {
        const local = marketMedians.get(cityKey(prop.city || "")) || null;
        if (local) anchored++;
        const result = await analyzeProperty(prop, openaiKey, local);
        if (result) {
          // Upsert into rent_benchmarks
          const { error: upsertErr } = await supabase
            .from("rent_benchmarks")
            .upsert({
              organization_id: organizationId,
              property_id: prop.id,
              our_rent: prop.rent_price,
              market_avg_rent: result.market_avg_rent,
              market_low: result.market_low,
              market_high: result.market_high,
              sample_size: result.sample_size,
              market_median_local: local?.median ?? null,
              market_local_sample: local?.sample ?? null,
              market_source: local ? "hemlane_nearbycities" : null,
              ai_summary: result.summary,
              ai_model: "gpt-4o-mini",
              analyzed_at: new Date().toISOString(),
            }, { onConflict: "property_id" });

          if (upsertErr) {
            console.error(`Upsert error for ${prop.address}:`, upsertErr);
            errors.push(`${prop.address}: ${upsertErr.message}`);
          } else {
            analyzed++;
          }
        }
        // Small delay to avoid OpenAI rate limits
        if (properties.length > 5) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`Error analyzing property ${prop.address}:`, err);
        errors.push(`${prop.address}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        properties_analyzed: analyzed,
        total_properties: properties.length,
        market_anchored: anchored,
        market_cities: marketMedians.size,
        ...(errors.length > 0 ? { warnings: errors.slice(0, 5) } : {}),
      }),
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
  openaiKey: string,
  local: MarketMedian | null,
): Promise<BenchmarkResult | null> {
  const bedrooms = prop.bedrooms || "unknown";
  const type = prop.property_type || "apartment";
  const city = prop.city || "Unknown City";
  const state = prop.state || "OH";
  const address = prop.address;
  const zip = prop.zip_code;
  const currentRent = prop.rent_price ? `$${prop.rent_price}/month` : "unknown";
  const currentDate = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" });

  // Anchor the model on real, current market data when we have it, so it
  // calibrates to the actual local market rather than stale training recall.
  const anchor = local
    ? `\n\nGROUND TRUTH (live listing data, ${currentDate}): the current MEDIAN asking rent across ${local.sample} active rentals in ${city}, ${state} is $${Math.round(local.median)}/month. Treat this as authoritative for the citywide level. A ${bedrooms}-bedroom ${type} may sit above or below it, but your market_avg_rent MUST stay consistent with this figure — do not contradict it with a wildly different number. In the summary, note how this property's rent compares to the $${Math.round(local.median)} local median.`
    : "";

  const prompt = `You are a real estate market analyst. Analyze the rental market for a ${bedrooms}-bedroom ${type} located at or near "${address}", ${city}, ${state} ${zip}.

Current listed rent: ${currentRent}${anchor}

Based on the ground-truth figure above (when provided) plus your knowledge of the ${city}, ${state} rental market as of ${currentDate}:

1. What is the average monthly rent for comparable ${bedrooms}-bedroom ${type} units within approximately 1 mile of this address?
2. What is the typical low and high range?
3. How many comparable properties would you estimate exist in this radius?
4. A brief 1-sentence market summary for this location${local ? `, referencing the $${Math.round(local.median)} local median` : ""}.

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
      response_format: { type: "json_object" },
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
