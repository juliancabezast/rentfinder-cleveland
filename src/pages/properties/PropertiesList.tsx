import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Building2,
  Filter,
  Globe,
  LayoutGrid,
  TableProperties,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  PropertyGroupCard,
  type PropertyGroupData,
} from "@/components/properties/PropertyGroupCard";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { ZillowImportDialog } from "@/components/properties/ZillowImportDialog";
import { CheckPropertiesDialog } from "@/components/properties/CheckPropertiesDialog";
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
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [groups, setGroups] = useState<PropertyGroupData[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [zillowOpen, setZillowOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [addingUnitGroupId, setAddingUnitGroupId] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);

  const fetchData = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      // Fetch groups with nested units
      const { data: groupsData, error: groupsErr } = await supabase
        .from("property_groups")
        .select(
          `*, properties!property_group_id (
            id, unit_number, bedrooms, bathrooms, rent_price, status, photos, square_feet
          )`
        )
        .eq("organization_id", userRecord.organization_id)
        .order("address");

      if (groupsErr) throw groupsErr;

      // Also fetch all properties flat (for CheckProperties dialog + form editing)
      const { data: propsData, error: propsErr } = await supabase
        .from("properties")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false });

      if (propsErr) throw propsErr;

      setGroups((groupsData || []) as unknown as PropertyGroupData[]);
      setAllProperties(propsData || []);
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
    fetchData();
  }, [userRecord?.organization_id]);

  // Client-side filtering on groups
  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      // Status filter: group passes if any unit matches status
      if (statusFilter !== "all") {
        const units = group.properties || [];
        if (!units.some((u) => u.status === statusFilter)) return false;
      }
      // Search filter
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        group.address.toLowerCase().includes(q) ||
        group.city.toLowerCase().includes(q) ||
        group.zip_code.includes(searchQuery)
      );
    });
  }, [groups, statusFilter, searchQuery]);

  // Total unit count for display
  const totalUnits = groups.reduce(
    (sum, g) => sum + (g.properties?.length || 0),
    0
  );

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingProperty(null);
    setAddingUnitGroupId(null);
    fetchData();
  };

  const handleAddUnit = (groupId: string) => {
    setAddingUnitGroupId(groupId);
    setEditingProperty(null);
    setFormOpen(true);
  };

  // Find the group for the unit being added
  const addingToGroup = addingUnitGroupId
    ? groups.find((g) => g.id === addingUnitGroupId)
    : null;

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
        alternative_property_ids: Array.isArray(
          editingProperty.alternative_property_ids
        )
          ? (editingProperty.alternative_property_ids as string[])
          : null,
      }
    : null;

  const CardSkeleton = () => (
    <Card variant="glass" className="overflow-hidden">
      <Skeleton className="aspect-[16/8] w-full" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
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
            {filteredGroups.length} building{filteredGroups.length !== 1 ? "s" : ""}, {totalUnits} unit{totalUnits !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            onClick={() => setCheckOpen(true)}
            className="min-h-[44px] border-amber-300 text-amber-700 hover:bg-amber-50"
            disabled={allProperties.length === 0}
          >
            <ClipboardCheck className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Check Properties</span>
          </Button>
          {permissions.canCreateProperty && (
            <>
              <Button
                variant="outline"
                onClick={() => setZillowOpen(true)}
                className="min-h-[44px] border-[#4F46E5]/30 text-[#4F46E5] hover:bg-[#4F46E5]/5"
              >
                <Globe className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Import Zillow</span>
              </Button>
              <Button
                onClick={() => {
                  setAddingUnitGroupId(null);
                  setEditingProperty(null);
                  setFormOpen(true);
                }}
                className="min-h-[44px] bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Property</span>
              </Button>
            </>
          )}
        </div>
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

      {/* Buildings Grid */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
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
                permissions.canCreateProperty &&
                !searchQuery &&
                statusFilter === "all"
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
          {filteredGroups.map((group, index) => (
            <div
              key={group.id}
              className="animate-fade-up"
              style={{
                animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
                animationFillMode: "both",
              }}
            >
              <PropertyGroupCard
                group={group}
                onAddUnit={
                  permissions.canCreateProperty ? handleAddUnit : undefined
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Zillow Import Dialog */}
      <ZillowImportDialog
        open={zillowOpen}
        onOpenChange={setZillowOpen}
        onSuccess={fetchData}
      />

      {/* Check Properties Dialog */}
      <CheckPropertiesDialog
        open={checkOpen}
        onOpenChange={setCheckOpen}
        properties={allProperties}
      />

      {/* Create/Edit Unit Dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingProperty(null);
            setAddingUnitGroupId(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProperty
                ? "Edit Unit"
                : addingToGroup
                  ? `Add Unit to ${addingToGroup.address}`
                  : "Add New Property"}
            </DialogTitle>
          </DialogHeader>
          <PropertyForm
            property={propertyForForm}
            propertyGroupId={addingUnitGroupId || undefined}
            propertyGroupAddress={addingToGroup?.address}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setFormOpen(false);
              setEditingProperty(null);
              setAddingUnitGroupId(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertiesList;
