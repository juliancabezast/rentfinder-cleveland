import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { trackPropertyView } from "@/lib/trackView";
import { ApplicationDialog } from "@/components/public/ApplicationDialog";
import { InquiryDialog } from "@/components/public/InquiryDialog";
import { loadListingConfig, type ListingTemplateConfig } from "@/lib/listingTemplate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, MapPin, BedDouble, Bath, Ruler, Home as HomeIcon, Clock,
  ShieldCheck, CheckCircle2, FileSignature, CalendarCheck, Share2, X,
  ChevronLeft, ChevronRight, Car, Warehouse, Trees, WashingMachine, Microwave,
  Wifi, Droplet, Flame, Zap, Trash2, Sofa, ParkingSquare, PawPrint, Images,
  Video, Rotate3d, TrendingUp, MessageCircleQuestion,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 * PropertyDetailPublic — public, renter-facing property page.
 * Rental marketplace (NOT for-sale): no AVM / tax / sale history. Shows the
 * building (all bookable units at the address), gallery + lightbox, amenities,
 * utilities, description, a "what's nearby" map and similar homes. Sticky
 * pricing sidebar on desktop, fixed CTA bar on mobile.
 * ──────────────────────────────────────────────────────────────────────────── */

type Property =
  import("@/integrations/supabase/types").Database["public"]["Tables"]["properties"]["Row"];

const VISIBLE = ["available", "coming_soon"] as const;

/* ---- helpers ---- */
function money(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  return "$" + Math.round(Number(n)).toLocaleString();
}
function num(n: number | string | null | undefined): number | null {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
function bathLabel(n: number | null): string {
  if (n == null) return "—";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
function photoUrls(p: Property | null | undefined): string[] {
  if (!p?.photos) return [];
  const arr = p.photos as any;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === "string" ? x : x?.url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}
function isMultiFamilyType(t?: string | null): boolean {
  if (!t) return false;
  const s = t.toLowerCase();
  return s.includes("plex") || s.includes("multi") || s.includes("apart") || s.includes("unit");
}
function titleCaseType(t?: string | null): string {
  if (!t) return "Rental home";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** Coming-soon availability label — the date set in admin, or rolling +20d. */
function comingSoonLabel(dateStr: string | null): string {
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date(Date.now() + 20 * 864e5);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ---- amenity / utility classification + icons ---- */
const UTILITY_RE = /resident pays|included|internet|\bheat\b|electric|\bgas\b|\bwater\b|trash|sewer/i;
function amenityIcon(label: string): React.ComponentType<{ className?: string }> {
  const s = label.toLowerCase();
  if (s.includes("garage")) return Warehouse;
  if (s.includes("parking")) return ParkingSquare;
  if (s.includes("car")) return Car;
  if (s.includes("yard") || s.includes("patio") || s.includes("deck") || s.includes("garden")) return Trees;
  if (s.includes("washer") || s.includes("dryer") || s.includes("laundry")) return WashingMachine;
  if (s.includes("microwave") || s.includes("appliance")) return Microwave;
  if (s.includes("internet") || s.includes("wifi")) return Wifi;
  if (s.includes("water")) return Droplet;
  if (s.includes("heat")) return Flame;
  if (s.includes("electric")) return Zap;
  if (s.includes("gas")) return Flame;
  if (s.includes("trash") || s.includes("sewer")) return Trash2;
  if (s.includes("furnish")) return Sofa;
  return CheckCircle2;
}

/* ---- data ---- */
interface DetailData {
  property: Property;
  units: Property[]; // all bookable units at this address (self included)
  similar: Property[];
  openSlots: Record<string, number>; // property_id → # of open future showing slots
  listingConfig: ListingTemplateConfig;
}
async function fetchDetail(id: string): Promise<DetailData | null> {
  const { data: prop } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .in("status", VISIBLE as unknown as string[])
    .maybeSingle();
  if (!prop) return null;
  const property = prop as Property;

  // Sibling units at the same address (building view).
  const { data: sibs } = await supabase
    .from("properties")
    .select("*")
    .ilike("address", property.address)
    .in("status", VISIBLE as unknown as string[]);
  const units = ((sibs as Property[] | null) || [property])
    .slice()
    .sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || ""));

  // Real showing availability per unit — so a "Tour" CTA only appears when the
  // unit actually has open, unbooked, future slots (avoids the "all units say
  // book-a-tour but only one really has slots" trap). Anon can read this table
  // (same as the public ScheduleShowing page).
  const openSlots: Record<string, number> = {};
  const unitIds = units.map((u) => u.id);
  if (unitIds.length) {
    const todayNY = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const { data: slots } = await supabase
      .from("showing_available_slots")
      .select("property_id")
      .in("property_id", unitIds)
      .eq("is_enabled", true)
      .eq("is_booked", false)
      .gte("slot_date", todayNY);
    for (const s of (slots as { property_id: string }[] | null) || []) {
      openSlots[s.property_id] = (openSlots[s.property_id] || 0) + 1;
    }
  }

  // Org-wide leasing policies (income multiple, lease length, fees…) for the
  // "Costs & lease terms" block — single source of truth from admin.
  const listingConfig = await loadListingConfig(supabase, property.organization_id);

  // Similar available homes in the same city (other buildings).
  const { data: sim } = await supabase
    .from("properties")
    .select("*")
    .eq("city", property.city || "")
    .in("status", VISIBLE as unknown as string[])
    .neq("address", property.address)
    .limit(24);
  const seen = new Set<string>();
  const similar: Property[] = [];
  for (const p of (sim as Property[] | null) || []) {
    const k = (p.address || "").toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    similar.push(p);
    if (similar.length >= 4) break;
  }

  return { property, units, similar, openSlots, listingConfig };
}

/** "3 days ago" / "today" from an ISO date/timestamp. */
function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "a month ago";
  if (months < 12) return `${months} months ago`;
  return "over a year ago";
}

/* ════════════════════════════ Lightbox ════════════════════════════ */
function Lightbox({ photos, index, onClose, onNav }: {
  photos: string[]; index: number; onClose: () => void; onNav: (i: number) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNav((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onNav((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [index, photos.length, onClose, onNav]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={onClose}>
      <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={onClose} aria-label="Close">
        <X className="h-6 w-6" />
      </button>
      <div className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">
        {index + 1} / {photos.length}
      </div>
      {photos.length > 1 && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); onNav((index - 1 + photos.length) % photos.length); }}
          aria-label="Previous"
        ><ChevronLeft className="h-7 w-7" /></button>
      )}
      <img
        src={photos[index]}
        alt=""
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); onNav((index + 1) % photos.length); }}
          aria-label="Next"
        ><ChevronRight className="h-7 w-7" /></button>
      )}
    </div>,
    document.body,
  );
}

/* ════════════════════════════ Gallery ════════════════════════════ */
function Gallery({ photos, alt, onOpen }: { photos: string[]; alt: string; onOpen: (i: number) => void }) {
  if (photos.length === 0) {
    return (
      <div className="flex h-[260px] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 text-primary/50 sm:h-[380px]">
        <HomeIcon className="h-12 w-12" />
      </div>
    );
  }
  const rest = photos.slice(1, 5);
  return (
    <div className="relative">
      <div className="grid h-[260px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-[380px] lg:h-[460px]">
        <button
          onClick={() => onOpen(0)}
          className="group col-span-4 row-span-2 overflow-hidden sm:col-span-2"
        >
          <img src={photos[0]} alt={alt} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        </button>
        {rest.map((src, i) => (
          <button
            key={i}
            onClick={() => onOpen(i + 1)}
            className="group hidden overflow-hidden sm:block"
          >
            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpen(0)}
        className="absolute bottom-3 right-3 gap-1.5 border border-black/10 bg-white/95 font-semibold text-slate-800 shadow-md hover:bg-white"
      >
        <Images className="h-4 w-4" /> {photos.length} photos
      </Button>
    </div>
  );
}

/* ════════════════════════════ Single-marker map ════════════════════════════ */
function NearbyMap({ lat, lng, price }: { lat: number; lng: number; price: string }) {
  const icon = useMemo(
    () => L.divIcon({
      className: "",
      html: `<div style="background:#4F46E5;color:#fff;font-family:Montserrat,Arial,sans-serif;
        font-size:13px;font-weight:800;padding:4px 10px;border-radius:9999px;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;transform:translate(-50%,-50%);
        width:max-content;">${price}</div>`,
      iconSize: [0, 0],
    }),
    [price],
  );
  return (
    <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="h-[300px] w-full rounded-2xl sm:h-[360px]">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <Marker position={[lat, lng]} icon={icon} />
    </MapContainer>
  );
}

/* ════════════════════════════ Section shell ════════════════════════════ */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/70 py-6">
      {title && <h2 className="mb-4 text-xl font-bold text-foreground">{title}</h2>}
      {children}
    </section>
  );
}

/* ════════════════════════════ Page ════════════════════════════ */
export default function PropertyDetailPublic() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [applyUnit, setApplyUnit] = useState<Property | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["property-detail", id],
    queryFn: () => fetchDetail(id),
    enabled: !!id,
  });

  // Record the detail-view once we know the property is real.
  useEffect(() => {
    if (data?.property?.id) trackPropertyView("detail_view", [data.property.id]);
  }, [data?.property?.id]);

  // SEO-ish: reflect the address in the tab title.
  useEffect(() => {
    if (data?.property?.address) {
      const prev = document.title;
      document.title = `${data.property.address}, ${data.property.city} — Rent Finder Cleveland`;
      return () => { document.title = prev; };
    }
  }, [data?.property?.address, data?.property?.city]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-[260px] w-full rounded-2xl sm:h-[380px] lg:h-[460px]" />
        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
        <HomeIcon className="h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold">This home isn’t available</h1>
        <p className="mt-2 text-muted-foreground">It may have just been rented or taken off the market. Browse the rest of our Section 8–friendly rentals.</p>
        <Button asChild className="mt-6"><Link to="/">Back to all rentals</Link></Button>
      </div>
    );
  }

  const { property: p, units, similar, openSlots, listingConfig } = data;
  const photos = photoUrls(p);
  const coming = p.status === "coming_soon";
  const multi = units.length > 1 || isMultiFamilyType(p.property_type);

  // Tour availability — only surface a "Tour" CTA where real open slots exist.
  const buildingHasSlots = units.some((u) => (openSlots[u.id] || 0) > 0);
  const slotUnitId = ((openSlots[p.id] || 0) > 0 ? p.id : units.find((u) => (openSlots[u.id] || 0) > 0)?.id) || p.id;

  // Media: a video / 3D tour anywhere in the building.
  const videoUrl = units.map((u) => u.video_tour_url).find((v) => !!v) || null;
  const virtualUrl = units.map((u) => u.virtual_tour_url).find((v) => !!v) || null;

  // Social proof — total real detail-views across the building's units.
  const buildingViews = units.reduce((s, u) => s + (u.detail_view_count || 0), 0);
  const isPopular = !coming && buildingViews >= 25;

  // Freshness — most recent listed/updated timestamp across the building.
  const freshISO = units
    .map((u) => u.listed_date || u.updated_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
  const freshLabel = timeAgo(freshISO);

  // Aggregate ranges across the building's units.
  const rents = units.map((u) => num(u.rent_price)).filter((n): n is number => n != null).sort((a, b) => a - b);
  const rentMin = rents[0] ?? num(p.rent_price);
  const rentMax = rents[rents.length - 1] ?? rentMin;
  const bedsVals = units.map((u) => u.bedrooms).filter((n): n is number => n != null);
  const bedsMin = bedsVals.length ? Math.min(...bedsVals) : p.bedrooms;
  const bedsMax = bedsVals.length ? Math.max(...bedsVals) : p.bedrooms;
  const bathVals = units.map((u) => num(u.bathrooms)).filter((n): n is number => n != null);
  const bathMin = bathVals.length ? Math.min(...bathVals) : num(p.bathrooms);

  const rentLabel = rentMin == null
    ? "Contact for price"
    : rentMax != null && rentMax !== rentMin
      ? `${money(rentMin)}–${money(rentMax)}`
      : money(rentMin);
  const bedLabel = bedsMin == null ? "—" : bedsMax != null && bedsMax !== bedsMin ? `${bedsMin}–${bedsMax}` : `${bedsMin}`;

  // Amenities: union across units, split features vs utilities.
  const allAmen = Array.from(new Set(
    units.flatMap((u) => (Array.isArray(u.amenities) ? (u.amenities as any[]) : []))
      .map((a) => (typeof a === "string" ? a.trim() : ""))
      .filter(Boolean),
  ));
  const features = allAmen.filter((a) => !UTILITY_RE.test(a));
  const utilities = allAmen.filter((a) => UTILITY_RE.test(a));

  // Highlight chips — the top sellable features (factual only; no
  // neighborhood/demographic claims, per Fair Housing). Section 8 leads.
  const HIGHLIGHT_ORDER = ["laundry", "washer", "parking", "garage", "yard", "basement", "deck", "patio", "air", "dishwasher", "microwave"];
  const rankedFeatures = [...features].sort((a, b) => {
    const ra = HIGHLIGHT_ORDER.findIndex((k) => a.toLowerCase().includes(k));
    const rb = HIGHLIGHT_ORDER.findIndex((k) => b.toLowerCase().includes(k));
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });
  const highlightChips = [
    ...(p.section_8_accepted ? [{ label: "Section 8 accepted", icon: ShieldCheck, hot: true }] : []),
    ...rankedFeatures.slice(0, 5).map((f) => ({ label: f, icon: amenityIcon(f), hot: false })),
  ].slice(0, 6);

  // Costs & lease terms — actual property values first, org policy defaults next.
  const pol = listingConfig.policies;
  const costRows: { k: string; v: string }[] = [
    { k: "Monthly rent", v: rentMin != null ? `${rentLabel}/mo` : "Contact us" },
    { k: "Security deposit", v: p.deposit_amount != null ? money(p.deposit_amount) : (pol.depositText || "") },
    { k: "Application fee", v: p.application_fee != null ? money(p.application_fee) : (pol.applicationFee ? `${money(pol.applicationFee)} per adult` : "") },
    { k: "Income requirement", v: pol.incomeMultiple ? `${pol.incomeMultiple}× the monthly rent` : "" },
    { k: "Lease length", v: pol.leaseMonths ? `${pol.leaseMonths} months` : "" },
    { k: "Move-in fee", v: pol.moveInFee ? money(pol.moveInFee) : "" },
    { k: "Utilities", v: pol.utilities || "" },
    { k: "Pets", v: p.pet_policy || pol.petPolicy || "" },
    { k: "Approval time", v: pol.processingTime || "" },
  ].filter((r) => r.v && r.v.trim());

  const label = `${p.address}${p.city ? `, ${p.city}` : ""}`;
  const openApply = (u: Property) => setApplyUnit(u);
  const share = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — ignore */ }
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-40 border-b border-border/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All rentals
          </button>
          <button onClick={share} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            {copied ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Link copied</> : <><Share2 className="h-4 w-4" /> Share</>}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <Gallery photos={photos} alt={`${titleCaseType(p.property_type)} for rent at ${label}`} onOpen={setLightbox} />

        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          {/* ── Left column ── */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2">
              {coming
                ? <Badge className="bg-amber-400 font-bold uppercase tracking-wide text-amber-950">Coming soon</Badge>
                : <Badge className="bg-primary text-primary-foreground">Available now</Badge>}
              {p.section_8_accepted && (
                <Badge variant="secondary" className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Section 8 accepted
                </Badge>
              )}
              <Badge variant="outline" className="font-medium">{titleCaseType(p.property_type)}</Badge>
              {isPopular && (
                <Badge className="border-0 bg-rose-500/10 font-semibold text-rose-600">
                  <TrendingUp className="mr-1 h-3.5 w-3.5" /> Popular · {buildingViews.toLocaleString()} views
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">{p.address}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{[p.city, p.state, p.zip_code].filter(Boolean).join(", ")}</span>
              {freshLabel && <span className="text-sm">· Updated {freshLabel}</span>}
            </div>
            {coming && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                <Clock className="h-4 w-4" /> Expected available ~ {comingSoonLabel(p.coming_soon_date)}
              </div>
            )}

            {/* Video / 3D tour buttons (surfaced only when the URLs exist) */}
            {(videoUrl || virtualUrl) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {videoUrl && (
                  <Button asChild variant="outline" size="sm" className="font-semibold">
                    <a href={videoUrl} target="_blank" rel="noopener noreferrer"><Video className="mr-1.5 h-4 w-4" /> Video tour</a>
                  </Button>
                )}
                {virtualUrl && (
                  <Button asChild variant="outline" size="sm" className="font-semibold">
                    <a href={virtualUrl} target="_blank" rel="noopener noreferrer"><Rotate3d className="mr-1.5 h-4 w-4" /> 3D / Virtual tour</a>
                  </Button>
                )}
              </div>
            )}

            {/* Highlight chips — quick scannable selling points */}
            {highlightChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {highlightChips.map((c) => (
                  <span
                    key={c.label}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${c.hot ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted/40 text-foreground/80"}`}
                  >
                    <c.icon className="h-3.5 w-3.5" /> {c.label}
                  </span>
                ))}
              </div>
            )}

            {/* Facts strip */}
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Fact icon={BedDouble} value={bedLabel} unit={Number(bedLabel) === 1 ? "bed" : "beds"} />
              <Fact icon={Bath} value={bathMin == null ? "—" : bathLabel(bathMin)} unit={bathMin === 1 ? "bath" : "baths"} />
              {p.square_feet != null && <Fact icon={Ruler} value={Number(p.square_feet).toLocaleString()} unit="sq ft" />}
              {rentMin != null && p.square_feet ? (
                <Fact icon={CheckCircle2} value={`$${(Number(rentMin) / Number(p.square_feet)).toFixed(2)}`} unit="/ sq ft" />
              ) : null}
              {multi && <Fact icon={HomeIcon} value={String(units.length)} unit={units.length === 1 ? "unit" : "units"} />}
            </div>

            {/* Units (multi-family) */}
            {multi && (
              <Section title={`${units.length} available ${units.length === 1 ? "unit" : "units"}`}>
                <div className="space-y-2.5">
                  {units.map((u) => {
                    const active = u.id === p.id;
                    const uComing = u.status === "coming_soon";
                    return (
                      <div key={u.id} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${active ? "border-primary/40 bg-primary/[0.03]" : "border-border"}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-bold text-foreground">
                            {u.unit_number ? `Unit ${u.unit_number}` : "Main unit"}
                            {active && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Viewing</span>}
                            {uComing && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Coming soon</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{u.bedrooms ?? "—"} bd</span>
                            <span className="inline-flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{bathLabel(num(u.bathrooms))} ba</span>
                            {u.square_feet != null && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{Number(u.square_feet).toLocaleString()} sf</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-lg font-extrabold tabular-nums text-foreground">{money(u.rent_price)}<span className="text-xs font-medium text-muted-foreground">/mo</span></div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => openApply(u)}>Apply</Button>
                            {!uComing && (openSlots[u.id] || 0) > 0 && (
                              <Button asChild size="sm" variant="outline">
                                <Link to={`/p/schedule-showing/${u.id}`}>Tour</Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* About */}
            {p.description && (
              <Section title="About this home">
                <p className="whitespace-pre-line leading-relaxed text-foreground/90">{p.description}</p>
              </Section>
            )}

            {/* Features */}
            {features.length > 0 && (
              <Section title="Features & amenities">
                <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-3">
                  {features.map((a) => {
                    const Icon = amenityIcon(a);
                    return (
                      <div key={a} className="flex items-center gap-2.5 text-sm text-foreground/90">
                        <Icon className="h-4 w-4 shrink-0 text-primary" /> {a}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Utilities & pets */}
            {(utilities.length > 0 || p.pet_policy) && (
              <Section title="Utilities & policies">
                {utilities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {utilities.map((u) => {
                      const included = /included/i.test(u);
                      const Icon = amenityIcon(u);
                      return (
                        <span key={u} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${included ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted/40 text-foreground/80"}`}>
                          <Icon className="h-3.5 w-3.5" /> {u}
                        </span>
                      );
                    })}
                  </div>
                )}
                {p.pet_policy && (
                  <div className="mt-4 flex items-start gap-2.5 text-sm text-foreground/90">
                    <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div><span className="font-semibold">Pet policy: </span>{p.pet_policy}</div>
                  </div>
                )}
              </Section>
            )}

            {/* Costs & lease terms */}
            {costRows.length > 0 && (
              <Section title="Costs & lease terms">
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  {costRows.map((r) => (
                    <div key={r.k} className="flex justify-between gap-4 border-b border-border/60 py-2.5 text-sm">
                      <span className="shrink-0 text-muted-foreground">{r.k}</span>
                      <span className="text-right font-medium text-foreground">{r.v}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Terms are subject to change and confirmed at application. Consent is not required to apply for housing.</p>
              </Section>
            )}

            {/* Map */}
            {p.latitude != null && p.longitude != null && (
              <Section title="What’s nearby">
                <NearbyMap lat={Number(p.latitude)} lng={Number(p.longitude)} price={money(rentMin)} />
                <p className="mt-2 text-xs text-muted-foreground">Approximate location · {[p.city, p.state].filter(Boolean).join(", ")}</p>
              </Section>
            )}

            {/* Ask a question */}
            <Section>
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <MessageCircleQuestion className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                  <div>
                    <div className="font-bold text-foreground">Have a question about this home?</div>
                    <div className="text-sm text-muted-foreground">Ask our local Cleveland team — voucher amounts, availability, move-in, anything.</div>
                  </div>
                </div>
                <Button className="shrink-0 font-semibold" onClick={() => setInquiryOpen(true)}>Ask a question</Button>
              </div>
            </Section>

            {/* Similar homes */}
            {similar.length > 0 && (
              <Section title="Similar rentals nearby">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {similar.map((s) => (
                    <SimilarCard key={s.id} p={s} />
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* ── Right sidebar (desktop) ── */}
          <div className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-white/70 p-5 shadow-sm backdrop-blur-xl">
              <div className="flex flex-wrap items-baseline gap-x-1">
                <span className="whitespace-nowrap text-3xl font-extrabold text-foreground">{rentLabel}</span>
                {rentMin != null && <span className="text-sm font-medium text-muted-foreground">/mo</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                <span>{bedLabel} bd</span><span>·</span>
                <span>{bathMin == null ? "—" : bathLabel(bathMin)} ba</span>
                {p.square_feet != null && <><span>·</span><span>{Number(p.square_feet).toLocaleString()} sf</span></>}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Button className="w-full font-semibold" onClick={() => openApply(p)}>
                  {coming ? <><ShieldCheck className="mr-2 h-4 w-4" /> Apply with voucher</> : <><FileSignature className="mr-2 h-4 w-4" /> Start application</>}
                </Button>
                {!coming && buildingHasSlots && (
                  <Button asChild variant="outline" className="w-full font-semibold">
                    <Link to={`/p/schedule-showing/${slotUnitId}`}><CalendarCheck className="mr-2 h-4 w-4" /> Schedule a showing</Link>
                  </Button>
                )}
                <Button variant="ghost" className="w-full font-semibold text-primary hover:text-primary" onClick={() => setInquiryOpen(true)}>
                  <MessageCircleQuestion className="mr-2 h-4 w-4" /> Ask a question
                </Button>
              </div>

              {(p.deposit_amount != null || p.application_fee != null) && (
                <div className="mt-4 space-y-1 border-t border-border/70 pt-3 text-sm text-muted-foreground">
                  {p.deposit_amount != null && <div className="flex justify-between"><span>Security deposit</span><span className="font-semibold text-foreground">{money(p.deposit_amount)}</span></div>}
                  {p.application_fee != null && <div className="flex justify-between"><span>Application fee</span><span className="font-semibold text-foreground">{money(p.application_fee)}</span></div>}
                </div>
              )}

              {p.section_8_accepted && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Housing Choice Vouchers welcome — HUD-inspection-ready. We handle the paperwork.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed CTA bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold leading-none text-foreground">{rentLabel}<span className="text-xs font-medium text-muted-foreground">{rentMin != null ? "/mo" : ""}</span></div>
            <div className="text-[11px] text-muted-foreground">{bedLabel} bd · {bathMin == null ? "—" : bathLabel(bathMin)} ba</div>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="font-semibold" onClick={() => setInquiryOpen(true)} aria-label="Ask a question">
              <MessageCircleQuestion className="h-4 w-4" />
            </Button>
            {!coming && buildingHasSlots && (
              <Button asChild variant="outline" size="sm" className="font-semibold">
                <Link to={`/p/schedule-showing/${slotUnitId}`} aria-label="Schedule a showing"><CalendarCheck className="h-4 w-4" /></Link>
              </Button>
            )}
            <Button size="sm" className="font-semibold" onClick={() => openApply(p)}>
              {coming ? <><ShieldCheck className="mr-1.5 h-4 w-4" /> Apply</> : <><FileSignature className="mr-1.5 h-4 w-4" /> Apply</>}
            </Button>
          </div>
        </div>
      </div>

      {lightbox != null && photos.length > 0 && (
        <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} onNav={setLightbox} />
      )}

      <ApplicationDialog
        open={!!applyUnit}
        onOpenChange={(o) => { if (!o) setApplyUnit(null); }}
        propertyId={applyUnit?.id ?? ""}
        propertyLabel={applyUnit ? `${applyUnit.address}${applyUnit.unit_number ? ` · Unit ${applyUnit.unit_number}` : ""}, ${applyUnit.city}` : ""}
        comingSoon={applyUnit?.status === "coming_soon"}
      />

      <InquiryDialog
        open={inquiryOpen}
        onOpenChange={setInquiryOpen}
        propertyId={p.id}
        propertyLabel={label}
      />
    </div>
  );
}

/* ---- small pieces ---- */
function Fact({ icon: Icon, value, unit }: { icon: React.ComponentType<{ className?: string }>; value: string; unit: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
      <Icon className="h-5 w-5 text-primary" />
      <span className="font-bold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

function SimilarCard({ p }: { p: Property }) {
  const photo = photoUrls(p)[0];
  const coming = p.status === "coming_soon";
  return (
    <Link to={`/property/${p.id}`} className="group block overflow-hidden rounded-xl border border-border transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] bg-muted">
        {photo ? (
          <img src={photo} alt={p.address} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-primary/40"><HomeIcon className="h-8 w-8" /></div>
        )}
        {coming && <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-950">Coming soon</span>}
      </div>
      <div className="p-2.5">
        <div className="truncate text-sm font-bold text-foreground">{money(p.rent_price)}<span className="text-[11px] font-medium text-muted-foreground">/mo</span></div>
        <div className="truncate text-xs text-muted-foreground">{p.address}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{p.bedrooms ?? "—"} bd · {bathLabel(num(p.bathrooms))} ba</div>
      </div>
    </Link>
  );
}
