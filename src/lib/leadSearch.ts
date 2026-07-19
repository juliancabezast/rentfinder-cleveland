import { supabase } from "@/integrations/supabase/client";

export interface LeadSearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

/** Display name for a lead row, tolerant of split/legacy name fields. */
export function leadDisplayName(
  l: Pick<LeadSearchResult, "full_name" | "first_name" | "last_name">
): string {
  const full = l.full_name?.trim();
  if (full) return full;
  const parts = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  return parts || "Unknown";
}

/**
 * Server-side lead search by name / phone / email, scoped to an org.
 *
 * Replaces the "load every lead then filter in the browser" anti-pattern that
 * silently dropped the alphabetical tail once an org outgrew the fetch cap
 * (e.g. an 18.8k-lead org with a 10k cap made every R–Z lead invisible).
 *
 * The raw query is sanitized before it reaches PostgREST's `.or()` — `,()%*`
 * would otherwise break the filter grammar or act as injected wildcards.
 */
export async function searchLeads(
  organizationId: string,
  rawQuery: string,
  limit = 50
): Promise<LeadSearchResult[]> {
  const q = rawQuery.replace(/[,()%*]/g, " ").trim();
  if (q.length < 2) return [];

  const digits = rawQuery.replace(/\D/g, "");
  const ors = [
    `full_name.ilike.%${q}%`,
    `first_name.ilike.%${q}%`,
    `last_name.ilike.%${q}%`,
    `email.ilike.%${q}%`,
  ];
  // Phone is stored inconsistently (+12163528700 and 12163528700); match on the
  // raw digit run so a formatted query like "(216) 352-8700" still hits.
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);

  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, full_name, phone, email")
    .eq("organization_id", organizationId)
    .or(ors.join(","))
    .order("full_name")
    .limit(limit);

  if (error) throw error;
  return (data || []) as LeadSearchResult[];
}
