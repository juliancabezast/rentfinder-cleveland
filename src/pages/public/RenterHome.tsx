import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  MessageSquare, X,
} from "lucide-react";
import { ApplicationDialog } from "@/components/public/ApplicationDialog";
import { SiteFooter } from "@/components/public/SiteFooter";

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_E164 = "+14404444737";

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
  photo: string | null;
  property_id: string;
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
  return data as { listings: Listing[]; areas: string[]; cities: string[] };
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

/** A single listing card. */
function ListingCard({ l, onApply }: { l: Listing; onApply: (l: Listing) => void }) {
  const [imgOk, setImgOk] = useState(true);
  const coming = l.status === "coming_soon";
  return (
    <Card
      className={`overflow-hidden flex flex-col group hover:shadow-lg transition-all ${
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
        <div className="text-lg font-bold text-foreground">{rentLabel(l)}</div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
          <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4" />{bedLabel(l)}</span>
          <span className="inline-flex items-center gap-1"><Bath className="h-4 w-4" />{bathLabel(l)}</span>
          <span className="inline-flex items-center gap-1"><HomeIcon className="h-4 w-4" />{titleCaseType(l.property_type)}</span>
        </div>
        <div className="mt-2 text-sm text-foreground font-medium">{l.address}</div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />{l.neighborhood}, {l.city} {l.zip_code || ""}
        </div>
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
              onClick={() => onApply(l)}
            >
              <ShieldCheck className="h-4 w-4 mr-2" /> Apply with Section 8 Voucher
            </Button>
          ) : (
            <>
              <Button className="w-full" onClick={() => onApply(l)}>
                <FileSignature className="h-4 w-4 mr-2" /> Start Application
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to={`/p/schedule-showing/${l.property_id}`}>
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

  const [area, setArea] = useState("all");
  const [beds, setBeds] = useState("any");
  const [zip, setZip] = useState("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [showSingle, setShowSingle] = useState(true);
  const [showMulti, setShowMulti] = useState(true);

  // Shared predicate. `skip` lets each dropdown compute its own options
  // against the OTHER active filters (faceted search) — an option only shows
  // if choosing it yields at least one home, so "0 homes" dead-ends are
  // impossible to pick.
  type FacetSkip = "area" | "beds" | "zip" | "price" | "type";
  const passes = (l: Listing, skip?: FacetSkip): boolean => {
    const [pMin, pMax] = priceRange;
    const priceFilterOn = pMin > PRICE_MIN || pMax < PRICE_MAX;

    if (skip !== "area" && area !== "all" && l.neighborhood !== area) return false;
    if (skip !== "beds" && beds !== "any" && (l.bedrooms_max ?? 0) < Number(beds)) return false;
    if (skip !== "zip" && zip !== "all" && l.zip_code !== zip) return false;

    // Price: only filters when the slider moved off the full range, so
    // "Contact for price" (null rent) homes stay visible by default.
    if (skip !== "price" && priceFilterOn) {
      if (l.rent_min == null) return false;
      const hi = l.rent_max ?? l.rent_min;
      const upper = pMax >= PRICE_MAX ? Infinity : pMax; // right thumb at end = no cap
      if (hi < pMin || l.rent_min > upper) return false;
    }

    if (skip !== "type") {
      const multi = isMultiFamilyType(l.property_type);
      if (multi && !showMulti) return false;
      if (!multi && !showSingle) return false;
    }
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
  }, [listings, area, beds, zip, priceRange, showSingle, showMulti]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zipOptions = useMemo(() => {
    const opts = [...new Set(
      listings.filter((l) => passes(l, "zip")).map((l) => l.zip_code).filter(Boolean) as string[],
    )].sort();
    if (zip !== "all" && !opts.includes(zip)) opts.push(zip);
    return opts;
  }, [listings, area, beds, zip, priceRange, showSingle, showMulti]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bedOptions = useMemo(() => {
    const pool = listings.filter((l) => passes(l, "beds"));
    const opts = ["1", "2", "3", "4"].filter((b) =>
      pool.some((l) => (l.bedrooms_max ?? 0) >= Number(b)),
    );
    if (beds !== "any" && !opts.includes(beds)) opts.push(beds);
    return opts;
  }, [listings, area, beds, zip, priceRange, showSingle, showMulti]);

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
  }, [listings, area, beds, zip, priceRange, showSingle, showMulti]);

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

  const hasActiveFilters =
    area !== "all" || beds !== "any" || zip !== "all" ||
    priceRange[0] > PRICE_MIN || priceRange[1] < PRICE_MAX ||
    !showSingle || !showMulti;

  const resetFilters = () => {
    setArea("all"); setBeds("any"); setZip("all");
    setPriceRange([PRICE_MIN, PRICE_MAX]);
    setShowSingle(true); setShowMulti(true);
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
        <div className="relative max-w-7xl mx-auto px-5 py-20 md:py-28 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight max-w-4xl mx-auto">
            Houses for Rent in Cleveland, OH
          </h1>
          <p className="mt-4 text-base md:text-lg opacity-95 max-w-2xl mx-auto">
            Browse available rental homes across Cleveland with a local team that knows every house.
            Every home welcomes Housing Choice Vouchers — tour in person and apply online.
          </p>
        </div>
      </section>

      {/* Sticky brand + filter bar — sits below the hero and pins to the top
          once you scroll past it. Every control is labeled, sized to breathe,
          and the row stretches edge-to-edge (results counter fills the right). */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border shadow-sm">
        {/* Single row on desktop (lg:flex-nowrap): selects shrink instead of
            pushing Results to a new line; the Clear ✕ always reserves its
            space so toggling filters never reflows the bar. */}
        <div className="w-full px-6 py-4 flex flex-wrap lg:flex-nowrap items-end gap-x-5 gap-y-3">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 shrink-0 h-11 self-end">
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
          <div className="flex flex-col gap-1 min-w-0 flex-1 basis-[150px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Area</span>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="h-11 w-full text-[15px] font-medium"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[260px]">
                <SelectItem value="all" className="text-[15px] py-2.5">All areas</SelectItem>
                {areaOptions.map((a) => <SelectItem key={a} value={a} className="text-[15px] py-2.5">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Beds */}
          <div className="flex flex-col gap-1 min-w-0 flex-1 basis-[100px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Beds</span>
            <Select value={beds} onValueChange={setBeds}>
              <SelectTrigger className="h-11 w-full text-[15px] font-medium"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[160px]">
                <SelectItem value="any" className="text-[15px] py-2.5">Any</SelectItem>
                {bedOptions.map((b) => (
                  <SelectItem key={b} value={b} className="text-[15px] py-2.5">{b}+ beds</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ZIP */}
          <div className="flex flex-col gap-1 min-w-0 flex-1 basis-[115px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">ZIP code</span>
            <Select value={zip} onValueChange={setZip}>
              <SelectTrigger className="h-11 w-full text-[15px] font-medium"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[180px]">
                <SelectItem value="all" className="text-[15px] py-2.5">All ZIPs</SelectItem>
                {zipOptions.map((z) => <SelectItem key={z} value={z} className="text-[15px] py-2.5">{z}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Price range — dual-thumb slider; live values shown in the label */}
          <div className="flex flex-col gap-1 min-w-0 flex-[1.6] basis-[230px]">
            <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">
              Price
              <span className="text-[15px] font-bold normal-case tracking-normal text-primary tabular-nums">
                {money(priceRange[0])} – {priceRange[1] >= PRICE_MAX ? `${money(PRICE_MAX)}+` : money(priceRange[1])}
              </span>
            </span>
            <div className="h-11 flex items-center px-1.5">
              <Slider
                min={PRICE_MIN}
                max={PRICE_MAX}
                step={50}
                value={priceRange}
                onValueChange={(v) => setPriceRange(v as [number, number])}
                className="flex-1"
                aria-label="Price range"
              />
            </div>
          </div>

          {/* Single / Multi-family toggles */}
          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">Home type</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setShowSingle((v) => !v)}
                aria-pressed={showSingle}
                className={`px-4 h-11 rounded-lg text-[15px] font-semibold border transition-colors whitespace-nowrap ${
                  showSingle
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                Single-family
              </button>
              <button
                type="button"
                onClick={() => setShowMulti((v) => !v)}
                aria-pressed={showMulti}
                className={`px-4 h-11 rounded-lg text-[15px] font-semibold border transition-colors whitespace-nowrap ${
                  showMulti
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                Multi-family
              </button>
            </div>
          </div>

          {/* Live results + clear — Clear (✕) always reserves space so the
              bar never grows a second row when filters activate */}
          <div className="flex flex-col gap-1 shrink-0 items-end ml-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Results</span>
            <div className="h-11 flex items-center gap-2">
              <span className="text-[15px] font-extrabold text-primary whitespace-nowrap tabular-nums">
                {qFiltered.length} <span className="font-semibold text-foreground">home{qFiltered.length === 1 ? "" : "s"}</span>
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className={`h-11 px-4 rounded-xl border text-[15px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  hasActiveFilters
                    ? "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-foreground/30"
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

      {/* Listings */}
      <section id="listings" className="max-w-7xl mx-auto px-5 py-12 scroll-mt-20">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Available Cleveland rentals</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {isLoading ? "Loading homes…" : `${qFiltered.length} home${qFiltered.length === 1 ? "" : "s"} matching your search`}
            </p>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>
          )}
        </div>

        {isLoading ? (
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

      {/* FAQ */}
      <section className="bg-card border-y border-border">
        <div className="max-w-3xl mx-auto px-5 py-14">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-8">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
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

      {/* Voucher sticky banner — pinned to the bottom, hides at the footer */}
      <div
        className={`fixed bottom-0 inset-x-0 z-40 transition-all duration-300 ${
          footerVisible ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="bg-emerald-600 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.18)]">
          <div className="max-w-7xl mx-auto px-5 py-3 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5 text-center">
            <p className="text-sm md:text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              Have a Section 8 voucher? We handle everything for you.
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
