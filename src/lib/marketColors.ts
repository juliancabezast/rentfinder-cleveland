/**
 * One colour per MARKET, so a glance at the Showings screen says which city a
 * slot belongs to without reading the label.
 *
 * Keyed by market, not by raw city: Cleveland and East Cleveland are the same
 * market (one person covers both), so they share a colour on purpose — the
 * label still says which municipality it is. Anything unmapped stays slate, so
 * adding a city never paints it a misleading colour.
 *
 * Tailwind can only see class names it finds as complete literals, so every
 * class here is written out rather than composed.
 */
export interface MarketTone {
  /** Full cell surface: background + border + text. */
  cell: string;
  /** Small inline tag next to a name. */
  tag: string;
  /** Text-only accent (times, headings). */
  text: string;
  /** Legend / chip swatch. */
  swatch: string;
}

const CLEVELAND: MarketTone = {
  cell: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",
  tag: "bg-blue-100 text-blue-700 border-blue-200",
  text: "text-blue-700",
  swatch: "bg-blue-100 border-blue-300",
};

const MILWAUKEE: MarketTone = {
  cell: "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100",
  tag: "bg-purple-100 text-purple-700 border-purple-200",
  text: "text-purple-700",
  swatch: "bg-purple-100 border-purple-300",
};

const OTHER: MarketTone = {
  cell: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
  tag: "bg-slate-100 text-slate-600 border-slate-200",
  text: "text-slate-600",
  swatch: "bg-slate-100 border-slate-300",
};

const BY_MARKET: Record<string, MarketTone> = {
  cleveland: CLEVELAND,
  milwaukee: MILWAUKEE,
};

/**
 * Tone for a city (or market). Pass the market when you have it; otherwise the
 * city is normalised the same way `properties.market` is generated, so
 * "East Cleveland" resolves to the Cleveland tone either way.
 */
export function marketTone(cityOrMarket: string | null | undefined): MarketTone {
  const key = (cityOrMarket || "").trim().toLowerCase();
  if (!key) return OTHER;
  if (key === "cleveland" || key === "east cleveland") return CLEVELAND;
  return BY_MARKET[key] ?? OTHER;
}

/** The markets that have a colour of their own — drives the grid legend. */
export const TONED_MARKETS: { label: string; tone: MarketTone }[] = [
  { label: "Cleveland", tone: CLEVELAND },
  { label: "Milwaukee", tone: MILWAUKEE },
];
