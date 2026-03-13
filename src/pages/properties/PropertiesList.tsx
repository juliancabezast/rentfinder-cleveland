import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Building2,
  Filter,
  Globe,
  ClipboardCheck,
  Settings2,
  Bed,
  Bath,
  DoorOpen,
  DollarSign,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { PropertyForm } from "@/components/properties/PropertyForm";
import { ZillowImportDialog } from "@/components/properties/ZillowImportDialog";
import { PropertyRulesDialog } from "@/components/properties/PropertyRulesDialog";
import { CheckPropertiesDialog } from "@/components/properties/CheckPropertiesDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "available", label: "Available" },
  { value: "coming_soon", label: "Coming Soon" },
  { value: "in_leasing_process", label: "In Leasing" },
  { value: "rented", label: "Rented" },
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  available: { label: "Available", dot: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200" },
  coming_soon: { label: "Coming Soon", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  in_leasing_process: { label: "In Leasing", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  rented: { label: "Rented", dot: "bg-gray-400", badge: "bg-gray-50 text-gray-500 border-gray-200" },
};

// Inline editable cell for rent/beds/baths
function EditableCell({
  value,
  onSave,
  prefix = "",
  type = "number",
  canEdit,
}: {
  value: number;
  onSave: (v: number) => void;
  prefix?: string;
  type?: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (!canEdit) {
    return <span>{prefix}{value.toLocaleString()}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="hover:bg-indigo-50 rounded px-1 -mx-1 transition-colors cursor-pointer"
        title="Click to edit"
      >
        {prefix}{value.toLocaleString()}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(Number(draft)); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-16 px-1 py-0.5 text-sm border rounded focus:ring-1 focus:ring-indigo-300"
        autoFocus
      />
      <button onClick={() => { onSave(Number(draft)); setEditing(false); }} className="text-green-600 hover:text-green-800">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

const PropertiesList: React.FC = () => {
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [zillowOpen, setZillowOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("address")
        .order("unit_number");
      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({ title: "Error", description: "Failed to load properties.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Inline update
  const updateProperty = async (id: string, field: string, value: number) => {
    const { error } = await supabase
      .from("properties")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: `Failed to update ${field}`, variant: "destructive" });
    } else {
      setProperties((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
    }
  };

  // Filter
  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return p.address.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.zip_code.includes(searchQuery);
    });
  }, [properties, statusFilter, searchQuery]);

  // Group by address for display
  const grouped = useMemo(() => {
    const map = new Map<string, Property[]>();
    for (const p of filtered) {
      const key = `${p.address.trim().toLowerCase()}|${p.city}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([, units]) => ({
      address: units[0].address,
      city: units[0].city,
      state: units[0].state,
      zip_code: units[0].zip_code,
      units: units.sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || "")),
    }));
  }, [filtered]);

  // Stats
  const stats = useMemo(() => {
    const active = properties.filter((p) => p.status !== "rented");
    const available = properties.filter((p) => p.status === "available");
    const rented = properties.filter((p) => p.status === "rented");
    const addresses = new Set(properties.map((p) => p.address.trim().toLowerCase()));
    const potentialRent = available.reduce((sum, p) => sum + (p.rent_price || 0), 0);
    const currentRent = rented.reduce((sum, p) => sum + (p.rent_price || 0), 0);
    return {
      buildings: addresses.size,
      totalDoors: properties.length,
      available: available.length,
      rented: rented.length,
      potentialRent,
      currentRent,
      totalPossible: potentialRent + currentRent,
    };
  }, [properties]);

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingProperty(null);
    fetchData();
  };

  const propertyForForm = editingProperty
    ? {
        ...editingProperty,
        photos: Array.isArray(editingProperty.photos) ? (editingProperty.photos as string[]) : null,
        amenities: Array.isArray(editingProperty.amenities) ? (editingProperty.amenities as string[]) : null,
        alternative_property_ids: Array.isArray(editingProperty.alternative_property_ids) ? (editingProperty.alternative_property_ids as string[]) : null,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-600" />
            Properties
          </h1>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => setCheckOpen(true)} size="sm" disabled={properties.length === 0}>
            <ClipboardCheck className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Check</span>
          </Button>
          {permissions.canEditProperty && (
            <Button variant="outline" onClick={() => setRulesOpen(true)} size="sm">
              <Settings2 className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Rules</span>
            </Button>
          )}
          {permissions.canCreateProperty && (
            <>
              <Button variant="outline" onClick={() => setZillowOpen(true)} size="sm">
                <Globe className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button onClick={() => { setEditingProperty(null); setFormOpen(true); }} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Add Property</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-500" />
              <div>
                <div className="text-lg font-bold">{stats.buildings}</div>
                <div className="text-[11px] text-muted-foreground">Buildings</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-indigo-500" />
              <div>
                <div className="text-lg font-bold">{stats.totalDoors}</div>
                <div className="text-[11px] text-muted-foreground">Total Doors</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <div>
                <div className="text-lg font-bold text-green-600">{stats.available}</div>
                <div className="text-[11px] text-muted-foreground">Available</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-gray-400" />
              <div>
                <div className="text-lg font-bold">{stats.rented}</div>
                <div className="text-[11px] text-muted-foreground">Rented</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-lg font-bold text-green-600">${stats.potentialRent.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">Potential/mo</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-indigo-500" />
              <div>
                <div className="text-lg font-bold">${stats.totalPossible.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">Total if full</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search address, city, zip..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Properties Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : grouped.length === 0 ? (
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-0">
            <EmptyState
              icon={Building2}
              title="No properties found"
              description={searchQuery || statusFilter !== "all" ? "Try adjusting your filters." : "Add your first property to get started."}
              action={permissions.canCreateProperty && !searchQuery && statusFilter === "all" ? { label: "Add Property", onClick: () => setFormOpen(true) } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr,60px,60px,50px,90px,100px,36px] gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Address</span>
            <span className="text-center">Beds</span>
            <span className="text-center">Baths</span>
            <span className="text-center">SqFt</span>
            <span className="text-right">Rent</span>
            <span className="text-center">Status</span>
            <span />
          </div>

          {grouped.map((group) => (
            <div key={group.address + group.city} className="space-y-0.5">
              {/* Building header — always show for multi-unit, skip for single-unit (address shown inline) */}
              {group.units.length > 1 && (
                <div className="px-3 pt-1 pb-0.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group.address} — {group.city}, {group.state} {group.zip_code}
                  </span>
                </div>
              )}

              {group.units.map((unit) => {
                const s = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                return (
                  <div
                    key={unit.id}
                    className="grid grid-cols-[1fr,auto] sm:grid-cols-[1fr,60px,60px,50px,90px,100px,36px] gap-2 items-center px-3 py-2 rounded-lg bg-white/50 hover:bg-white/80 backdrop-blur-sm border border-border/30 transition-colors"
                  >
                    {/* Address */}
                    <Link to={`/properties/${unit.id}`} className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", s.dot)} />
                        <span className="font-medium text-sm truncate">
                          {group.units.length > 1 ? `Unit ${unit.unit_number || "—"}` : unit.address}
                        </span>
                        {group.units.length === 1 && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {unit.city}, {unit.state}
                          </span>
                        )}
                      </div>
                      {/* Mobile: show specs inline */}
                      <div className="sm:hidden flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{unit.bedrooms}bd / {unit.bathrooms}ba</span>
                        <span className="font-semibold text-foreground">${unit.rent_price.toLocaleString()}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", s.badge)}>{s.label}</Badge>
                      </div>
                    </Link>

                    {/* Beds */}
                    <div className="hidden sm:flex justify-center text-sm">
                      <EditableCell value={unit.bedrooms} onSave={(v) => updateProperty(unit.id, "bedrooms", v)} canEdit={permissions.canEditProperty} />
                    </div>

                    {/* Baths */}
                    <div className="hidden sm:flex justify-center text-sm">
                      <EditableCell value={Number(unit.bathrooms)} onSave={(v) => updateProperty(unit.id, "bathrooms", v)} canEdit={permissions.canEditProperty} />
                    </div>

                    {/* SqFt */}
                    <div className="hidden sm:flex justify-center text-xs text-muted-foreground">
                      {unit.square_feet || "—"}
                    </div>

                    {/* Rent */}
                    <div className="hidden sm:flex justify-end text-sm font-semibold">
                      <EditableCell value={unit.rent_price} onSave={(v) => updateProperty(unit.id, "rent_price", v)} prefix="$" canEdit={permissions.canEditProperty} />
                    </div>

                    {/* Status */}
                    <div className="hidden sm:flex justify-center">
                      <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", s.badge)}>
                        {s.label}
                      </Badge>
                    </div>

                    {/* Edit */}
                    {permissions.canEditProperty ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hidden sm:flex"
                        onClick={() => { setEditingProperty(unit); setFormOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    ) : (
                      <div className="hidden sm:block" />
                    )}

                    {/* Mobile edit */}
                    {permissions.canEditProperty && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 sm:hidden"
                        onClick={() => { setEditingProperty(unit); setFormOpen(true); }}
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <PropertyRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
      <ZillowImportDialog open={zillowOpen} onOpenChange={setZillowOpen} onSuccess={fetchData} />
      <CheckPropertiesDialog open={checkOpen} onOpenChange={setCheckOpen} properties={properties} />

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingProperty(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProperty ? "Edit Property" : "Add New Property"}</DialogTitle>
          </DialogHeader>
          <PropertyForm
            property={propertyForForm}
            onSuccess={handleFormSuccess}
            onCancel={() => { setFormOpen(false); setEditingProperty(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertiesList;
