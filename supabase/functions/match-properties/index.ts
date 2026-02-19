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

    // ── Get lead preferences ───────────────────────────────────────
    const { data: lead } = await supabase
      .from("leads")
      .select(
        "id, budget_min, budget_max, bedrooms_needed, has_voucher, voucher_amount, preferred_areas, preferred_language"
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

    // ── Query available properties ─────────────────────────────────
    let query = supabase
      .from("properties")
      .select(
        "id, address, unit_number, city, state, zip_code, bedrooms, bathrooms, square_feet, rent_price, deposit_amount, status, section_8_accepted, photos, property_type, description, amenities"
      )
      .eq("organization_id", organization_id)
      .in("status", ["available", "coming_soon"])
      .order("rent_price", { ascending: true });

    const { data: properties } = await query;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Score each property ────────────────────────────────────────
    const scored = properties.map((p) => {
      let score = 50; // Base score
      const reasons: string[] = [];

      // Budget match
      if (lead.budget_max && p.rent_price <= lead.budget_max) {
        score += 20;
        reasons.push("Within budget");
      } else if (lead.budget_max && p.rent_price <= lead.budget_max * 1.1) {
        score += 10;
        reasons.push("Slightly over budget");
      } else if (lead.budget_max && p.rent_price > lead.budget_max * 1.2) {
        score -= 20;
        reasons.push("Over budget");
      }

      if (lead.budget_min && p.rent_price >= lead.budget_min) {
        score += 5;
      }

      // Bedrooms match
      if (lead.bedrooms_needed && p.bedrooms === lead.bedrooms_needed) {
        score += 20;
        reasons.push("Exact bedroom match");
      } else if (
        lead.bedrooms_needed &&
        Math.abs(p.bedrooms - lead.bedrooms_needed) === 1
      ) {
        score += 10;
        reasons.push("Close bedroom match");
      }

      // Section 8 / Voucher match
      if (lead.has_voucher) {
        if (p.section_8_accepted) {
          score += 15;
          reasons.push("Accepts Section 8");
        } else {
          score -= 30;
          reasons.push("Does not accept Section 8");
        }

        // Check if voucher covers rent
        if (lead.voucher_amount && p.rent_price <= lead.voucher_amount) {
          score += 10;
          reasons.push("Voucher covers rent");
        }
      }

      // Availability bonus
      if (p.status === "available") {
        score += 5;
        reasons.push("Available now");
      }

      return {
        ...p,
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
        details: { lead_id, total_properties: properties.length, top_matches: topMatches.length, top_score: topMatches[0]?.match_score || 0 },
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

    // Log error
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
