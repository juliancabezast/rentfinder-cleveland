import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bed, Bath, Home, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  bedrooms: number;
  bathrooms: number;
  rent_price: number;
  status: string;
  section_8_accepted?: boolean | null;
  photos?: string[] | null;
  coming_soon_date?: string | null;
}

interface PublicPropertyCardProps {
  property: PublicProperty;
  onScheduleShowing: (property: PublicProperty) => void;
}

export const PublicPropertyCard: React.FC<PublicPropertyCardProps> = ({
  property,
  onScheduleShowing,
}) => {
  const photos = Array.isArray(property.photos) ? property.photos : [];
  const mainPhoto = photos[0] || null;
  const isComingSoon = property.status === "coming_soon";

  return (
    <Card className="overflow-hidden hover:shadow-card-hover transition-shadow group">
      <Link to={`/p/properties/${property.id}`}>
        {/* Photo */}
        <div className="relative aspect-video bg-muted">
          {mainPhoto ? (
            <img
              src={mainPhoto}
              alt={`Property in ${property.city}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
              <Home className="h-16 w-16 text-primary/30" />
            </div>
          )}

          {/* Status Badge */}
          {isComingSoon ? (
            <Badge className="absolute top-3 left-3 bg-warning text-warning-foreground">
              <Calendar className="mr-1 h-3 w-3" />
              Coming Soon
            </Badge>
          ) : (
            <Badge className="absolute top-3 left-3 bg-success text-success-foreground">
              Available Now
            </Badge>
          )}

          {/* Section 8 Badge */}
          {property.section_8_accepted && (
            <Badge
              variant="secondary"
              className="absolute top-3 right-3 bg-primary text-primary-foreground"
            >
              Section 8 Welcome
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <Link to={`/p/properties/${property.id}`}>
          {/* Price */}
          <p className="text-2xl font-bold text-primary">
            ${property.rent_price.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>

          {/* Location - No unit number for privacy */}
          <p className="text-sm font-medium text-foreground mt-1">
            {property.address}
          </p>
          <p className="text-sm text-muted-foreground">
            {property.city}, {property.state} {property.zip_code}
          </p>

          {/* Details */}
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              {property.bedrooms} {property.bedrooms === 1 ? "Bed" : "Beds"}
            </span>
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              {property.bathrooms} {property.bathrooms === 1 ? "Bath" : "Baths"}
            </span>
          </div>
        </Link>

        {/* CTA Button */}
        <Button
          className="mt-4 w-full bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={(e) => {
            e.preventDefault();
            onScheduleShowing(property);
          }}
        >
          {isComingSoon ? "Get Notified" : "Schedule Showing"}
        </Button>
      </CardContent>
    </Card>
  );
};
