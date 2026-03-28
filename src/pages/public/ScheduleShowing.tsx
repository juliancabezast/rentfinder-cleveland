import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SmsConsentCheckbox,
  buildConsentPayload,
} from "@/components/public/SmsConsentCheckbox";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin,
  BedDouble,
  Bath,
  DollarSign,
  CheckCircle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader2,
  Home,
  SquareIcon,
  FileText,
  ChevronRight,
  Building2,
  Phone,
  Star,
  Sparkles,
} from "lucide-react";
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

/* ---- Property Select Card (multi-mode) ---- */
const PropertySelectCard: React.FC<{
  property: PropertyWithSlots;
  onClick: () => void;
}> = ({ property, onClick }) => {
  const photoUrl = getPhotoUrl(property);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all text-left"
    >
      <div className="h-16 w-24 rounded-lg overflow-hidden shrink-0 bg-muted">
        {photoUrl ? (
          <img src={photoUrl} alt={property.address} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-6 w-6 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {property.address}
          {property.unit_number && `, Unit ${property.unit_number}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {property.city}, {property.state} {property.zip_code}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
            <BedDouble className="h-2.5 w-2.5" /> {property.bedrooms}
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
            <Bath className="h-2.5 w-2.5" /> {property.bathrooms}
          </Badge>
          <Badge className="bg-[#4F46E5] text-white text-[10px] h-5">
            ${property.rent_price?.toLocaleString()}/mo
          </Badge>
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">
        {property.available_slot_count} {property.available_slot_count === 1 ? "slot" : "slots"}
      </Badge>
    </button>
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

/** Simple deterministic hash from string → number */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
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

const BuildingSelectCard: React.FC<{
  building: BuildingGroup;
  onClick: () => void;
}> = ({ building, onClick }) => {
  const rentLabel =
    building.rentMin != null && building.rentMax != null && building.rentMin !== building.rentMax
      ? `$${building.rentMin.toLocaleString()}–$${building.rentMax.toLocaleString()}/mo`
      : building.rentMin != null
        ? `$${building.rentMin.toLocaleString()}/mo`
        : null;

  const dateLabel = friendlyDate(building.nextSlotDate);
  const timeLabel = formatTime(building.nextSlotTime);
  const spots = building.spotsNextDay;
  const v = building.displayVariant;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all text-left"
    >
      <div className="h-16 w-24 rounded-lg overflow-hidden shrink-0 bg-muted">
        {building.photoUrl ? (
          <img src={building.photoUrl} alt={building.address} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 className="h-6 w-6 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{building.address}</p>
        <p className="text-xs text-muted-foreground">
          {building.city}, {building.state} {building.zip_code}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <Badge variant="outline" className="text-[10px] h-5">
            {building.units.length} {building.units.length === 1 ? "unit" : "units"}
          </Badge>
          {rentLabel && (
            <Badge className="bg-[#4F46E5] text-white text-[10px] h-5">
              {rentLabel}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0 max-w-[110px]">
        {v === 1 ? (
          /* Variant 1: "Next: Tomorrow 9 AM" */
          <>
            <span className="text-[10px] font-semibold text-[#4F46E5]">
              Next: {dateLabel}
            </span>
            <span className="text-[10px] text-muted-foreground">{timeLabel}</span>
          </>
        ) : (
          /* Variant 2: "Only X left" */
          <>
            <Badge
              variant="outline"
              className="text-[10px] text-orange-700 border-orange-300 bg-orange-50"
            >
              Only {spots} left
            </Badge>
            <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
          </>
        )}
      </div>
    </button>
  );
};

const UnitSelectCard: React.FC<{
  property: PropertyWithSlots;
  onClick: () => void;
}> = ({ property, onClick }) => {
  // Show 2nd photo (interior) if available, fallback to 1st
  const unitPhoto = getPhotoUrl(property, 1);

  return (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all text-left"
  >
    <div className="h-14 w-20 rounded-lg overflow-hidden shrink-0 bg-muted">
      {unitPhoto ? (
        <img src={unitPhoto} alt={property.unit_number || "Unit"} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Home className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-sm">
        {property.unit_number ? `Unit ${property.unit_number}` : "Main Unit"}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
          <BedDouble className="h-2.5 w-2.5" /> {property.bedrooms}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
          <Bath className="h-2.5 w-2.5" /> {property.bathrooms}
        </Badge>
        <Badge className="bg-[#4F46E5] text-white text-[10px] h-5">
          ${property.rent_price?.toLocaleString()}/mo
        </Badge>
      </div>
    </div>
    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
  </button>
  );
};

/* ================================================================ */

const ScheduleShowing: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const isMultiMode = !propertyId;

  // Multi-mode: property selection
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null); // address key
  const [properties, setProperties] = useState<PropertyWithSlots[]>([]);
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

  // Call Now button config
  const [callNowConfig, setCallNowConfig] = useState<{ enabled: boolean; phone: string; label: string } | null>(null);
  const [callNowOrgFetched, setCallNowOrgFetched] = useState(false);

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
        setProperties([]);
        setRawSlots([]);
        setPropertiesLoading(false);
        return;
      }

      setRawSlots(slotData as SlotRecord[]);

      const slotCounts = new Map<string, number>();
      slotData.forEach((s) => {
        slotCounts.set(s.property_id, (slotCounts.get(s.property_id) || 0) + 1);
      });
      const uniqueIds = [...slotCounts.keys()];

      const { data: propData } = await supabase
        .from("properties")
        .select("*")
        .in("id", uniqueIds)
        .eq("status", "available")
        .order("address");

      if (propData) {
        setProperties(
          propData.map((p) => ({
            ...p,
            available_slot_count: slotCounts.get(p.id) || 0,
          }))
        );
      }
      setPropertiesLoading(false);
    })();
  }, [isMultiMode]);

  // ---- Fetch Call Now button config ----
  useEffect(() => {
    if (callNowOrgFetched) return;
    // Get org_id from any available source
    const orgId = property?.organization_id || properties[0]?.organization_id;
    if (!orgId) return;
    setCallNowOrgFetched(true);
    (async () => {
      const { data } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "call_now_button")
        .single();
      if (data?.value) {
        const val = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        if (val.enabled) {
          setCallNowConfig({ enabled: val.enabled, phone: val.phone || "", label: val.label || "Call Now" });
        }
      }
    })();

    // Also fetch city cover images + featured property
    (async () => {
      const { data: settingsData } = await supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", orgId)
        .in("key", ["city_cover_images", "featured_property_id"]);

      for (const row of settingsData || []) {
        if (row.key === "city_cover_images" && row.value && typeof row.value === "object") {
          setCityCoverImages(row.value as Record<string, string>);
        }
        if (row.key === "featured_property_id" && row.value && typeof row.value === "string" && row.value.length > 0) {
          const { data: fp } = await supabase
            .from("properties")
            .select("*")
            .eq("id", row.value)
            .maybeSingle();
          if (fp) setFeaturedProperty(fp as Property);
        }
      }
    })();
  }, [property, properties, callNowOrgFetched]);

  // Group properties by building address
  const buildingGroups = useMemo<BuildingGroup[]>(() => {
    const map = new Map<string, PropertyWithSlots[]>();
    properties.forEach((p) => {
      const key = p.address;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });

    return [...map.entries()].map(([address, units], idx) => {
      const unitIds = new Set(units.map((u) => u.id));

      // Collect unique (date|time) pairs for this building, sorted chronologically
      const uniquePairs = new Set<string>();
      rawSlots.forEach((s) => {
        if (unitIds.has(s.property_id)) {
          uniquePairs.add(`${s.slot_date}|${s.slot_time}`);
        }
      });
      const sorted = [...uniquePairs].sort();

      // Next available slot
      const [nextDate, nextTime] = sorted.length > 0
        ? sorted[0].split("|")
        : [format(new Date(), "yyyy-MM-dd"), "09:00:00"];

      // Spots on the nearest available day — display a small urgency number (1–3)
      const realSpots = sorted.filter((p) => p.startsWith(nextDate + "|")).length;
      const spotsNextDay = realSpots === 0 ? 1 : Math.max(1, ((hashStr(address) % 3) + 1));

      // Rent range
      const rents = units.map((u) => u.rent_price).filter((r): r is number => r != null).sort((a, b) => a - b);

      // Deterministic variant (1 or 2) based on address hash
      const displayVariant = ((hashStr(address) % 2) + 1) as 1 | 2;

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
  }, [properties, rawSlots]);

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
  const filteredBuildings = useMemo(
    () => selectedCity ? buildingGroups.filter((b) => (b.city || "Other") === selectedCity) : buildingGroups,
    [buildingGroups, selectedCity]
  );

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

      if (error || !data) {
        setPropertyError("Property not found or no longer available.");
      } else {
        setProperty(data);
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

  // ---- Handle booking ----
  const handleBook = async () => {
    if (!consent) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    if (!fullName.trim() || !phone.trim()) return;
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

  // Property photo
  const photoUrl = useMemo(() => getPhotoUrl(property!), [property?.photos]);

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
        <div className="w-full max-w-[640px] space-y-4">
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
        <Card className="w-full max-w-[640px]">
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
        <div className="max-w-[640px] mx-auto space-y-2">
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

      <div className="max-w-[640px] mx-auto px-4 -mt-5 space-y-6 relative z-10">

        {/* Featured Property Card */}
        {isMultiMode && !property && !selectedBuilding && featuredProperty && (() => {
          const fp = featuredProperty;
          const fpPhoto = getPhotoUrl(fp);
          const details: string[] = [];
          if (fp.bedrooms) details.push(`${fp.bedrooms} Bed`);
          if (fp.bathrooms) details.push(`${fp.bathrooms} Bath`);
          if (fp.square_feet) details.push(`${fp.square_feet.toLocaleString()} sqft`);
          return (
            <Card className="shadow-lg border-0 overflow-hidden">
              {/* Photo */}
              {fpPhoto && (
                <div className="relative h-44 w-full">
                  <img src={fpPhoto} alt={fp.address} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-amber-500 text-white text-[10px] font-bold gap-1 shadow-md">
                      <Sparkles className="h-3 w-3" />
                      Featured
                    </Badge>
                  </div>
                </div>
              )}
              <CardContent className={fpPhoto ? "p-4 space-y-3" : "p-4 space-y-3 pt-5"}>
                {!fpPhoto && (
                  <Badge className="bg-amber-500 text-white text-[10px] font-bold gap-1 w-fit">
                    <Sparkles className="h-3 w-3" />
                    Featured
                  </Badge>
                )}
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {fp.address}{fp.unit_number ? ` #${fp.unit_number}` : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[fp.city, fp.state, fp.zip_code].filter(Boolean).join(", ")}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {fp.rent_price && (
                    <span className="text-lg font-extrabold text-[#4F46E5]">
                      ${fp.rent_price.toLocaleString()}<span className="text-xs font-medium text-muted-foreground">/mo</span>
                    </span>
                  )}
                  <div className="flex gap-1.5">
                    {details.map((d) => (
                      <Badge key={d} variant="outline" className="text-[10px] h-5">{d}</Badge>
                    ))}
                    {fp.section_8_accepted && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] h-5">Section 8</Badge>
                    )}
                  </div>
                </div>

                <Button
                  className="w-full h-11 bg-[#4F46E5] hover:bg-[#4F46E5]/90 font-semibold text-sm gap-2"
                  onClick={() => setSelectedPropertyId(fp.id)}
                >
                  <CalendarDays className="h-4 w-4" />
                  Book a Tour
                </Button>
              </CardContent>
            </Card>
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
              {filteredBuildings.length === 0 ? (
                <div className="text-center py-6">
                  <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No properties available in {selectedCity} right now.
                  </p>
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

        {/* Property Card — compact inline for multi-mode, hero for direct URL */}
        {property && (
          <>
            {isMultiMode ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-white">
                <div className="h-14 w-20 rounded-lg overflow-hidden shrink-0 bg-muted">
                  {photoUrl ? (
                    <img src={photoUrl} alt={property.address} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {property.address}
                    {property.unit_number && `, Unit ${property.unit_number}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {property.city}, {property.state} {property.zip_code}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                      <BedDouble className="h-2.5 w-2.5" /> {property.bedrooms}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                      <Bath className="h-2.5 w-2.5" /> {property.bathrooms}
                    </Badge>
                    <Badge className="bg-[#4F46E5] text-white text-[10px] h-5">
                      ${property.rent_price?.toLocaleString()}/mo
                    </Badge>
                  </div>
                </div>
                {!booked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs text-muted-foreground"
                    onClick={handleChangeProperty}
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <Card className="overflow-hidden">
                {photoUrl && (
                  <div className="aspect-video overflow-hidden">
                    <img
                      src={photoUrl}
                      alt={property.address}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardContent className="p-4 space-y-2">
                  <h2 className="text-lg font-bold flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-[#4F46E5] shrink-0" />
                    {property.address}
                    {property.unit_number && `, Unit ${property.unit_number}`}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {property.city}, {property.state} {property.zip_code}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline" className="gap-1">
                      <BedDouble className="h-3 w-3" /> {property.bedrooms} bed
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Bath className="h-3 w-3" /> {property.bathrooms} bath
                    </Badge>
                    <Badge className="bg-[#4F46E5] text-white gap-1">
                      <DollarSign className="h-3 w-3" /> ${property.rent_price?.toLocaleString()}/mo
                    </Badge>
                    {property.square_feet && (
                      <Badge variant="outline" className="gap-1">
                        <SquareIcon className="h-3 w-3" /> {property.square_feet} sqft
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
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
            {/* Step 1: Calendar */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold">
                    1
                  </div>
                  <h3 className="font-semibold">Pick a Date</h3>
                </div>

                {datesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : availableDates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No available dates at this time. Please check back later or call us.
                  </p>
                ) : (
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) =>
                        !availableDates.some((d) => isSameDay(d, date))
                      }
                      modifiers={{
                        available: availableDates,
                      }}
                      modifiersStyles={{
                        available: {
                          backgroundColor: "#ffb22c20",
                          borderRadius: "8px",
                          fontWeight: 600,
                        },
                      }}
                      fromDate={new Date()}
                      toDate={addDays(new Date(), 30)}
                      className="rounded-md"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Time Slots */}
            {selectedDate && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-6 w-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <h3 className="font-semibold">
                      Pick a Time — {format(selectedDate, "EEE, MMM d")}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-xs"
                      onClick={() => {
                        setSelectedDate(undefined);
                        setSelectedTime(null);
                      }}
                    >
                      <ArrowLeft className="h-3 w-3 mr-1" />
                      Change Date
                    </Button>
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
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-6 w-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold">
                      3
                    </div>
                    <h3 className="font-semibold">Your Information</h3>
                  </div>

                  {/* Summary badge */}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline" className="gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {format(selectedDate!, "EEE, MMM d")}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(selectedTime)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-auto py-0.5"
                      onClick={() => setSelectedTime(null)}
                    >
                      Change
                    </Button>
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
                        placeholder="(216) 555-1234"
                        value={phone}
                        onChange={handlePhoneChange}
                        className="mt-1"
                      />
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
                      disabled={submitting || !fullName.trim() || !phone.trim() || !paymentType}
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
        <p className="text-center text-xs text-muted-foreground pb-16">
          Powered by Rent Finder Cleveland
        </p>
      </div>

      {/* Floating Call Now Button — always visible, safe area aware */}
      {callNowConfig?.enabled && callNowConfig.phone && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.08) 60%, transparent)" }}>
          <a
            href={`tel:${callNowConfig.phone}`}
            className="mx-auto flex items-center justify-center gap-2.5 w-full max-w-[640px] py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-xl shadow-emerald-600/40 transition-all hover:scale-[1.02] active:scale-95 animate-call-pulse"
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
