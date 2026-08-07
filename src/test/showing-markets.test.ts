import { describe, it, expect } from "vitest";
import fs from "fs";
import { marketTone, splitSurface, TONED_MARKETS } from "@/lib/marketColors";

// Guards for the two rules the owner asked for on 2026-08-07:
//   1. Cities schedule independently — a different person shows in each, so a
//      Milwaukee booking must not close Cleveland at the same hour.
//   2. Nobody self-books more than 2 showings in one day.
//
// Both are enforced in SQL and in the booking paths, so these read the real
// sources (the repo's existing convention — see campaigns.test.tsx). They exist
// to catch a silent revert to the old org-wide "single agent" model, which is
// the failure that would quietly hand one city's hours to another.

const MARKET_MIGRATION = "supabase/migrations/20260807191558_showings_market_scoped_agent_slot.sql";
const CAP_MIGRATION = "supabase/migrations/20260807192427_showings_daily_cap_per_lead.sql";
const read = (p: string) => fs.readFileSync(p, "utf-8");

describe("market-scoped showing exclusivity", () => {
  it("properties.market groups Cleveland with East Cleveland and leaves other cities alone", () => {
    const sql = read(MARKET_MIGRATION);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS market text");
    expect(sql).toContain("GENERATED ALWAYS AS");
    // The grouping itself — case/whitespace tolerant so a typo'd city still lands.
    expect(sql).toContain("lower(btrim(city)) IN ('cleveland', 'east cleveland')");
    expect(sql).toContain("THEN 'Cleveland'");
    expect(sql).toContain("ELSE btrim(city)");
  });

  it("the agent-slot trigger only collides INSIDE a market", () => {
    const sql = read(MARKET_MIGRATION);
    expect(sql).toContain("sp.market IS NOT DISTINCT FROM new_market");
    // Group tours (same property, same instant) must still be allowed.
    expect(sql).toContain("s.property_id <> NEW.property_id");
    // App layers map this to a 409; changing the code would break both.
    expect(sql).toContain("showing_slot_conflict");
    expect(sql).toContain("ERRCODE = '23505'");
  });

  it("one renter still cannot hold two showings at the same instant", () => {
    // Dropping the org-wide lock opened this hole: without the guard a lead
    // could book Cleveland 4pm AND Milwaukee 4pm.
    const sql = read(MARKET_MIGRATION);
    expect(sql).toContain("showing_lead_conflict");
    expect(sql).toContain("s.lead_id = NEW.lead_id");
  });

  it("book-public-showing confines every block to the booked property's market", () => {
    const fn = read("supabase/functions/book-public-showing/index.ts");
    expect(fn).toContain("marketPropertyIds");
    // Backstop + fan-out + the two buffer loops = 4 scoped queries. Any of them
    // left org-wide would still close the other city.
    const scoped = fn.match(/\.in\("property_id", marketPropertyIds\)/g) || [];
    expect(scoped.length).toBeGreaterThanOrEqual(4);
  });

  it("the admin dialog resolves the market before blocking", () => {
    const dlg = read("src/components/showings/ScheduleShowingDialog.tsx");
    expect(dlg).toContain("fetchMarketPropertyIds");
    expect(dlg).toContain('.in("property_id", marketPropertyIds)');
    // The "agent busy" snapshot must be market-scoped too, or the admin UI
    // would grey out times another city's booking took.
    expect(dlg).toContain('.in("property_id", marketIds)');
  });

  it("the grid and the agenda share one per-city implementation", () => {
    const hook = read("src/hooks/useSlotCities.ts");
    expect(hook).toContain("bookedMarkets");
    expect(hook).toContain("setCities");
    const agenda = read("src/components/showings/ShowingsAgenda.tsx");
    expect(agenda).toContain('from "@/hooks/useSlotCities"');
  });

  it("a booked grid cell still offers the other cities", () => {
    const grid = read("src/components/showings/ManageSlotsTab.tsx");
    // The old code rendered `) : null` for booked cells — no city controls at
    // all, which is exactly what the owner hit.
    expect(grid).toContain("toggleableCities");
    expect(grid).toContain("lockedCities");
    expect(grid).not.toContain("Close this time (all cities)\n            </Button>\n            </>\n          ) : !isBooked ? (");
  });
});

describe("daily cap: 2 self-booked showings per person", () => {
  it("caps public_link bookings at 2 per Cleveland day, overridable per org", () => {
    const sql = read(CAP_MIGRATION);
    expect(sql).toContain("enforce_showing_daily_cap");
    expect(sql).toContain("BEFORE INSERT ON public.showings");
    expect(sql).toContain("NEW.booking_source IS DISTINCT FROM 'public_link'");
    expect(sql).toContain("max_showings_per_day_per_lead");
    expect(sql).toContain("America/New_York");
    expect(sql).toContain("showing_daily_cap");
  });

  it("the public page stops offering a 3rd same-day stop", () => {
    const page = read("src/pages/public/ScheduleShowing.tsx");
    expect(page).toContain("const MAX_TOUR_STOPS = 2;");
  });

  it("the booking endpoint explains the cap instead of blaming the time", () => {
    const fn = read("supabase/functions/book-public-showing/index.ts");
    expect(fn).toContain('dbMsg.includes("showing_daily_cap")');
    expect(fn).toContain('code: "daily_cap"');
    expect(fn).toContain('dbMsg.includes("showing_lead_conflict")');
  });
});

describe("market colours", () => {
  it("Cleveland is blue and East Cleveland shares it (same market, same person)", () => {
    const cle = marketTone("Cleveland");
    expect(cle.cell).toContain("blue");
    expect(marketTone("East Cleveland")).toEqual(cle);
    // Case and stray whitespace must not fall through to the neutral tone.
    expect(marketTone("  east cleveland ")).toEqual(cle);
  });

  it("Milwaukee is purple and distinct from Cleveland", () => {
    const mil = marketTone("Milwaukee");
    expect(mil.cell).toContain("purple");
    expect(mil.cell).not.toEqual(marketTone("Cleveland").cell);
  });

  it("an unmapped city stays neutral rather than borrowing a colour", () => {
    for (const c of ["Detroit", "Akron", "", null, undefined]) {
      expect(marketTone(c).cell).toContain("slate");
    }
  });

  it("the legend lists exactly the toned markets", () => {
    expect(TONED_MARKETS.map((m) => m.label)).toEqual(["Cleveland", "Milwaukee"]);
  });
});

describe("a slot booked in two cities at once", () => {
  it("splits the cell so each market gets its own side", () => {
    const bg = splitSurface([marketTone("Cleveland"), marketTone("Milwaukee")]);
    expect(bg).toBeDefined();
    expect(bg).toContain("linear-gradient(90deg");
    // Cleveland's blue-50 on the left, Milwaukee's purple-50 on the right.
    expect(bg!.indexOf("#EFF6FF")).toBeLessThan(bg!.indexOf("#FAF5FF"));
    // A hairline divider, or two pale tints would blur into one another.
    expect(bg).toContain("#CBD5E1");
  });

  it("leaves a single market to its plain class (so hover still works)", () => {
    expect(splitSurface([marketTone("Cleveland")])).toBeUndefined();
    expect(splitSurface([])).toBeUndefined();
  });

  it("handles three markets in equal bands", () => {
    const bg = splitSurface([marketTone("Cleveland"), marketTone("Milwaukee"), marketTone("Detroit")]);
    expect(bg).toContain("33.33");
    expect(bg).toContain("66.66");
  });
});
