import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { CalendarCheck, FileSignature, ShieldCheck } from "lucide-react";

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
  onApply: (l: MapListing) => void;
  className?: string;
}

export function ListingsMap({ listings, onApply, className }: ListingsMapProps) {
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
                <div className="mt-2 flex flex-col gap-1.5">
                  {l.status === "coming_soon" ? (
                    <Button
                      size="sm"
                      className="h-9 w-full bg-amber-400 font-bold text-amber-950 hover:bg-amber-300"
                      onClick={() => onApply(l)}
                    >
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Apply with Voucher
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" className="h-9 w-full" onClick={() => onApply(l)}>
                        <FileSignature className="mr-1.5 h-3.5 w-3.5" /> Start Application
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-9 w-full">
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
