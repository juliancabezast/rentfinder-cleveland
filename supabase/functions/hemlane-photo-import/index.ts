import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-import-secret",
};

// Allowlisted public listing-photo hosts (SSRF guard). Hemlane S3 + AppFolio CDN
// (showmetherent syndicates AppFolio) + Zillow static photos.
const ALLOWED_HOSTS = new Set([
  "hemlane-production.s3.amazonaws.com",
  "images.cdn.appfolio.com",
  "photos.zillowstatic.com",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const secret = Deno.env.get("HEMLANE_IMPORT_SECRET");
    if (!secret || req.headers.get("x-import-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    const { property_id, urls } = await req.json();
    if (
      typeof property_id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(property_id) ||
      !Array.isArray(urls) ||
      urls.length === 0 ||
      urls.length > 40
    ) {
      return json({ error: "bad request: property_id (uuid) + urls[1..40] required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Remove hemlane files from a previous import so re-runs don't orphan objects.
    const dir = `properties/${property_id}`;
    const { data: existing } = await supabase.storage.from("property-photos").list(dir, { limit: 100 });
    const stale = (existing ?? [])
      .filter((f) => f.name.includes("-hemlane-"))
      .map((f) => `${dir}/${f.name}`);
    if (stale.length > 0) await supabase.storage.from("property-photos").remove(stale);

    const ts = Date.now();
    const photos: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      const raw = String(urls[i]);
      const url = raw.startsWith("//") ? `https:${raw}` : raw;
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        failed.push(raw);
        continue;
      }
      if (!ALLOWED_HOSTS.has(host)) {
        failed.push(raw);
        continue;
      }

      const resp = await fetch(url);
      if (!resp.ok) {
        failed.push(url);
        continue;
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      // Hemlane's S3 serves binary/octet-stream — infer the real type from the file extension.
      let ct = resp.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) {
        const m = url.toLowerCase().match(/\.(jpe?g|png|webp|gif)(\?|$)/);
        ct = m ? (m[1].startsWith("jp") ? "image/jpeg" : `image/${m[1]}`) : "image/jpeg";
      }
      const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("gif") ? "gif" : "jpg";
      const path = `properties/${property_id}/${ts}-hemlane-${String(i).padStart(2, "0")}.${ext}`;

      const { error } = await supabase.storage
        .from("property-photos")
        .upload(path, buf, { contentType: ct, upsert: true });
      if (error) {
        failed.push(url);
        continue;
      }
      const { data } = supabase.storage.from("property-photos").getPublicUrl(path);
      photos.push(data.publicUrl);
    }

    return json({ photos, failed_count: failed.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
