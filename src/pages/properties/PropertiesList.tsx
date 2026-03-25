import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  ChevronRight,
  ChevronDown,
  ImageIcon,
  ImageOff,
  Users,
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
  const navigate = useNavigate();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [zillowOpen, setZillowOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingUnitTo, setAddingUnitTo] = useState<{ address: string; city: string; state: string; zip_code: string; property_group_id: string | null } | null>(null);
  const [leadCounts, setLeadCounts] = useState<Map<string, number>>(new Map());

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

      // Fetch lead counts per property
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("interested_property_id")
        .eq("organization_id", userRecord.organization_id)
        .not("interested_property_id", "is", null);
      if (!leadError && leadData) {
        const counts = new Map<string, number>();
        for (const lead of leadData) {
          const pid = lead.interested_property_id as string;
          counts.set(pid, (counts.get(pid) || 0) + 1);
        }
        setLeadCounts(counts);
      }
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({ title: "Error", description: "Failed to load properties.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Inline update
  const updateProperty = async (id: string, field: string, value: number | string) => {
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
    return Array.from(map.entries()).map(([key, units]) => ({
      key,
      address: units[0].address,
      city: units[0].city,
      state: units[0].state,
      zip_code: units[0].zip_code,
      units: units.sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || "")),
    }));
  }, [filtered]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
    setAddingUnitTo(null);
    fetchData();
  };

  const propertyForForm = editingProperty
    ? {
        ...editingProperty,
        photos: Array.isArray(editingProperty.photos) ? (editingProperty.photos as string[]) : null,
        amenities: Array.isArray(editingProperty.amenities) ? (editingProperty.amenities as string[]) : null,
        alternative_property_ids: Array.isArray(editingProperty.alternative_property_ids) ? (editingProperty.alternative_property_ids as string[]) : null,
      }
    : addingUnitTo
    ? {
        id: "",
        address: addingUnitTo.address,
        unit_number: "",
        city: addingUnitTo.city,
        state: addingUnitTo.state,
        zip_code: addingUnitTo.zip_code,
        bedrooms: 0,
        bathrooms: 1,
        rent_price: 0,
        status: "available",
        photos: null,
        amenities: null,
        alternative_property_ids: null,
      }
    : null;

  const formGroupId = addingUnitTo?.property_group_id || undefined;

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
              <Button onClick={() => { setEditingProperty(null); setFormOpen(true); }} size="sm" className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white">
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

      {/* Properties List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
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
        <div className="space-y-1.5">
          {grouped.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const totalLeads = group.units.reduce((sum, u) => sum + (leadCounts.get(u.id) || 0), 0);
            const allHavePhotos = group.units.every((u) => Array.isArray(u.photos) && u.photos.length > 0);
            const someHavePhotos = group.units.some((u) => Array.isArray(u.photos) && u.photos.length > 0);
            const isSingleStandalone = group.units.length === 1 && !group.units[0].unit_number;
            const rentRange = (() => {
              const rents = group.units.map((u) => u.rent_price).filter((r) => r > 0);
              if (rents.length === 0) return null;
              const min = Math.min(...rents);
              const max = Math.max(...rents);
              return min === max ? `$${min.toLocaleString()}` : `$${min.toLocaleString()}–$${max.toLocaleString()}`;
            })();

            return (
              <div key={group.key}>
                {/* Building row */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left",
                    isExpanded
                      ? "bg-indigo-50/80 border-indigo-200/60"
                      : "bg-white/60 border-border/30 hover:bg-white/90"
                  )}
                >
                  {/* Chevron */}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  {/* Photo indicator */}
                  {allHavePhotos ? (
                    <ImageIcon className="h-4 w-4 text-green-500 shrink-0" />
                  ) : someHavePhotos ? (
                    <ImageIcon className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <ImageOff className="h-4 w-4 text-red-400 shrink-0" />
                  )}

                  {/* Address & info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{group.address}</span>
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                        {group.city}, {group.state} {group.zip_code}
                      </span>
                    </div>
                    {/* Subtitle line */}
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {isSingleStandalone ? (
                        <>
                          <span>{group.units[0].bedrooms}bd / {Number(group.units[0].bathrooms)}ba</span>
                          <span>·</span>
                        </>
                      ) : (
                        <>
                          <span>{group.units.length} unit{group.units.length > 1 ? "s" : ""}</span>
                          <span>·</span>
                        </>
                      )}
                      {rentRange && <span className="font-medium text-foreground">{rentRange}/mo</span>}
                      {!rentRange && <span>No rent set</span>}
                    </div>
                  </div>

                  {/* Right side badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Leads */}
                    {totalLeads > 0 && (
                      <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                        <Users className="h-3 w-3" />
                        {totalLeads}
                      </span>
                    )}

                    {/* Status */}
                    {isSingleStandalone ? (
                      (() => {
                        const sc = STATUS_CONFIG[group.units[0].status] || STATUS_CONFIG.available;
                        return <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 shrink-0", sc.badge)}>{sc.label}</Badge>;
                      })()
                    ) : (
                      <div className="flex gap-1">
                        {group.units.map((u) => {
                          const sc = STATUS_CONFIG[u.status] || STATUS_CONFIG.available;
                          return <span key={u.id} className={cn("h-2.5 w-2.5 rounded-full", sc.dot)} title={`${u.unit_number || "Unit"}: ${sc.label}`} />;
                        })}
                      </div>
                    )}

                    {/* Edit */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        const groupId = group.units[0].property_group_id as string | null;
                        navigate(groupId ? `/properties/group/${groupId}` : `/properties/${group.units[0].id}`);
                      }}
                      className="p-1 rounded-md hover:bg-black/5 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </button>

                {/* Expanded units */}
                {isExpanded && (
                  <div className="ml-9 mt-1 space-y-1">
                    {group.units.map((unit) => {
                      const s = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                      const hasPhotos = Array.isArray(unit.photos) && unit.photos.length > 0;
                      const unitLabel = unit.unit_number ? `Unit ${unit.unit_number}` : group.address;
                      const unitLeads = leadCounts.get(unit.id) || 0;

                      return (
                        <div
                          key={unit.id}
                          className={cn(
                            "rounded-lg bg-white/50 hover:bg-white/80 border border-border/20 transition-colors border-l-[3px] px-3 py-2",
                            unit.status === "available" && "border-l-green-500",
                            unit.status === "coming_soon" && "border-l-amber-500",
                            unit.status === "in_leasing_process" && "border-l-blue-500",
                            unit.status === "rented" && "border-l-gray-400",
                          )}
                        >
                          {/* Row 1: name + rent */}
                          <div className="flex items-baseline justify-between">
                            <Link to={`/properties/${unit.id}`} className="font-semibold text-sm hover:text-indigo-600">
                              {unitLabel}
                            </Link>
                            <span className="text-sm font-semibold">${unit.rent_price.toLocaleString()}/mo</span>
                          </div>
                          {/* Row 2: details + badges */}
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {unit.bedrooms}bd / {Number(unit.bathrooms)}ba
                              {unit.square_feet ? ` · ${unit.square_feet} sqft` : ""}
                              {!hasPhotos ? " · No photos" : ""}
                            </span>
                            <div className="flex items-center gap-2">
                              {unitLeads > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0">
                                  <Users className="h-2.5 w-2.5" />
                                  {unitLeads}
                                </span>
                              )}
                              {permissions.canEditProperty ? (
                                <Select value={unit.status} onValueChange={(v) => updateProperty(unit.id, "status", v)}>
                                  <SelectTrigger className={cn("h-5 w-[85px] text-[10px] px-2 border rounded-full font-medium", s.badge)}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => {
                                      const sc = STATUS_CONFIG[o.value];
                                      return (
                                        <SelectItem key={o.value} value={o.value}>
                                          <span className="flex items-center gap-1.5">
                                            <span className={cn("h-2 w-2 rounded-full", sc?.dot)} />
                                            {o.label}
                                          </span>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="outline" className={cn("text-[10px] px-2 py-0", s.badge)}>{s.label}</Badge>
                              )}
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                const gid = unit.property_group_id as string | null;
                                navigate(gid ? `/properties/group/${gid}` : `/properties/${unit.id}`);
                              }}>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <PropertyRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
      <ZillowImportDialog open={zillowOpen} onOpenChange={setZillowOpen} onSuccess={fetchData} />
      <CheckPropertiesDialog open={checkOpen} onOpenChange={setCheckOpen} />

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) { setEditingProperty(null); setAddingUnitTo(null); }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProperty ? "Edit Property" : addingUnitTo ? `Add Unit to ${addingUnitTo.address}` : "Add New Property"}
            </DialogTitle>
          </DialogHeader>
          <PropertyForm
            property={propertyForForm}
            propertyGroupId={formGroupId}
            propertyGroupAddress={addingUnitTo?.address}
            propertyGroupCity={addingUnitTo?.city}
            propertyGroupState={addingUnitTo?.state}
            propertyGroupZip={addingUnitTo?.zip_code}
            onSuccess={handleFormSuccess}
            onCancel={() => { setFormOpen(false); setEditingProperty(null); setAddingUnitTo(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertiesList;
