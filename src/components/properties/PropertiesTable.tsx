import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Check, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlternativePropertiesSelector } from "./AlternativePropertiesSelector";
import { ReassignLeadsDialog } from "./ReassignLeadsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

interface PropertiesTableProps {
  properties: Property[];
  allProperties: Property[];
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-green-100 text-green-800" },
  coming_soon: { label: "Coming Soon", className: "bg-amber-100 text-amber-800" },
  in_leasing_process: { label: "In Leasing", className: "bg-purple-100 text-purple-800" },
  rented: { label: "Rented", className: "bg-gray-200 text-gray-600" },
};

export const PropertiesTable: React.FC<PropertiesTableProps> = ({ properties, allProperties, onRefresh }) => {
  const navigate = useNavigate();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, string[]>>({});
  const [reassignProperty, setReassignProperty] = useState<Property | null>(null);

  // ALL org properties for selector — unaffected by status filter
  const availableForSelector = allProperties.map((p) => ({
    id: p.id,
    address: p.address,
    unit_number: p.unit_number,
    city: p.city,
    rent_price: p.rent_price,
    bedrooms: p.bedrooms,
    status: p.status,
  }));

  const getAltIds = (property: Property): string[] => {
    if (localOverrides[property.id]) return localOverrides[property.id];
    return Array.isArray(property.alternative_property_ids)
      ? (property.alternative_property_ids as string[])
      : [];
  };

  const handleAlternativesChange = async (propertyId: string, newIds: string[]) => {
    setLocalOverrides((prev) => ({ ...prev, [propertyId]: newIds }));
    setSavingId(propertyId);
    setSavedId(null);

    const { error } = await supabase
      .from("properties")
      .update({
        alternative_property_ids: newIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId);

    setSavingId(null);

    if (error) {
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[propertyId];
        return next;
      });
      toast.error("Save failed", { description: error.message });
      return;
    }

    // Brief checkmark feedback
    setSavedId(propertyId);
    setTimeout(() => setSavedId(null), 1500);
  };

  // Sort: rented first (need redirect attention), then by address
  const sorted = [...properties].sort((a, b) => {
    const aRented = a.status === "rented" ? 0 : 1;
    const bRented = b.status === "rented" ? 0 : 1;
    if (aRented !== bRented) return aRented - bRented;
    return a.address.localeCompare(b.address);
  });

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Address</TableHead>
            <TableHead className="min-w-[60px]">Unit</TableHead>
            <TableHead className="min-w-[90px]">Beds/Bath</TableHead>
            <TableHead className="min-w-[80px]">Rent</TableHead>
            <TableHead className="min-w-[100px]">Status</TableHead>
            <TableHead className="min-w-[280px]">Redirect To</TableHead>
            <TableHead className="min-w-[90px]">Leads</TableHead>
            <TableHead className="min-w-[70px]">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((property) => {
            const status = STATUS_CONFIG[property.status] || STATUS_CONFIG.available;
            const altIds = getAltIds(property);
            const isRented = property.status === "rented";
            const isSaving = savingId === property.id;
            const justSaved = savedId === property.id;

            return (
              <TableRow
                key={property.id}
                className={isRented ? "bg-muted/40" : ""}
              >
                <TableCell>
                  <button
                    className="text-sm font-medium text-left hover:text-[#370d4b] hover:underline cursor-pointer"
                    onClick={() => navigate(`/properties/${property.id}`)}
                  >
                    {property.address}
                  </button>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {property.unit_number || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {property.bedrooms}bd / {property.bathrooms}ba
                </TableCell>
                <TableCell className="text-sm font-medium">
                  ${property.rent_price.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge className={`${status.className} text-xs`}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <AlternativePropertiesSelector
                        selectedIds={altIds}
                        onChange={(ids) => handleAlternativesChange(property.id, ids)}
                        availableProperties={availableForSelector}
                        excludePropertyId={property.id}
                        compact
                      />
                    </div>
                    {isSaving && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                    {justSaved && !isSaving && (
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-[#370d4b]"
                    onClick={() => setReassignProperty(property)}
                    title="Reassign leads to another property"
                  >
                    <Users className="h-3.5 w-3.5 mr-1" />
                    Reassign
                  </Button>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(property.updated_at), "MMM d")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {/* Reassign Leads Dialog */}
      {reassignProperty && (
        <ReassignLeadsDialog
          open={!!reassignProperty}
          onOpenChange={(open) => {
            if (!open) setReassignProperty(null);
          }}
          sourceProperty={reassignProperty}
          allProperties={allProperties}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
};
