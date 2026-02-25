import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlternativePropertiesSelector } from "./AlternativePropertiesSelector";
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
  rented: { label: "Rented", className: "bg-gray-100 text-gray-600" },
};

export const PropertiesTable: React.FC<PropertiesTableProps> = ({ properties, allProperties, onRefresh }) => {
  const navigate = useNavigate();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, string[]>>({});

  // Use ALL org properties for the selector so it works regardless of status filter
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
    // Optimistic local update — no loading flash
    setLocalOverrides((prev) => ({ ...prev, [propertyId]: newIds }));
    setSavingId(propertyId);

    const { error } = await supabase
      .from("properties")
      .update({
        alternative_property_ids: newIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId);

    setSavingId(null);

    if (error) {
      // Revert optimistic update
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[propertyId];
        return next;
      });
      toast.error("Save failed", { description: error.message });
      return;
    }

    toast.success("Redirect properties updated");
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Address</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Beds/Bath</TableHead>
            <TableHead>Rent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="min-w-[300px]">Redirect To</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((property) => {
            const status = STATUS_CONFIG[property.status] || STATUS_CONFIG.available;
            const altIds = getAltIds(property);
            const isRented = property.status === "rented";
            const isSaving = savingId === property.id;

            return (
              <TableRow
                key={property.id}
                className={isRented ? "bg-muted/50" : ""}
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
                  <div className="relative">
                    {isSaving && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <AlternativePropertiesSelector
                      selectedIds={altIds}
                      onChange={(ids) => handleAlternativesChange(property.id, ids)}
                      availableProperties={availableForSelector}
                      excludePropertyId={property.id}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(property.updated_at), "MMM d")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
