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

  let organization_id = "", lead_id = "";
  try {
    const parsed = await req.json();
    organization_id = parsed.organization_id;
    lead_id = parsed.lead_id;

    if (!organization_id || !lead_id) {
      return new Response(
        JSON.stringify({ matches: [], error: "Missing organization_id or lead_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get lead with preferences + interested property ──────────
    const { data: lead } = await supabase
      .from("leads")
      .select(
        "id, budget_min, budget_max, has_voucher, voucher_amount, interested_property_id, interested_zip_codes"
      )
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build reference from interested property or lead prefs ───
    let refBedrooms: number | null = null;
    let refBathrooms: number | null = null;
    let refRent: number | null = lead.budget_max;
    let refZip: string | null = null;
    let refCity: string | null = null;
    let refState: string | null = null;
    let excludePropertyId: string | null = null;

    if (lead.interested_property_id) {
      const { data: refProp } = await supabase
        .from("properties")
        .select("id, bedrooms, bathrooms, rent_price, zip_code, city, state")
        .eq("id", lead.interested_property_id)
        .single();

      if (refProp) {
        excludePropertyId = refProp.id;
        if (!refBedrooms) refBedrooms = refProp.bedrooms;
        if (!refBathrooms) refBathrooms = refProp.bathrooms;
        if (!refRent) refRent = refProp.rent_price;
        refZip = refProp.zip_code;
        refCity = refProp.city;
        refState = refProp.state;
      }
    }

    // Use interested_zip_codes as fallback for zip
    if (!refZip && lead.interested_zip_codes && lead.interested_zip_codes.length > 0) {
      refZip = lead.interested_zip_codes[0];
    }

    // ── Query available properties (same city when known) ─────────
    let query = supabase
      .from("properties")
      .select(
        "id, address, unit_number, city, state, zip_code, bedrooms, bathrooms, square_feet, rent_price, deposit_amount, status, section_8_accepted, photos, property_type, description, amenities"
      )
      .eq("organization_id", organization_id)
      .in("status", ["available", "coming_soon"]);

    // Filter to same city — never suggest St. Louis to a Cleveland lead
    if (refCity) {
      query = query.ilike("city", refCity);
    } else if (refState) {
      query = query.eq("state", refState);
    }

    const { data: properties } = await query.order("rent_price", { ascending: true });

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Score each property ──────────────────────────────────────
    const scored = properties
      .filter((p) => p.id !== excludePropertyId)
      .map((p) => {
        let score = 40; // Base score
        const reasons: string[] = [];

        // ── Bedrooms match ───────────────────────────────────
        if (refBedrooms !== null) {
          if (p.bedrooms === refBedrooms) {
            score += 25;
            reasons.push("Exact bedroom match");
          } else if (Math.abs(p.bedrooms - refBedrooms) === 1) {
            score += 10;
            reasons.push("Close bedroom match");
          }
        }

        // ── Bathrooms match ──────────────────────────────────
        if (refBathrooms !== null) {
          if (p.bathrooms === refBathrooms) {
            score += 20;
            reasons.push("Exact bathroom match");
          } else if (Math.abs(p.bathrooms - refBathrooms) === 1) {
            score += 10;
            reasons.push("Close bathroom match");
          }
        }

        // ── Rent / Budget match ──────────────────────────────
        if (refRent) {
          const ratio = p.rent_price / refRent;
          if (ratio >= 0.8 && ratio <= 1.2) {
            score += 15;
            reasons.push("Similar price range");
          } else if (ratio >= 0.5 && ratio <= 1.5) {
            score += 5;
            reasons.push("Within price range");
          }

          // Also check budget_min
          if (lead.budget_min && p.rent_price >= lead.budget_min) {
            score += 3;
          }
        }

        // ── Zip code proximity (same zip ≈ within 1 mile) ───
        if (refZip) {
          if (p.zip_code === refZip) {
            score += 20;
            reasons.push("Same neighborhood");
          } else if (refCity && p.city?.toLowerCase() === refCity.toLowerCase()) {
            score += 5;
            reasons.push("Same city");
          }
        }

        // ── Section 8 / Voucher match ────────────────────────
        if (lead.has_voucher) {
          if (p.section_8_accepted) {
            score += 10;
            reasons.push("Accepts Section 8");
          } else {
            score -= 30;
            reasons.push("Does not accept Section 8");
          }

          if (lead.voucher_amount && p.rent_price <= lead.voucher_amount) {
            score += 10;
            reasons.push("Voucher covers rent");
          }
        }

        // ── Availability bonus ───────────────────────────────
        if (p.status === "available") {
          score += 5;
          reasons.push("Available now");
        }

        return {
          ...p,
          property_id: p.id, // SmartMatches.tsx expects property_id
          match_score: Math.max(0, Math.min(100, score)),
          match_reasons: reasons,
          photos: Array.isArray(p.photos) ? p.photos : [],
        };
      });

    // Sort by score descending, take top 10
    scored.sort((a, b) => b.match_score - a.match_score);
    const topMatches = scored.slice(0, 10);

    // Log match results
    try {
      await supabase.from("system_logs").insert({
        organization_id,
        level: "info",
        category: "general",
        event_type: "properties_matched",
        message: `Matched ${topMatches.length} properties for lead (top score: ${topMatches[0]?.match_score || 0})`,
        details: {
          lead_id,
          total_properties: properties.length,
          top_matches: topMatches.length,
          top_score: topMatches[0]?.match_score || 0,
          ref_bedrooms: refBedrooms,
          ref_bathrooms: refBathrooms,
          ref_zip: refZip,
          ref_city: refCity,
          ref_rent: refRent,
        },
        related_lead_id: lead_id,
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({ matches: topMatches }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("match-properties error:", err);

    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: "general",
        event_type: "property_match_error",
        message: `Failed to match properties: ${(err as Error).message || "Unknown error"}`,
        details: { error: String(err), lead_id },
        related_lead_id: lead_id || null,
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        matches: [],
        error: (err as Error).message || "Failed to match properties",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
