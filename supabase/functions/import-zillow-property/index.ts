import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Extract ZPID from any Zillow URL format ─────────────────────────────
function extractZpid(url: string): string | null {
  // Standard: /12345678_zpid/
  const zpidMatch = url.match(/\/(\d+)_zpid/);
  if (zpidMatch) return zpidMatch[1];

  // Sometimes just a query param: ?zpid=12345678
  const urlObj = new URL(url);
  const zpidParam = urlObj.searchParams.get("zpid");
  if (zpidParam && /^\d+$/.test(zpidParam)) return zpidParam;

  return null;
}

// ── Map Zillow homeType to our property_type ────────────────────────────
function mapPropertyType(homeType: string | undefined): string {
  if (!homeType) return "house";
  const mapping: Record<string, string> = {
    SINGLE_FAMILY: "house",
    MULTI_FAMILY: "duplex",
    APARTMENT: "apartment",
    CONDO: "condo",
    TOWNHOUSE: "townhouse",
    MANUFACTURED: "house",
    LOT: "house",
  };
  return mapping[homeType.toUpperCase()] || "house";
}

// ── Extract best photo URLs from Zillow response ────────────────────────
function extractPhotos(data: Record<string, unknown>): string[] {
  const photos: string[] = [];

  // Try responsivePhotos array (common in newer API responses)
  const responsivePhotos = data.responsivePhotos as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(responsivePhotos)) {
    for (const photo of responsivePhotos) {
      const sources = photo.mixedSources as Record<string, Array<Record<string, unknown>>> | undefined;
      if (sources?.jpeg && sources.jpeg.length > 0) {
        // Get the largest JPEG
        const largest = sources.jpeg[sources.jpeg.length - 1];
        if (largest?.url) photos.push(largest.url as string);
      }
    }
  }

  // Try photos array
  if (photos.length === 0) {
    const photoArr = data.photos as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(photoArr)) {
      for (const p of photoArr) {
        if (typeof p === "string") photos.push(p);
        else if (p?.url) photos.push(p.url as string);
        else if (p?.href) photos.push(p.href as string);
      }
    }
  }

  // Try images array
  if (photos.length === 0) {
    const images = data.images as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(images)) {
      for (const img of images) {
        if (typeof img === "string") photos.push(img);
        else if (img?.url) photos.push(img.url as string);
      }
    }
  }

  // Try originalPhotos
  if (photos.length === 0) {
    const origPhotos = data.originalPhotos as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(origPhotos)) {
      for (const p of origPhotos) {
        if (p?.mixedSources) {
          const sources = p.mixedSources as Record<string, Array<Record<string, unknown>>>;
          if (sources.jpeg && sources.jpeg.length > 0) {
            const largest = sources.jpeg[sources.jpeg.length - 1];
            if (largest?.url) photos.push(largest.url as string);
          }
        }
      }
    }
  }

  return photos.slice(0, 15);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");

    const { zillow_url, organization_id } = await req.json();

    if (!zillow_url || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing zillow_url or organization_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({
          error:
            "RAPIDAPI_KEY not configured. Add it in Supabase Dashboard → Edge Functions → Secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const zpid = extractZpid(zillow_url);
    if (!zpid) {
      return new Response(
        JSON.stringify({
          error:
            "Could not extract Zillow property ID from URL. Use a URL like: zillow.com/homedetails/.../12345678_zpid/",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Call RapidAPI Zillow endpoint ──────────────────────────────────
    const apiResponse = await fetch(
      `https://zillow56.p.rapidapi.com/property?zpid=${zpid}`,
      {
        headers: {
          "X-RapidAPI-Key": rapidApiKey,
          "X-RapidAPI-Host": "zillow56.p.rapidapi.com",
        },
      }
    );

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error("RapidAPI error:", apiResponse.status, errText);
      throw new Error(
        `Zillow API returned ${apiResponse.status}. Check your RAPIDAPI_KEY and subscription.`
      );
    }

    const data = await apiResponse.json();

    // ── Handle nested address object ──────────────────────────────────
    const addr = (data.address as Record<string, string>) || {};

    // ── Map response to our properties schema ─────────────────────────
    const property = {
      address: addr.streetAddress || data.streetAddress || data.address || "",
      city: addr.city || data.city || "Cleveland",
      state: addr.state || data.state || "OH",
      zip_code: addr.zipcode || data.zipcode || "",
      bedrooms: data.bedrooms ?? data.resoFacts?.bedrooms ?? 0,
      bathrooms: data.bathrooms ?? data.resoFacts?.bathrooms ?? 0,
      square_feet: data.livingArea || data.livingAreaValue || null,
      property_type: mapPropertyType(
        data.homeType || data.propertyType || data.homeTypeDimension
      ),
      rent_price: data.rentZestimate || data.price || 0,
      deposit_amount: null,
      application_fee: null,
      description: data.description || null,
      photos: extractPhotos(data),
      section_8_accepted: true,
      hud_inspection_ready: true,
      status: "available",
      pet_policy: null,
      year_built: data.yearBuilt || null,
      lot_size: data.lotSize || data.lotAreaValue || null,
      // Metadata for reference
      _zillow_url: zillow_url,
      _zpid: zpid,
      _zestimate: data.zestimate || null,
      _rent_zestimate: data.rentZestimate || null,
    };

    return new Response(
      JSON.stringify({ success: true, property }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("import-zillow-property error:", err);
    return new Response(
      JSON.stringify({
        error:
          (err as Error).message || "Failed to import property from Zillow",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
