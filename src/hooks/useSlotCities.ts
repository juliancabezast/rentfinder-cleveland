import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Only 'available' homes can be opened for showings (coming_soon is visible in
// the public catalog but not bookable). Mirrors the gate in ManageSlotsTab,
// book-public-showing and the anon RLS policy.
const BOOKABLE_STATUSES = ["available"];

export interface SlotMutationResult {
  ok: boolean;
  /** Human sentence for the caller's toast — the caller owns the UI. */
  message: string;
  /** Cities left untouched because their market is already booked. */
  blocked?: string[];
}

/**
 * The per-city open/close primitives for showing slots, shared by the desktop
 * week grid (ManageSlotsTab) and the mobile agenda (ShowingsAgenda).
 *
 * The one idea worth holding on to: a booking is exclusive **inside a market**,
 * not across the organization. A market is the set of cities one person covers
 * (Cleveland + East Cleveland are one; Milwaukee is its own). So the same 4pm
 * can be booked in Milwaukee and still open in Cleveland — and the only thing
 * you may not do is open a second home in a market that already has a booking
 * at that time, because that agent can't be in two places at once.
 *
 * Every mutation returns a result instead of raising toasts, so each surface
 * can report in its own voice and refresh its own data.
 */
export function useSlotCities(orgId: string | null | undefined) {
  const [citiesWithProps, setCitiesWithProps] = useState<Map<string, string[]>>(new Map());
  const [cityMarket, setCityMarket] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("properties")
        .select("id, city, market, status")
        .eq("organization_id", orgId)
        .in("status", BOOKABLE_STATUSES);
      if (cancelled) return;
      const pool = new Map<string, string[]>();
      const markets = new Map<string, string>();
      for (const p of (data || []) as { id: string; city: string | null; market: string | null }[]) {
        const city = p.city || "Other";
        if (!pool.has(city)) pool.set(city, []);
        pool.get(city)!.push(p.id);
        markets.set(city, p.market || city);
      }
      setCitiesWithProps(pool);
      setCityMarket(markets);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const cityNames = useMemo(() => [...citiesWithProps.keys()].sort(), [citiesWithProps]);
  const cityCounts = useMemo(
    () => new Map([...citiesWithProps.entries()].map(([c, ids]) => [c, ids.length])),
    [citiesWithProps],
  );

  const marketOf = useCallback((city: string) => cityMarket.get(city) || city, [cityMarket]);

  /** Markets that already hold a booking at this date+time. */
  const bookedMarkets = useCallback(async (date: string, time: string): Promise<Set<string>> => {
    const taken = new Set<string>();
    if (!orgId) return taken;
    const { data } = await supabase
      .from("showing_available_slots")
      .select("property_id, properties!inner(market)")
      .eq("organization_id", orgId)
      .eq("slot_date", date)
      .eq("slot_time", time)
      .eq("is_booked", true);
    for (const row of (data || []) as { properties: { market: string | null } | null }[]) {
      if (row.properties?.market) taken.add(row.properties.market);
    }
    return taken;
  }, [orgId]);

  /** Which of `cities` sit in a market that is already booked at that time. */
  const blockedCities = useCallback(
    (cities: string[], taken: Set<string>) => cities.filter((c) => taken.has(marketOf(c))),
    [marketOf],
  );

  /**
   * Set the EXACT set of open cities for one date+time: check = open.
   * Cities whose market already has a booking are left exactly as they are —
   * opening them would double-book that agent, and their rows are is_booked
   * anyway so closing them is meaningless.
   */
  const setCities = useCallback(async (
    date: string,
    time: string,
    targetCities: string[],
  ): Promise<SlotMutationResult> => {
    if (!orgId) return { ok: false, message: "No organization in context." };

    const taken = await bookedMarkets(date, time);
    const blocked = blockedCities(targetCities, taken);
    const target = new Set(targetCities.filter((c) => !blocked.includes(c)));

    const enableIds: string[] = [];
    const disableIds: string[] = [];
    for (const c of cityNames) {
      const ids = citiesWithProps.get(c) || [];
      if (!target.has(c) && taken.has(marketOf(c))) continue; // booked → hands off
      (target.has(c) ? enableIds : disableIds).push(...ids);
    }

    if (enableIds.length) {
      const rows = enableIds.map((property_id) => ({
        organization_id: orgId, property_id, slot_date: date, slot_time: time, is_enabled: true,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from("showing_available_slots")
          .upsert(rows.slice(i, i + 200), { onConflict: "organization_id,property_id,slot_date,slot_time" });
        if (error) return { ok: false, message: error.message };
      }
    }
    if (disableIds.length) {
      const { error } = await supabase
        .from("showing_available_slots")
        .update({ is_enabled: false, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .eq("slot_date", date)
        .eq("slot_time", time)
        .eq("is_booked", false)
        .in("property_id", disableIds);
      if (error) return { ok: false, message: error.message };
    }

    const open = [...target];
    return {
      ok: true,
      blocked,
      message: open.length
        ? `${open.join(", ")} open.`
        : "Closed for every city.",
    };
  }, [orgId, bookedMarkets, blockedCities, cityNames, citiesWithProps, marketOf]);

  return {
    loading,
    cityNames,
    cityCounts,
    citiesWithProps,
    cityMarket,
    marketOf,
    bookedMarkets,
    blockedCities,
    setCities,
  };
}
