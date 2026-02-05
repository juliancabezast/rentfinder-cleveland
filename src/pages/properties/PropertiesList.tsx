import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Building2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "available", label: "Available" },
  { value: "coming_soon", label: "Coming Soon" },
  { value: "in_leasing_process", label: "In Leasing" },
  { value: "rented", label: "Rented" },
];

const PropertiesList: React.FC = () => {
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  const fetchProperties = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("properties")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({
        title: "Error",
        description: "Failed to load properties.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [userRecord?.organization_id, statusFilter]);

  const filteredProperties = properties.filter((property) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      property.address.toLowerCase().includes(searchLower) ||
      property.city.toLowerCase().includes(searchLower) ||
      property.zip_code.includes(searchQuery)
    );
  });

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingProperty(null);
    fetchProperties();
  };

  // Convert Property to the format expected by PropertyForm
  const propertyForForm = editingProperty
    ? {
        ...editingProperty,
        photos: Array.isArray(editingProperty.photos)
          ? (editingProperty.photos as string[])
          : null,
        amenities: Array.isArray(editingProperty.amenities)
          ? (editingProperty.amenities as string[])
          : null,
        alternative_property_ids: Array.isArray(editingProperty.alternative_property_ids)
          ? (editingProperty.alternative_property_ids as string[])
          : null,
      }
    : null;

  const PropertyCardSkeleton = () => (
    <Card variant="glass" className="overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Properties
          </h1>
          <p className="text-muted-foreground">
            Manage your property listings ({filteredProperties.length} total)
          </p>
        </div>
        {permissions.canCreateProperty && (
          <Button onClick={() => setFormOpen(true)} className="min-h-[44px] bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Property</span>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card rounded-xl p-4 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address, city, or zip..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

      {/* Properties Grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredProperties.length === 0 ? (
        <Card variant="glass">
          <CardContent className="p-0">
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description={
                searchQuery || statusFilter !== "all"
                  ? "No properties match your search criteria. Try adjusting your filters."
                  : "Add your first property to get started with lead management."
              }
              action={
                permissions.canCreateProperty && !searchQuery && statusFilter === "all"
                  ? {
                      label: "Add Property",
                      onClick: () => setFormOpen(true),
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProperties.map((property, index) => (
            <div
              key={property.id}
              className="animate-fade-up"
              style={{
                animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
                animationFillMode: "both",
              }}
            >
              <PropertyCard
                property={{
                  id: property.id,
                  address: property.address,
                  unit_number: property.unit_number,
                  city: property.city,
                  state: property.state,
                  zip_code: property.zip_code,
                  bedrooms: property.bedrooms,
                  bathrooms: property.bathrooms,
                  square_feet: property.square_feet,
                  rent_price: property.rent_price,
                  status: property.status,
                  section_8_accepted: property.section_8_accepted,
                  photos: Array.isArray(property.photos)
                    ? (property.photos as string[])
                    : null,
                }}
                onEdit={() => handleEdit(property)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Property Dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingProperty(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProperty ? "Edit Property" : "Add New Property"}
            </DialogTitle>
          </DialogHeader>
          <PropertyForm
            property={propertyForForm}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setFormOpen(false);
              setEditingProperty(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertiesList;
