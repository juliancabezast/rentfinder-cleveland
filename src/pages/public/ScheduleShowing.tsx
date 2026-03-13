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
} from "lucide-react";
import { format, addDays, parseISO, isSameDay } from "date-fns";

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

function getPhotoUrl(property: Property): string | null {
  if (!property?.photos) return null;
  const photos = property.photos as any;
  if (Array.isArray(photos) && photos.length > 0) {
    return typeof photos[0] === "string" ? photos[0] : photos[0]?.url || null;
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

/* ---- Building Group (for multi-unit addresses) ---- */
interface BuildingGroup {
  address: string;
  city: string;
  state: string | null;
  zip_code: string | null;
  photoUrl: string | null;
  units: PropertyWithSlots[];
  totalSlots: number;
}

const BuildingSelectCard: React.FC<{
  building: BuildingGroup;
  onClick: () => void;
}> = ({ building, onClick }) => (
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
      <p className="text-xs text-muted-foreground mt-0.5">
        {building.units.length} {building.units.length === 1 ? "unit" : "units"} available
      </p>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">
        {building.totalSlots} {building.totalSlots === 1 ? "slot" : "slots"}
      </Badge>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  </button>
);

const UnitSelectCard: React.FC<{
  property: PropertyWithSlots;
  onClick: () => void;
}> = ({ property, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all text-left"
  >
    <div className="h-12 w-12 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center shrink-0">
      <Home className="h-5 w-5 text-[#4F46E5]" />
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
    <Badge variant="outline" className="shrink-0 text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">
      {property.available_slot_count} {property.available_slot_count === 1 ? "slot" : "slots"}
    </Badge>
  </button>
);

/* ================================================================ */

const ScheduleShowing: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const isMultiMode = !propertyId;

  // Multi-mode: property selection
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null); // address key
  const [properties, setProperties] = useState<PropertyWithSlots[]>([]);
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

  // Form — pre-fill from localStorage if returning visitor
  const [fullName, setFullName] = useState(() => localStorage.getItem("rf_name") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem("rf_phone") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("rf_email") || "");
  const [consent, setConsent] = useState(() => localStorage.getItem("rf_consent") === "1");
  const [consentError, setConsentError] = useState(false);

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
        .select("property_id")
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .gte("slot_date", today)
        .lte("slot_date", maxDate);

      if (!slotData || slotData.length === 0) {
        setProperties([]);
        setPropertiesLoading(false);
        return;
      }

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

  // Group properties by building address
  const buildingGroups = useMemo<BuildingGroup[]>(() => {
    const map = new Map<string, PropertyWithSlots[]>();
    properties.forEach((p) => {
      const key = p.address;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return [...map.entries()].map(([address, units]) => ({
      address,
      city: units[0].city || "",
      state: units[0].state,
      zip_code: units[0].zip_code,
      photoUrl: getPhotoUrl(units[0]),
      units,
      totalSlots: units.reduce((sum, u) => sum + u.available_slot_count, 0),
    }));
  }, [properties]);

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
        setTimeSlots(data);
      }
      setSlotsLoading(false);
    })();
  }, [effectivePropertyId, selectedDate]);

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
      {/* Header bar */}
      <div className="bg-[#4F46E5] text-white py-3 px-4">
        <div className="max-w-[640px] mx-auto flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-[#ffb22c]" />
          <span className="font-semibold text-sm tracking-wide" style={{ fontFamily: "Montserrat, sans-serif" }}>
            Schedule a Showing
          </span>
        </div>
      </div>

      <div className="max-w-[640px] mx-auto px-4 py-6 space-y-6">

        {/* Multi-mode: Building Selection → Unit Selection */}
        {isMultiMode && !property && !selectedBuilding && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-[#4F46E5]" />
                <h3 className="font-semibold text-lg">Select a Property</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose the building you'd like to tour:
              </p>
              {propertiesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : buildingGroups.length === 0 ? (
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
                <div className="space-y-2">
                  {buildingGroups.map((bldg) => (
                    <BuildingSelectCard
                      key={bldg.address}
                      building={bldg}
                      onClick={() => {
                        // If only 1 unit, skip unit picker and go straight to property
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
                      disabled={submitting || !fullName.trim() || !phone.trim()}
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
        <p className="text-center text-xs text-muted-foreground pb-4">
          Powered by Rent Finder Cleveland
        </p>
      </div>
    </div>
  );
};

export default ScheduleShowing;
