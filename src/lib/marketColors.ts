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
  /** The raw background colour, for cells that must blend two markets. */
  surface: string;
  /** Small inline tag next to a name. */
  tag: string;
  /** Text-only accent (times, headings). */
  text: string;
  /** Legend / chip swatch. */
  swatch: string;
}

const CLEVELAND: MarketTone = {
  cell: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",
  surface: "#EFF6FF", // blue-50
  tag: "bg-blue-100 text-blue-700 border-blue-200",
  text: "text-blue-700",
  swatch: "bg-blue-100 border-blue-300",
};

// Fuchsia, not purple. The first pass used purple-600 (#9333EA) next to the
// indigo brand colour, and the palette validator measured that pair at ΔE 0.9
// for protanopia and 11.8 for normal vision — below the 15 floor, i.e. two
// colours most people cannot tell apart and a red-blind reader sees as one.
// #A21CAF (fuchsia-700) reads as the same "morado" and measures 9.5 / 18.2:
// all six checks pass. Keep this in step with the chart series colour.
const MILWAUKEE: MarketTone = {
  cell: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800 hover:bg-fuchsia-100",
  surface: "#FDF4FF", // fuchsia-50
  tag: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  text: "text-fuchsia-700",
  swatch: "bg-fuchsia-100 border-fuchsia-300",
};

const OTHER: MarketTone = {
  cell: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
  surface: "#F8FAFC", // slate-50
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

/**
 * Background for a slot that is booked in MORE THAN ONE market at the same
 * time — now possible, because each city has its own person. Splits the cell
 * into equal vertical bands, one per market, with a hairline divider so the
 * boundary reads even between two pale tints.
 *
 * Returns undefined for zero or one market: those use the plain `cell` class,
 * which keeps the hover state Tailwind gives us for free.
 */
export function splitSurface(tones: MarketTone[]): string | undefined {
  if (tones.length < 2) return undefined;
  const DIVIDER = "#CBD5E1"; // slate-300
  const band = 100 / tones.length;
  const stops: string[] = [];
  tones.forEach((t, i) => {
    const from = i * band;
    const to = (i + 1) * band;
    // Pull each band half a pixel off the seam so the divider sits between.
    stops.push(`${t.surface} ${i === 0 ? "0%" : `calc(${from}% + 0.5px)`} ${i === tones.length - 1 ? "100%" : `calc(${to}% - 0.5px)`}`);
    if (i < tones.length - 1) {
      stops.push(`${DIVIDER} calc(${to}% - 0.5px) calc(${to}% + 0.5px)`);
    }
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
