import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { CalendarCheck, FileSignature, ShieldCheck, LocateFixed, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ────────────────────────────────────────────────────────────────────────────
 * ListingsMap — Zillow-style map for the public renter marketplace.
 * Price-pill markers (amber for Coming Soon), popup mini-card with photo,
 * price and the same CTAs as the listing cards. Free Carto tiles (no key).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface MapListing {
  key: string;
  address: string;
  city: string;
  zip_code: string | null;
  neighborhood: string;
  status: string;
  rent_min: number | null;
  rent_max: number | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  latitude: number | null;
  longitude: number | null;
  photo: string | null;
  property_id: string;
}

function pinLabel(l: MapListing): string {
  if (l.rent_min == null) return "$—";
  return "$" + Math.round(l.rent_min).toLocaleString();
}

type UserSpot = { lat: number; lng: number; accuracy: number };

/** Great-circle distance in miles (haversine). */
function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceLabel(mi: number): string {
  if (mi < 0.05) return "You're right here";
  if (mi < 1) return `${Math.round((mi * 5280) / 50) * 50} ft away`;
  return `${(Math.round(mi * 10) / 10).toLocaleString()} miles away`;
}

/** Blue "you are here" dot, same divIcon approach as the price pills. */
const userIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;border-radius:9999px;background:#2563eb;
    border:3px solid #ffffff;box-shadow:0 0 0 1px rgba(37,99,235,.45),0 2px 8px rgba(0,0,0,.35);
    transform:translate(-50%,-50%);"></div>`,
  iconSize: [0, 0],
});

/**
 * "My location" control. Lives inside MapContainer so it can use useMap().
 *
 * Privacy: the coordinates never leave the browser — they are only used to
 * recentre the map and to compute distances client-side. Nothing is sent to
 * Supabase and nothing is stored. Permission is requested ONLY on click,
 * never on page load.
 */
function LocateMeControl({ onLocated }: { onLocated: (s: UserSpot) => void }) {
  const map = useMap();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Keep clicks/scrolls on the control from panning or zooming the map.
  useEffect(() => {
    if (boxRef.current) {
      L.DomEvent.disableClickPropagation(boxRef.current);
      L.DomEvent.disableScrollPropagation(boxRef.current);
    }
  }, []);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast({
        title: "Location isn't available",
        description: "This browser doesn't support location. You can still browse the map.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const spot = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        onLocated(spot);
        map.flyTo([spot.lat, spot.lng], 13);
      },
      (err) => {
        setBusy(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "You'll need to allow location in your browser to see how close these homes are."
            : err.code === err.TIMEOUT
              ? "Finding you took too long. Please try again."
              : "We couldn't get your location. You can still browse the map.";
        toast({ title: "Couldn't find you", description: msg, variant: "destructive" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="leaflet-top leaflet-right">
      <div ref={boxRef} className="leaflet-control">
        <button
          type="button"
          onClick={locate}
          disabled={busy}
          aria-label="Show my location on the map"
          className="flex items-center gap-1.5 rounded-xl border-0 bg-white px-3 py-2.5 text-[13px] font-semibold text-[#4F46E5] shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-indigo-50 disabled:opacity-70"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
          {busy ? "Finding you…" : "My location"}
        </button>
      </div>
    </div>
  );
}

/** Price-pill divIcon, Zillow style. Amber for coming soon, indigo otherwise. */
function priceIcon(l: MapListing): L.DivIcon {
  const coming = l.status === "coming_soon";
  const bg = coming ? "#fbbf24" : "#4F46E5";
  const fg = coming ? "#451a03" : "#ffffff";
  const label = pinLabel(l);
  return L.divIcon({
    className: "", // no default leaflet styles
    html: `<div style="
      background:${bg};color:${fg};
      font-family:Montserrat,Arial,sans-serif;font-size:13px;font-weight:800;
      padding:4px 10px;border-radius:9999px;white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid #ffffff;
      transform:translate(-50%,-50%);width:max-content;">${label}</div>`,
    iconSize: [0, 0],
  });
}

interface ListingsMapProps {
  listings: MapListing[];
  className?: string;
}

export function ListingsMap({ listings, className }: ListingsMapProps) {
  // Visitor's own position, once they ask for it. Client-side only.
  const [me, setMe] = useState<UserSpot | null>(null);

  const located = useMemo(
    () => listings.filter((l) => l.latitude != null && l.longitude != null),
    [listings],
  );

  // Center on the pins (Cleveland fallback if nothing is located)
  const center = useMemo<[number, number]>(() => {
    if (located.length === 0) return [41.4993, -81.6944];
    const lat = located.reduce((s, l) => s + (l.latitude as number), 0) / located.length;
    const lng = located.reduce((s, l) => s + (l.longitude as number), 0) / located.length;
    return [lat, lng];
  }, [located]);

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        className="h-full w-full rounded-2xl z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <LocateMeControl onLocated={setMe} />

        {me && (
          <>
            {/* Accuracy halo, then the dot on top. */}
            <Circle
              center={[me.lat, me.lng]}
              radius={me.accuracy}
              pathOptions={{ color: "#2563eb", weight: 1, fillColor: "#2563eb", fillOpacity: 0.1 }}
            />
            <Marker position={[me.lat, me.lng]} icon={userIcon} zIndexOffset={1000}>
              <Popup>
                <div className="font-sans text-[13px] font-semibold text-slate-800">You are here</div>
              </Popup>
            </Marker>
          </>
        )}

        {located.map((l) => (
          <Marker
            key={l.key}
            position={[l.latitude as number, l.longitude as number]}
            icon={priceIcon(l)}
          >
            <Popup minWidth={230} maxWidth={260}>
              <div className="w-[230px] font-sans">
                {l.photo && (
                  <img
                    src={l.photo}
                    alt={l.address}
                    className="h-28 w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                )}
                <div className="mt-2 text-base font-extrabold text-slate-900">
                  {pinLabel(l)}
                  <span className="text-xs font-medium text-slate-500">/mo</span>
                  {l.status === "coming_soon" && (
                    <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-950">
                      Coming soon
                    </span>
                  )}
                </div>
                <div className="text-[13px] font-medium text-slate-800">{l.address}</div>
                <div className="text-xs text-slate-500">
                  {l.neighborhood}, {l.city} {l.zip_code || ""}
                  {l.bedrooms_max ? ` · ${l.bedrooms_max} bd` : ""}
                </div>
                {me && (
                  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#2563eb]">
                    <LocateFixed className="h-3 w-3" />
                    {distanceLabel(
                      milesBetween(me.lat, me.lng, l.latitude as number, l.longitude as number),
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-1.5">
                  {l.status === "coming_soon" ? (
                    <Button
                      asChild
                      size="sm"
                      className="h-9 w-full bg-amber-400 font-bold !text-amber-950 hover:bg-amber-300"
                    >
                      <Link to="/apply">
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Apply with Voucher
                      </Link>
                    </Button>
                  ) : (
                    <>
                      {/* `!text-*`: Leaflet's `.leaflet-container a` colour rule
                          outranks plain Tailwind text utilities inside popups. */}
                      <Button asChild size="sm" className="h-9 w-full !text-primary-foreground">
                        <Link to="/apply">
                          <FileSignature className="mr-1.5 h-3.5 w-3.5" /> Start Application
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-9 w-full !text-foreground">
                        <Link to={`/p/schedule-showing/${l.property_id}`}>
                          <CalendarCheck className="mr-1.5 h-3.5 w-3.5" /> Schedule a Showing
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
