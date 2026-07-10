// Compliant bulk-send for the Property Spotlight module.
//
// Mirrors the proven launch path in CampaignCreateWizard so Spotlight stays
// CAN-SPAM / CASL compliant and shows up in the Campaigns tracking UI:
//   build audience → fail-closed marketing-consent gate → create a `campaigns`
//   row → bulk-insert queued `email_events` → reconcile the queued count.
//
// The Spotlight email HTML is identical for every recipient (it is not
// per-lead personalized), so the caller renders it ONCE — with the CAN-SPAM
// marketing footer containing the {{unsubscribe_url}} placeholder — and it is
// reused for every row. The placeholder is substituted per-recipient by the
// `process-email-queue` worker using each row's `related_entity_id` + the org's
// UNSUBSCRIBE_SECRET, so the HMAC signing key never touches the client.
// (`process-email-queue` treats a row as marketing whenever `details.campaign_id`
// is present, which we always set below.)

import { leadIdsTaggedWith } from "@/lib/leadTags";

export type SpotlightAudienceMode = "all_active" | "by_status" | "interested";

export interface SpotlightRecipient {
  id: string;
  email: string;
  status: string | null;
}

// Statuses we never blast, regardless of audience mode.
const DEAD_END_STATUSES = new Set(["lost", "converted"]);

// Sensible default warm-lead segment for the "by status" mode.
export const DEFAULT_SPOTLIGHT_STATUSES = [
  "new",
  "contacted",
  "engaged",
  "nurturing",
  "qualified",
  "showing_scheduled",
];

export interface FetchAudienceOpts {
  statuses?: string[]; // for by_status
  propertyIds?: string[]; // for interested
}

/**
 * Resolve the recipient pool for a Spotlight send. Returns only leads that have
 * an email and are NOT in a dead-end status. Consent suppression happens later,
 * at send time (see sendSpotlightCampaign) — this is the pre-suppression pool,
 * so the count shown to the user is an upper bound.
 */
export async function fetchSpotlightRecipients(
  supabase: any,
  orgId: string,
  mode: SpotlightAudienceMode,
  opts: FetchAudienceOpts = {},
): Promise<SpotlightRecipient[]> {
  const clean = (
    rows: Array<{ id: string; email: string | null; status: string | null }> | null,
  ): SpotlightRecipient[] =>
    (rows || [])
      .filter((l) => l.email && String(l.email).trim())
      .filter((l) => !DEAD_END_STATUSES.has(l.status ?? ""))
      .map((l) => ({
        id: l.id,
        email: String(l.email).trim(),
        status: l.status ?? null,
      }));

  // Paginate past PostgREST's 1000-row response cap. `.limit(10000)` does NOT
  // help — the server enforces max-rows=1000 — so without this a large audience
  // would read a flat 1000 in the UI and a blast would silently drop everyone
  // beyond the first page. Order by id for stable, non-overlapping pages.
  const PAGE = 1000;
  const fetchAll = async (
    build: (from: number, to: number) => any,
  ): Promise<Array<{ id: string; email: string | null; status: string | null }>> => {
    const out: Array<{ id: string; email: string | null; status: string | null }> = [];
    for (let from = 0; from < 200000; from += PAGE) {
      const { data, error } = await build(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as Array<{ id: string; email: string | null; status: string | null }>;
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  };

  if (mode === "by_status") {
    const statuses = (opts.statuses || []).filter(Boolean);
    if (statuses.length === 0) return [];
    const rows = await fetchAll((from, to) =>
      supabase
        .from("leads")
        .select("id, email, status")
        .eq("organization_id", orgId)
        .in("status", statuses)
        .not("email", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    );
    return clean(rows);
  }

  if (mode === "interested") {
    const propertyIds = (opts.propertyIds || []).filter(Boolean);
    if (propertyIds.length === 0) return [];
    // Two-step: resolve tagged lead ids from lead_property_interests (already
    // paginated + deduped by leadIdsTaggedWith), then fetch the lead fields in
    // id-chunks of 200 — each chunk returns ≤200 rows, safely under the
    // PostgREST 1000-row cap, so no .range() pagination is needed here.
    const taggedIds = [...(await leadIdsTaggedWith(propertyIds))];
    if (taggedIds.length === 0) return [];
    const rows: Array<{ id: string; email: string | null; status: string | null }> = [];
    for (let i = 0; i < taggedIds.length; i += 200) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, email, status")
        .eq("organization_id", orgId)
        .in("id", taggedIds.slice(i, i + 200))
        .not("email", "is", null);
      if (error) throw error;
      rows.push(
        ...((data || []) as Array<{ id: string; email: string | null; status: string | null }>),
      );
    }
    return clean(rows);
  }

  // all_active: pull everything with an email, then drop dead-ends client-side.
  // (A PostgREST NOT IN would silently drop NULL-status rows — most scraped /
  // webhook leads have a NULL status — so we filter in JS to keep them.)
  const rows = await fetchAll((from, to) =>
    supabase
      .from("leads")
      .select("id, email, status")
      .eq("organization_id", orgId)
      .not("email", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return clean(rows);
}

export interface SendSpotlightArgs {
  supabase: any;
  orgId: string;
  orgName: string;
  createdBy?: string | null;
  campaignName: string;
  subject: string;
  /** Rendered Spotlight HTML, already carrying the CAN-SPAM marketing footer
   *  with the {{unsubscribe_url}} placeholder. Same HTML for every recipient. */
  html: string;
  recipients: SpotlightRecipient[];
  propertyIds: string[];
  audienceLabel: string;
  sendDelaySeconds?: number;
}

export interface SendSpotlightResult {
  campaignId: string | null;
  queued: number;
  suppressed: number;
  totalRecipients: number;
}

/**
 * Queue a Spotlight email blast to `recipients`, compliantly.
 *
 * Throws only when the campaign row can't be created. The marketing-consent
 * gate FAILS CLOSED — if consent can't be verified for a chunk, every recipient
 * in the send is suppressed rather than risk emailing an opt-out.
 */
export async function sendSpotlightCampaign(
  args: SendSpotlightArgs,
): Promise<SendSpotlightResult> {
  const {
    supabase,
    orgId,
    orgName,
    createdBy,
    campaignName,
    subject,
    html,
    recipients,
    propertyIds,
    audienceLabel,
    sendDelaySeconds = 2,
  } = args;

  const totalRecipients = recipients.length;
  if (totalRecipients === 0) {
    return { campaignId: null, queued: 0, suppressed: 0, totalRecipients: 0 };
  }

  // ── 1. Create the campaign row (tracking in Campaigns + progress panel) ──
  const targetCriteria: Record<string, unknown> = {
    spotlight: true,
    audience: audienceLabel,
    property_ids: propertyIds,
    subject,
  };
  const baseInsert: Record<string, unknown> = {
    organization_id: orgId,
    name: campaignName.trim() || "Property Spotlight",
    property_id: propertyIds[0] ?? null,
    campaign_type: "email_blast",
    target_criteria: targetCriteria,
    status: "in_progress",
    started_at: new Date().toISOString(),
    total_leads: totalRecipients,
    leads_with_email: totalRecipients,
    emails_queued: 0,
    sms_template: null,
    created_by: createdBy ?? null,
  };
  // `send_delay_seconds` lives in the campaigns-hardening migration which may
  // not have run on every DB. Attempt with it, retry without on 42703/204,
  // stashing the delay inside target_criteria (process-email-queue reads either).
  let { data: campaign, error: campErr } = await (supabase.from("campaigns") as any)
    .insert({ ...baseInsert, send_delay_seconds: sendDelaySeconds })
    .select("id")
    .single();
  if (
    campErr &&
    (campErr.code === "PGRST204" ||
      campErr.code === "42703" ||
      /send_delay_seconds/.test(campErr.message || ""))
  ) {
    const retry = await (supabase.from("campaigns") as any)
      .insert({
        ...baseInsert,
        target_criteria: { ...targetCriteria, send_delay_seconds: sendDelaySeconds },
      })
      .select("id")
      .single();
    campaign = retry.data;
    campErr = retry.error;
  }
  if (campErr || !campaign) throw campErr || new Error("Failed to create campaign");
  const campaignId = campaign.id as string;

  // ── 2. Fail-closed marketing-consent gate ──
  // Suppress leads that unsubscribed, explicitly declined email marketing
  // consent, or are flagged do_not_contact. If the check can't run for a chunk,
  // suppress EVERYONE — never assume consent (CAN-SPAM / CASL).
  const suppressed = new Set<string>();
  const ids = recipients.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const { data: rows, error } = await supabase
      .from("leads")
      .select("id, unsubscribed_at, email_marketing_consent, do_not_contact")
      .in("id", chunk);
    if (error) {
      for (const id of ids) suppressed.add(id);
      break;
    }
    for (const row of (rows as Array<{
      id: string;
      unsubscribed_at: string | null;
      email_marketing_consent: boolean | null;
      do_not_contact: boolean | null;
    }> | null) || []) {
      if (
        row.unsubscribed_at != null ||
        row.email_marketing_consent === false ||
        row.do_not_contact === true
      ) {
        suppressed.add(row.id);
      }
    }
  }

  // ── 3. Bulk-insert queued email_events for eligible recipients ──
  // process-email-queue picks these up on its next tick, fills the per-recipient
  // unsubscribe URL, paces sends (rate-limit), retries, and tracks the campaign.
  const nowIso = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  for (const r of recipients) {
    if (suppressed.has(r.id)) continue;
    rows.push({
      organization_id: orgId,
      event_type: "delivery_delayed",
      recipient_email: r.email,
      subject,
      details: {
        html,
        from_name: orgName,
        status: "queued",
        notification_type: "campaign_featured",
        related_entity_id: r.id,
        related_entity_type: "lead",
        queued_at: nowIso,
        campaign_id: campaignId,
      },
    });
  }

  let queued = 0;
  // ~50KB of HTML per row → cap chunks at 100 to stay under PostgREST payload limits.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await (supabase.from("email_events") as any).insert(chunk);
    if (!error) queued += chunk.length;
    else console.error(`Spotlight queue chunk ${i}-${i + chunk.length} failed:`, error.message);
  }

  // ── 4. Reconcile the queued count on the campaign row ──
  await supabase.from("campaigns").update({ emails_queued: queued }).eq("id", campaignId);

  return { campaignId, queued, suppressed: suppressed.size, totalRecipients };
}
