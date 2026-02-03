import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MatchRequest {
  organization_id: string;
  lead_id: string;
  // Optional overrides (if not provided, read from lead record)
  budget_min?: number;
  budget_max?: number;
  bedrooms?: number;
  zip_codes?: string[];
  has_voucher?: boolean;
  voucher_amount?: number;
  pet_needed?: boolean;
}

interface ScoredProperty {
  property_id: string;
  address: string;
  rent_price: number;
  bedrooms: number;
  zip_code: string;
  match_score: number; // 0-100
  match_reasons: string[]; // Human-readable reasons
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { organization_id, lead_id, ...overrides }: MatchRequest = await req.json();

    if (!organization_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: 'organization_id and lead_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Merge overrides with lead data
    const criteria = {
      budget_min: overrides.budget_min ?? lead.budget_min ?? 0,
      budget_max: overrides.budget_max ?? lead.budget_max ?? 99999,
      zip_codes: overrides.zip_codes ?? lead.interested_zip_codes ?? [],
      has_voucher: overrides.has_voucher ?? lead.has_voucher ?? false,
      voucher_amount: overrides.voucher_amount ?? lead.voucher_amount ?? 0,
    };

    // Fetch available properties
    const { data: properties, error: propError } = await supabase
      .from('properties')
      .select('*')
      .eq('organization_id', organization_id)
      .in('status', ['available', 'coming_soon'])
      .order('rent_price', { ascending: true });

    if (propError) {
      console.error('Error fetching properties:', propError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch properties' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ matches: [], lead_criteria: criteria }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Score each property
    const scored: ScoredProperty[] = properties.map(prop => {
      let score = 0;
      const reasons: string[] = [];

      // Budget alignment (0-30 points)
      if (prop.rent_price >= criteria.budget_min && prop.rent_price <= criteria.budget_max) {
        score += 30;
        reasons.push('Within budget');
      } else if (prop.rent_price <= criteria.budget_max * 1.1) {
        score += 15;
        reasons.push('Near budget');
      }

      // Voucher alignment (0-25 points)
      if (criteria.has_voucher && prop.section_8_accepted) {
        score += 15;
        reasons.push('Section 8');
        if (criteria.voucher_amount >= prop.rent_price) {
          score += 10;
          reasons.push('Full coverage');
        } else if (criteria.voucher_amount >= prop.rent_price * 0.9) {
          score += 5;
          reasons.push('90% coverage');
        }
      }

      // Location match (0-20 points)
      if (criteria.zip_codes && criteria.zip_codes.length > 0 && criteria.zip_codes.includes(prop.zip_code)) {
        score += 20;
        reasons.push('Location');
      }

      // HUD ready bonus (0-10 points)
      if (criteria.has_voucher && prop.hud_inspection_ready) {
        score += 10;
        reasons.push('HUD Ready');
      }

      // Availability bonus (0-10 points)
      if (prop.status === 'available') {
        score += 10;
        reasons.push('Available now');
      } else if (prop.status === 'coming_soon') {
        score += 5;
        reasons.push('Coming soon');
      }

      // Media bonus (0-5 points)
      const photos = prop.photos as any[];
      if (photos && photos.length > 0) {
        score += 3;
        reasons.push('Has photos');
      }
      if (prop.video_tour_url) {
        score += 2;
        reasons.push('Video tour');
      }

      return {
        property_id: prop.id,
        address: `${prop.address}${prop.unit_number ? ' ' + prop.unit_number : ''}, ${prop.city}`,
        rent_price: prop.rent_price,
        bedrooms: prop.bedrooms,
        zip_code: prop.zip_code,
        match_score: Math.min(score, 100),
        match_reasons: reasons,
      };
    });

    // Sort by score descending, return top 5
    const matches = scored
      .filter(s => s.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 5);

    // TODO: OpenAI Enhancement
    // After basic scoring, send top 10 candidates + lead transcript to OpenAI
    // Ask it to re-rank based on conversation context:
    // - Specific features mentioned (parking, laundry, yard)
    // - Commute needs mentioned
    // - Family size implied
    // - Urgency signals
    // This turns the 30-point scoring into a 100-point contextual match

    console.log(`Matched ${matches.length} properties for lead ${lead_id}`);

    return new Response(
      JSON.stringify({ matches, lead_criteria: criteria }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
