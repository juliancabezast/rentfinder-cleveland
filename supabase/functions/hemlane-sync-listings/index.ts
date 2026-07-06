import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Recurring re-sync of the org's live Hemlane inventory (price / availability /
// HCV / attributes) into `properties`, via Hemlane's public ownerListings GraphQL
// feed (no auth token needed). Designed to run unattended on a daily cron.
//
// SAFETY MODEL — this writes to the live properties table, so field ownership is
// explicit and the guiding rule is "when in doubt, REPORT, don't write":
//   - Hemlane-owned (auto-synced):  rent_price, security deposit, beds, baths,
//     sqft, section_8_accepted (HCV), pet_policy, property_type.
//   - RFC-owned (NEVER touched here): status, description, photos,
//     coming_soon_date. lat/lng only backfilled when currently NULL.
//   - amenities & photos are set once by the RICH importer (full detail feed,
//     4 amenity arrays + ordered photos). The light ownerListings feed only
//     exposes a subset, so this daily cron never touches them.
//   - A feed field that is NULL is treated as "no data" and skipped entirely —
//     it never overwrites a real DB value or seeds a snapshot (see fieldsFromListing:
//     bathrooms/section_8/property_type all preserve null rather than coercing).
//   - SNAPSHOT-BASED sync: each property stores `hemlane_synced_fields` = the last
//     Hemlane values applied. A field is overwritten ONLY when Hemlane's value
//     CHANGED vs that snapshot; an unchanged-Hemlane / DB-differs case is a manual
//     override and is preserved. On first sight of a field, we backfill only when
//     the DB value is null; a non-null DB value that disagrees with Hemlane is
//     REPORTED as a seed_divergence (never silently overwritten or frozen).
//   - Availability / structural mismatches (Hemlane de-listed, re-listed, new
//     listing, listing vanished, listing_id conflict, unmapped type) are REPORTED,
//     never auto-applied.
// Matching is by the persisted properties.hemlane_listing_id (stable); address
// matching is only a best-effort fallback to LINK a new listing, and ambiguous
// keys are excluded from the fallback rather than guessed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const HEMLANE_GQL = "https://api.hemlane.com/graphql";
const HEMLANE_HEADERS = {
  "Content-Type": "application/json",
  "Origin": "https://www.hemlane.com",
  "User-Agent": "Mozilla/5.0",
};

const ABBREV: Record<string, string> = {
  Avenue: "Ave", Street: "St", Road: "Rd", Boulevard: "Blvd", Drive: "Dr",
  East: "E", West: "W", North: "N", South: "S", Court: "Ct", Place: "Pl",
  Lane: "Ln", Terrace: "Ter", Parkway: "Pkwy", Circle: "Cir",
};
const TYPE_MAP: Record<string, string> = {
  Duplex: "duplex", House: "house", Triplex: "triplex", "4plex": "fourplex",
  Apartments: "apartment", "Single Family": "house",
};

const abbrevAddr = (s: string) =>
  s.trim().split(/\s+/).map((t) => ABBREV[t] ?? t).join(" ");

function normUnit(u: string | null): string | null {
  if (!u) return null;
  u = u.replace(/\s+/g, " ").trim()
    .replace("(Downstairs)", "(Down)").replace("(Upstairs)", "(Up)");
  return u || null;
}

function splitAddr(full: string): { street: string; unit: string | null } {
  full = (full || "").trim();
  const m = full.match(/^(.*?),\s*Unit\b(.*)$/i);
  if (m) {
    const unit = m[2].trim().replace(/^Unit\s+/i, "").trim();
    return { street: m[1].trim(), unit: normUnit(unit) };
  }
  return { street: full, unit: null };
}

const sqftFix = (v: number | null | undefined): number | null =>
  v == null ? null : v < 10 ? Math.round(v * 1000) : Math.round(v);

// canonical match key: "<abbreviated lowercased street>|<lowercased unit or ''>"
const matchKey = (street: string, unit: string | null) =>
  abbrevAddr(street).toLowerCase().replace(/\s+/g, " ").trim() +
  "|" + (unit ? unit.toLowerCase().replace(/\s+/g, " ").trim() : "");

const numEq = (a: unknown, b: unknown) => {
  const x = a == null ? null : Number(a), y = b == null ? null : Number(b);
  if (x == null || y == null) return x === y;
  return Math.abs(x - y) < 0.005;
};
const boolEq = (a: unknown, b: unknown) => a === b;
const strEq = (a: unknown, b: unknown) => String(a ?? "").trim() === String(b ?? "").trim();
// order-insensitive comparison for the comma-joined pet policy
const petEq = (a: unknown, b: unknown) => {
  const norm = (x: unknown) =>
    String(x ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort().join("|");
  return norm(a) === norm(b);
};

interface Listing {
  id: string;
  propertyListingOn: boolean;
  acceptsHcv: boolean | null;
  primaryPropertyType: string | null;
  unitBedrooms: number | null;
  unitFullBaths: number | null;
  unitHalfBaths: number | null;
  unitSquareFeet: number | null;
  amenitiesPetsDescriptions: string[] | null;
  property: { addressLat: number | null; addressLng: number | null } | null;
  propertyUnit: {
    addressStreetWithUnitNumber: string;
    monthlyRent: number | null;
    securityDeposit: number | null;
  } | null;
}

function fieldsFromListing(l: Listing) {
  const pets = (l.amenitiesPetsDescriptions || [])
    .map((s) => (s || "").trim()).filter(Boolean).join(", ");
  // Preserve null so the "no data → skip" rule holds: only compute baths when
  // Hemlane actually reports at least one of the two counts.
  const bathrooms = (l.unitFullBaths == null && l.unitHalfBaths == null)
    ? null
    : (l.unitFullBaths || 0) + 0.5 * (l.unitHalfBaths || 0);
  const rawType = l.primaryPropertyType ?? null;
  return {
    bedrooms: l.unitBedrooms,
    bathrooms,
    square_feet: sqftFix(l.unitSquareFeet),
    rent_price: l.propertyUnit?.monthlyRent ?? null,
    deposit_amount: l.propertyUnit?.securityDeposit ?? null,
    section_8_accepted: l.acceptsHcv == null ? null : !!l.acceptsHcv, // null → skip, never write false
    pet_policy: pets || null,
    property_type_raw: rawType,
    property_type: rawType ? (TYPE_MAP[rawType] ?? null) : null, // unmapped → null (skip + report)
    latitude: l.property?.addressLat ?? null,
    longitude: l.property?.addressLng ?? null,
    hemlane_on: !!l.propertyListingOn,
  };
}

async function fetchAllListings(userId: string): Promise<Listing[]> {
  const all: Listing[] = [];
  const fields = `id referenceId propertyListingOn acceptsHcv primaryPropertyType
    unitBedrooms unitFullBaths unitHalfBaths unitSquareFeet amenitiesPetsDescriptions
    property{ addressLat addressLng }
    propertyUnit{ addressStreetWithUnitNumber monthlyRent securityDeposit }`;
  for (let page = 1; page <= 20; page++) {
    // userId is validated caller-side against /^[A-Za-z0-9_-]+$/ before we get here.
    const query =
      `query{ ownerListings(userId:"${userId}", pagination:{page:${page},limit:50}){ ` +
      `pageInfo{ totalPages page } data{ ${fields} } } }`;
    const resp = await fetch(HEMLANE_GQL, {
      method: "POST",
      headers: HEMLANE_HEADERS,
      body: JSON.stringify({ query }),
    });
    if (!resp.ok) throw new Error(`Hemlane GraphQL HTTP ${resp.status}`);
    const json = await resp.json();
    const node = json?.data?.ownerListings;
    if (!node) throw new Error(`Hemlane GraphQL empty: ${JSON.stringify(json).slice(0, 300)}`);
    all.push(...(node.data || []));
    if (page >= (node.pageInfo?.totalPages || 1)) break;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let supabase: ReturnType<typeof createClient> | undefined;
  let organizationId: string | undefined;
  let dryRun = true;

  try {
    const secret = Deno.env.get("HEMLANE_SYNC_SECRET");
    if (!secret || req.headers.get("x-sync-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    dryRun = body.dry_run !== false; // default DRY-RUN unless explicitly false

    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve org + Hemlane userId from settings (no hardcoded org values).
    let settingsQ = supabase
      .from("organization_settings")
      .select("organization_id, value")
      .eq("key", "hemlane_owner_user_id");
    if (body.organization_id) settingsQ = settingsQ.eq("organization_id", body.organization_id);
    const { data: settings, error: sErr } = await settingsQ.limit(1);
    if (sErr) throw sErr;
    if (!settings || settings.length === 0) {
      return json({ error: "no hemlane_owner_user_id setting found" }, 400);
    }
    organizationId = settings[0].organization_id as string;
    const userId = String(settings[0].value).replace(/^"|"$/g, "");
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
      return json({ error: "invalid hemlane_owner_user_id (must be [A-Za-z0-9_-])" }, 400);
    }

    // Load current inventory for this org (paginated — PostgREST caps at 1000/page).
    const props: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id, address, unit_number, hemlane_listing_id, hemlane_synced_fields, " +
          "rent_price, deposit_amount, status, section_8_accepted, bedrooms, bathrooms, " +
          "square_feet, latitude, longitude, pet_policy, property_type, photos",
        )
        .eq("organization_id", organizationId)
        .range(from, from + 999);
      if (error) throw error;
      props.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const byListingId = new Map<string, any>();
    const keyCount = new Map<string, number>();
    const byKey = new Map<string, any>();
    for (const p of props) {
      if (p.hemlane_listing_id) byListingId.set(p.hemlane_listing_id, p);
      const k = matchKey(p.address || "", p.unit_number || null);
      keyCount.set(k, (keyCount.get(k) || 0) + 1);
      byKey.set(k, p);
    }
    // Address keys shared by >1 DB row are unsafe to fallback-match — report instead.
    const ambiguousKeys = new Set([...keyCount].filter(([, n]) => n > 1).map(([k]) => k));

    const listings = await fetchAllListings(userId);
    // Live listings claim rows first, so a re-listed unit's live listing wins the
    // link and its stale/off twin becomes a reported conflict.
    listings.sort((a, b) => (b.propertyListingOn ? 1 : 0) - (a.propertyListingOn ? 1 : 0));
    const seenListingIds = new Set<string>();

    const toUpdate: { id: string; changes: Record<string, unknown>; snapNext: Record<string, unknown> | null }[] = [];
    const toLink: { id: string; listingId: string }[] = [];
    const discrepancies: any[] = [];
    const seedDivergences: any[] = [];
    const unmatched: any[] = [];
    const unchanged: string[] = [];
    const photosMissing: any[] = [];

    for (const l of listings) {
      seenListingIds.add(l.id);
      const f = fieldsFromListing(l);
      const { street, unit } = splitAddr(l.propertyUnit?.addressStreetWithUnitNumber || "");
      const addr = abbrevAddr(street);

      let prop = byListingId.get(l.id);
      let newlyLinked = false;
      if (!prop) {
        const key = matchKey(street, unit);
        if (ambiguousKeys.has(key)) {
          unmatched.push({ address: addr, unit, listing_id: l.id, hemlane_on: f.hemlane_on, reason: "ambiguous_address" });
          continue;
        }
        const cand = byKey.get(key);
        if (cand && !cand.hemlane_listing_id) {
          prop = cand;
          toLink.push({ id: prop.id, listingId: l.id });
          newlyLinked = true;
          prop.hemlane_listing_id = l.id;      // claim in memory so a same-key twin conflicts
          byListingId.set(l.id, prop);
        } else if (cand && cand.hemlane_listing_id !== l.id) {
          discrepancies.push({
            type: "listing_id_conflict", address: addr, unit,
            property_id: cand.id, its_listing_id: cand.hemlane_listing_id, feed_listing_id: l.id,
          });
          continue;                            // reserved bucket; do NOT also mark unmatched
        } else {
          unmatched.push({ address: addr, unit, listing_id: l.id, hemlane_on: f.hemlane_on });
          continue;
        }
      }

      // Present-but-unmapped property type: don't silently drop a real recategorization.
      if (f.property_type_raw && f.property_type == null) {
        discrepancies.push({ type: "unmapped_property_type", address: addr, unit, property_id: prop.id, hemlane_type: f.property_type_raw });
      }

      // Snapshot-based field sync (see SAFETY MODEL header).
      const snapPrev = (prop.hemlane_synced_fields && typeof prop.hemlane_synced_fields === "object")
        ? prop.hemlane_synced_fields as Record<string, unknown> : {};
      const snapNext: Record<string, unknown> = { ...snapPrev };
      const changes: Record<string, unknown> = {};

      const track: [string, unknown, unknown, (a: unknown, b: unknown) => boolean][] = [
        ["bedrooms", f.bedrooms, prop.bedrooms, numEq],
        ["bathrooms", f.bathrooms, prop.bathrooms, numEq],
        ["square_feet", f.square_feet, prop.square_feet, numEq],
        ["rent_price", f.rent_price, prop.rent_price, numEq],
        ["deposit_amount", f.deposit_amount, prop.deposit_amount, numEq],
        ["section_8_accepted", f.section_8_accepted, prop.section_8_accepted, boolEq],
        ["pet_policy", f.pet_policy, prop.pet_policy, petEq],
        ["property_type", f.property_type, prop.property_type, strEq],
      ];
      for (const [key, hv, dbv, eq] of track) {
        if (hv == null) continue;                     // Hemlane has no value → never write/seed
        const hadPrev = Object.prototype.hasOwnProperty.call(snapPrev, key);
        snapNext[key] = hv;                            // advance snapshot to current Hemlane value
        if (!hadPrev) {
          if (dbv == null) changes[key] = hv;          // backfill empty DB field
          else if (!eq(hv, dbv)) {
            // First sight, DB already has a (possibly placeholder/manual) value that
            // disagrees — surface it instead of silently freezing or overwriting.
            seedDivergences.push({ property_id: prop.id, address: addr, unit, field: key, db_value: dbv, hemlane_value: hv });
          }
        } else if (!eq(hv, snapPrev[key]) && !eq(hv, dbv)) {
          changes[key] = hv;                           // Hemlane changed → propagate
        }
        // Hemlane unchanged since last sync → leave DB alone (manual edit preserved)
      }
      // lat/lng: pure null-backfill, never overwritten, not snapshot-tracked.
      if (prop.latitude == null && f.latitude != null) changes.latitude = f.latitude;
      if (prop.longitude == null && f.longitude != null) changes.longitude = f.longitude;

      const snapChanged = JSON.stringify(snapNext) !== JSON.stringify(snapPrev);
      if (Object.keys(changes).length || snapChanged) {
        toUpdate.push({ id: prop.id, changes, snapNext: snapChanged ? snapNext : null });
      } else if (!newlyLinked) {
        unchanged.push(prop.id);
      }

      // Availability discrepancy — reported, never auto-applied.
      const st = prop.status;
      if (f.hemlane_on && (st === "rented" || st === "inactive")) {
        discrepancies.push({ type: "hemlane_live_rfc_off", address: addr, unit, property_id: prop.id, rfc_status: st });
      } else if (!f.hemlane_on && (st === "available" || st === "coming_soon")) {
        discrepancies.push({ type: "hemlane_off_rfc_live", address: addr, unit, property_id: prop.id, rfc_status: st });
      }

      const noPhotos = !prop.photos || (Array.isArray(prop.photos) && prop.photos.length === 0);
      if (noPhotos) photosMissing.push({ property_id: prop.id, address: addr, unit, listing_id: l.id });
    }

    // Linked properties whose listing has vanished from the feed.
    const missingFromHemlane = props
      .filter((p) => p.hemlane_listing_id && !seenListingIds.has(p.hemlane_listing_id))
      .map((p) => ({ property_id: p.id, address: p.address, unit: p.unit_number, listing_id: p.hemlane_listing_id, rfc_status: p.status }));

    const fieldUpdates = toUpdate.filter((u) => Object.keys(u.changes).length > 0);

    // ---- Apply (unless dry-run) — all write errors are collected, not swallowed. ----
    const errors: any[] = [];
    let appliedFields = 0, snapWrites = 0, linked = 0;
    if (!dryRun) {
      for (const { id, listingId } of toLink) {
        const { error } = await supabase.from("properties").update({ hemlane_listing_id: listingId }).eq("id", id);
        if (error) errors.push({ id, op: "link", msg: error.message });
        else linked++;
      }
      for (const { id, changes, snapNext } of toUpdate) {
        const payload: Record<string, unknown> = { ...changes };
        if (snapNext) payload.hemlane_synced_fields = snapNext;
        if (Object.keys(changes).length) payload.updated_at = new Date().toISOString();
        if (Object.keys(payload).length === 0) continue;
        const { error } = await supabase.from("properties").update(payload).eq("id", id);
        if (error) {
          errors.push({ id, op: "update", keys: Object.keys(changes), msg: error.message });
        } else {
          if (Object.keys(changes).length) appliedFields++;
          if (snapNext) snapWrites++;
        }
      }
    }

    const summary = {
      organization_id: organizationId,
      listings_in_feed: listings.length,
      would_update: fieldUpdates.length,
      would_link: toLink.length,
      snapshot_writes: toUpdate.filter((u) => u.snapNext).length,
      unchanged: unchanged.length,
      discrepancies,
      seed_divergences: seedDivergences,
      unmatched_in_feed: unmatched,
      missing_from_hemlane: missingFromHemlane,
      photos_missing_count: photosMissing.length,
      applied_updates: appliedFields,
      applied_snapshot_writes: snapWrites,
      applied_links: linked,
      errors,
      updates_preview: fieldUpdates.slice(0, 60).map((u) => ({ id: u.id, changes: u.changes })),
    };

    // Audit row for every run (dry or live) — check its own write.
    const { error: auditErr } = await supabase.from("hemlane_sync_runs").insert({
      organization_id: organizationId,
      dry_run: dryRun,
      updated_count: dryRun ? fieldUpdates.length : appliedFields,
      linked_count: dryRun ? toLink.length : linked,
      discrepancy_count: discrepancies.length + seedDivergences.length,
      summary,
    });
    if (auditErr) {
      console.error("hemlane-sync audit insert failed:", auditErr.message);
      errors.push({ op: "audit", msg: auditErr.message });
    }

    return json({ ok: errors.length === 0, dry_run: dryRun, errors_count: errors.length, ...summary });
  } catch (e) {
    console.error("hemlane-sync fatal:", String(e));
    // Leave a trace even on fatal failure so a broken nightly run is visible.
    if (supabase && organizationId) {
      try {
        await supabase.from("hemlane_sync_runs").insert({
          organization_id: organizationId,
          dry_run: dryRun,
          discrepancy_count: 0,
          summary: { fatal: String(e) },
        });
      } catch (_) { /* best-effort */ }
    }
    return json({ error: String(e) }, 500);
  }
});
