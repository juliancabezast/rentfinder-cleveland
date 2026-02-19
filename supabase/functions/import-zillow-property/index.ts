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
  try {
    const urlObj = new URL(url);
    const zpidParam = urlObj.searchParams.get("zpid");
    if (zpidParam && /^\d+$/.test(zpidParam)) return zpidParam;
  } catch { /* ignore invalid URL */ }

  return null;
}

// ── Parse property data from the Zillow URL slug ────────────────────────
function parseZillowUrl(url: string): {
  address: string;
  city: string;
  state: string;
  zip_code: string;
} | null {
  // URL format: /homedetails/14504-Ardenall-Ave-East-Cleveland-OH-44112/33444982_zpid/
  const slugMatch = url.match(/\/homedetails\/([^/]+)\//);
  if (!slugMatch) return null;

  const slug = slugMatch[1];
  // Split by hyphens
  const parts = slug.split("-");
  if (parts.length < 4) return null;

  // Last part might be zpid or zip code
  // Work backwards: zip (5 digits), state (2 letters), city (remaining after address number)
  let zip_code = "";
  let state = "";
  let endIdx = parts.length;

  // Check if last part is zpid-like (just digits, > 5 chars) — skip it
  if (/^\d{6,}$/.test(parts[endIdx - 1])) {
    endIdx--;
  }

  // Zip code: 5-digit number
  if (endIdx > 0 && /^\d{5}$/.test(parts[endIdx - 1])) {
    zip_code = parts[endIdx - 1];
    endIdx--;
  }

  // State: 2-letter code
  if (endIdx > 0 && /^[A-Z]{2}$/i.test(parts[endIdx - 1])) {
    state = parts[endIdx - 1].toUpperCase();
    endIdx--;
  }

  // Now find where the street address ends and city begins
  // Street usually starts with a number
  const addressParts = parts.slice(0, endIdx);
  if (addressParts.length === 0) return null;

  // Find where street number + street name ends (heuristic: common street suffixes)
  const streetSuffixes = [
    "St", "Ave", "Blvd", "Dr", "Rd", "Ct", "Ln", "Way", "Pl", "Cir",
    "Ter", "Pkwy", "Hwy", "Trail", "Loop", "Run", "Path", "Walk",
    "Street", "Avenue", "Boulevard", "Drive", "Road", "Court", "Lane",
  ];

  let splitIdx = -1;
  for (let i = 0; i < addressParts.length; i++) {
    if (streetSuffixes.some(s => addressParts[i].toLowerCase() === s.toLowerCase())) {
      splitIdx = i;
      break;
    }
  }

  let address: string;
  let city: string;

  if (splitIdx >= 0 && splitIdx < addressParts.length - 1) {
    address = addressParts.slice(0, splitIdx + 1).join(" ");
    city = addressParts.slice(splitIdx + 1).join(" ");
  } else {
    // Fallback: assume first few parts are address, rest is city
    // If starts with number, take until we hit a non-street-word
    const numMatch = addressParts[0]?.match(/^\d+$/);
    if (numMatch && addressParts.length >= 3) {
      // Take number + next word(s) as address, guess city
      address = addressParts.slice(0, 3).join(" ");
      city = addressParts.slice(3).join(" ");
    } else {
      address = addressParts.join(" ");
      city = "";
    }
  }

  // Title-case the address and city
  const titleCase = (s: string) =>
    s.replace(/\b\w/g, c => c.toUpperCase());

  return {
    address: titleCase(address),
    city: titleCase(city) || "Cleveland",
    state: state || "OH",
    zip_code,
  };
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

    const zpid = extractZpid(zillow_url);

    // ── Try RapidAPI if key is available ─────────────────────────────
    if (rapidApiKey && zpid) {
      try {
        const apiResponse = await fetch(
          `https://zillow56.p.rapidapi.com/property?zpid=${zpid}`,
          {
            headers: {
              "X-RapidAPI-Key": rapidApiKey,
              "X-RapidAPI-Host": "zillow56.p.rapidapi.com",
            },
          }
        );

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          const addr = (data.address as Record<string, string>) || {};

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
        }
      } catch (e) {
        console.error("RapidAPI failed, falling back to URL parsing:", (e as Error).message);
      }
    }

    // ── Fallback: parse property data from the URL slug ──────────────
    const parsed = parseZillowUrl(zillow_url);
    if (!parsed) {
      return new Response(
        JSON.stringify({
          error: "Could not extract property info from this URL. Try a URL like: zillow.com/homedetails/123-Main-St-Cleveland-OH-44101/12345678_zpid/",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const property = {
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip_code: parsed.zip_code,
      bedrooms: 0,
      bathrooms: 0,
      square_feet: null,
      property_type: "house",
      rent_price: 0,
      deposit_amount: null,
      application_fee: null,
      description: null,
      photos: [],
      section_8_accepted: true,
      hud_inspection_ready: true,
      status: "available",
      pet_policy: null,
      year_built: null,
      lot_size: null,
      _zillow_url: zillow_url,
      _zpid: zpid || "unknown",
      _zestimate: null,
      _rent_zestimate: null,
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
