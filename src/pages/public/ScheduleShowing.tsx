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
} from "lucide-react";
import { format, addDays, parseISO, isSameDay } from "date-fns";

type Property =
  import("@/integrations/supabase/types").Database["public"]["Tables"]["properties"]["Row"];

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

const ScheduleShowing: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();

  // State
  const [property, setProperty] = useState<Property | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [datesLoading, setDatesLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [timeSlots, setTimeSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);

  // Booking
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Current step
  const step = useMemo(() => {
    if (booked) return 5;
    if (selectedTime) return 4;
    if (selectedDate) return 3;
    if (property) return 2;
    return 1;
  }, [property, selectedDate, selectedTime, booked]);

  // ---- Fetch property ----
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      setPropertyLoading(true);
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .single();

      if (error || !data) {
        setPropertyError("Property not found or no longer available.");
      } else {
        setProperty(data);
      }
      setPropertyLoading(false);
    })();
  }, [propertyId]);

  // ---- Fetch available dates (next 30 days) ----
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      setDatesLoading(true);
      const today = format(new Date(), "yyyy-MM-dd");
      const maxDate = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("slot_date")
        .eq("property_id", propertyId)
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
  }, [propertyId]);

  // ---- Fetch slots for selected date ----
  useEffect(() => {
    if (!propertyId || !selectedDate) return;
    (async () => {
      setSlotsLoading(true);
      setSelectedTime(null);
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("showing_available_slots")
        .select("slot_time, duration_minutes")
        .eq("property_id", propertyId)
        .eq("slot_date", dateStr)
        .eq("is_enabled", true)
        .eq("is_booked", false)
        .order("slot_time");

      if (!error && data) {
        setTimeSlots(data);
      }
      setSlotsLoading(false);
    })();
  }, [propertyId, selectedDate]);

  // ---- Handle booking ----
  const handleBook = async () => {
    if (!consent) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    if (!fullName.trim() || !phone.trim()) return;
    if (!selectedDate || !selectedTime || !propertyId || !property) return;

    setSubmitting(true);
    setBookingError(null);

    try {
      const { data, error } = await supabase.functions.invoke("pathway-webhook", {
        body: {
          action: "book_public_showing",
          property_id: propertyId,
          organization_id: property.organization_id,
          slot_date: format(selectedDate, "yyyy-MM-dd"),
          slot_time: selectedTime,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          consent: buildConsentPayload(consent),
        },
      });

      if (error) throw error;

      if (data?.error) {
        setBookingError(data.error);
      } else {
        setBooked(true);
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
  const photoUrl = useMemo(() => {
    if (!property?.photos) return null;
    const photos = property.photos as any;
    if (Array.isArray(photos) && photos.length > 0) {
      return typeof photos[0] === "string" ? photos[0] : photos[0]?.url || null;
    }
    return null;
  }, [property?.photos]);

  // ---- RENDER ----

  // Loading state
  if (propertyLoading) {
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

  // Error state
  if (propertyError || !property) {
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
      <div className="bg-[#370d4b] text-white py-3 px-4">
        <div className="max-w-[640px] mx-auto flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-[#ffb22c]" />
          <span className="font-semibold text-sm tracking-wide" style={{ fontFamily: "Montserrat, sans-serif" }}>
            Schedule a Showing
          </span>
        </div>
      </div>

      <div className="max-w-[640px] mx-auto px-4 py-6 space-y-6">
        {/* Step 1: Property Card (always visible) */}
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
              <MapPin className="h-4 w-4 text-[#370d4b] shrink-0" />
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
              <Badge className="bg-[#370d4b] text-white gap-1">
                <DollarSign className="h-3 w-3" /> ${property.rent_price?.toLocaleString()}/mo
              </Badge>
              {property.square_feet && (
                <Badge variant="outline" className="gap-1">
                  <SquareIcon className="h-3 w-3" /> {property.square_feet} sqft
                </Badge>
              )}
              {property.section_8_accepted && (
                <Badge variant="secondary">Section 8 OK</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Success screen (step 5) */}
        {booked ? (
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
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setBooked(false);
                  setSelectedDate(undefined);
                  setSelectedTime(null);
                  setFullName("");
                  setPhone("");
                  setEmail("");
                  setConsent(false);
                }}
              >
                Schedule Another Showing
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Step 2: Calendar */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-full bg-[#370d4b] text-white flex items-center justify-center text-xs font-bold">
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

            {/* Step 3: Time Slots */}
            {selectedDate && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-6 w-6 rounded-full bg-[#370d4b] text-white flex items-center justify-center text-xs font-bold">
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
                              ? "bg-[#370d4b] hover:bg-[#370d4b]/90 text-white"
                              : "hover:border-[#370d4b] hover:text-[#370d4b]"
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

            {/* Step 4: Contact Form */}
            {selectedTime && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-6 w-6 rounded-full bg-[#370d4b] text-white flex items-center justify-center text-xs font-bold">
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
                      className="w-full h-12 bg-[#370d4b] hover:bg-[#370d4b]/90 text-white font-semibold text-base"
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
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          Powered by Rent Finder Cleveland
        </p>
      </div>
    </div>
  );
};

export default ScheduleShowing;
