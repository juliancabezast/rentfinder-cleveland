// Single source of truth for the org-wide listing description.
//
// Instead of writing/AI-generating a description per property, the org defines
// ONE template + a set of leasing "policies" (3× income, app fee, deposit, pet
// policy, …) once. `renderPropertyDescription()` merges that template with a
// given property's fields to produce the generic description that gets written
// into `properties.description` (via "Apply to all" in PropertyRulesDialog and
// on every property save in PropertyForm) and shown to renters + the AI matcher.
//
// Stored in `organization_settings` (category "property_rules", key
// "listing_template_config") as a structured jsonb object — no schema migration.

export interface ListingPolicies {
  incomeMultiple: number; // × monthly rent, e.g. 3
  minCreditScore: number; // e.g. 550 (0 = don't mention)
  applicationFee: number; // $ (0 = don't mention)
  depositText: string; // e.g. "One month's rent"
  moveInFee: number; // $ (0 = don't mention)
  leaseMonths: number; // e.g. 12 (0 = don't mention)
  petPolicy: string; // e.g. "Pets considered case-by-case"
  utilities: string; // e.g. "Tenant pays all utilities"
  appliances: string; // e.g. "Appliances are not provided"
  section8: boolean; // vouchers accepted
  processingTime: string; // e.g. "3–5 business days"
  extraNotes: string; // free text appended to the terms block
}

export interface ListingTemplateConfig {
  template: string; // description body with merge tags
  policies: ListingPolicies;
  showPoliciesBlock: boolean; // append the "Leasing terms" bullet list
}

/** Merge tags available inside the template body. */
export const LISTING_MERGE_TAGS = [
  "{beds}",
  "{baths}",
  "{rent}",
  "{sqft}",
  "{neighborhood}",
  "{city}",
  "{state}",
  "{zip}",
  "{address}",
  "{propertyType}",
  "{petPolicy}",
  "{incomeRequirement}",
] as const;

export const DEFAULT_LISTING_CONFIG: ListingTemplateConfig = {
  template:
    "Welcome to this {beds}-bedroom, {baths}-bathroom {propertyType} in {neighborhood} at {rent}/month. Housing Choice Vouchers (Section 8) are welcome and the home is inspection-ready. {petPolicy}. Schedule a free showing and apply online today.",
  policies: {
    incomeMultiple: 3,
    minCreditScore: 550,
    applicationFee: 50,
    depositText: "One month's rent, due within one week of approval",
    moveInFee: 225,
    leaseMonths: 12,
    petPolicy: "Pets are considered on a case-by-case basis",
    utilities: "All utilities (water, gas, electric, sewer) are the tenant's responsibility",
    appliances: "Appliances are not provided",
    section8: true,
    processingTime: "3–5 business days",
    extraNotes:
      "In multi-family homes the basement is a shared area. Details are subject to change and should be verified.",
  },
  showPoliciesBlock: true,
};

export const LISTING_CONFIG_CATEGORY = "property_rules";
export const LISTING_CONFIG_KEY = "listing_template_config";

/** Loose property shape used for rendering (works for form data + DB rows). */
export interface RenderableProperty {
  address?: string | null;
  unit_number?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  neighborhood?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;
  rent_price?: number | null;
  property_type?: string | null;
  pet_policy?: string | null;
}

function money(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "";
  return `$${Math.round(n).toLocaleString()}`;
}

/** A sample property for live previews in the editor. */
export const SAMPLE_PROPERTY: RenderableProperty = {
  address: "1234 Example Ave",
  city: "Cleveland",
  state: "OH",
  zip_code: "44105",
  neighborhood: "Slavic Village",
  bedrooms: 3,
  bathrooms: 1,
  square_feet: 1200,
  rent_price: 1100,
  property_type: "single-family home",
};

/**
 * Render the generic description for one property from the org's template +
 * policies. Empty merge tags collapse cleanly (no stray "()" or double spaces).
 */
export function renderPropertyDescription(
  config: ListingTemplateConfig,
  p: RenderableProperty,
): string {
  const rent = p.rent_price ?? null;
  const incomeReq =
    rent != null ? money(rent * (config.policies.incomeMultiple || 3)) : "";
  const petPolicy = p.pet_policy?.trim() || config.policies.petPolicy || "";

  const tags: Record<string, string> = {
    "{beds}": p.bedrooms != null ? String(p.bedrooms) : "",
    "{baths}": p.bathrooms != null ? String(p.bathrooms) : "",
    "{rent}": money(rent),
    "{sqft}": p.square_feet != null ? `${p.square_feet.toLocaleString()} sq ft` : "",
    "{neighborhood}": p.neighborhood?.trim() || p.city?.trim() || "the area",
    "{city}": p.city?.trim() || "",
    "{state}": p.state?.trim() || "",
    "{zip}": p.zip_code?.trim() || "",
    "{address}": p.address?.trim() || "",
    "{propertyType}": (p.property_type?.trim() || "home").toLowerCase(),
    "{petPolicy}": petPolicy,
    "{incomeRequirement}": incomeReq,
  };

  let body = config.template || "";
  for (const [k, v] of Object.entries(tags)) body = body.split(k).join(v);
  // Tidy artifacts left by empty tags.
  body = body
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!config.showPoliciesBlock) return body;

  const pol = config.policies;
  const lines: string[] = [];
  if (pol.section8) lines.push("Section 8 / Housing Choice Vouchers welcome.");
  lines.push(
    rent != null
      ? `Income requirement: ${pol.incomeMultiple}× the monthly rent (${incomeReq}/mo).`
      : `Income requirement: ${pol.incomeMultiple}× the monthly rent.`,
  );
  if (pol.minCreditScore) lines.push(`Minimum credit score: ${pol.minCreditScore} (self-pay applicants).`);
  if (pol.applicationFee) lines.push(`Application fee: ${money(pol.applicationFee)} (non-refundable).`);
  if (pol.depositText?.trim()) lines.push(`Security deposit: ${pol.depositText.trim()}.`);
  if (pol.moveInFee) lines.push(`Move-in fee: ${money(pol.moveInFee)} (one-time).`);
  if (pol.leaseMonths) lines.push(`Lease term: ${pol.leaseMonths} months.`);
  if (pol.utilities?.trim()) lines.push(`${pol.utilities.trim()}.`);
  if (pol.appliances?.trim()) lines.push(`${pol.appliances.trim()}.`);
  if (pol.processingTime?.trim()) lines.push(`Application processing: ${pol.processingTime.trim()}.`);
  if (pol.extraNotes?.trim()) lines.push(pol.extraNotes.trim());

  return `${body}\n\nLeasing terms:\n${lines.map((l) => `• ${l}`).join("\n")}`;
}

/** Load the org's listing config, falling back to defaults + merging partials. */
export async function loadListingConfig(
  supabase: any,
  orgId: string,
): Promise<ListingTemplateConfig> {
  const { data } = await supabase
    .from("organization_settings")
    .select("value")
    .eq("organization_id", orgId)
    .eq("category", LISTING_CONFIG_CATEGORY)
    .eq("key", LISTING_CONFIG_KEY)
    .maybeSingle();

  const v = data?.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return {
      template: typeof v.template === "string" ? v.template : DEFAULT_LISTING_CONFIG.template,
      showPoliciesBlock: v.showPoliciesBlock !== false,
      policies: { ...DEFAULT_LISTING_CONFIG.policies, ...(v.policies || {}) },
    };
  }
  return DEFAULT_LISTING_CONFIG;
}

/** Upsert the org's listing config into organization_settings. */
export async function saveListingConfig(
  supabase: any,
  orgId: string,
  userId: string | undefined,
  config: ListingTemplateConfig,
): Promise<void> {
  const { data: existing } = await supabase
    .from("organization_settings")
    .select("id")
    .eq("organization_id", orgId)
    .eq("category", LISTING_CONFIG_CATEGORY)
    .eq("key", LISTING_CONFIG_KEY)
    .maybeSingle();

  const payload = {
    value: config as any,
    updated_by: userId ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("organization_settings")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("organization_settings").insert({
      organization_id: orgId,
      category: LISTING_CONFIG_CATEGORY,
      key: LISTING_CONFIG_KEY,
      description: "Listing description template + leasing policies (single source of truth)",
      ...payload,
    });
    if (error) throw error;
  }
}

/**
 * Regenerate `properties.description` for every property in the org from the
 * given config. Returns how many rows were updated. Paginates the read past the
 * 1000-row cap and updates in small concurrent batches.
 */
export async function applyDescriptionToAllProperties(
  supabase: any,
  orgId: string,
  config: ListingTemplateConfig,
): Promise<number> {
  const cols =
    "id, address, unit_number, city, state, zip_code, bedrooms, bathrooms, square_feet, rent_price, property_type, pet_policy";
  const rows: RenderableProperty[] & { id: string }[] = [] as any;
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .from("properties")
      .select(cols)
      .eq("organization_id", orgId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as any[];
    rows.push(...(batch as any));
    if (batch.length < PAGE) break;
  }

  let updated = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map((p: any) =>
        supabase
          .from("properties")
          .update({ description: renderPropertyDescription(config, p) })
          .eq("id", p.id)
          .then((r: any) => !r.error),
      ),
    );
    updated += results.filter(Boolean).length;
  }
  return updated;
}
