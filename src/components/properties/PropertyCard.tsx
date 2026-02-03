import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bed, Bath, Square, Edit, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

interface Property {
  id: string;
  address: string;
  unit_number?: string | null;
  city: string;
  state: string;
  zip_code: string;
  bedrooms: number;
  bathrooms: number;
  square_feet?: number | null;
  rent_price: number;
  status: string;
  section_8_accepted?: boolean | null;
  photos?: string[] | null;
}

interface PropertyCardProps {
  property: Property;
  onEdit?: (property: Property) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  available: { label: 'Available', className: 'bg-success text-success-foreground' },
  coming_soon: { label: 'Coming Soon', className: 'bg-warning text-warning-foreground' },
  in_leasing_process: { label: 'In Leasing', className: 'bg-primary text-primary-foreground' },
  rented: { label: 'Rented', className: 'bg-muted text-muted-foreground' },
};

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onEdit }) => {
  const permissions = usePermissions();
  const photos = Array.isArray(property.photos) ? property.photos : [];
  const mainPhoto = photos[0] || null;
  const statusInfo = statusConfig[property.status] || statusConfig.available;

  const fullAddress = property.unit_number 
    ? `${property.address}, Unit ${property.unit_number}`
    : property.address;

  return (
    <Card variant="glass" className="overflow-hidden group hover:shadow-modern-lg transition-all duration-300 group-hover:scale-[1.02]">
      <Link to={`/properties/${property.id}`}>
        {/* Photo */}
        <div className="relative aspect-video overflow-hidden">
          {mainPhoto ? (
            <img
              src={mainPhoto}
              alt={fullAddress}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
              <Home className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          {/* Status Badge */}
          <Badge className={cn('absolute top-2 left-2', statusInfo.className)}>
            {statusInfo.label}
          </Badge>
          {/* Section 8 Badge */}
          {property.section_8_accepted && (
            <Badge variant="secondary" className="absolute top-2 right-2">
              Section 8
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <Link to={`/properties/${property.id}`}>
          {/* Price */}
          <p className="text-lg font-bold text-foreground">
            ${property.rent_price.toLocaleString()}/mo
          </p>
          
          {/* Address */}
          <p className="text-sm font-medium text-foreground truncate mt-1">
            {fullAddress}
          </p>
          <p className="text-xs text-muted-foreground">
            {property.city}, {property.state} {property.zip_code}
          </p>

          {/* Details */}
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              {property.bedrooms} bd
            </span>
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              {property.bathrooms} ba
            </span>
            {property.square_feet && (
              <span className="flex items-center gap-1">
                <Square className="h-4 w-4" />
                {property.square_feet.toLocaleString()} sqft
              </span>
            )}
          </div>
        </Link>

        {/* Edit Button */}
        {permissions.canEditProperty && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300"
            onClick={(e) => {
              e.preventDefault();
              onEdit(property);
            }}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
