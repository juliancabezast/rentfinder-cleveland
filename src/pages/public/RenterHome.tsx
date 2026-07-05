import { useState, useEffect, useMemo } from "react";
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
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Building2, MapPin, BedDouble, Bath, Search, CheckCircle2, Home as HomeIcon,
  Phone, CalendarCheck, ShieldCheck, Clock, KeyRound, ArrowRight,
} from "lucide-react";

const PHONE_DISPLAY = "(216) 201-9201";
const PHONE_E164 = "+12162019201";
const EMAIL = "support@rentfindercleveland.com";

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
  photo: string | null;
  property_id: string;
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

/** A single listing card. */
function ListingCard({ l }: { l: Listing }) {
  const [imgOk, setImgOk] = useState(true);
  const coming = l.status === "coming_soon";
  return (
    <Card className="overflow-hidden flex flex-col group hover:shadow-lg transition-shadow">
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
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className={coming ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}>
            {coming ? "Coming Soon" : "Available"}
          </Badge>
        </div>
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
        <div className="mt-4 pt-3 border-t border-border flex-1 flex items-end">
          <Button asChild className="w-full">
            <Link to={`/p/schedule-showing/${l.property_id}`}>
              <CalendarCheck className="h-4 w-4 mr-2" /> Schedule a Showing
            </Link>
          </Button>
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
    a: "Yes — every home we manage accepts Housing Choice Vouchers (Section 8) and is HUD-inspection-ready. Voucher holders are welcome to tour and apply for any available home.",
  },
  {
    q: "How much is rent for a house in Cleveland?",
    a: "Our Cleveland rental homes generally run about $700 to $1,800 a month, with most 2- and 3-bedroom homes around $900–$1,300. Rent varies by size, neighborhood, and condition.",
  },
  {
    q: "How do I schedule a showing?",
    a: "Pick any available home above and click “Schedule a Showing” to choose a time, or call us at " + PHONE_DISPLAY + ". Showings are free and there's no obligation.",
  },
  {
    q: "What areas do you serve?",
    a: "We manage rental homes across Cleveland's East and Southeast side — including Slavic Village, Collinwood, Glenville, Fairfax, Hough and Buckeye-Shaker — plus select West-side homes and homes in Akron, Lorain and Elyria.",
  },
];

export default function RenterHome() {
  useEffect(() => {
    document.title = "Houses for Rent in Cleveland, OH | Section 8 Friendly | Rent Finder Cleveland";
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-listings"],
    queryFn: fetchListings,
    staleTime: 5 * 60 * 1000,
  });

  const listings = data?.listings ?? [];
  const areas = data?.areas ?? [];

  const [area, setArea] = useState("all");
  const [beds, setBeds] = useState("any");
  const [maxRent, setMaxRent] = useState("any");

  const filtered = useMemo(
    () =>
      listings.filter(
        (l) =>
          (area === "all" || l.neighborhood === area) &&
          (beds === "any" || (l.bedrooms_max ?? 0) >= Number(beds)) &&
          (maxRent === "any" || (l.rent_min ?? 1e9) <= Number(maxRent)),
      ),
    [listings, area, beds, maxRent],
  );

  const availableCount = listings.filter((l) => l.status === "available").length;

  const resetFilters = () => { setArea("all"); setBeds("any"); setMaxRent("any"); };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Rent Finder Cleveland</span>
          </Link>
          <div className="flex items-center gap-3">
            <a href={`tel:${PHONE_E164}`} className="hidden sm:inline text-sm font-semibold text-foreground hover:text-primary">
              {PHONE_DISPLAY}
            </a>
            <Button asChild size="sm">
              <a href="#listings"><Search className="h-4 w-4 mr-1.5" />Browse Rentals</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary to-[hsl(239,84%,60%)] text-primary-foreground">
        <div className="max-w-7xl mx-auto px-5 py-16 md:py-20 text-center">
          <Badge className="bg-accent text-accent-foreground mb-4">Section 8 friendly · Local team</Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight max-w-4xl mx-auto">
            Houses for Rent in Cleveland, OH
          </h1>
          <p className="mt-4 text-base md:text-lg opacity-95 max-w-2xl mx-auto">
            Browse available rental homes from a local Cleveland property manager. Every home welcomes
            Housing Choice Vouchers — tour in person and apply online.
          </p>

          {/* Search bar */}
          <div className="mt-8 bg-card text-foreground rounded-2xl shadow-xl p-4 max-w-3xl mx-auto">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue placeholder="Any area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any area</SelectItem>
                  {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={beds} onValueChange={setBeds}>
                <SelectTrigger><SelectValue placeholder="Beds" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any beds</SelectItem>
                  <SelectItem value="1">1+ beds</SelectItem>
                  <SelectItem value="2">2+ beds</SelectItem>
                  <SelectItem value="3">3+ beds</SelectItem>
                  <SelectItem value="4">4+ beds</SelectItem>
                </SelectContent>
              </Select>
              <Select value={maxRent} onValueChange={setMaxRent}>
                <SelectTrigger><SelectValue placeholder="Max rent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any price</SelectItem>
                  <SelectItem value="800">Up to $800</SelectItem>
                  <SelectItem value="1000">Up to $1,000</SelectItem>
                  <SelectItem value="1200">Up to $1,200</SelectItem>
                  <SelectItem value="1500">Up to $1,500</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button asChild className="w-full mt-3">
              <a href="#listings"><Search className="h-4 w-4 mr-2" />Search {availableCount ? `${availableCount} available homes` : "rentals"}</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-5 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { icon: HomeIcon, big: "90+", small: "Rental homes managed" },
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

      {/* Listings */}
      <section id="listings" className="max-w-7xl mx-auto px-5 py-12 scroll-mt-20">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Available Cleveland rentals</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {isLoading ? "Loading homes…" : `${filtered.length} home${filtered.length === 1 ? "" : "s"} matching your search`}
            </p>
          </div>
          {(area !== "all" || beds !== "any" || maxRent !== "any") && (
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
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <HomeIcon className="h-10 w-10 text-primary/50 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No homes match those filters right now.</p>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              We add Section 8-friendly homes regularly. Tell us what you're looking for and we'll reach out when something fits.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" onClick={resetFilters}>Clear filters</Button>
              <Button asChild><Link to="/p/book-showing">Tell us what you need</Link></Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((l) => <ListingCard key={l.key} l={l} />)}
          </div>
        )}

        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link to="/p/book-showing">See all showing times <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
          </Button>
        </div>
      </section>

      {/* Why us */}
      <section className="bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-5 py-14">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground">Why rent with Rent Finder Cleveland</h2>
          <div className="grid gap-6 md:grid-cols-3 mt-8">
            {[
              { icon: CheckCircle2, title: "Every home takes Section 8", body: "All of our homes accept Housing Choice Vouchers and are HUD-inspection-ready, so voucher holders can rent with confidence." },
              { icon: KeyRound, title: "Real local team", body: "We're a Cleveland property manager, not a national listing site. Reach a real person and tour homes in person." },
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

      {/* Footer */}
      <footer className="bg-[hsl(222,47%,11%)] text-slate-300">
        <div className="max-w-7xl mx-auto px-5 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-white">Rent Finder Cleveland</span>
              </div>
              <p className="text-sm text-slate-400">Section 8-friendly rental homes across Greater Cleveland.</p>
              <p className="text-sm mt-2">
                <a href={`tel:${PHONE_E164}`} className="text-accent">{PHONE_DISPLAY}</a><br />
                <a href={`mailto:${EMAIL}`} className="text-accent">{EMAIL}</a>
              </p>
            </div>
            <div>
              <div className="font-semibold text-white mb-2">Find a Rental</div>
              <ul className="space-y-1.5 text-sm">
                <li><a href="/houses-for-rent-cleveland-oh/" className="hover:text-white">Houses for Rent in Cleveland</a></li>
                <li><a href="/apartments-for-rent-cleveland-oh/" className="hover:text-white">Apartments for Rent</a></li>
                <li><a href="/section-8-housing-cleveland-oh/" className="hover:text-white">Section 8 Housing</a></li>
                <li><a href="/cleveland-rentals/" className="hover:text-white">Rental Guides & Neighborhoods</a></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-2">Get Started</div>
              <ul className="space-y-1.5 text-sm">
                <li><Link to="/p/book-showing" className="hover:text-white">Schedule a Showing</Link></li>
                <li><Link to="/apply" className="hover:text-white">Apply Now</Link></li>
                <li><a href={`tel:${PHONE_E164}`} className="hover:text-white">Call Us</a></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-2">Company</div>
              <ul className="space-y-1.5 text-sm">
                <li><Link to="/saas" className="hover:text-white">For Property Managers</Link></li>
                <li><Link to="/p/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link to="/p/terms-of-service" className="hover:text-white">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-8 pt-6 text-xs text-slate-500 text-center leading-relaxed">
            © {new Date().getFullYear()} Rent Finder Cleveland, LLC. All rights reserved. Rent Finder Cleveland is an
            equal housing opportunity provider and does business in accordance with the Fair Housing Act. Cleveland, Ohio.
          </div>
        </div>
      </footer>
    </div>
  );
}
