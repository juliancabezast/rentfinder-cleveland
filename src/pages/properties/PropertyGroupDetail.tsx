import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PropertyGroupForm,
  type PropertyGroup,
} from "@/components/properties/PropertyGroupForm";
import { PropertyForm } from "@/components/properties/PropertyForm";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Bed,
  Bath,
  Square,
  Building2,
  Plus,
  MapPin,
  Check,
  Star,
  Navigation,
  GraduationCap,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  available: {
    label: "Available",
    className: "bg-success text-success-foreground",
    dot: "bg-green-500",
  },
  coming_soon: {
    label: "Coming Soon",
    className: "bg-warning text-warning-foreground",
    dot: "bg-amber-500",
  },
  in_leasing_process: {
    label: "In Leasing",
    className: "bg-primary text-primary-foreground",
    dot: "bg-blue-500",
  },
  rented: {
    label: "Rented",
    className: "bg-muted text-muted-foreground",
    dot: "bg-gray-400",
  },
};

const TYPE_LABELS: Record<string, string> = {
  single_family: "Single Family",
  duplex: "Duplex",
  triplex: "Triplex",
  fourplex: "Fourplex",
};

interface Unit {
  id: string;
  unit_number: string | null;
  bedrooms: number;
  bathrooms: number;
  rent_price: number;
  status: string;
  square_feet: number | null;
  photos: unknown;
}

interface NeighborhoodInfo {
  area_benefits?: string[];
  nearby_places?: string[];
  school_district?: string;
}

const PropertyGroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const permissions = usePermissions();

  const [group, setGroup] = useState<PropertyGroup | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);

  const fetchData = async () => {
    if (!groupId || !organization?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("property_groups")
        .select(
          `*, properties!property_group_id (
            id, unit_number, bedrooms, bathrooms, rent_price, status, square_feet, photos
          )`
        )
        .eq("id", groupId)
        .eq("organization_id", organization.id)
        .single();

      if (error) throw error;

      const { properties: unitData, ...groupData } = data as any;
      setGroup(groupData as PropertyGroup);
      setUnits((unitData || []) as Unit[]);
    } catch (error) {
      console.error("Error fetching property group:", error);
      toast.error("Failed to load property");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [groupId, organization?.id]);

  const handleDelete = async () => {
    if (!group) return;

    setDeleting(true);
    try {
      // Unlink units first (set property_group_id to null)
      await supabase
        .from("properties")
        .update({ property_group_id: null })
        .eq("property_group_id", group.id);

      const { error } = await supabase
        .from("property_groups")
        .delete()
        .eq("id", group.id);

      if (error) throw error;

      toast.success("Property deleted");
      navigate("/properties");
    } catch (error) {
      console.error("Error deleting property group:", error);
      toast.error("Failed to delete property");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48 lg:col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">Property not found</h3>
        <Button className="mt-4" onClick={() => navigate("/properties")}>
          Back to Properties
        </Button>
      </div>
    );
  }

  const neighborhoodInfo = (group.neighborhood_info || {}) as NeighborhoodInfo;
  const typeLabel = TYPE_LABELS[group.property_type || ""] || "Property";
  const availableCount = units.filter((u) => u.status === "available").length;
  const rents = units.map((u) => u.rent_price).filter(Boolean);
  const minRent = rents.length > 0 ? Math.min(...rents) : 0;
  const maxRent = rents.length > 0 ? Math.max(...rents) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/properties")}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Properties
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {group.address}
            <Badge className="bg-[#370d4b] text-white">{typeLabel}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {group.city}, {group.state} {group.zip_code}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {permissions.canEditProperty && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {permissions.canDeleteProperty && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Property</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure? This will delete the building record. Units
                    will be unlinked but not deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Cover Photo */}
      {group.cover_photo ? (
        <div className="relative aspect-[21/9] rounded-xl overflow-hidden border">
          <img
            src={group.cover_photo}
            alt={group.address}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-[21/9] rounded-xl overflow-hidden border bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card variant="glass">
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{units.length}</p>
                <p className="text-xs text-muted-foreground">
                  Unit{units.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {availableCount}
                </p>
                <p className="text-xs text-muted-foreground">Available</p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">
                  {rents.length > 0
                    ? `$${minRent.toLocaleString()}`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {minRent !== maxRent && rents.length > 0
                    ? `to $${maxRent.toLocaleString()}`
                    : "Rent"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Units Grid */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>
                Units ({units.length})
              </CardTitle>
              {permissions.canCreateProperty && (
                <Button
                  size="sm"
                  onClick={() => setAddUnitOpen(true)}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Unit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {units.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No units yet. Add your first unit.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {units
                    .sort((a, b) =>
                      (a.unit_number || "").localeCompare(b.unit_number || "")
                    )
                    .map((unit) => {
                      const s =
                        STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                      const photos = Array.isArray(unit.photos)
                        ? unit.photos
                        : [];
                      const firstPhoto = photos[0] as string | undefined;

                      return (
                        <Link
                          key={unit.id}
                          to={`/properties/${unit.id}`}
                          className="flex gap-3 p-3 rounded-lg border hover:bg-muted/50 hover:shadow-sm transition-all"
                        >
                          {/* Unit photo thumbnail */}
                          <div className="w-20 h-20 rounded-md overflow-hidden bg-muted shrink-0">
                            {firstPhoto ? (
                              <img
                                src={firstPhoto}
                                alt={`Unit ${unit.unit_number || ""}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Building2 className="h-6 w-6 text-muted-foreground/40" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-sm">
                                Unit {unit.unit_number || "—"}
                              </span>
                              <Badge
                                className={cn(
                                  "text-xs h-5 px-2 shrink-0",
                                  s.className
                                )}
                              >
                                {s.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Bed className="h-3.5 w-3.5" />
                                {unit.bedrooms}
                              </span>
                              <span className="flex items-center gap-1">
                                <Bath className="h-3.5 w-3.5" />
                                {unit.bathrooms}
                              </span>
                              {unit.square_feet && (
                                <span className="flex items-center gap-1">
                                  <Square className="h-3.5 w-3.5" />
                                  {unit.square_feet.toLocaleString()}
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-sm mt-1">
                              ${unit.rent_price.toLocaleString()}/mo
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          {group.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {group.description}
                </p>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Neighborhood Info */}
          {(neighborhoodInfo.area_benefits?.length ||
            neighborhoodInfo.nearby_places?.length ||
            neighborhoodInfo.school_district) && (
            <Card>
              <CardHeader>
                <CardTitle>Neighborhood</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Area Benefits */}
                {neighborhoodInfo.area_benefits &&
                  neighborhoodInfo.area_benefits.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Star className="h-3.5 w-3.5" />
                        Area Benefits
                      </p>
                      <ul className="space-y-1">
                        {neighborhoodInfo.area_benefits.map((b, i) => (
                          <li
                            key={i}
                            className="text-sm flex items-start gap-2"
                          >
                            <Check className="h-3.5 w-3.5 mt-0.5 text-green-600 shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Nearby Places */}
                {neighborhoodInfo.nearby_places &&
                  neighborhoodInfo.nearby_places.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Navigation className="h-3.5 w-3.5" />
                        Nearby Places
                      </p>
                      <ul className="space-y-1">
                        {neighborhoodInfo.nearby_places.map((p, i) => (
                          <li key={i} className="text-sm">
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* School District */}
                {neighborhoodInfo.school_district && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      School District
                    </p>
                    <p className="text-sm">
                      {neighborhoodInfo.school_district}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Building Features */}
          <Card>
            <CardHeader>
              <CardTitle>Building Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{typeLabel}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Building Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
          </DialogHeader>
          <PropertyGroupForm
            group={group}
            onSuccess={() => {
              setEditOpen(false);
              fetchData();
            }}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Add Unit Dialog */}
      <Dialog open={addUnitOpen} onOpenChange={setAddUnitOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Unit to {group.address}</DialogTitle>
          </DialogHeader>
          <PropertyForm
            propertyGroupId={group.id}
            propertyGroupAddress={group.address}
            onSuccess={() => {
              setAddUnitOpen(false);
              fetchData();
            }}
            onCancel={() => setAddUnitOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertyGroupDetail;
