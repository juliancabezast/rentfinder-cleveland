import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ImageOff, FileText, DollarSign, Ruler, Home, Sparkles, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

interface CheckPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: Property[];
}

interface PropertyIssue {
  field: string;
  label: string;
  icon: React.ReactNode;
}

function getIssues(property: Property): PropertyIssue[] {
  const issues: PropertyIssue[] = [];

  if (!property.bedrooms || property.bedrooms <= 0) {
    issues.push({ field: "bedrooms", label: "Bedrooms", icon: <Home className="h-3 w-3" /> });
  }
  if (!property.bathrooms || property.bathrooms <= 0) {
    issues.push({ field: "bathrooms", label: "Bathrooms", icon: <Home className="h-3 w-3" /> });
  }
  if (!property.rent_price || property.rent_price <= 0) {
    issues.push({ field: "rent_price", label: "Rent Price", icon: <DollarSign className="h-3 w-3" /> });
  }
  if (!property.description || property.description.trim().length === 0) {
    issues.push({ field: "description", label: "Description", icon: <FileText className="h-3 w-3" /> });
  }
  if (!property.photos || !Array.isArray(property.photos) || property.photos.length === 0) {
    issues.push({ field: "photos", label: "Photos", icon: <ImageOff className="h-3 w-3" /> });
  }
  if (!property.square_feet || property.square_feet <= 0) {
    issues.push({ field: "square_feet", label: "Square Feet", icon: <Ruler className="h-3 w-3" /> });
  }
  if (!property.property_type || property.property_type.trim().length === 0) {
    issues.push({ field: "property_type", label: "Property Type", icon: <Tag className="h-3 w-3" /> });
  }
  if (!property.amenities || !Array.isArray(property.amenities) || property.amenities.length === 0) {
    issues.push({ field: "amenities", label: "Amenities", icon: <Sparkles className="h-3 w-3" /> });
  }

  return issues;
}

export const CheckPropertiesDialog: React.FC<CheckPropertiesDialogProps> = ({
  open,
  onOpenChange,
  properties,
}) => {
  const navigate = useNavigate();

  const results = useMemo(() => {
    const withIssues: { property: Property; issues: PropertyIssue[] }[] = [];
    const complete: Property[] = [];

    for (const property of properties) {
      const issues = getIssues(property);
      if (issues.length > 0) {
        withIssues.push({ property, issues });
      } else {
        complete.push(property);
      }
    }

    // Sort by most issues first
    withIssues.sort((a, b) => b.issues.length - a.issues.length);

    return { withIssues, complete };
  }, [properties]);

  const totalProperties = properties.length;
  const needAttention = results.withIssues.length;
  const allGood = results.complete.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Property Health Check
          </DialogTitle>
          <DialogDescription>
            Analyzing {totalProperties} properties for missing data
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{totalProperties}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{needAttention}</p>
            <p className="text-xs text-amber-600">Need Attention</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{allGood}</p>
            <p className="text-xs text-green-600">Complete</p>
          </div>
        </div>

        {/* Results List */}
        <ScrollArea className="flex-1 min-h-0 max-h-[400px] pr-4">
          {needAttention === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
              <p className="font-semibold text-lg">All properties look great!</p>
              <p className="text-sm text-muted-foreground">
                Every property has complete information.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.withIssues.map(({ property, issues }) => (
                <button
                  key={property.id}
                  className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/properties/${property.id}`);
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {property.address}
                        {property.unit_number && `, Unit ${property.unit_number}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {property.city}, {property.state} {property.zip_code}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-amber-700 border-amber-300 bg-amber-50">
                      {issues.length} missing
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {issues.map((issue) => (
                      <Badge
                        key={issue.field}
                        variant="secondary"
                        className="text-[11px] gap-1 bg-red-50 text-red-700 border border-red-200"
                      >
                        {issue.icon}
                        {issue.label}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
