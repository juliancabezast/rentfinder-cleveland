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

  const titleCase = (s: string) =>
    s.replace(/\b\w/g, c => c.toUpperCase());

  return {
    address: titleCase(address),
    city: titleCase(city) || "Cleveland",
    state: state || "OH",
    zip_code,
  };
}

// ── Scrape Zillow page HTML for property details ────────────────────────
async function scrapeZillowPage(url: string): Promise<{
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  propertyType: string;
  description: string | null;
  petPolicy: string | null;
  photos: string[];
  yearBuilt: number | null;
} | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!resp.ok) {
      console.error(`Zillow page fetch failed: ${resp.status}`);
      return null;
    }

    const html = await resp.text();

    const result = {
      price: 0,
      bedrooms: 0,
      bathrooms: 0,
      sqft: null as number | null,
      propertyType: "house",
      description: null as string | null,
      petPolicy: null as string | null,
      photos: [] as string[],
      yearBuilt: null as number | null,
    };

    // ── Try JSON-LD structured data ──────────────────────────────────
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld["@type"] === "SingleFamilyResidence" || ld["@type"] === "Apartment" || ld["@type"]?.includes?.("Residence")) {
          result.bedrooms = ld.numberOfBedrooms || ld.numberOfRooms || 0;
          result.bathrooms = ld.numberOfBathroomsTotal || 0;
          result.sqft = ld.floorSize?.value || null;
          result.description = ld.description || null;
          if (ld.image) {
            const imgs = Array.isArray(ld.image) ? ld.image : [ld.image];
            result.photos = imgs.filter((i: unknown) => typeof i === "string").slice(0, 15);
          }
        }
      } catch { /* ignore JSON parse errors */ }
    }

    // ── Try __NEXT_DATA__ or gdpClientCache (Zillow embeds data) ─────
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nd = JSON.parse(nextDataMatch[1]);
        const prop = nd?.props?.pageProps?.componentProps?.gdpClientCache;
        if (prop) {
          const cacheKey = Object.keys(prop)[0];
          if (cacheKey) {
            const cached = JSON.parse(prop[cacheKey]);
            const p = cached?.property;
            if (p) {
              result.bedrooms = p.bedrooms || result.bedrooms;
              result.bathrooms = p.bathrooms || result.bathrooms;
              result.sqft = p.livingArea || p.livingAreaValue || result.sqft;
              result.price = p.rentZestimate || p.price || result.price;
              result.description = p.description || result.description;
              result.yearBuilt = p.yearBuilt || result.yearBuilt;
              result.propertyType = mapPropertyType(p.homeType || p.propertyType);
              if (p.responsivePhotos || p.photos) {
                result.photos = extractPhotos(p);
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    // ── Regex fallbacks from raw HTML ────────────────────────────────

    // Price: "$1,300/mo" or similar
    if (!result.price) {
      const priceMatch = html.match(/\$([0-9,]+)\s*\/\s*mo/i);
      if (priceMatch) {
        result.price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
      }
    }

    // Bedrooms
    if (!result.bedrooms) {
      const bedMatch = html.match(/(\d+)\s*(?:beds?|bedrooms?|bd)\b/i);
      if (bedMatch) result.bedrooms = parseInt(bedMatch[1], 10);
    }

    // Bathrooms
    if (!result.bathrooms) {
      const bathMatch = html.match(/([\d.]+)\s*(?:baths?|bathrooms?|ba)\b/i);
      if (bathMatch) result.bathrooms = parseFloat(bathMatch[1]);
    }

    // Square feet
    if (!result.sqft) {
      const sqftMatch = html.match(/([\d,]+)\s*(?:sqft|sq\s*ft|square\s*feet)/i);
      if (sqftMatch) result.sqft = parseInt(sqftMatch[1].replace(/,/g, ""), 10);
    }

    // Property type
    const typeMatch = html.match(/(?:Single family|Multi family|Apartment|Condo|Townhouse|Duplex)\s*(?:residence|home)?/i);
    if (typeMatch) {
      const t = typeMatch[0].toLowerCase();
      if (t.includes("single family")) result.propertyType = "house";
      else if (t.includes("multi family") || t.includes("duplex")) result.propertyType = "duplex";
      else if (t.includes("apartment")) result.propertyType = "apartment";
      else if (t.includes("condo")) result.propertyType = "condo";
      else if (t.includes("townhouse")) result.propertyType = "townhouse";
    }

    // Pet policy
    const petMatch = html.match(/((?:Cats?|Dogs?)[^<]{0,50}(?:OK|allowed|welcome|accepted))/i)
      || html.match(/(No pets|Pets (?:allowed|not allowed|OK|welcome))/i);
    if (petMatch) {
      result.petPolicy = petMatch[1].trim();
    }

    // Description from "What's special" or meta description
    if (!result.description) {
      const descMatch = html.match(/What(?:'|&#x27;)s special<\/[^>]+>\s*<[^>]+>([^<]+)/i);
      if (descMatch) {
        result.description = descMatch[1].trim();
      }
    }
    if (!result.description) {
      const metaDesc = html.match(/<meta name="description" content="([^"]+)"/i);
      if (metaDesc) {
        result.description = metaDesc[1].trim();
      }
    }

    // Photos from meta og:image or image URLs
    if (result.photos.length === 0) {
      const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImage) result.photos.push(ogImage[1]);

      // Zillow photo URLs pattern
      const photoMatches = html.matchAll(/https:\/\/photos\.zillowstatic\.com\/fp\/[a-f0-9]+-[a-z0-9_]+\.jpg/gi);
      for (const m of photoMatches) {
        if (!result.photos.includes(m[0]) && result.photos.length < 15) {
          result.photos.push(m[0]);
        }
      }
    }

    // Year built
    if (!result.yearBuilt) {
      const yearMatch = html.match(/(?:Year built|Built in)\s*:?\s*(\d{4})/i);
      if (yearMatch) result.yearBuilt = parseInt(yearMatch[1], 10);
    }

    return result;
  } catch (e) {
    console.error("Zillow scrape error:", (e as Error).message);
    return null;
  }
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let organization_id = "", zillow_url = "";
  try {
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");

    const parsed = await req.json();
    zillow_url = parsed.zillow_url;
    organization_id = parsed.organization_id;

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

    // ── Fallback: scrape page + parse URL slug ──────────────────────
    const urlParsed = parseZillowUrl(zillow_url);
    if (!urlParsed) {
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

    // Scrape the actual Zillow page for detailed info
    const scraped = await scrapeZillowPage(zillow_url);

    const property = {
      address: urlParsed.address,
      city: urlParsed.city,
      state: urlParsed.state,
      zip_code: urlParsed.zip_code,
      bedrooms: scraped?.bedrooms || 0,
      bathrooms: scraped?.bathrooms || 0,
      square_feet: scraped?.sqft || null,
      property_type: scraped?.propertyType || "house",
      rent_price: scraped?.price || 0,
      deposit_amount: null,
      application_fee: null,
      description: scraped?.description || null,
      photos: scraped?.photos || [],
      section_8_accepted: true,
      hud_inspection_ready: true,
      status: "available",
      pet_policy: scraped?.petPolicy || null,
      year_built: scraped?.yearBuilt || null,
      lot_size: null,
      _zillow_url: zillow_url,
      _zpid: zpid || "unknown",
      _zestimate: null,
      _rent_zestimate: null,
    };

    // Log successful import
    try {
      await supabase.from("system_logs").insert({
        organization_id,
        level: "info",
        category: "general",
        event_type: "zillow_property_imported",
        message: `Property imported from Zillow: ${property.address}, ${property.city} — $${property.rent_price}/mo`,
        details: { address: property.address, city: property.city, rent_price: property.rent_price, bedrooms: property.bedrooms, zillow_url },
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({ success: true, property }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("import-zillow-property error:", err);

    // Log error
    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: "general",
        event_type: "zillow_import_error",
        message: `Failed to import from Zillow: ${(err as Error).message || "Unknown error"}`,
        details: { error: String(err), zillow_url },
      });
    } catch { /* non-blocking */ }

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
