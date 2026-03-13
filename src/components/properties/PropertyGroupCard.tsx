import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bed,
  Bath,
  Home,
  ChevronDown,
  ChevronUp,
  Building2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  available: { label: "Available", className: "bg-success text-success-foreground", dot: "bg-green-500" },
  coming_soon: { label: "Coming Soon", className: "bg-warning text-warning-foreground", dot: "bg-amber-500" },
  in_leasing_process: { label: "In Leasing", className: "bg-primary text-primary-foreground", dot: "bg-blue-500" },
  rented: { label: "Rented", className: "bg-muted text-muted-foreground", dot: "bg-gray-400" },
};

const TYPE_LABELS: Record<string, string> = {
  single_family: "Single Family",
  duplex: "Duplex",
  triplex: "Triplex",
  fourplex: "Fourplex",
};

export interface PropertyGroupUnit {
  id: string;
  unit_number: string | null;
  bedrooms: number;
  bathrooms: number;
  rent_price: number;
  status: string;
  photos: unknown;
  square_feet: number | null;
}

export interface PropertyGroupData {
  id: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  property_type: string | null;
  cover_photo: string | null;
  properties: PropertyGroupUnit[];
}

interface PropertyGroupCardProps {
  group: PropertyGroupData;
  onAddUnit?: (groupId: string) => void;
}

export const PropertyGroupCard: React.FC<PropertyGroupCardProps> = ({
  group,
  onAddUnit,
}) => {
  const [expanded, setExpanded] = useState(false);
  const units = group.properties || [];

  // Compute summary
  const availableCount = units.filter((u) => u.status === "available").length;
  const rents = units.map((u) => u.rent_price).filter(Boolean);
  const minRent = rents.length > 0 ? Math.min(...rents) : 0;
  const maxRent = rents.length > 0 ? Math.max(...rents) : 0;
  const rentDisplay =
    rents.length === 0
      ? "—"
      : minRent === maxRent
        ? `$${minRent.toLocaleString()}/mo`
        : `$${minRent.toLocaleString()} – $${maxRent.toLocaleString()}/mo`;

  // Cover photo: group cover or first unit's first photo
  const coverPhoto =
    group.cover_photo ||
    (() => {
      for (const u of units) {
        const photos = Array.isArray(u.photos) ? u.photos : [];
        if (photos[0]) return photos[0] as string;
      }
      return null;
    })();

  // Best status for composite badge
  const hasSomeAvailable = availableCount > 0;
  const typeLabel = TYPE_LABELS[group.property_type || ""] || "Property";

  return (
    <Card
      variant="glass"
      className="overflow-hidden hover:shadow-modern-lg transition-all duration-300"
    >
      {/* Header: photo + info */}
      <Link to={`/properties/group/${group.id}`}>
        <div className="relative aspect-[16/8] overflow-hidden">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={group.address}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          {/* Type badge */}
          <Badge className="absolute top-2 left-2 bg-[#370d4b] text-white">
            {typeLabel}
          </Badge>
        </div>
      </Link>

      <CardContent className="p-4 space-y-3">
        {/* Address + summary */}
        <Link to={`/properties/group/${group.id}`}>
          <h3 className="font-semibold text-base text-foreground truncate">
            {group.address}
          </h3>
          <p className="text-xs text-muted-foreground">
            {group.city}, {group.state} {group.zip_code}
          </p>
        </Link>

        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-foreground">{rentDisplay}</span>
          <span className="text-muted-foreground">
            {units.length} unit{units.length !== 1 ? "s" : ""}
            {hasSomeAvailable && (
              <span className="text-green-600 ml-1">
                ({availableCount} available)
              </span>
            )}
          </span>
        </div>

        {/* Expand/collapse units */}
        {units.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={(e) => {
                e.preventDefault();
                setExpanded(!expanded);
              }}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" /> Hide Units
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" /> Show Units
                </>
              )}
            </Button>

            {expanded && (
              <div className="space-y-2">
                {units
                  .sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || ""))
                  .map((unit) => {
                    const s = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                    return (
                      <Link
                        key={unit.id}
                        to={`/properties/${unit.id}`}
                        className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <span
                          className={cn("h-2.5 w-2.5 rounded-full shrink-0", s.dot)}
                        />
                        <span className="font-medium text-sm min-w-[50px]">
                          Unit {unit.unit_number || "—"}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Bed className="h-3.5 w-3.5" />
                          {unit.bedrooms}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Bath className="h-3.5 w-3.5" />
                          {unit.bathrooms}
                        </span>
                        <span className="ml-auto font-semibold text-sm">
                          ${unit.rent_price.toLocaleString()}
                        </span>
                        <Badge
                          className={cn("text-xs h-5 px-2 shrink-0", s.className)}
                        >
                          {s.label}
                        </Badge>
                      </Link>
                    );
                  })}
                {onAddUnit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      onAddUnit(group.id);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Unit
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
