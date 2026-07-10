import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Lead property-interest TAGS — the multi-tag model that replaces the old
// single leads.interested_property_id FK. A lead accumulates one tag per
// property it ever asks about (never replaced), plus derived CITY chips.
// Canonical store: lead_property_interests (UNIQUE lead_id+property_id).
//   created_at       = first time the lead showed interest in the property
//   last_interest_at = most recent time they asked again (recency ordering)
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadTagProperty {
  id: string;
  address: string;
  unit_number: string | null;
  city: string | null;
  rent_price: number | null;
}

export interface LeadTag {
  property_id: string;
  source: string | null;
  created_at: string | null;
  last_interest_at: string | null;
  property: LeadTagProperty | null;
}

/** Embed fragment for selects from `leads` — hydrates the full tag list. */
export const LEAD_TAGS_EMBED =
  "lead_property_interests(property_id, source, created_at, last_interest_at, properties(id, address, unit_number, city, rent_price))";

/** Lighter embed for list surfaces that only render chips. */
export const LEAD_TAGS_DISPLAY_EMBED =
  "lead_property_interests(property_id, last_interest_at, properties(address, unit_number, city))";

interface EmbeddedTagRow {
  property_id: string;
  source?: string | null;
  created_at?: string | null;
  last_interest_at?: string | null;
  properties?: LeadTagProperty | Partial<LeadTagProperty> | null;
}

/** Normalize the PostgREST embed payload into a recency-sorted LeadTag[]. */
export function mapEmbeddedTags(row: {
  lead_property_interests?: EmbeddedTagRow[] | null;
}): LeadTag[] {
  const rows = row?.lead_property_interests || [];
  return rows
    .map((r) => ({
      property_id: r.property_id,
      source: r.source ?? null,
      created_at: r.created_at ?? null,
      last_interest_at: r.last_interest_at ?? null,
      property: (r.properties as LeadTagProperty) ?? null,
    }))
    .sort((a, b) =>
      (b.last_interest_at || b.created_at || "").localeCompare(
        a.last_interest_at || a.created_at || ""
      )
    );
}

/** Unique cities across a tag set, in order of first appearance. */
export function tagCities(tags: LeadTag[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const city = t.property?.city;
    if (city && !out.includes(city)) out.push(city);
  }
  return out;
}

/** "1234 Main St #B" style label for a tag. */
export function formatTagAddress(tag: LeadTag): string {
  if (!tag.property) return "Unknown property";
  const unit = tag.property.unit_number ? ` #${tag.property.unit_number}` : "";
  return `${tag.property.address}${unit}`;
}

/**
 * Add (or re-affirm) a property-interest tag. Uses the atomic DB RPC — it
 * validates org membership, keeps the original source/created_at on conflict
 * and bumps last_interest_at ("asked again").
 */
export async function upsertLeadTag(
  leadId: string,
  propertyId: string,
  source: string
): Promise<void> {
  const { error } = await supabase.rpc("add_lead_property_tag", {
    p_lead_id: leadId,
    p_property_id: propertyId,
    p_source: source,
  });
  if (error) throw error;
}

/** Bulk tag many leads with the same property (CSV import, campaigns). */
export async function upsertLeadTags(
  organizationId: string,
  leadIds: string[],
  propertyId: string,
  source: string
): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const rows = leadIds.slice(i, i + CHUNK).map((lead_id) => ({
      organization_id: organizationId,
      lead_id,
      property_id: propertyId,
      source,
      last_interest_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("lead_property_interests")
      .upsert(rows, { onConflict: "lead_id,property_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

/** Remove a tag from a lead. */
export async function removeLeadTag(leadId: string, propertyId: string): Promise<void> {
  const { error } = await supabase
    .from("lead_property_interests")
    .delete()
    .eq("lead_id", leadId)
    .eq("property_id", propertyId);
  if (error) throw error;
}

/** Tags for a batch of leads → Map<leadId, LeadTag[]> (chunked, no row cap). */
export async function fetchTagsForLeadIds(leadIds: string[]): Promise<Map<string, LeadTag[]>> {
  const map = new Map<string, LeadTag[]>();
  const CHUNK = 200;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("lead_property_interests")
      .select(
        "lead_id, property_id, source, created_at, last_interest_at, properties(id, address, unit_number, city, rent_price)"
      )
      .in("lead_id", leadIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const r of (data as (EmbeddedTagRow & { lead_id: string })[]) || []) {
      const tag: LeadTag = {
        property_id: r.property_id,
        source: r.source ?? null,
        created_at: r.created_at ?? null,
        last_interest_at: r.last_interest_at ?? null,
        property: (r.properties as LeadTagProperty) ?? null,
      };
      const list = map.get(r.lead_id) || [];
      list.push(tag);
      map.set(r.lead_id, list);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      (b.last_interest_at || b.created_at || "").localeCompare(
        a.last_interest_at || a.created_at || ""
      )
    );
  }
  return map;
}

export interface TagPair {
  lead_id: string;
  property_id: string;
  created_at: string | null;
  last_interest_at: string | null;
}

/** Every (lead, property) tag pair in the org — paginated past the 1000-row cap. */
export async function fetchAllTagPairs(organizationId: string): Promise<TagPair[]> {
  const pairs: TagPair[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .from("lead_property_interests")
      .select("lead_id, property_id, created_at, last_interest_at")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    pairs.push(...((data as TagPair[]) || []));
    if (!data || data.length < PAGE) break;
  }
  return pairs;
}

/** Distinct lead ids tagged with ANY of the given properties (paginated). */
export async function leadIdsTaggedWith(propertyIds: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!propertyIds.length) return ids;
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .from("lead_property_interests")
      .select("lead_id")
      .in("property_id", propertyIds)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data as { lead_id: string }[]) || []) ids.add(r.lead_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}
