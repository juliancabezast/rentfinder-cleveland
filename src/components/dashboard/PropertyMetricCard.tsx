import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Users, Calendar, Clock } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface PropertyMetricCardProps {
  property: {
    id: string;
    address: string;
    unit_number?: string | null;
    city: string;
    status: string;
    rent_price: number;
    photos?: { url: string }[] | null;
    listed_date?: string | null;
    leads_count?: number;
    showings_scheduled?: number;
    showings_completed?: number;
  };
  loading?: boolean;
}

export const PropertyMetricCard = ({
  property,
  loading = false,
}: PropertyMetricCardProps) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-0">
          <Skeleton className="h-32 w-full rounded-t-lg" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "available":
        return "default";
      case "coming_soon":
        return "secondary";
      case "in_leasing_process":
        return "outline";
      case "rented":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const daysOnMarket = property.listed_date
    ? differenceInDays(new Date(), parseISO(property.listed_date))
    : null;

  // Handle photos - could be an array of objects or strings
  const photoUrl = Array.isArray(property.photos) && property.photos.length > 0
    ? typeof property.photos[0] === 'string' 
      ? property.photos[0] 
      : (property.photos[0] as { url?: string })?.url
    : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Property Image */}
        <div className="relative h-32 bg-muted">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={property.address}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Home className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          <Badge
            className={cn("absolute top-2 right-2")}
            variant={getStatusVariant(property.status)}
          >
            {property.status.replace("_", " ")}
          </Badge>
        </div>

        {/* Property Info */}
        <div className="p-4 space-y-3">
          <div>
            <CardTitle className="text-base truncate">
              {property.address}
              {property.unit_number && ` #${property.unit_number}`}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{property.city}</p>
            <p className="text-lg font-bold text-primary mt-1">
              ${property.rent_price.toLocaleString()}/mo
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">{property.leads_count ?? 0}</p>
              <p className="text-xs text-muted-foreground">Leads</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">
                {(property.showings_scheduled ?? 0) + (property.showings_completed ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Showings</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">
                {daysOnMarket !== null ? daysOnMarket : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Days</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const PropertyMetricCardSkeleton = () => (
  <PropertyMetricCard
    property={{
      id: "",
      address: "",
      city: "",
      status: "",
      rent_price: 0,
    }}
    loading
  />
);
