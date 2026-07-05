import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORG_SLUG = "rent-finder-cleveland";
const ORG_TZ = "America/New_York";

// Applicant / post-application statuses are never surfaced on this public page.
const HIDDEN_LEAD_STATUSES = ["in_application"];

// ── helpers ───────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeQuery(raw: string): string {
  return raw.replace(/[%_()*\\]/g, " ").replace(/\s+/g, " ").trim();
}

// Common street-type abbreviations so "Avenue" matches a stored "Ave", etc.
const STREET_SUFFIX: Record<string, string> = {
  avenue: "ave", av: "ave", street: "st", road: "rd", drive: "dr",
  boulevard: "blvd", court: "ct", lane: "ln", place: "pl", terrace: "ter",
  parkway: "pkwy", highway: "hwy", circle: "cir", trail: "trl", square: "sq",
  apartment: "apt", unit: "", number: "", "#": "",
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w in STREET_SUFFIX ? STREET_SUFFIX[w] : w))
    .filter(Boolean)
    .join(" ");
}

// All units of a building share the same `address` string — group on it.
function addrKey(address: string): string {
  return (address || "").trim().toLowerCase();
}

// DST-aware YYYY-MM for a timestamp, in the org timezone.
function monthKey(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-CA", {
      timeZone: ORG_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    })
    .slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}

function fillMonths(counts: Record<string, number>) {
  const keys = Object.keys(counts).sort();
  if (keys.length === 0) return [];
  const [sy, sm] = keys[0].split("-").map(Number);
  const [ey, em] = keys[keys.length - 1].split("-").map(Number);
  const out: { month: string; label: string; count: number }[] = [];
  let y = sy, m = sm;
  for (let i = 0; i < 36; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ month: key, label: monthLabel(key), count: counts[key] || 0 });
    if (y === ey && m === em) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function firstPhoto(photos: unknown): string | null {
  if (Array.isArray(photos)) {
    const p = photos[0];
    if (typeof p === "string") return p;
    if (p && typeof p === "object") {
      const url = (p as Record<string, unknown>).url ||
        (p as Record<string, unknown>).src ||
        (p as Record<string, unknown>).href;
      return typeof url === "string" ? url : null;
    }
  }
  return null;
}

// Pick the most "open" status across a building's units for display.
const STATUS_RANK = ["available", "coming_soon", "in_leasing_process", "rented"];
function aggregateStatus(statuses: string[]): string {
  for (const s of STATUS_RANK) if (statuses.includes(s)) return s;
  return statuses[0] || "available";
}

function range(nums: (number | null | undefined)[]): [number | null, number | null] {
  const vals = nums.filter((n): n is number => n !== null && n !== undefined);
  if (vals.length === 0) return [null, null];
  return [Math.min(...vals), Math.max(...vals)];
}

// Today (YYYY-MM-DD) in the org timezone, for splitting open slots.
function orgToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ORG_TZ });
}

// Redact concrete contact PII (emails + phone numbers) from free-text agent
// comments so they are safe to show on the public, de-identified page.
function redactPII(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) =>
      m.replace(/\D/g, "").length >= 10 ? "[redacted]" : m,
    );
}

const propCols =
  "id, address, unit_number, city, state, zip_code, status, rent_price, " +
  "bedrooms, bathrooms, square_feet, property_type, section_8_accepted, " +
  "listed_date, photos";

type Prop = Record<string, any>;

// Build a grouped lookup card (one per building) from its units.
function groupCard(units: Prop[]) {
  const first = units[0];
  const [rentMin, rentMax] = range(units.map((u) => u.rent_price));
  const [bedMin, bedMax] = range(units.map((u) => u.bedrooms));
  const photo = units.map((u) => firstPhoto(u.photos)).find(Boolean) || null;
  return {
    key: addrKey(first.address),
    address: first.address,
    city: first.city,
    state: first.state,
    zip_code: first.zip_code,
    units: units.length,
    status: aggregateStatus(units.map((u) => u.status)),
    section_8_accepted: units.some((u) => u.section_8_accepted),
    rent_min: rentMin,
    rent_max: rentMax,
    bedrooms_min: bedMin,
    bedrooms_max: bedMax,
    photo,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const payload = await req.json().catch(() => ({}));
    const rawQuery = typeof payload.query === "string" ? payload.query : "";
    const groupKey = typeof payload.groupKey === "string" ? payload.groupKey : null;
    const q = sanitizeQuery(rawQuery);

    // Resolve the (single) organization.
    const { data: org } = await supabase
      .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
    const orgId = org?.id ||
      (await supabase.from("organizations").select("id")
        .order("created_at", { ascending: true }).limit(1).maybeSingle()).data?.id;
    if (!orgId) return json({ error: "org_not_found" }, 500);

    // Load the org catalog once (small).
    const { data: allProps, error: propErr } = await supabase
      .from("properties").select(propCols)
      .eq("organization_id", orgId).eq("is_demo", false);
    if (propErr) throw propErr;
    const catalog: Prop[] = allProps || [];

    // ── OPEN-AGENDA mode: city-grouped open showing availability. Public and
    // shown to every visitor (landing banner), independent of any search.
    // Aggregates enabled + unbooked upcoming slots across the org's real
    // properties and groups them by city.
    if (payload.mode === "open_agenda") {
      const today = orgToday();
      const catalogIds = catalog.map((p) => p.id);
      const cityById = new Map(
        catalog.map((p) => [p.id, String(p.city || "").trim()]),
      );
      if (catalogIds.length === 0) return json({ cities: [], total_slots: 0 });

      const slots: { property_id: string; slot_date: string }[] = [];
      const PAGE = 1000;
      for (let from = 0; from < 50000; from += PAGE) {
        const { data, error } = await supabase
          .from("showing_available_slots")
          .select("property_id, slot_date")
          .in("property_id", catalogIds)
          .eq("is_enabled", true)
          .eq("is_booked", false)
          .gte("slot_date", today)
          .order("slot_date", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        slots.push(...((data || []) as { property_id: string; slot_date: string }[]));
        if (!data || data.length < PAGE) break;
      }

      const byCity = new Map<
        string,
        { city: string; slots: number; propIds: Set<string>; next_date: string; dates: Set<string> }
      >();
      for (const s of slots) {
        const city = cityById.get(s.property_id);
        if (!city) continue; // skip slots with no known city
        let g = byCity.get(city);
        if (!g) {
          g = { city, slots: 0, propIds: new Set(), next_date: s.slot_date, dates: new Set() };
          byCity.set(city, g);
        }
        g.slots++;
        g.propIds.add(s.property_id);
        g.dates.add(s.slot_date);
        if (s.slot_date < g.next_date) g.next_date = s.slot_date;
      }
      const cities = [...byCity.values()]
        .map((g) => ({
          city: g.city,
          slots: g.slots,
          properties: g.propIds.size,
          next_date: g.next_date,
          dates: [...g.dates].sort().slice(0, 12), // all open dates, soonest first
        }))
        // soonest first (YYYY-MM-DD sorts chronologically), then A–Z
        .sort((a, b) => a.next_date.localeCompare(b.next_date) || a.city.localeCompare(b.city));
      return json({
        cities,
        total_slots: cities.reduce((n, c) => n + c.slots, 0),
      });
    }

    // ── LISTINGS mode: public renter marketplace. Returns available (+coming
    // soon) buildings in Ohio as renter-facing cards, one per building, each
    // with a representative available unit id for the "schedule a showing" link.
    // Milwaukee/St. Louis units are out of the Cleveland-market scope.
    if (payload.mode === "listings") {
      const ZIP_NEIGHBORHOOD: Record<string, string> = {
        "44105": "Slavic Village", "44110": "Collinwood", "44108": "Glenville",
        "44104": "Central / Fairfax", "44103": "Hough", "44120": "Buckeye-Shaker",
        "44102": "Detroit-Shoreway", "44109": "Old Brooklyn", "44112": "East Cleveland",
        "44113": "Ohio City / Tremont", "44128": "Lee-Harvard", "44106": "University Circle",
        "44127": "Kinsman", "44115": "Central",
      };
      const avail = catalog.filter(
        (p) =>
          ["available", "coming_soon"].includes(p.status) &&
          String(p.state || "").toUpperCase() === "OH",
      );
      const groups = new Map<string, Prop[]>();
      for (const p of avail) {
        const k = addrKey(p.address);
        const arr = groups.get(k);
        if (arr) arr.push(p);
        else groups.set(k, [p]);
      }
      const listings = [...groups.values()]
        .map((units) => {
          const first = units[0];
          const [rentMin, rentMax] = range(units.map((u) => u.rent_price));
          const [bedMin, bedMax] = range(units.map((u) => u.bedrooms));
          const [baMin, baMax] = range(units.map((u) => u.bathrooms));
          const photo = units.map((u) => firstPhoto(u.photos)).find(Boolean) || null;
          const availUnit = units.find((u) => u.status === "available") || first;
          const types = [...new Set(units.map((u) => u.property_type).filter(Boolean))];
          return {
            key: addrKey(first.address),
            address: first.address,
            city: first.city,
            state: first.state,
            zip_code: first.zip_code,
            neighborhood: ZIP_NEIGHBORHOOD[String(first.zip_code)] || first.city,
            units: units.length,
            status: aggregateStatus(units.map((u) => u.status)),
            section_8_accepted: units.some((u) => u.section_8_accepted),
            rent_min: rentMin,
            rent_max: rentMax,
            bedrooms_min: bedMin,
            bedrooms_max: bedMax,
            bathrooms_min: baMin,
            bathrooms_max: baMax,
            property_type: types[0] || null,
            photo,
            property_id: availUnit.id,
          };
        })
        .sort(
          (a, b) =>
            (a.status === "available" ? 0 : 1) - (b.status === "available" ? 0 : 1) ||
            (a.rent_min ?? 1e9) - (b.rent_min ?? 1e9),
        );
      const areas = [...new Set(listings.map((l) => l.neighborhood))].sort();
      const cities = [...new Set(listings.map((l) => l.city))].sort();
      return json({ listings, total: listings.length, areas, cities });
    }

    // ── SEARCH mode: return one grouped card per matching building ─────
    if (!groupKey) {
      if (q.length < 2) return json({ matches: [] });
      const tokens = normalizeText(q).split(" ").filter(Boolean);
      if (tokens.length === 0) return json({ matches: [] });

      const matches = catalog.filter((p) => {
        const text = normalizeText(
          [p.address, p.unit_number, p.city, p.state, p.zip_code]
            .filter(Boolean).join(" "),
        );
        return tokens.every((t) => text.includes(t));
      });

      // Group matched units by building address.
      const groups = new Map<string, Prop[]>();
      for (const p of matches) {
        const k = addrKey(p.address);
        const arr = groups.get(k);
        if (arr) arr.push(p);
        else groups.set(k, [p]);
      }
      const cards = [...groups.values()]
        .map(groupCard)
        .sort((a, b) => {
          const aStart = normalizeText(a.address).startsWith(tokens[0]) ? 0 : 1;
          const bStart = normalizeText(b.address).startsWith(tokens[0]) ? 0 : 1;
          if (aStart !== bStart) return aStart - bStart;
          return a.address.localeCompare(b.address);
        })
        .slice(0, 8);
      return json({ matches: cards });
    }

    // ── TRACKER mode: aggregate a whole building (all its units) ──────
    // Public + de-identified: no prospect PII, applicants excluded, and agent
    // comments are redacted (emails/phones) below. Intentionally NOT auth-gated
    // so an owner can open the public link and type their address.
    const units = catalog.filter((p) => addrKey(p.address) === groupKey);
    if (units.length === 0) return json({ matches: [] });
    const unitIds = units.map((u) => u.id);

    // Leads across all units (de-identified, applicants excluded). PostgREST
    // caps a select at 1000 rows, so page through to count large buildings.
    const leads: { status: string; source: string; created_at: string }[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await supabase
        .from("leads").select("status, source, created_at")
        .eq("organization_id", orgId)
        .in("interested_property_id", unitIds)
        .eq("is_demo", false)
        .not("status", "in", `(${HIDDEN_LEAD_STATUSES.join(",")})`)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      leads.push(...((data || []) as typeof leads));
      if (!data || data.length < PAGE) break;
    }

    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    let firstLeadAt: string | null = null;
    let lastLeadAt: string | null = null;
    let leadsLast30d = 0;
    const cutoff30d = new Date(Date.now() - 30 * 86400000).toISOString();
    for (const l of leads) {
      const st = (l.status as string) || "new";
      byStatus[st] = (byStatus[st] || 0) + 1;
      const src = ((l.source as string) || "unknown").trim() || "unknown";
      bySource[src] = (bySource[src] || 0) + 1;
      const c = l.created_at as string;
      if (c) {
        byMonth[monthKey(c)] = (byMonth[monthKey(c)] || 0) + 1;
        if (!firstLeadAt || c < firstLeadAt) firstLeadAt = c;
        if (!lastLeadAt || c > lastLeadAt) lastLeadAt = c;
        if (c >= cutoff30d) leadsLast30d++;
      }
    }

    const stageDefs = [
      { label: "Inquiries", statuses: ["new", "contacted"] },
      { label: "Engaged", statuses: ["engaged", "nurturing", "qualified"] },
      { label: "Showing Scheduled", statuses: ["showing_scheduled"] },
      { label: "Toured", statuses: ["showed"] },
    ];
    const funnel = stageDefs.map((s) => ({
      stage: s.label,
      count: s.statuses.reduce((sum, st) => sum + (byStatus[st] || 0), 0),
    }));

    const leadSources = Object.entries(bySource)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);

    // Showings across all units (de-identified).
    const { data: showingsRaw } = await supabase
      .from("showings")
      .select(
        "id, property_id, scheduled_at, status, prospect_interest_level, completed_at, agent_report",
      )
      .eq("organization_id", orgId)
      .in("property_id", unitIds)
      .eq("is_demo", false)
      .order("scheduled_at", { ascending: false });
    const showings = showingsRaw || [];
    const unitNumberById = new Map(units.map((u) => [u.id, u.unit_number]));

    const nowMs = Date.now();
    const showStatus: Record<string, number> = {};
    let upcomingCount = 0, completedCount = 0;
    const timeline = showings.map((s) => {
      const status = (s.status as string) || "scheduled";
      showStatus[status] = (showStatus[status] || 0) + 1;
      const when = s.scheduled_at as string | null;
      const isUpcoming = !!when && new Date(when).getTime() >= nowMs &&
        ["scheduled", "confirmed", "rescheduled"].includes(status);
      if (isUpcoming) upcomingCount++;
      if (status === "completed") completedCount++;
      return {
        id: s.id, scheduled_at: when, status,
        interest_level: s.prospect_interest_level || null,
        is_upcoming: isUpcoming,
      };
    });
    const showingsByStatus = Object.entries(showStatus)
      .map(([status, count]) => ({ status, count }));

    // Leasing-agent comments (post-showing reports) — visible to the owner.
    const agentComments = showings
      .filter((s) => s.agent_report && String(s.agent_report).trim())
      .map((s) => ({
        id: s.id,
        date: (s.completed_at as string | null) || (s.scheduled_at as string | null),
        interest_level: s.prospect_interest_level || null,
        unit_number: unitNumberById.get(s.property_id) || null,
        comment: redactPII(String(s.agent_report).trim()),
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Open agenda slots across all units (enabled & not booked). Use exact
    // counts (there can be thousands) + a bounded list of the next open slots.
    const today = orgToday();
    // select() must come before filters in postgrest-js.
    const slotQuery = (sel: string, opts?: { count: "exact"; head: boolean }) =>
      supabase.from("showing_available_slots").select(sel, opts)
        .in("property_id", unitIds).eq("is_enabled", true).eq("is_booked", false);
    const { count: openUpcomingCount } = await slotQuery("id", {
      count: "exact", head: true,
    }).gte("slot_date", today);
    const { count: openPastCount } = await slotQuery("id", {
      count: "exact", head: true,
    }).lt("slot_date", today);
    const { data: upcomingSlots } = await slotQuery(
      "id, slot_date, slot_time, duration_minutes",
    )
      .gte("slot_date", today)
      .order("slot_date", { ascending: true })
      .order("slot_time", { ascending: true })
      .limit(30);
    const openUpcoming = openUpcomingCount || 0;
    const openPast = openPastCount || 0;

    // Org-wide first-response speed (median minutes to first email reply,
    // last 120 days) — same responder serves every property. Soft-fails to
    // null so a stats hiccup never breaks the tracker.
    let responseStats: {
      responded_count?: number;
      median_minutes?: number | null;
      pct_under_1h?: number | null;
    } | null = null;
    try {
      const { data: rs } = await supabase.rpc("leasing_tracker_response_stats", {
        p_organization_id: orgId,
      });
      if (rs && typeof rs === "object") responseStats = rs;
    } catch (_) { /* keep null */ }

    // Org-wide "pulse" figures for the global banner shown above the
    // per-property stats: total leads ever managed + this-week volume and
    // week-over-week trend. Three cheap head-count queries; soft-fail to null.
    let globalPulse: {
      total_leads: number;
      leads_7d: number;
      leads_prev_7d: number;
    } | null = null;
    try {
      const leadCount = () =>
        supabase.from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).eq("is_demo", false);
      const d7 = new Date(nowMs - 7 * 86400000).toISOString();
      const d14 = new Date(nowMs - 14 * 86400000).toISOString();
      const [tot, wk, prev] = await Promise.all([
        leadCount(),
        leadCount().gte("created_at", d7),
        leadCount().gte("created_at", d14).lt("created_at", d7),
      ]);
      globalPulse = {
        total_leads: tot.count || 0,
        leads_7d: wk.count || 0,
        leads_prev_7d: prev.count || 0,
      };
    } catch (_) { /* keep null */ }

    // Building-level header, aggregated across the units.
    const [rentMin, rentMax] = range(units.map((u) => u.rent_price));
    const [bedMin, bedMax] = range(units.map((u) => u.bedrooms));
    const [baMin, baMax] = range(units.map((u) => u.bathrooms));
    const sqftVals = units.map((u) => u.square_feet)
      .filter((n): n is number => n != null);
    const listedDates = units.map((u) => u.listed_date as string | null)
      .filter(Boolean) as string[];
    const earliestListed = listedDates.length
      ? listedDates.sort()[0]
      : firstLeadAt ? firstLeadAt.slice(0, 10) : null;
    let daysOnMarket: number | null = null;
    if (earliestListed) {
      const start = new Date(earliestListed + "T00:00:00Z").getTime();
      daysOnMarket = Math.max(0, Math.round((nowMs - start) / 86400000));
    }

    return json({
      property: {
        key: groupKey,
        address: units[0].address,
        city: units[0].city,
        state: units[0].state,
        zip_code: units[0].zip_code,
        units: units.length,
        unit_numbers: units.map((u) => u.unit_number).filter(Boolean),
        bedrooms_min: bedMin, bedrooms_max: bedMax,
        bathrooms_min: baMin, bathrooms_max: baMax,
        square_feet_total: sqftVals.length
          ? sqftVals.reduce((a, b) => a + b, 0) : null,
        rent_min: rentMin, rent_max: rentMax,
        status: aggregateStatus(units.map((u) => u.status)),
        unit_statuses: units.map((u) => ({
          unit_number: u.unit_number, status: u.status, rent_price: u.rent_price,
        })),
        section_8_accepted: units.some((u) => u.section_8_accepted),
        listed_date: earliestListed,
        photo: units.map((u) => firstPhoto(u.photos)).find(Boolean) || null,
      },
      summary: {
        total_leads: leads.length,
        units: units.length,
        showings_total: showings.length,
        showings_completed: completedCount,
        showings_upcoming: upcomingCount,
        open_slots_upcoming: openUpcoming,
        days_on_market: daysOnMarket,
        leads_last_30d: leadsLast30d,
        first_lead_at: firstLeadAt,
        last_lead_at: lastLeadAt,
        response_median_minutes: responseStats?.median_minutes ?? null,
        response_pct_under_1h: responseStats?.pct_under_1h ?? null,
      },
      global: globalPulse,
      funnel,
      lead_sources: leadSources,
      leads_over_time: fillMonths(byMonth),
      showings_by_status: showingsByStatus,
      showings_timeline: timeline,
      agent_comments: agentComments,
      open_slots: {
        upcoming_count: openUpcoming,
        past_count: openPast,
        upcoming: (upcomingSlots || []).map((s) => ({
          id: s.id, slot_date: s.slot_date, slot_time: s.slot_time,
          duration_minutes: s.duration_minutes,
        })),
      },
    });
  } catch (err) {
    console.error("[leasing-tracker-lookup] error:", err);
    return json({ error: "server_error" }, 500);
  }
});
