import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SmsConsentCheckbox,
  buildConsentPayload,
} from "@/components/public/SmsConsentCheckbox";
import { supabase } from "@/integrations/supabase/client";
import { trackPropertyView } from "@/lib/trackView";
import {
  MapPin,
  DollarSign,
  CheckCircle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader2,
  Home,
  FileText,
  ChevronRight,
  ChevronLeft,
  Building2,
  Phone,
  Sparkles,
  Camera,
  X,
  BedDouble,
  Layers,
} from "lucide-react";
import { createPortal } from "react-dom";
import { format, addDays, parseISO, isSameDay } from "date-fns";
import { getTimezoneForCity } from "@/lib/cityTimezone";

type Property =
  import("@/integrations/supabase/types").Database["public"]["Tables"]["properties"]["Row"];

interface PropertyWithSlots extends Property {
  available_slot_count: number;
}

interface AvailableSlot {
  slot_time: string;
  duration_minutes: number;
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function getAllPhotoUrls(property: Property | null | undefined): string[] {
  if (!property?.photos) return [];
  const photos = property.photos as any;
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p) => (typeof p === "string" ? p : p?.url))
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

function getPhotoUrl(property: Property, index = 0): string | null {
  if (!property?.photos) return null;
  const photos = property.photos as any;
  if (Array.isArray(photos) && photos.length > index) {
    const photo = photos[index];
    return typeof photo === "string" ? photo : photo?.url || null;
  }
  // Fallback to first photo if requested index doesn't exist
  if (Array.isArray(photos) && photos.length > 0 && index > 0) {
    const photo = photos[0];
    return typeof photo === "string" ? photo : photo?.url || null;
  }
  return null;
}

/* ---- Photo lightbox: fullscreen viewer with swipe + keyboard nav ---- */
const PhotoLightbox: React.FC<{
  photos: string[];
  alt: string;
  initialIndex: number;
  onClose: () => void;
}> = ({ photos, alt, initialIndex, onClose }) => {
  const [index, setIndex] = React.useState(initialIndex);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const total = photos.length;

  // Lock body scroll while open
  React.useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  // Programmatically scroll to a photo. The scroll position — not an effect on
  // `index` — drives navigation, so `handleScroll` updating `index` mid-scroll
  // can't fight an in-flight arrow/keyboard move (which previously bounced it
  // straight back to the first photo).
  const goTo = React.useCallback(
    (idx: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, idx));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [total],
  );

  // Snap to initial index without animation on mount
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = initialIndex * el.clientWidth;
  }, [initialIndex]);

  // Keyboard navigation
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, index, goTo]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== index && idx >= 0 && idx < total) setIndex(idx);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — photo viewer`}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-sm transition-all"
        style={{ top: "max(1rem, env(safe-area-inset-top))" }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Photo counter */}
      {total > 1 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full pointer-events-none"
          style={{ top: "max(1rem, env(safe-area-inset-top))" }}
        >
          {index + 1} / {total}
        </div>
      )}

      {/* Swipeable scroll track */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {photos.map((url, i) => (
          <div
            key={url + i}
            className="w-full h-full shrink-0 snap-start flex items-center justify-center px-4"
          >
            <img
              src={url}
              alt={`${alt} — photo ${i + 1}`}
              draggable={false}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ))}
      </div>

      {/* Prev arrow (hidden on touch where swipe is natural) */}
      {total > 1 && index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goTo(index - 1); }}
          aria-label="Previous photo"
          className="hidden sm:flex absolute top-1/2 left-4 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center backdrop-blur-sm transition-all"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Next arrow */}
      {total > 1 && index < total - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goTo(index + 1); }}
          aria-label="Next photo"
          className="hidden sm:flex absolute top-1/2 right-4 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center backdrop-blur-sm transition-all"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>,
    document.body
  );
};

/* ---- Photo carousel: swipeable inline gallery with arrows + tap-to-zoom ---- */
const PhotoCarousel: React.FC<{
  photos: string[];
  alt: string;
  className?: string;
  countPosition?: "top-left" | "bottom-left";
  arrowSize?: "sm" | "md";
}> = ({ photos, alt, className = "aspect-square", countPosition = "top-left", arrowSize = "md" }) => {
  const [current, setCurrent] = React.useState(0);
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const total = photos.length;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== current && idx >= 0 && idx < total) setCurrent(idx);
  };

  const goToIdx = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(total - 1, idx));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    goToIdx(current - 1);
  };
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    goToIdx(current + 1);
  };

  // Detect tap vs swipe so taps open the lightbox without hijacking horizontal scrolls
  const pointerStart = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const handlePointerUp = (e: React.PointerEvent, idx: number) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    const dt = Date.now() - start.t;
    // Treat as a tap only when movement and dwell are small
    if (dx < 8 && dy < 8 && dt < 400) {
      e.stopPropagation();
      e.preventDefault();
      setLightboxIndex(idx);
    }
  };

  if (total === 0) {
    return (
      <div className={`${className} bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center`}>
        <Home className="h-8 w-8 text-slate-400" />
      </div>
    );
  }

  const arrowBtn =
    arrowSize === "sm"
      ? "h-6 w-6 rounded-full"
      : "h-7 w-7 rounded-full";
  const arrowIcon = arrowSize === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <>
      <div className={`relative overflow-hidden bg-muted ${className}`}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {photos.map((url, i) => (
            <img
              key={url + i}
              src={url}
              alt={`${alt} — photo ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              onPointerDown={handlePointerDown}
              onPointerUp={(e) => handlePointerUp(e, i)}
              className="w-full h-full object-cover shrink-0 snap-start select-none cursor-zoom-in"
            />
          ))}
        </div>

        {/* Photo count badge */}
        {total > 1 && (
          <div
            className={`absolute ${
              countPosition === "top-left" ? "top-1.5 left-1.5" : "bottom-1.5 left-1.5"
            } bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none`}
          >
            <Camera className="h-2.5 w-2.5" />
            {total} PHOTOS
          </div>
        )}

        {/* Prev arrow */}
        {total > 1 && current > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous photo"
            className={`absolute top-1/2 left-1.5 -translate-y-1/2 ${arrowBtn} bg-black/55 hover:bg-black/75 text-white flex items-center justify-center shadow-md transition-all`}
          >
            <ChevronLeft className={arrowIcon} />
          </button>
        )}

        {/* Next arrow */}
        {total > 1 && current < total - 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next photo"
            className={`absolute top-1/2 right-1.5 -translate-y-1/2 ${arrowBtn} bg-black/55 hover:bg-black/75 text-white flex items-center justify-center shadow-md transition-all`}
          >
            <ChevronRight className={arrowIcon} />
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          alt={alt}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
};

/* ---- Slot record for unique-time computation ---- */
interface SlotRecord {
  property_id: string;
  slot_date: string;
  slot_time: string;
}

/* ---- Building Group (for multi-unit addresses) ---- */
interface BuildingGroup {
  address: string;
  city: string;
  state: string | null;
  zip_code: string | null;
  photoUrl: string | null;
  units: PropertyWithSlots[];
  nextSlotDate: string; // yyyy-MM-dd
  nextSlotTime: string; // HH:mm:ss
  spotsNextDay: number; // unique slots on the nearest available day
  rentMin: number | null;
  rentMax: number | null;
  displayVariant: 1 | 2; // which urgency style to show
}

/** Format a slot date as a friendly label: "Today", "Tomorrow", or "Wed, Mar 19" */
function friendlyDate(dateStr: string): string {
  const d = parseISO(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

/** Simple public-facing filters for the city property list */
const BEDS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Any" },
  { value: 1, label: "1+" },
  { value: 2, label: "2+" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
];
const TYPE_OPTIONS: { value: "all" | "single" | "multi"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "single", label: "Single" },
  { value: "multi", label: "Multi" },
];

/** A building is "multi-family" if it exposes more than one bookable unit OR
 * its property type is a duplex / triplex / fourplex / apartment. Classifying
 * on type (not just how many units currently have open slots) means a duplex
 * with a single bookable unit is still correctly treated as multi-family. */
function isMultiFamilyType(t?: string | null): boolean {
  if (!t) return false;
  const s = t.toLowerCase();
  return s.includes("plex") || s.includes("multi") || s.includes("apart") || s.includes("unit");
}
function buildingIsMulti(b: BuildingGroup): boolean {
  return b.units.length > 1 || b.units.some((u) => isMultiFamilyType(u.property_type));
}

const BuildingSelectCard: React.FC<{
  building: BuildingGroup;
  onClick: () => void;
}> = ({ building, onClick }) => {
  const isMulti = building.units.length > 1;
  const firstUnit = building.units[0];
  const photos = getAllPhotoUrls(firstUnit);

  const rentLabel =
    building.rentMin != null && building.rentMax != null && building.rentMin !== building.rentMax
      ? `$${building.rentMin.toLocaleString()}–$${building.rentMax.toLocaleString()}`
      : building.rentMin != null
        ? `$${building.rentMin.toLocaleString()}`
        : null;

  const dateLabel = friendlyDate(building.nextSlotDate);
  const timeLabel = formatTime(building.nextSlotTime);
  const spots = building.spotsNextDay;
  const isScarce = spots > 0 && spots <= 3;

  const specs: string[] = [];
  if (!isMulti && firstUnit) {
    if (firstUnit.bedrooms != null) specs.push(`${firstUnit.bedrooms} BR`);
    if (firstUnit.bathrooms != null) specs.push(`${firstUnit.bathrooms} BA`);
    if (firstUnit.square_feet) specs.push(`${firstUnit.square_feet.toLocaleString()} SF`);
  } else if (isMulti) {
    specs.push(`${building.units.length} units`);
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex gap-3 p-3">
        {/* Photo (left) */}
        <PhotoCarousel
          photos={photos}
          alt={building.address}
          className="h-40 w-44 sm:h-44 sm:w-52 rounded-lg shrink-0"
          arrowSize="md"
        />

        {/* Info (right) — vertically centered so there's no dead white space */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {rentLabel && (
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-2xl font-extrabold text-slate-900">{rentLabel}</span>
              <span className="text-xs font-medium text-muted-foreground">/mo</span>
            </div>
          )}
          {specs.length > 0 && (
            <p className="text-sm text-slate-600 truncate">{specs.join(" · ")}</p>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-base text-slate-900 truncate leading-tight">
              {building.address}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-0.5 truncate mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              {building.city}, {building.state}
            </p>
          </div>

          {/* Availability + Section 8 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isScarce ? (
              <Badge variant="outline" className="text-[11px] h-6 px-2 text-orange-700 border-orange-300 bg-orange-50">
                Only {spots} left {dateLabel.toLowerCase()}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px] h-6 px-2 text-emerald-700 border-emerald-300 bg-emerald-50">
                {dateLabel} · {timeLabel}
              </Badge>
            )}
            {!isMulti && firstUnit?.section_8_accepted && (
              <Badge className="text-[11px] h-6 px-2 bg-blue-100 text-blue-700 border-0">
                Sec 8
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* CTA — full width below */}
      <Button
        onClick={onClick}
        className="w-full h-10 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
      >
        <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
        {isMulti ? "View Units" : "Schedule a Showing"}
        <ChevronRight className="h-3.5 w-3.5 ml-auto" />
      </Button>
    </div>
  );
};

const UnitSelectCard: React.FC<{
  property: PropertyWithSlots;
  onClick: () => void;
}> = ({ property, onClick }) => {
  const photos = getAllPhotoUrls(property);

  const specs: string[] = [];
  if (property.bedrooms != null) specs.push(`${property.bedrooms} BR`);
  if (property.bathrooms != null) specs.push(`${property.bathrooms} BA`);
  if (property.square_feet) specs.push(`${property.square_feet.toLocaleString()} SF`);

  return (
    <div className="rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex gap-3 p-3">
        <PhotoCarousel
          photos={photos}
          alt={property.unit_number || property.address}
          className="h-36 w-40 sm:h-44 sm:w-48 rounded-lg shrink-0"
          arrowSize="md"
        />

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <div className="flex items-baseline gap-1 leading-none">
            <span className="text-2xl font-extrabold text-slate-900">
              ${property.rent_price?.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-muted-foreground">/mo</span>
          </div>
          {specs.length > 0 && (
            <p className="text-sm text-slate-600 truncate">{specs.join(" · ")}</p>
          )}
          <p className="font-semibold text-base text-slate-900 truncate">
            {property.unit_number ? `Unit ${property.unit_number}` : "Main Unit"}
          </p>
          {(() => {
            const unitInfo: string[] = [];
            if (property.section_8_accepted) unitInfo.push("Section 8 OK");
            if (property.pet_policy && property.pet_policy.toLowerCase() !== "no pets" && property.pet_policy.toLowerCase() !== "none") {
              unitInfo.push("Pets welcome");
            }
            const label = unitInfo.length > 0 ? unitInfo.join(" · ") : "Tour this unit";
            return (
              <p className="text-xs text-emerald-700 font-medium truncate">
                {label}
              </p>
            );
          })()}
          {property.description && (
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              {property.description.split("\n")[0]}
            </p>
          )}
        </div>
      </div>

      <Button
        onClick={onClick}
        className="w-full h-10 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
      >
        <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
        Schedule a Showing
        <ChevronRight className="h-3.5 w-3.5 ml-auto" />
      </Button>
    </div>
  );
};

/* ================================================================ */

const ScheduleShowing: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const isMultiMode = !propertyId;

  // Multi-mode: property selection
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [bedsFilter, setBedsFilter] = useState<number>(0); // 0 = any, else minimum beds
  const [typeFilter, setTypeFilter] = useState<"all" | "single" | "multi">("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null); // address key
  const [rawProperties, setRawProperties] = useState<Property[]>([]);
  const [rawSlots, setRawSlots] = useState<SlotRecord[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(isMultiMode);

  // Effective property ID (from URL or user selection)
  const effectivePropertyId = propertyId || selectedPropertyId;

  // State
  const [property, setProperty] = useState<Property | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(!!propertyId);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [datesLoading, setDatesLoading] = useState(!!propertyId);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [timeSlots, setTimeSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [leadTimeMinutes, setLeadTimeMinutes] = useState(60); // default 1 hour

  // Form — pre-fill from localStorage if returning visitor
  const [fullName, setFullName] = useState(() => localStorage.getItem("rf_name") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem("rf_phone") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("rf_email") || "");
  const [consent, setConsent] = useState(() => localStorage.getItem("rf_consent") === "1");
  const [consentError, setConsentError] = useState(false);
  const [paymentType, setPaymentType] = useState<"self" | "voucher" | "">(
    () => (localStorage.getItem("rf_payment") as "self" | "voucher") || ""
  );
  const [note, setNote] = useState("");

  // Call Now button config
  const [callNowConfig, setCallNowConfig] = useState<{ enabled: boolean; phone: string; label: string } | null>(null);
  const [orgSettingsFetched, setOrgSettingsFetched] = useState<string | null>(null);

  // City cover images from org settings
  const [cityCoverImages, setCityCoverImages] = useState<Record<string, string>>({});

  // Featured property
  const [featuredProperty, setFeaturedProperty] = useState<Property | null>(null);

  // Booking
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookedLeadId, setBookedLeadId] = useState<string | null>(null);
  const [applyingSent, setApplyingSent] = useState(false);
  const [applyingLoading, setApplyingLoading] = useState(false);

  // ---- Multi-mode: fetch properties with available slots ----
  useEffect(() => {
    if (!isMultiMode) return;
    (async () => {
      setPropertiesLoading(true);
      const today = format(new Date(), "yyyy-MM-dd");
      const maxDate = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const { data: slotData } = await supabase
        .from("showing_available_slots")
        .select("property_id, slot_date, slot_time")
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .gte("slot_date", today)
        .lte("slot_date", maxDate);

      if (!slotData || slotData.length === 0) {
        setRawProperties([]);
        setRawSlots([]);
        setPropertiesLoading(false);
        return;
      }

      setRawSlots(slotData as SlotRecord[]);

      const uniqueIds = [...new Set(slotData.map((s) => s.property_id))];

      const { data: propData } = await supabase
        .from("properties")
        .select("*")
        .in("id", uniqueIds)
        .eq("status", "available")
        .order("address");

      setRawProperties((propData as Property[] | null) || []);
      setPropertiesLoading(false);
    })();
  }, [isMultiMode]);

  // ---- Multi-mode: fetch org-level lead time once we know org ----
  useEffect(() => {
    if (!isMultiMode) return;
    const orgId = rawProperties[0]?.organization_id;
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "showing_lead_time_minutes")
        .maybeSingle();
      if (data?.value != null) {
        setLeadTimeMinutes(typeof data.value === "number" ? data.value : parseInt(String(data.value)) || 60);
      }
    })();
  }, [isMultiMode, rawProperties]);

  // ---- Derived: filter past slots (per-property TZ) ----
  const futureSlots = useMemo<SlotRecord[]>(() => {
    if (rawSlots.length === 0 || rawProperties.length === 0) return [];
    const propertyById = new Map(rawProperties.map((p) => [p.id, p]));
    const cutoffByTz = new Map<string, { date: string; minute: number }>();
    return rawSlots.filter((s) => {
      const prop = propertyById.get(s.property_id);
      if (!prop) return false;
      const tz = getTimezoneForCity(prop.city);
      let cutoff = cutoffByTz.get(tz);
      if (!cutoff) {
        const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
        cutoff = {
          date: format(nowInTz, "yyyy-MM-dd"),
          minute: nowInTz.getHours() * 60 + nowInTz.getMinutes() + leadTimeMinutes,
        };
        cutoffByTz.set(tz, cutoff);
      }
      if (s.slot_date > cutoff.date) return true;
      if (s.slot_date < cutoff.date) return false;
      const [h, m] = s.slot_time.split(":").map(Number);
      return h * 60 + m >= cutoff.minute;
    });
  }, [rawSlots, rawProperties, leadTimeMinutes]);

  // ---- Derived: properties with up-to-date slot counts ----
  const properties = useMemo<PropertyWithSlots[]>(() => {
    const counts = new Map<string, number>();
    futureSlots.forEach((s) => counts.set(s.property_id, (counts.get(s.property_id) || 0) + 1));
    return rawProperties
      .filter((p) => (counts.get(p.id) || 0) > 0)
      .map((p) => ({ ...p, available_slot_count: counts.get(p.id) || 0 }));
  }, [rawProperties, futureSlots]);

  // ---- Fetch org-level public settings (call-now, city covers, featured) ----
  // Single source of truth — keyed by orgId so it survives refresh and only
  // fires once per org. The featured-property fetch is intentionally inside
  // this effect so it's not coupled to the lifecycle of other state like
  // `property` or `selectedBuilding`.
  useEffect(() => {
    const orgId = property?.organization_id || properties[0]?.organization_id;
    if (!orgId) return;
    if (orgSettingsFetched === orgId) return;
    setOrgSettingsFetched(orgId);

    (async () => {
      const { data: settingsData } = await supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", orgId)
        .in("key", ["call_now_button", "city_cover_images", "featured_property_id"]);

      let featuredId: string | null = null;
      for (const row of settingsData || []) {
        if (row.key === "call_now_button" && row.value) {
          const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (val?.enabled) {
            setCallNowConfig({
              enabled: !!val.enabled,
              phone: val.phone || "",
              label: val.label || "Call Now",
            });
          }
        }
        if (row.key === "city_cover_images" && row.value && typeof row.value === "object") {
          setCityCoverImages(row.value as Record<string, string>);
        }
        if (row.key === "featured_property_id" && row.value && typeof row.value === "string" && row.value.length > 0) {
          featuredId = row.value;
        }
      }

      if (featuredId) {
        const { data: fp } = await supabase
          .from("properties")
          .select("*")
          .eq("id", featuredId)
          .in("status", ["available", "coming_soon"])
          .maybeSingle();
        if (fp) setFeaturedProperty(fp as Property);
      }
    })();
  }, [property?.organization_id, properties, orgSettingsFetched]);

  // Group properties by building address
  const buildingGroups = useMemo<BuildingGroup[]>(() => {
    const map = new Map<string, PropertyWithSlots[]>();
    properties.forEach((p) => {
      const key = p.address;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });

    return [...map.entries()].map(([address, units]) => {
      const unitIds = new Set(units.map((u) => u.id));

      // Collect unique (date|time) pairs for this building, sorted chronologically
      const uniquePairs = new Set<string>();
      futureSlots.forEach((s) => {
        if (unitIds.has(s.property_id)) {
          uniquePairs.add(`${s.slot_date}|${s.slot_time}`);
        }
      });
      const sorted = [...uniquePairs].sort();

      // Next available slot
      const [nextDate, nextTime] = sorted.length > 0
        ? sorted[0].split("|")
        : [format(new Date(), "yyyy-MM-dd"), "09:00:00"];

      // Real number of distinct times on the nearest available day
      const spotsNextDay = sorted.filter((p) => p.startsWith(nextDate + "|")).length;

      // Rent range
      const rents = units.map((u) => u.rent_price).filter((r): r is number => r != null).sort((a, b) => a - b);

      // Variant: show "Only X left" only when it's actually scarce (≤ 3),
      // otherwise show "Next: <date> <time>".
      const displayVariant: 1 | 2 = spotsNextDay > 0 && spotsNextDay <= 3 ? 2 : 1;

      return {
        address,
        city: units[0].city || "",
        state: units[0].state,
        zip_code: units[0].zip_code,
        photoUrl: getPhotoUrl(units[0]),
        units,
        nextSlotDate: nextDate,
        nextSlotTime: nextTime,
        spotsNextDay,
        rentMin: rents.length > 0 ? rents[0] : null,
        rentMax: rents.length > 0 ? rents[rents.length - 1] : null,
        displayVariant,
      };
    });
  }, [properties, futureSlots]);

  // Unique cities with property counts and representative photo
  const cityGroups = useMemo(() => {
    const map = new Map<string, { count: number; photoUrl: string | null; rentMin: number | null; rentMax: number | null }>();
    buildingGroups.forEach((b) => {
      const city = b.city || "Other";
      const existing = map.get(city);
      const rents = b.units.map((u) => u.rent_price).filter((r): r is number => r != null);
      if (!existing) {
        map.set(city, {
          count: 1,
          photoUrl: b.photoUrl,
          rentMin: rents.length > 0 ? Math.min(...rents) : null,
          rentMax: rents.length > 0 ? Math.max(...rents) : null,
        });
      } else {
        existing.count += 1;
        if (!existing.photoUrl && b.photoUrl) existing.photoUrl = b.photoUrl;
        if (rents.length > 0) {
          const minR = Math.min(...rents);
          const maxR = Math.max(...rents);
          existing.rentMin = existing.rentMin != null ? Math.min(existing.rentMin, minR) : minR;
          existing.rentMax = existing.rentMax != null ? Math.max(existing.rentMax, maxR) : maxR;
        }
      }
    });
    return [...map.entries()]
      .map(([city, info]) => ({
        city,
        ...info,
        // Use admin-configured cover image if available
        photoUrl: cityCoverImages[city] || info.photoUrl,
      }))
      .sort((a, b) => b.count - a.count);
  }, [buildingGroups, cityCoverImages]);

  // Auto-select city if only one
  useEffect(() => {
    if (isMultiMode && !propertiesLoading && cityGroups.length === 1 && !selectedCity) {
      setSelectedCity(cityGroups[0].city);
    }
  }, [cityGroups, propertiesLoading, isMultiMode, selectedCity]);

  // Filter buildings by selected city
  const cityBuildings = useMemo(
    () => selectedCity ? buildingGroups.filter((b) => (b.city || "Other") === selectedCity) : buildingGroups,
    [buildingGroups, selectedCity]
  );
  const filteredBuildings = useMemo(() => {
    let list = cityBuildings;
    if (typeFilter === "single") list = list.filter((b) => !buildingIsMulti(b));
    else if (typeFilter === "multi") list = list.filter((b) => buildingIsMulti(b));
    if (bedsFilter > 0) {
      list = list.filter(
        (b) => Math.max(0, ...b.units.map((u) => u.bedrooms ?? 0)) >= bedsFilter,
      );
    }
    return list;
  }, [cityBuildings, typeFilter, bedsFilter]);
  const filtersActive = bedsFilter > 0 || typeFilter !== "all";

  // Units in the currently selected building
  const selectedBuildingUnits = useMemo(
    () => (selectedBuilding ? properties.filter((p) => p.address === selectedBuilding) : []),
    [selectedBuilding, properties]
  );

  // ---- Fetch property ----
  useEffect(() => {
    if (!effectivePropertyId) return;
    (async () => {
      setPropertyLoading(true);
      setPropertyError(null);
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", effectivePropertyId)
        .single();

      // Inactive properties are hidden from every public surface — treat a
      // direct link to one exactly like a property that no longer exists.
      if (error || !data || data.status === "inactive") {
        setPropertyError("Property not found or no longer available.");
      } else {
        setProperty(data);
        // Record a real detail-view for this property (raw count). Fires for
        // every property-page open regardless of entry point.
        trackPropertyView("detail_view", [data.id]);
      }
      setPropertyLoading(false);
    })();
  }, [effectivePropertyId]);

  // ---- Fetch lead time setting from org ----
  useEffect(() => {
    if (!property?.organization_id) return;
    (async () => {
      const { data } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", property.organization_id)
        .eq("key", "showing_lead_time_minutes")
        .maybeSingle();
      if (data?.value != null) {
        setLeadTimeMinutes(typeof data.value === "number" ? data.value : parseInt(String(data.value)) || 60);
      }
    })();
  }, [property?.organization_id]);

  // ---- Fetch available dates (next 30 days) ----
  useEffect(() => {
    if (!effectivePropertyId) return;
    (async () => {
      setDatesLoading(true);
      const today = format(new Date(), "yyyy-MM-dd");
      const maxDate = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("slot_date")
        .eq("property_id", effectivePropertyId)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .gte("slot_date", today)
        .lte("slot_date", maxDate);

      if (!error && data) {
        const uniqueDates = [...new Set(data.map((d) => d.slot_date))];
        setAvailableDates(uniqueDates.map((d) => parseISO(d)));
      }
      setDatesLoading(false);
    })();
  }, [effectivePropertyId]);

  // ---- Fetch slots for selected date ----
  useEffect(() => {
    if (!effectivePropertyId || !selectedDate) return;
    (async () => {
      setSlotsLoading(true);
      setSelectedTime(null);
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("slot_time, duration_minutes")
        .eq("property_id", effectivePropertyId)
        .eq("slot_date", dateStr)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .order("slot_time");

      if (!error && data) {
        // Filter out slots that are too close to the current time
        const tz = getTimezoneForCity(property?.city);
        const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
        const todayStr = format(nowInTz, "yyyy-MM-dd");

        if (dateStr === todayStr) {
          const cutoffMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes() + leadTimeMinutes;
          setTimeSlots(data.filter((slot) => {
            const [h, m] = slot.slot_time.split(":").map(Number);
            return h * 60 + m >= cutoffMinutes;
          }));
        } else {
          setTimeSlots(data);
        }
      }
      setSlotsLoading(false);
    })();
  }, [effectivePropertyId, selectedDate, property?.city, leadTimeMinutes]);

  // Phone is valid only with 10 digits (NANP).
  const phoneDigits = phone.replace(/\D/g, "");
  const isPhoneValid = phoneDigits.length === 10;

  // ---- Handle booking ----
  const handleBook = async () => {
    if (!consent) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    if (!fullName.trim() || !isPhoneValid) return;
    if (!selectedDate || !selectedTime || !effectivePropertyId || !property) return;

    setSubmitting(true);
    setBookingError(null);

    try {
      const { data, error } = await supabase.functions.invoke("book-public-showing", {
        body: {
          property_id: effectivePropertyId,
          organization_id: property.organization_id,
          slot_date: format(selectedDate, "yyyy-MM-dd"),
          slot_time: selectedTime,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          has_voucher: paymentType === "voucher",
          note: note.trim() || null,
          consent: buildConsentPayload(consent),
        },
      });

      if (error) {
        // Try to extract specific error message from edge function response
        let msg = "Something went wrong while booking. Please try again or call us directly.";
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        setBookingError(msg);
        setSubmitting(false);
        return;
      }

      if (data?.error) {
        setBookingError(data.error);
      } else {
        setBooked(true);
        if (data?.lead_id) setBookedLeadId(data.lead_id);
        // Remember visitor info for next time
        try {
          localStorage.setItem("rf_name", fullName.trim());
          localStorage.setItem("rf_phone", phone.trim());
          if (email.trim()) localStorage.setItem("rf_email", email.trim());
          if (consent) localStorage.setItem("rf_consent", "1");
          if (paymentType) localStorage.setItem("rf_payment", paymentType);
        } catch {}
      }
    } catch (err: any) {
      console.error("Booking error:", err);
      setBookingError(
        "Something went wrong while booking. Please try again or call us directly."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Format phone while typing
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    if (raw.length >= 7) {
      setPhone(`(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`);
    } else if (raw.length >= 4) {
      setPhone(`(${raw.slice(0, 3)}) ${raw.slice(3)}`);
    } else {
      setPhone(raw);
    }
  };

  // Property photos for carousel
  const allPhotos = useMemo(() => getAllPhotoUrls(property), [property?.photos]);

  // Reset to property selection (multi-mode)
  const handleChangeProperty = () => {
    setProperty(null);
    setSelectedPropertyId(null);
    setSelectedBuilding(null);
    setSelectedCity(cityGroups.length > 1 ? null : selectedCity);
    setPropertyError(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setAvailableDates([]);
    setTimeSlots([]);
  };

  // Apply Now handler
  const handleApplyNow = async () => {
    if (!bookedLeadId || !effectivePropertyId || !property) return;
    setApplyingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-application-invite", {
        body: {
          lead_id: bookedLeadId,
          property_id: effectivePropertyId,
          organization_id: property.organization_id,
        },
      });
      if (error) {
        console.error("Application invite error:", error);
      }
      setApplyingSent(true);
    } catch (err) {
      console.error("Application invite error:", err);
      setApplyingSent(true); // Show message anyway so user isn't stuck
    } finally {
      setApplyingLoading(false);
    }
  };

  // Reset all for "Schedule Another"
  const handleScheduleAnother = () => {
    setBooked(false);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setFullName("");
    setPhone("");
    setEmail("");
    setNote("");
    setConsent(false);
    setBookingError(null);
    setBookedLeadId(null);
    setApplyingSent(false);
    setApplyingLoading(false);
    if (isMultiMode) {
      setProperty(null);
      setSelectedPropertyId(null);
      setSelectedBuilding(null);
      setSelectedCity(cityGroups.length > 1 ? null : selectedCity);
      setAvailableDates([]);
      setTimeSlots([]);
    }
  };

  // ---- RENDER ----

  // Loading state (direct URL mode only)
  if (propertyId && propertyLoading) {
    return (
      <div className="min-h-screen bg-[#f4f1f1] flex items-center justify-center p-4">
        <div className="w-full max-w-[760px] space-y-4">
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  // Error state (direct URL mode only)
  if (propertyId && (propertyError || !property)) {
    return (
      <div className="min-h-screen bg-[#f4f1f1] flex items-center justify-center p-4">
        <Card className="w-full max-w-[760px]">
          <CardContent className="p-8 text-center">
            <Home className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Property Not Found</h2>
            <p className="text-muted-foreground">
              {propertyError || "This property is no longer available for showings."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f1f1]">
      {/* Hero header */}
      <div className="bg-[#4F46E5] text-white px-4 pt-8 pb-10" style={{ fontFamily: "Montserrat, sans-serif" }}>
        <div className="max-w-[760px] mx-auto space-y-2">
          <p className="text-[#ffb22c] text-xs font-semibold tracking-widest uppercase">
            Book a Free Tour
          </p>
          <h1 className="text-2xl font-bold leading-tight">
            Find Your Next Home
          </h1>
          <p className="text-white/70 text-sm leading-relaxed">
            Pick a property, choose a time that works for you, and we'll be there to show you around.
          </p>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-4 -mt-5 space-y-6 relative z-10">

        {/* Featured Property Card — compact horizontal */}
        {isMultiMode && !property && !selectedBuilding && featuredProperty && (() => {
          const fp = featuredProperty;
          const fpPhotos = getAllPhotoUrls(fp);
          const specs: string[] = [];
          if (fp.bedrooms != null) specs.push(`${fp.bedrooms} BR`);
          if (fp.bathrooms != null) specs.push(`${fp.bathrooms} BA`);
          if (fp.square_feet) specs.push(`${fp.square_feet.toLocaleString()} SF`);
          return (
            <div className="rounded-xl border-2 border-amber-300 bg-white overflow-hidden shadow-md relative">
              {/* Featured ribbon */}
              <div className="absolute top-2 right-2 z-10 pointer-events-none">
                <Badge className="bg-amber-500 text-white text-[10px] font-bold gap-1 shadow-md">
                  <Sparkles className="h-3 w-3" />
                  Featured
                </Badge>
              </div>

              <div className="flex gap-3 p-3">
                <PhotoCarousel
                  photos={fpPhotos}
                  alt={fp.address}
                  className="h-40 w-44 sm:h-44 sm:w-52 rounded-lg shrink-0"
                  arrowSize="md"
                />

                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                  {fp.rent_price != null && (
                    <div className="flex items-baseline gap-1 leading-none pr-16">
                      <span className="text-2xl font-extrabold text-slate-900">
                        ${fp.rent_price.toLocaleString()}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">/mo</span>
                    </div>
                  )}
                  {specs.length > 0 && (
                    <p className="text-sm text-slate-600 truncate">{specs.join(" · ")}</p>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-base text-slate-900 truncate leading-tight">
                      {fp.address}{fp.unit_number ? ` #${fp.unit_number}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-0.5 truncate mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[fp.city, fp.state].filter(Boolean).join(", ")}
                    </p>
                  </div>

                  {fp.section_8_accepted && (
                    <div>
                      <Badge className="text-[11px] h-6 px-2 bg-blue-100 text-blue-700 border-0">
                        Section 8
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              <Button
                className="w-full h-10 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                onClick={() => setSelectedPropertyId(fp.id)}
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                Schedule a Showing
                <ChevronRight className="h-3.5 w-3.5 ml-auto" />
              </Button>
            </div>
          );
        })()}

        {/* Multi-mode Step 1: City Selector */}
        {isMultiMode && !property && !selectedBuilding && !selectedCity && (
          <Card className="shadow-md">
            <CardContent className="p-5 space-y-4">
              <div className="text-center space-y-1">
                <MapPin className="h-6 w-6 text-[#4F46E5] mx-auto" />
                <h3 className="font-semibold text-base">Where are you looking?</h3>
                <p className="text-xs text-muted-foreground">Select a city to see available homes</p>
              </div>
              {propertiesLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 rounded-2xl" />
                  ))}
                </div>
              ) : cityGroups.length === 0 ? (
                <div className="text-center py-6">
                  <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No properties with available showing times right now.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please check back later or call us directly.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {cityGroups.map((cg) => (
                    <button
                      key={cg.city}
                      onClick={() => setSelectedCity(cg.city)}
                      className="relative group rounded-2xl overflow-hidden border border-white/60 shadow-sm hover:shadow-lg transition-all hover:scale-[1.02] active:scale-95 text-left"
                    >
                      {/* Photo background */}
                      <div className="h-36 w-full bg-gradient-to-br from-indigo-100 to-indigo-50">
                        {cg.photoUrl && (
                          <img
                            src={cg.photoUrl}
                            alt={cg.city}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        )}
                      </div>
                      {/* Dark gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      {/* Content */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h4 className="text-white font-bold text-base leading-tight drop-shadow-sm">
                          {cg.city}
                        </h4>
                        <p className="text-white/80 text-[11px] mt-0.5">
                          {cg.count} {cg.count === 1 ? "property" : "properties"}
                        </p>
                        {cg.rentMin != null && (
                          <p className="text-[#ffb22c] text-[11px] font-semibold mt-0.5">
                            From ${cg.rentMin.toLocaleString()}/mo
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Multi-mode Step 2: Building Selection (filtered by city) */}
        {isMultiMode && !property && !selectedBuilding && selectedCity && (
          <Card className="shadow-md">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#4F46E5]" />
                <h3 className="font-semibold text-sm text-muted-foreground">
                  Properties in {selectedCity}
                </h3>
                {cityGroups.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-xs"
                    onClick={() => setSelectedCity(null)}
                  >
                    <ArrowLeft className="h-3 w-3 mr-1" />
                    Cities
                  </Button>
                )}
              </div>

              {/* Simple filters: bedrooms + single/multi — centered & labeled */}
              {cityBuildings.length > 1 && (
                <div className="flex flex-wrap items-end justify-center gap-x-8 gap-y-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <BedDouble className="h-4 w-4" /> Bedrooms
                    </span>
                    <div className="inline-flex rounded-xl border bg-white p-1">
                      {BEDS_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setBedsFilter(o.value)}
                          className={`h-10 min-w-[3rem] px-3 rounded-lg text-sm font-semibold transition-colors ${
                            bedsFilter === o.value
                              ? "bg-[#4F46E5] text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Layers className="h-4 w-4" /> Home type
                    </span>
                    <div className="inline-flex rounded-xl border bg-white p-1">
                      {TYPE_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setTypeFilter(o.value)}
                          className={`h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${
                            typeFilter === o.value
                              ? "bg-[#4F46E5] text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {filteredBuildings.length === 0 ? (
                <div className="text-center py-6">
                  <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {filtersActive && cityBuildings.length > 0
                      ? "No properties match these filters."
                      : `No properties available in ${selectedCity} right now.`}
                  </p>
                  {filtersActive && cityBuildings.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setBedsFilter(0);
                        setTypeFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBuildings.map((bldg) => (
                    <BuildingSelectCard
                      key={bldg.address}
                      building={bldg}
                      onClick={() => {
                        if (bldg.units.length === 1) {
                          setSelectedPropertyId(bldg.units[0].id);
                        } else {
                          setSelectedBuilding(bldg.address);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Multi-mode: Unit Selection within a building */}
        {isMultiMode && !property && selectedBuilding && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Home className="h-5 w-5 text-[#4F46E5]" />
                <h3 className="font-semibold text-lg">Select a Unit</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => setSelectedBuilding(null)}
                >
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  Back
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedBuilding} — choose a unit:
              </p>
              <div className="space-y-2">
                {selectedBuildingUnits.map((unit) => (
                  <UnitSelectCard
                    key={unit.id}
                    property={unit}
                    onClick={() => setSelectedPropertyId(unit.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Multi-mode: loading selected property */}
        {isMultiMode && selectedPropertyId && propertyLoading && (
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full rounded-xl" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        )}

        {/* Property Card — horizontal summary, same for multi-mode and direct URL */}
        {property && (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <div className="flex gap-3 p-3">
              <PhotoCarousel
                photos={allPhotos}
                alt={property.address}
                className="h-40 w-40 sm:h-48 sm:w-48 rounded-lg shrink-0"
                arrowSize="md"
              />

              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-1 leading-none">
                    <span className="text-xl font-extrabold text-slate-900">
                      ${property.rent_price?.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-xs text-slate-600 truncate">
                    {property.bedrooms} BR · {property.bathrooms} BA
                    {property.square_feet ? ` · ${property.square_feet.toLocaleString()} SF` : ""}
                  </p>
                  <p className="font-semibold text-sm text-slate-900 truncate leading-tight">
                    {property.address}
                    {property.unit_number && `, Unit ${property.unit_number}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    {property.city}, {property.state}
                  </p>
                </div>

                {isMultiMode && !booked && (
                  <button
                    type="button"
                    onClick={handleChangeProperty}
                    className="text-[11px] text-[#4F46E5] hover:underline self-start mt-1 flex items-center gap-0.5"
                  >
                    <ArrowLeft className="h-2.5 w-2.5" />
                    Change
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success screen */}
        {property && booked ? (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold">Showing Confirmed!</h2>
              <p className="text-muted-foreground">
                Your showing has been scheduled for{" "}
                <span className="font-semibold text-foreground">
                  {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
                </span>{" "}
                at{" "}
                <span className="font-semibold text-foreground">
                  {selectedTime && formatTime(selectedTime)}
                </span>
                .
              </p>
              <p className="text-sm text-muted-foreground">
                You'll receive a confirmation call or text shortly. If you need to reschedule,
                please call us directly.
              </p>

              {/* Apply Now section */}
              {!applyingSent ? (
                <div className="border-t pt-4 mt-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Want to get ahead? Apply now to speed up the process!
                  </p>
                  <Button
                    className="w-full h-12 bg-[#ffb22c] hover:bg-[#ffb22c]/90 text-[#4F46E5] font-semibold text-base"
                    onClick={handleApplyNow}
                    disabled={applyingLoading || !bookedLeadId}
                  >
                    {applyingLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending Application...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Apply Now
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="border-t pt-4 mt-4 space-y-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-left">
                    <p className="text-sm font-semibold text-emerald-800">
                      Application Sent!
                    </p>
                    <p className="text-sm text-emerald-700 mt-1">
                      Check your email — you'll receive an application invitation from <strong>DoorLoop</strong> in the next few minutes. Be sure to check your spam folder too.
                    </p>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="mt-4"
                onClick={handleScheduleAnother}
              >
                Schedule Another Showing
              </Button>
            </CardContent>
          </Card>
        ) : property && !booked ? (
          <>
            {/* Step 1: Compact available-date picker */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold">
                    1
                  </div>
                  <h3 className="font-semibold">Pick a Date</h3>
                </div>

                {datesLoading ? (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-12 rounded-lg shrink-0" />
                    ))}
                  </div>
                ) : availableDates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No available dates at this time. Please check back later or call us.
                  </p>
                ) : (
                  <div
                    className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {[...availableDates]
                      .sort((a, b) => a.getTime() - b.getTime())
                      .map((date) => {
                        const isSelected = selectedDate && isSameDay(selectedDate, date);
                        const now = new Date();
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const tomorrow = new Date(today);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        const isToday = isSameDay(date, today);
                        const isTomorrow = isSameDay(date, tomorrow);
                        return (
                          <button
                            key={date.toISOString()}
                            type="button"
                            onClick={() => setSelectedDate(date)}
                            className={`shrink-0 snap-start w-12 rounded-lg border px-1 py-1.5 text-center transition-all active:scale-95 ${
                              isSelected
                                ? "border-[#4F46E5] bg-[#4F46E5] text-white shadow-sm"
                                : "border-slate-200 bg-white hover:border-[#4F46E5]/40 text-slate-900"
                            }`}
                          >
                            <div className={`text-[9px] font-semibold uppercase tracking-wider leading-tight ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                              {isToday ? "Today" : isTomorrow ? "Tmrw" : format(date, "EEE")}
                            </div>
                            <div className={`text-base font-extrabold leading-tight ${isSelected ? "text-white" : "text-slate-900"}`}>
                              {format(date, "d")}
                            </div>
                            <div className={`text-[9px] font-medium leading-tight ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                              {format(date, "MMM")}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Time Slots */}
            {selectedDate && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(undefined);
                      setSelectedTime(null);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline -ml-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to dates
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <h3 className="font-semibold">
                      Pick a Time — {format(selectedDate, "EEE, MMM d")}
                    </h3>
                  </div>

                  {slotsLoading ? (
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-11 rounded-lg" />
                      ))}
                    </div>
                  ) : timeSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No available times on this date. Please pick another day.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map((slot) => (
                        <Button
                          key={slot.slot_time}
                          variant={selectedTime === slot.slot_time ? "default" : "outline"}
                          className={`h-11 rounded-lg text-sm font-medium transition-all ${
                            selectedTime === slot.slot_time
                              ? "bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
                              : "hover:border-[#4F46E5] hover:text-[#4F46E5]"
                          }`}
                          onClick={() => setSelectedTime(slot.slot_time)}
                        >
                          <Clock className="h-3.5 w-3.5 mr-1.5" />
                          {formatTime(slot.slot_time)}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 3: Contact Form */}
            {selectedTime && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <button
                    type="button"
                    onClick={() => setSelectedTime(null)}
                    className="flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline -ml-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to times
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold">
                      3
                    </div>
                    <h3 className="font-semibold">Your Information</h3>
                  </div>

                  {/* Summary badges */}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline" className="gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {format(selectedDate!, "EEE, MMM d")}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(selectedTime)}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="fullName">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="fullName"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">
                        Phone Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(216) 555-1234"
                        value={phone}
                        onChange={handlePhoneChange}
                        className={`mt-1 ${phoneDigits.length > 0 && !isPhoneValid ? "border-destructive" : ""}`}
                      />
                      {phoneDigits.length > 0 && !isPhoneValid && (
                        <p className="text-xs text-destructive mt-1">
                          Please enter a 10-digit US phone number.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="email">Email (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    {/* Payment type */}
                    <div>
                      <Label>Payment Method <span className="text-destructive">*</span></Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setPaymentType("self")}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                            paymentType === "self"
                              ? "border-[#4F46E5] bg-[#4F46E5]/5 text-[#4F46E5]"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <DollarSign className="h-4 w-4" />
                          Self-Pay
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentType("voucher")}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                            paymentType === "voucher"
                              ? "border-[#4F46E5] bg-[#4F46E5]/5 text-[#4F46E5]"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <FileText className="h-4 w-4" />
                          Housing Voucher
                        </button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="note">Note (optional)</Label>
                      <Textarea
                        id="note"
                        placeholder="Anything we should know? (move-in date, questions, etc.)"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        rows={3}
                        className="mt-1 resize-none"
                      />
                      {note.length > 400 && (
                        <p className="text-[11px] text-muted-foreground mt-1 text-right">
                          {500 - note.length} characters left
                        </p>
                      )}
                    </div>

                    <SmsConsentCheckbox
                      checked={consent}
                      onCheckedChange={(val) => {
                        setConsent(val);
                        if (val) setConsentError(false);
                      }}
                      error={consentError}
                    />

                    {bookingError && (
                      <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                        {bookingError}
                      </p>
                    )}

                    <Button
                      className="w-full h-12 bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white font-semibold text-base"
                      onClick={handleBook}
                      disabled={submitting || !fullName.trim() || !isPhoneValid || !paymentType}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Booking...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Confirm Showing
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by Rent Finder Cleveland
        </p>

        {/* Spacer so the floating Call Now button never overlaps content */}
        <div className={callNowConfig?.enabled ? "h-32" : "h-6"} aria-hidden />
      </div>

      {/* Floating Call Now Button — always visible, safe area aware */}
      {callNowConfig?.enabled && callNowConfig.phone && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.08) 60%, transparent)" }}>
          <a
            href={`tel:${callNowConfig.phone}`}
            className="mx-auto flex items-center justify-center gap-2.5 w-full max-w-[760px] py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-xl shadow-emerald-600/40 transition-all hover:scale-[1.02] active:scale-95 animate-call-pulse"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            <Phone className="h-5 w-5 animate-wiggle" />
            Talk to Us — We're Available!
          </a>
          <style>{`
            @keyframes call-pulse {
              0%, 100% { box-shadow: 0 10px 30px -5px rgba(5,150,105,0.4); }
              50% { box-shadow: 0 10px 40px 0px rgba(5,150,105,0.6); }
            }
            .animate-call-pulse { animation: call-pulse 2s ease-in-out infinite; }
            @keyframes wiggle {
              0%, 100% { transform: rotate(0deg); }
              15% { transform: rotate(-12deg); }
              30% { transform: rotate(10deg); }
              45% { transform: rotate(-8deg); }
              60% { transform: rotate(5deg); }
              75% { transform: rotate(0deg); }
            }
            .animate-wiggle { animation: wiggle 2s ease-in-out infinite; }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default ScheduleShowing;
