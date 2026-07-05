import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// track-property-view
//
// Public (no-JWT) endpoint that records real property views from the renter
// site, via two accumulating counters on `properties`:
//   • "impression"  → the public home displayed the property (fired per load)
//   • "detail_view" → a visitor opened the property page (/p/schedule-showing)
// Raw counting (no dedup) per product decision. Increments are atomic through
// the service-role-only `increment_property_views` RPC, scoped to the resolved
// org so a client can't inflate another tenant's rows.
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORG_SLUG = "rent-finder-cleveland";
const VALID_EVENTS = ["impression", "detail_view"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));

    const event = typeof body.event === "string" ? body.event : "";
    if (!VALID_EVENTS.includes(event)) {
      return json({ error: "invalid_event" }, 400);
    }

    const ids = Array.isArray(body.propertyIds)
      ? [...new Set(body.propertyIds.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x)))].slice(0, MAX_IDS)
      : [];
    if (ids.length === 0) return json({ ok: true, counted: 0 });

    // Resolve the single-tenant org server-side (by slug, fallback oldest) —
    // never trust an org id from the client.
    let orgId: string | null = null;
    {
      const { data: org } = await supabase
        .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
      orgId = org?.id ?? null;
      if (!orgId) {
        const { data: fb } = await supabase
          .from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
        orgId = fb?.id ?? null;
      }
    }
    if (!orgId) return json({ error: "org_not_found" }, 500);

    const { error } = await supabase.rpc("increment_property_views", {
      p_property_ids: ids,
      p_event: event,
      p_organization_id: orgId,
    });
    if (error) {
      console.error("increment_property_views failed:", error.message);
      return json({ ok: false }, 200); // never block the UI
    }

    return json({ ok: true, counted: ids.length });
  } catch (e) {
    console.error("track-property-view error:", e);
    return json({ ok: false }, 200);
  }
});
