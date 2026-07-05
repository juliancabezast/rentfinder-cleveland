import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackPropertyView } from "@/lib/trackView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  MapPin, BedDouble, Bath, Search, CheckCircle2, Home as HomeIcon,
  Phone, CalendarCheck, ShieldCheck, Clock, KeyRound, ArrowRight, FileSignature,
  MessageSquare, X, SlidersHorizontal, Plus, List, Map as MapIcon, ChevronDown,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListingsMap } from "@/components/public/ListingsMap";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ApplicationDialog } from "@/components/public/ApplicationDialog";
import { SiteFooter } from "@/components/public/SiteFooter";

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_E164 = "+14404444737";

interface UnitDetail {
  unit_number: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rent_price: number | null;
}

interface Listing {
  key: string;
  address: string;
  city: string;
  state: string;
  zip_code: string | null;
  neighborhood: string;
  units: number;
  status: string;
  section_8_accepted: boolean;
  rent_min: number | null;
  rent_max: number | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  bathrooms_min: number | null;
  bathrooms_max: number | null;
  property_type: string | null;
  coming_soon_date: string | null;
  latitude: number | null;
  longitude: number | null;
  photo: string | null;
  property_id: string;
  unitDetails?: UnitDetail[];
}

/** Expected availability for a Coming Soon home: the date set in Properties,
 *  or a rolling "today + 20 days" until one is set (recomputed on every visit). */
function comingSoonAvailableLabel(l: Listing): string {
  const d = l.coming_soon_date
    ? new Date(`${l.coming_soon_date}T12:00:00`)
    : new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchListings(): Promise<{ listings: Listing[]; areas: string[]; cities: string[] }> {
  const { data, error } = await supabase.functions.invoke("leasing-tracker-lookup", {
    body: { mode: "listings" },
  });
  if (error) throw error;
  const result = data as { listings: Listing[]; areas: string[]; cities: string[] };

  // Per-unit details so multi-family cards can show a row per unit. Anon can
  // read listed properties (RLS: anon_view_listed_properties → available /
  // coming_soon), so one direct query is enough — no edge-function change.
  const { data: props } = await supabase
    .from("properties")
    .select("address, unit_number, bedrooms, bathrooms, rent_price")
    .in("status", ["available", "coming_soon"]);
  const byAddr = new Map<string, UnitDetail[]>();
  for (const p of props || []) {
    const k = ((p as any).address || "").trim().toLowerCase();
    if (!k) continue;
    const arr = byAddr.get(k) || [];
    arr.push({
      unit_number: (p as any).unit_number ?? null,
      bedrooms: (p as any).bedrooms ?? null,
      bathrooms: (p as any).bathrooms != null ? Number((p as any).bathrooms) : null,
      rent_price: (p as any).rent_price ?? null,
    });
    byAddr.set(k, arr);
  }
  for (const l of result.listings) {
    const k = (l.address || "").trim().toLowerCase();
    l.unitDetails = (byAddr.get(k) || [])
      .slice()
      .sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || ""));
  }
  return result;
}

function money(n: number | null): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}
function rentLabel(l: Listing): string {
  if (l.rent_min == null) return "Contact for price";
  if (l.rent_max != null && l.rent_max !== l.rent_min) return `${money(l.rent_min)}–${money(l.rent_max)}/mo`;
  return `${money(l.rent_min)}/mo`;
}
function bedLabel(l: Listing): string {
  const a = l.bedrooms_min, b = l.bedrooms_max;
  if (a == null) return "— bd";
  if (b != null && b !== a) return `${a}–${b} bd`;
  return `${a} bd`;
}
function bathLabel(l: Listing): string {
  const a = l.bathrooms_min;
  if (a == null) return "— ba";
  return `${a % 1 === 0 ? a : a.toFixed(1)} ba`;
}
function titleCaseType(t: string | null): string {
  if (!t) return "Rental home";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Price slider bounds — at full range the filter is off, so
// "Contact for price" homes stay visible.
const PRICE_MIN = 700;
const PRICE_MAX = 2000;

/** Same heuristic as ScheduleShowing: duplex/triplex/fourplex/apartment/multi-unit. */
function isMultiFamilyType(t?: string | null): boolean {
  if (!t) return false;
  const s = t.toLowerCase();
  return s.includes("plex") || s.includes("multi") || s.includes("apart") || s.includes("unit");
}

/* ── Segmented filter cells (Bedrooms / Bathrooms / Property type) ──
   Exact-match semantics: a building whose units span 1–3 bd matches "2".
   "5" means 5+. "0" is Studio. */
function bedMatches(l: Listing, v: string): boolean {
  if (v === "any") return true;
  const min = l.bedrooms_min;
  if (min == null) return false;
  const max = l.bedrooms_max ?? min;
  const n = Number(v);
  if (n === 5) return max >= 5;
  return min <= n && n <= max;
}
function bathMatches(l: Listing, v: string): boolean {
  if (v === "any") return true;
  const min = l.bathrooms_min;
  if (min == null) return false;
  const max = l.bathrooms_max ?? min;
  const n = Number(v);
  if (n === 5) return max >= 5;
  // Forgiving band for half-baths: a 1.5-ba home matches both "1" and "2"
  return Math.floor(min) <= n && n <= Math.ceil(max);
}
function typeMatches(l: Listing, v: string): boolean {
  if (v === "any") return true;
  return isMultiFamilyType(l.property_type) === (v === "multi");
}

const BED_OPTS = [
  { value: "any", label: "Any" }, { value: "0", label: "Studio" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5+" },
];
const BATH_OPTS = [
  { value: "any", label: "Any" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5+" },
];
/** Two-story house glyph (lucide-style stroke) so "Multi-family" reads as a
 *  multi-unit home at a glance — lucide has no literal two-story house. */
function MultiFamilyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11 12 4l9 7" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M5 14.5h14" />
      <path d="M10.5 20v-3h3v3" />
      <path d="M8.4 11.8h.01M15.6 11.8h.01" />
    </svg>
  );
}

const TYPE_OPTS = [
  { value: "any", label: "Any" },
  { value: "single", label: "Single", icon: HomeIcon },
  { value: "multi", label: "Multi", icon: MultiFamilyIcon },
];

/** Shared style for the popover trigger pills in the sticky filter bar. */
const FILTER_PILL =
  "h-12 rounded-full border border-transparent bg-card px-5 text-[15px] font-semibold shadow-sm transition-shadow hover:shadow-md inline-flex items-center justify-between gap-2 whitespace-nowrap";

interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

/** Segmented button row — a padded track with floating pills. The active pill
 *  gets a warm-gray fill and a dark inset outline; the track padding + gaps
 *  keep that outline from colliding with the track edge (no broken corners). */
function SegmentedRow({
  options, value, onChange, ariaLabel,
}: {
  options: SegmentedOption[]; value: string; onChange: (v: string) => void; ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full items-stretch gap-1 rounded-xl border border-stone-300 bg-card p-1"
    >
      {options.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[15px] transition-colors ${
              active
                ? "bg-stone-100 font-semibold text-stone-900 shadow-[inset_0_0_0_2px_#57534e]"
                : o.disabled
                  ? "cursor-not-allowed text-stone-300"
                  : "text-stone-700 hover:bg-stone-50"
            }`}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Panel chrome for the filter popovers: bold title + underlined "Done". */
function FilterPanel({
  title, onDone, children,
}: { title: string; onDone: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[22px] font-extrabold leading-none text-stone-900">{title}</h3>
        <button
          type="button"
          onClick={onDone}
          className="text-[15px] font-bold text-stone-900 underline underline-offset-4 hover:text-stone-600"
        >
          Done
        </button>
      </div>
      {children}
    </div>
  );
}

/** A single listing card. */
function ListingCard({ l, onApply }: { l: Listing; onApply: (l: Listing) => void }) {
  const [imgOk, setImgOk] = useState(true);
  const navigate = useNavigate();
  const coming = l.status === "coming_soon";
  // Whole card is clickable → opens the property page (which records the
  // detail-view). Footer buttons stopPropagation so they keep their own action.
  const openDetail = () => navigate(`/p/schedule-showing/${l.property_id}`);
  return (
    <Card
      onClick={openDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
      className={`overflow-hidden flex flex-col group hover:shadow-lg transition-all cursor-pointer ${
        coming ? "opacity-75 hover:opacity-100" : ""
      }`}
    >
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {l.photo && imgOk ? (
          <img
            src={l.photo}
            alt={`${titleCaseType(l.property_type)} for rent at ${l.address}, ${l.city}`}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 text-primary/60">
            <HomeIcon className="h-10 w-10 mb-1" />
            <span className="text-xs font-medium">{l.neighborhood}</span>
          </div>
        )}
        {coming ? (
          /* Diagonal yellow ribbon — long enough that both ends bleed past
             the container edges (no visible cut ends) */
          <div className="absolute -left-14 top-10 z-10 w-64 -rotate-45 bg-amber-400 py-2 text-center text-sm font-extrabold uppercase tracking-widest text-amber-950 shadow-lg">
            Coming Soon
          </div>
        ) : (
          <div className="absolute top-3 left-3 flex gap-2">
            <Badge className="bg-primary text-primary-foreground">Available</Badge>
          </div>
        )}
        {l.section_8_accepted && (
          <div className="absolute top-3 right-3">
            <Badge variant="secondary" className="bg-white/90 text-primary border border-primary/20">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Section 8
            </Badge>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        {/* Address is the card header */}
        <div className="text-lg font-bold text-foreground leading-tight">{l.address}</div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
          <MapPin className="h-3.5 w-3.5" />{l.neighborhood}, {l.city} {l.zip_code || ""}
        </div>

        {l.unitDetails && l.unitDetails.length > 1 ? (
          /* Multi-family: one row per unit — beds · baths · price */
          <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
            {l.unitDetails.map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="shrink-0 font-semibold text-foreground">
                  {u.unit_number ? `Unit ${u.unit_number}` : `Unit ${i + 1}`}
                </span>
                <span className="flex items-center gap-2.5 text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{u.bedrooms ?? "—"}</span>
                  <span className="inline-flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{u.bathrooms != null ? (u.bathrooms % 1 === 0 ? u.bathrooms : u.bathrooms.toFixed(1)) : "—"}</span>
                  <span className="font-bold text-foreground tabular-nums">{money(u.rent_price)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          /* Single unit: one line — beds · baths · price */
          <div className="mt-3 flex items-center gap-3 border-t border-border pt-2.5 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground"><BedDouble className="h-4 w-4" />{bedLabel(l)}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Bath className="h-4 w-4" />{bathLabel(l)}</span>
            <span className="ml-auto text-base font-bold text-foreground">{rentLabel(l)}</span>
          </div>
        )}
        {coming && (
          <>
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              Expected available ~ {comingSoonAvailableLabel(l)}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Have a Section 8 voucher? You can apply today.
            </div>
          </>
        )}
        <div className="mt-4 pt-3 border-t border-border flex-1 flex flex-col justify-end gap-2">
          {coming ? (
            /* Coming soon: no showings yet — voucher holders can apply early */
            <Button
              className="w-full bg-amber-400 text-amber-950 hover:bg-amber-300 font-bold"
              onClick={(e) => { e.stopPropagation(); onApply(l); }}
            >
              <ShieldCheck className="h-4 w-4 mr-2" /> Apply with Section 8 Voucher
            </Button>
          ) : (
            <>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); onApply(l); }}>
                <FileSignature className="h-4 w-4 mr-2" /> Start Application
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to={`/p/schedule-showing/${l.property_id}`} onClick={(e) => e.stopPropagation()}>
                  <CalendarCheck className="h-4 w-4 mr-2" /> Schedule a Showing
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

const NEIGHBORHOOD_GUIDES: { label: string; href: string }[] = [
  { label: "Slavic Village", href: "/cleveland-rentals/neighborhoods/houses-for-rent-slavic-village-cleveland/" },
  { label: "Collinwood", href: "/cleveland-rentals/neighborhoods/houses-for-rent-collinwood-cleveland/" },
  { label: "Glenville", href: "/cleveland-rentals/neighborhoods/houses-for-rent-glenville-cleveland/" },
  { label: "Buckeye-Shaker", href: "/cleveland-rentals/neighborhoods/houses-for-rent-buckeye-cleveland/" },
  { label: "Old Brooklyn", href: "/cleveland-rentals/neighborhoods/houses-for-rent-old-brooklyn-cleveland/" },
  { label: "Ohio City", href: "/cleveland-rentals/neighborhoods/houses-for-rent-ohio-city-cleveland/" },
  { label: "Tremont", href: "/cleveland-rentals/neighborhoods/houses-for-rent-tremont-cleveland/" },
  { label: "Detroit-Shoreway", href: "/cleveland-rentals/neighborhoods/houses-for-rent-detroit-shoreway-cleveland/" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do you accept Section 8 / Housing Choice Vouchers?",
    a: "Yes — every home listed here accepts Housing Choice Vouchers (Section 8) and is HUD-inspection-ready. Voucher holders are welcome to tour and apply for any available home.",
  },
  {
    q: "How much is rent for a house in Cleveland?",
    a: "The Cleveland rental homes listed here generally run about $700 to $1,800 a month, with most 2- and 3-bedroom homes around $900–$1,300. Rent varies by size, neighborhood, and condition.",
  },
  {
    q: "How do I schedule a showing?",
    a: "Pick any available home above and click “Schedule a Showing” to choose a time, or call us at " + PHONE_DISPLAY + ". Showings are free and there's no obligation.",
  },
  {
    q: "What areas do you serve?",
    a: "You'll find rental homes across Cleveland's East and Southeast side — including Slavic Village, Collinwood, Glenville, Fairfax, Hough and Buckeye-Shaker — plus select West-side homes and homes in Akron, Lorain and Elyria.",
  },
];

export default function RenterHome() {
  useEffect(() => {
    document.title = "Houses for Rent in Cleveland, OH | Section 8 Vouchers Welcome | Rent Finder Cleveland";
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-listings"],
    queryFn: fetchListings,
    staleTime: 5 * 60 * 1000,
  });

  const listings = data?.listings ?? [];

  // Record a real impression for every property shown on the home (raw count,
  // once per listings load). Fire-and-forget; never blocks render.
  useEffect(() => {
    const ids = (data?.listings ?? []).map((l) => l.property_id).filter(Boolean);
    if (ids.length) trackPropertyView("impression", ids);
  }, [data]);

  const [area, setArea] = useState("all");
  const [beds, setBeds] = useState("any");   // exact match; "0" = Studio, "5" = 5+
  const [baths, setBaths] = useState("any"); // exact match; "5" = 5+
  const [zip, setZip] = useState("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [homeType, setHomeType] = useState("any"); // any | single | multi

  // Shared predicate. `skip` lets each control compute its own options
  // against the OTHER active filters (faceted search) — an option only
  // enables if choosing it yields at least one home, so "0 homes"
  // dead-ends are impossible to pick.
  type FacetSkip = "area" | "beds" | "baths" | "zip" | "price" | "type";
  const passes = (l: Listing, skip?: FacetSkip): boolean => {
    const [pMin, pMax] = priceRange;
    const priceFilterOn = pMin > PRICE_MIN || pMax < PRICE_MAX;

    if (skip !== "area" && area !== "all" && l.neighborhood !== area) return false;
    if (skip !== "beds" && !bedMatches(l, beds)) return false;
    if (skip !== "baths" && !bathMatches(l, baths)) return false;
    if (skip !== "zip" && zip !== "all" && l.zip_code !== zip) return false;

    // Price: only filters when the slider moved off the full range, so
    // "Contact for price" (null rent) homes stay visible by default.
    if (skip !== "price" && priceFilterOn) {
      if (l.rent_min == null) return false;
      const hi = l.rent_max ?? l.rent_min;
      const upper = pMax >= PRICE_MAX ? Infinity : pMax; // right thumb at end = no cap
      if (hi < pMin || l.rent_min > upper) return false;
    }

    if (skip !== "type" && !typeMatches(l, homeType)) return false;
    return true;
  };

  // Faceted options: values with ≥1 matching home given the other filters.
  // The currently-selected value is always kept so the control never blanks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const areaOptions = useMemo(() => {
    const opts = [...new Set(
      listings.filter((l) => passes(l, "area")).map((l) => l.neighborhood).filter(Boolean),
    )].sort();
    if (area !== "all" && !opts.includes(area)) opts.push(area);
    return opts;
  }, [listings, area, beds, baths, zip, priceRange, homeType]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zipOptions = useMemo(() => {
    const opts = [...new Set(
      listings.filter((l) => passes(l, "zip")).map((l) => l.zip_code).filter(Boolean) as string[],
    )].sort();
    if (zip !== "all" && !opts.includes(zip)) opts.push(zip);
    return opts;
  }, [listings, area, beds, baths, zip, priceRange, homeType]);

  // Faceted enablement for the segmented cells: a cell is clickable only if
  // choosing it (given the OTHER filters) yields ≥1 home. Current value and
  // "any" always stay enabled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bedEnabled = useMemo(() => new Set([
    "any", beds,
    ...["0", "1", "2", "3", "4", "5"].filter((v) =>
      listings.some((l) => passes(l, "beds") && bedMatches(l, v))),
  ]), [listings, area, beds, baths, zip, priceRange, homeType]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bathEnabled = useMemo(() => new Set([
    "any", baths,
    ...["1", "2", "3", "4", "5"].filter((v) =>
      listings.some((l) => passes(l, "baths") && bathMatches(l, v))),
  ]), [listings, area, beds, baths, zip, priceRange, homeType]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const typeEnabled = useMemo(() => new Set([
    "any", homeType,
    ...["single", "multi"].filter((v) =>
      listings.some((l) => passes(l, "type") && typeMatches(l, v))),
  ]), [listings, area, beds, baths, zip, priceRange, homeType]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    return listings
      .filter((l) => passes(l))
      // Available homes first; every "Coming Soon" sinks to the end
      // (sort is stable, so the original order is kept within each group).
      .sort(
        (a, b) =>
          (a.status === "coming_soon" ? 1 : 0) - (b.status === "coming_soon" ? 1 : 0),
      );
  }, [listings, area, beds, baths, zip, priceRange, homeType]);

  // Free-text search from a `?q=` landing (Sitelinks Search Box → /?q={term}).
  // Layered on top of the faceted filters without touching them.
  const [q] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; }
  });
  const qFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return filtered;
    return filtered.filter((l) =>
      `${l.address} ${l.neighborhood} ${l.city} ${l.zip_code || ""} ${l.property_type || ""}`
        .toLowerCase().includes(s),
    );
  }, [filtered, q]);
  useEffect(() => {
    if (q.trim()) document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
  }, [q]);

  const availableCount = listings.filter((l) => l.status === "available").length;

  const priceActive = priceRange[0] > PRICE_MIN || priceRange[1] < PRICE_MAX;
  const hasActiveFilters =
    area !== "all" || beds !== "any" || baths !== "any" || zip !== "all" ||
    priceActive || homeType !== "any";

  // Badge for the mobile "Filters" button — how many filters are active.
  const activeFilterCount =
    (area !== "all" ? 1 : 0) +
    (beds !== "any" ? 1 : 0) +
    (baths !== "any" ? 1 : 0) +
    (zip !== "all" ? 1 : 0) +
    (priceActive ? 1 : 0) +
    (homeType !== "any" ? 1 : 0);

  // Live summaries shown on the popover trigger pills
  const priceLabel = priceActive
    ? `${money(priceRange[0])} – ${priceRange[1] >= PRICE_MAX ? `${money(PRICE_MAX)}+` : money(priceRange[1])}`
    : "Any price";
  const roomsLabel = beds === "any" && baths === "any"
    ? "Any rooms"
    : [
        beds !== "any" ? (beds === "0" ? "Studio" : `${beds === "5" ? "5+" : beds} bd`) : null,
        baths !== "any" ? `${baths === "5" ? "5+" : baths} ba` : null,
      ].filter(Boolean).join(" · ");
  const typeLabel = homeType === "single" ? "Single-family" : homeType === "multi" ? "Multi-family" : "All homes";

  // Mobile filters bottom-sheet visibility + desktop popover panels
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  // List ⇄ Map view (desktop: segmented toggle; mobile: floating button)
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const resetFilters = () => {
    setArea("all"); setBeds("any"); setBaths("any"); setZip("all");
    setPriceRange([PRICE_MIN, PRICE_MAX]);
    setHomeType("any");
  };

  // Application dialog: the listing the visitor is applying for (null = closed)
  const [applyListing, setApplyListing] = useState<Listing | null>(null);

  // Voucher bottom banner: fixed to the viewport bottom, slides away once the
  // real footer scrolls into view (so it never covers the footer).
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerVisible, setFooterVisible] = useState(false);
  useEffect(() => {
    const el = footerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setFooterVisible(e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Hero — at the very top of the page */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[hsl(239,84%,60%)] text-primary-foreground">
        {/* Background video (muted, looping). The gradient overlay above it keeps
            the brand tint + text contrast; if the video fails to load, the
            section's own gradient background is the fallback. */}
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/header-background.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/85 to-[hsl(239,84%,60%)]/75"
          aria-hidden="true"
        />
        <div className="relative max-w-7xl mx-auto px-5 py-10 lg:py-28 text-center">
          <h1 className="text-[26px] sm:text-3xl lg:text-5xl font-extrabold leading-tight max-w-4xl mx-auto">
            Houses for Rent in Cleveland, OH
          </h1>
          <p className="mt-3 text-sm sm:text-base lg:text-lg opacity-95 max-w-2xl mx-auto">
            Browse available rental homes across Cleveland with a local team that knows every house.
            Every home welcomes Housing Choice Vouchers — tour in person and apply online.
          </p>
        </div>
      </section>

      {/* Sticky brand + filter bar — sits below the hero and pins to the top
          once you scroll past it. Desktop: full inline row. Mobile (<lg):
          compact bar (logo · live count · Filters button) + bottom sheet. */}
      <div className="sticky top-0 z-40 bg-muted/85 backdrop-blur-xl border-b border-border/60">
        {/* ── Mobile compact bar ── */}
        <div className="flex lg:hidden items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/favicon-96.png" alt="Rent Finder Cleveland" className="w-9 h-9 rounded-full" width={36} height={36} />
          </Link>
          <span className="text-[15px] font-extrabold text-primary tabular-nums whitespace-nowrap">
            {qFiltered.length} <span className="font-semibold text-foreground">home{qFiltered.length === 1 ? "" : "s"}</span>
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[13px] font-semibold text-muted-foreground underline underline-offset-2 whitespace-nowrap"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[15px] font-semibold text-foreground shadow-sm active:bg-muted"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Desktop inline row ── */}
        <div className="w-full px-6 py-4 hidden lg:flex flex-wrap lg:flex-nowrap items-end gap-x-5 gap-y-3">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 shrink-0 h-12 self-end">
            <img
              src="/favicon-96.png"
              alt="Rent Finder Cleveland"
              className="w-10 h-10 rounded-full"
              width={40}
              height={40}
            />
            <span className="font-bold text-foreground hidden 2xl:inline whitespace-nowrap">Rent Finder Cleveland</span>
          </Link>

          {/* Area */}
          <div className="flex flex-col gap-1 min-w-0 w-[180px] shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Area</span>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="h-12 w-full rounded-full border-transparent bg-card px-5 text-[15px] font-semibold shadow-sm transition-shadow hover:shadow-md"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[240px] rounded-2xl border-stone-200 p-1.5 shadow-xl">
                <SelectItem value="all" className="rounded-lg text-[15px] py-2.5">All areas</SelectItem>
                {areaOptions.map((a) => <SelectItem key={a} value={a} className="rounded-lg text-[15px] py-2.5">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ZIP */}
          <div className="flex flex-col gap-1 min-w-0 w-[140px] shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">ZIP code</span>
            <Select value={zip} onValueChange={setZip}>
              <SelectTrigger className="h-12 w-full rounded-full border-transparent bg-card px-5 text-[15px] font-semibold shadow-sm transition-shadow hover:shadow-md"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[170px] rounded-2xl border-stone-200 p-1.5 shadow-xl">
                <SelectItem value="all" className="rounded-lg text-[15px] py-2.5">All ZIPs</SelectItem>
                {zipOptions.map((z) => <SelectItem key={z} value={z} className="rounded-lg text-[15px] py-2.5">{z}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Price — popover panel (reference style: title + Done, no extras) */}
          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Price</span>
            <Popover open={priceOpen} onOpenChange={setPriceOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={FILTER_PILL}>
                  <span className={priceActive ? "text-primary" : ""}>{priceLabel}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={10} className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border-stone-200 bg-white p-6 shadow-xl">
                <FilterPanel title="Price" onDone={() => setPriceOpen(false)}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Min</div>
                      <div className="text-[17px] font-bold text-stone-900 tabular-nums">{money(priceRange[0])}</div>
                    </div>
                    <span className="text-stone-400 font-semibold">–</span>
                    <div className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Max</div>
                      <div className="text-[17px] font-bold text-stone-900 tabular-nums">
                        {priceRange[1] >= PRICE_MAX ? `${money(PRICE_MAX)}+` : money(priceRange[1])}
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 px-1 pb-1">
                    <Slider
                      min={PRICE_MIN}
                      max={PRICE_MAX}
                      step={25}
                      value={priceRange}
                      onValueChange={(v) => setPriceRange(v as [number, number])}
                      aria-label="Price range"
                    />
                  </div>
                </FilterPanel>
              </PopoverContent>
            </Popover>
          </div>

          {/* Rooms — Bedrooms + Bathrooms segmented rows (reference style) */}
          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Rooms</span>
            <Popover open={roomsOpen} onOpenChange={setRoomsOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={FILTER_PILL}>
                  <span className={beds !== "any" || baths !== "any" ? "text-primary" : ""}>{roomsLabel}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={10} className="w-[470px] rounded-2xl border-stone-200 bg-white p-6 shadow-xl">
                <FilterPanel title="Rooms" onDone={() => setRoomsOpen(false)}>
                  <div className="mb-2 text-[17px] text-stone-800">Bedrooms</div>
                  <SegmentedRow
                    ariaLabel="Bedrooms"
                    options={BED_OPTS.map((o) => ({ ...o, disabled: !bedEnabled.has(o.value) }))}
                    value={beds}
                    onChange={setBeds}
                  />
                  <div className="mb-2 mt-6 text-[17px] text-stone-800">Bathrooms</div>
                  <SegmentedRow
                    ariaLabel="Bathrooms"
                    options={BATH_OPTS.map((o) => ({ ...o, disabled: !bathEnabled.has(o.value) }))}
                    value={baths}
                    onChange={setBaths}
                  />
                </FilterPanel>
              </PopoverContent>
            </Popover>
          </div>

          {/* Property type — segmented row (reference style) */}
          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Home type</span>
            <Popover open={typeOpen} onOpenChange={setTypeOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={FILTER_PILL}>
                  <span className={homeType !== "any" ? "text-primary" : ""}>{typeLabel}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={10} className="w-[440px] rounded-2xl border-stone-200 bg-white p-6 shadow-xl">
                <FilterPanel title="Property type" onDone={() => setTypeOpen(false)}>
                  <SegmentedRow
                    ariaLabel="Property type"
                    options={TYPE_OPTS.map((o) => ({ ...o, disabled: !typeEnabled.has(o.value) }))}
                    value={homeType}
                    onChange={setHomeType}
                  />
                </FilterPanel>
              </PopoverContent>
            </Popover>
          </div>

          {/* Live results + clear — Clear (✕) always reserves space so the
              bar never grows a second row when filters activate */}
          <div className="flex flex-col gap-1 shrink-0 items-start ml-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Results</span>
            <div className="h-12 flex items-center gap-2">
              <span className="text-[15px] font-extrabold text-primary whitespace-nowrap tabular-nums">
                {qFiltered.length} <span className="font-semibold text-foreground">home{qFiltered.length === 1 ? "" : "s"}</span>
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className={`h-12 px-5 rounded-full border text-[15px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  hasActiveFilters
                    ? "border-transparent bg-card text-foreground shadow-sm hover:shadow-md"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                Clear filters
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile filters bottom sheet ── */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto px-5 pb-6">
          <SheetHeader className="text-left pb-1">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Filters
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 pt-2">
            {/* Area + ZIP side by side (big touch targets) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Area</span>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger className="h-12 w-full rounded-full border-border/60 bg-card px-5 text-[15px] font-semibold shadow-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[15px] py-2.5">All areas</SelectItem>
                    {areaOptions.map((a) => <SelectItem key={a} value={a} className="text-[15px] py-2.5">{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">ZIP code</span>
                <Select value={zip} onValueChange={setZip}>
                  <SelectTrigger className="h-12 w-full rounded-full border-border/60 bg-card px-5 text-[15px] font-semibold shadow-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[15px] py-2.5">All ZIPs</SelectItem>
                    {zipOptions.map((z) => <SelectItem key={z} value={z} className="text-[15px] py-2.5">{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[17px] text-stone-800">Price</span>
                <span className="text-[15px] font-bold text-primary tabular-nums">
                  {money(priceRange[0])} – {priceRange[1] >= PRICE_MAX ? `${money(PRICE_MAX)}+` : money(priceRange[1])}
                </span>
              </div>
              <div className="px-1 py-2">
                <Slider
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={25}
                  value={priceRange}
                  onValueChange={(v) => setPriceRange(v as [number, number])}
                  aria-label="Price range"
                />
              </div>
            </div>

            {/* Bedrooms / Bathrooms — segmented rows (reference style) */}
            <div className="space-y-2">
              <span className="text-[17px] text-stone-800">Bedrooms</span>
              <SegmentedRow
                ariaLabel="Bedrooms"
                options={BED_OPTS.map((o) => ({ ...o, disabled: !bedEnabled.has(o.value) }))}
                value={beds}
                onChange={setBeds}
              />
            </div>
            <div className="space-y-2">
              <span className="text-[17px] text-stone-800">Bathrooms</span>
              <SegmentedRow
                ariaLabel="Bathrooms"
                options={BATH_OPTS.map((o) => ({ ...o, disabled: !bathEnabled.has(o.value) }))}
                value={baths}
                onChange={setBaths}
              />
            </div>

            {/* Property type — segmented row */}
            <div className="space-y-2">
              <span className="text-[17px] text-stone-800">Property type</span>
              <SegmentedRow
                ariaLabel="Property type"
                options={TYPE_OPTS.map((o) => ({ ...o, disabled: !typeEnabled.has(o.value) }))}
                value={homeType}
                onChange={setHomeType}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {hasActiveFilters && (
                <Button variant="outline" className="h-12 rounded-xl px-4" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1.5" /> Clear
                </Button>
              )}
              <Button className="flex-1 h-12 rounded-xl text-[15px] font-semibold" onClick={() => setFiltersOpen(false)}>
                Show {qFiltered.length} home{qFiltered.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Listings */}
      <section id="listings" className="max-w-7xl mx-auto px-5 py-12 scroll-mt-20">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Available Cleveland rentals</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {isLoading ? "Loading homes…" : `${qFiltered.length} home${qFiltered.length === 1 ? "" : "s"} matching your search`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>
            )}
            {/* Desktop List | Map segmented toggle */}
            <div className="hidden lg:inline-flex rounded-full border border-border/60 bg-muted/70 p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold transition-colors ${
                  viewMode === "list"
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-4 w-4" /> List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                aria-pressed={viewMode === "map"}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold transition-colors ${
                  viewMode === "map"
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapIcon className="h-4 w-4" /> Map
              </button>
            </div>
          </div>
        </div>

        {viewMode === "map" ? (
          <ListingsMap
            listings={qFiltered}
            onApply={(l) => setApplyListing(l as Listing)}
            className="h-[calc(100vh-230px)] min-h-[440px] overflow-hidden rounded-2xl border border-border shadow-sm"
          />
        ) : isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[4/3] w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-40" /><Skeleton className="h-9 w-full mt-2" />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">We couldn't load listings right now. Call us at{" "}
              <a href={`tel:${PHONE_E164}`} className="text-primary font-semibold">{PHONE_DISPLAY}</a> and we'll help you find a home.</p>
          </Card>
        ) : qFiltered.length === 0 ? (
          <Card className="p-8 text-center">
            <HomeIcon className="h-10 w-10 text-primary/50 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No homes match those filters right now.</p>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              We add homes that welcome vouchers regularly. Tell us what you're looking for and we'll reach out when something fits.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" onClick={resetFilters}>Clear filters</Button>
              <Button asChild><Link to="/p/book-showing">Tell us what you need</Link></Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {qFiltered.map((l) => <ListingCard key={l.key} l={l} onApply={setApplyListing} />)}
          </div>
        )}

        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link to="/p/book-showing">See all showing times <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
          </Button>
        </div>
      </section>

      {/* Trust strip — moved below the listings so the hero flows straight into homes */}
      <section className="border-y border-border bg-card">
        <div className="max-w-7xl mx-auto px-5 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { icon: HomeIcon, big: "90+", small: "Rental homes listed" },
            { icon: ShieldCheck, big: "100%", small: "Accept Section 8 vouchers" },
            { icon: MapPin, big: "Greater", small: "Cleveland & suburbs" },
            { icon: Clock, big: "Fast", small: "Local team, quick replies" },
          ].map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <s.icon className="h-6 w-6 text-primary" />
              <div className="text-xl font-extrabold text-foreground">{s.big}</div>
              <div className="text-xs text-muted-foreground">{s.small}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Why us */}
      <section className="bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-5 py-14">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground">Why rent with Rent Finder Cleveland</h2>
          <div className="grid gap-6 md:grid-cols-3 mt-8">
            {[
              { icon: CheckCircle2, title: "Every home takes Section 8", body: "Every home on this site accepts Housing Choice Vouchers and is HUD-inspection-ready, so voucher holders can rent with confidence." },
              { icon: KeyRound, title: "Real local team", body: "We're a real Cleveland team, not a faceless national site. Reach a real person and tour homes in person." },
              { icon: CalendarCheck, title: "Easy showings & online apply", body: "Book a free showing online in seconds, then apply through our secure application portal when you find the one." },
            ].map((c, i) => (
              <Card key={i} className="p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <c.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-foreground">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{c.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Explore by neighborhood — links into the static content hub */}
      <section className="max-w-7xl mx-auto px-5 py-14">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center">Explore Cleveland rentals by neighborhood</h2>
        <p className="text-muted-foreground text-center mt-2 max-w-2xl mx-auto">
          Rent ranges, transit, and what to know about renting in each area — plus guides on Section 8, deposits, and applying.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5 mt-6">
          {NEIGHBORHOOD_GUIDES.map((n) => (
            <a key={n.href} href={n.href}
              className="px-4 py-2 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors">
              {n.label}
            </a>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mt-8 max-w-4xl mx-auto">
          <a href="/houses-for-rent-cleveland-oh/" className="block">
            <Card className="p-5 h-full hover:shadow-md transition-shadow">
              <HomeIcon className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold text-foreground">Houses for Rent</h3>
              <p className="text-sm text-muted-foreground mt-1">Homes by neighborhood, budget, and bedrooms.</p>
            </Card>
          </a>
          <a href="/section-8-housing-cleveland-oh/" className="block">
            <Card className="p-5 h-full hover:shadow-md transition-shadow">
              <ShieldCheck className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold text-foreground">Section 8 Housing</h3>
              <p className="text-sm text-muted-foreground mt-1">How vouchers work in Cleveland and how to rent with one.</p>
            </Card>
          </a>
          <a href="/cleveland-rentals/" className="block">
            <Card className="p-5 h-full hover:shadow-md transition-shadow">
              <Search className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold text-foreground">Renter Guides</h3>
              <p className="text-sm text-muted-foreground mt-1">Deposits, applications, credit, utilities, tenant rights.</p>
            </Card>
          </a>
        </div>
      </section>

      {/* FAQ — separated white cards on soft gray, circled "+" that rotates
          to "×" when open (reference: classic marketplace FAQ style) */}
      <section className="bg-muted/70 border-y border-border">
        <div className="max-w-4xl mx-auto px-5 py-14">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-10">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="w-full space-y-4">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-2xl border border-border/70 bg-card px-5 md:px-7 shadow-sm transition-shadow data-[state=open]:shadow-md"
              >
                <AccordionTrigger className="py-5 md:py-6 text-left text-base md:text-xl font-bold gap-4 hover:no-underline [&>svg]:hidden [&[data-state=open]_.faq-plus]:rotate-45">
                  <span className="faq-plus flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full border-2 border-sky-400 text-sky-500 transition-transform duration-300">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="flex-1">{f.q}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-6 pl-[52px] md:pl-14 pr-2 text-[15px] leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-5 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">Find your next Cleveland home</h2>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          Book a free showing or tell our local leasing team what you're looking for — we welcome housing vouchers.
        </p>
        <div className="flex gap-3 justify-center flex-wrap mt-6">
          <Button asChild size="lg"><Link to="/p/book-showing"><CalendarCheck className="h-4 w-4 mr-2" />Schedule a Showing</Link></Button>
          <Button asChild size="lg" variant="outline"><a href={`tel:${PHONE_E164}`}><Phone className="h-4 w-4 mr-2" />Call {PHONE_DISPLAY}</a></Button>
        </div>
      </section>

      {/* Footer — SEO-rich internal linking into the content hub */}
      <div ref={footerRef}>
        <SiteFooter />
      </div>

      {/* Mobile view switcher — single floating button offering the OTHER view */}
      <button
        type="button"
        onClick={() => {
          setViewMode((v) => (v === "list" ? "map" : "list"));
          document.getElementById("listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="lg:hidden fixed bottom-28 left-1/2 z-40 -translate-x-1/2 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-bold text-background shadow-xl active:scale-95 transition-transform"
      >
        {viewMode === "list" ? (
          <>
            <MapIcon className="h-4.5 w-4.5" /> Map
          </>
        ) : (
          <>
            <List className="h-4.5 w-4.5" /> List
          </>
        )}
      </button>

      {/* Voucher sticky banner — pinned to the bottom, hides at the footer */}
      <div
        className={`fixed bottom-0 inset-x-0 z-40 transition-all duration-300 ${
          footerVisible ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="bg-emerald-600 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.18)]">
          <div className="max-w-7xl mx-auto px-5 py-2.5 lg:py-3 flex flex-col lg:flex-row items-center justify-center gap-2 lg:gap-5 text-center">
            <p className="text-sm md:text-base font-semibold leading-snug">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Have a Section 8 voucher?
              </span>
              <br />
              We handle everything for you.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold">
                <a href={`sms:${PHONE_E164}`}>
                  <MessageSquare className="h-4 w-4 mr-1.5" />
                  Text us at {PHONE_DISPLAY}
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-white/70 bg-transparent text-white hover:bg-white/15 hover:text-white font-semibold">
                <a href={`tel:${PHONE_E164}`}>
                  <Phone className="h-4 w-4 mr-1.5" />
                  Call
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Rental application — 4-step, progressive save */}
      <ApplicationDialog
        open={!!applyListing}
        onOpenChange={(o) => { if (!o) setApplyListing(null); }}
        propertyId={applyListing?.property_id ?? ""}
        propertyLabel={applyListing ? `${applyListing.address}, ${applyListing.city}` : undefined}
        comingSoon={applyListing?.status === "coming_soon"}
      />
    </div>
  );
}
