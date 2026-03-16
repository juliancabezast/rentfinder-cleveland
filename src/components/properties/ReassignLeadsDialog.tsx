import React, { useState, useEffect } from "react";
import { ArrowRight, Loader2, Users, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

interface ReassignLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceProperty: Property;
  allProperties: Property[];
  onSuccess?: () => void;
}

export const ReassignLeadsDialog: React.FC<ReassignLeadsDialogProps> = ({
  open,
  onOpenChange,
  sourceProperty,
  allProperties,
  onSuccess,
}) => {
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [targetPropertyId, setTargetPropertyId] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  // Fetch lead count when dialog opens
  useEffect(() => {
    if (open && sourceProperty.id) {
      fetchLeadCount();
      setTargetPropertyId("");
    }
  }, [open, sourceProperty.id]);

  const fetchLeadCount = async () => {
    setLoadingCount(true);
    try {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("interested_property_id", sourceProperty.id);

      if (error) throw error;
      setLeadCount(count ?? 0);
    } catch (error) {
      console.error("Error fetching lead count:", error);
      setLeadCount(0);
    } finally {
      setLoadingCount(false);
    }
  };

  const targetProperties = allProperties.filter(
    (p) => p.id !== sourceProperty.id
  );

  const targetProperty = allProperties.find((p) => p.id === targetPropertyId);

  const handleReassign = async () => {
    if (!targetPropertyId || !leadCount) return;

    setReassigning(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({
          interested_property_id: targetPropertyId,
          updated_at: new Date().toISOString(),
        })
        .eq("interested_property_id", sourceProperty.id);

      if (error) throw error;

      toast.success(`${leadCount} lead${leadCount > 1 ? "s" : ""} reassigned`, {
        description: `From ${sourceProperty.address} → ${targetProperty?.address}`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error reassigning leads:", error);
      toast.error("Failed to reassign leads");
    } finally {
      setReassigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Reassign Leads
          </DialogTitle>
          <DialogDescription>
            Move all leads from one property to another
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source Property */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">From</p>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="font-medium text-sm">
                {sourceProperty.address}
                {sourceProperty.unit_number && `, Unit ${sourceProperty.unit_number}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {sourceProperty.city}, {sourceProperty.state} {sourceProperty.zip_code}
                {" · "}${sourceProperty.rent_price.toLocaleString()}/mo
              </p>
              <div className="mt-2">
                {loadingCount ? (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Counting leads...
                  </Badge>
                ) : leadCount === 0 ? (
                  <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                    No leads assigned
                  </Badge>
                ) : (
                  <Badge className="bg-[#4F46E5] text-white">
                    {leadCount} lead{leadCount > 1 ? "s" : ""} assigned
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Target Property */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">To</p>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={leadCount === 0}
                >
                  {targetProperty ? (
                    <span className="truncate">
                      {targetProperty.address}
                      {targetProperty.unit_number && ` #${targetProperty.unit_number}`}
                      {" · "}${targetProperty.rent_price.toLocaleString()}/mo
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select target property...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full max-w-[calc(100vw-2rem)] sm:min-w-[400px] p-0 z-[60]" align="start" side="bottom" sideOffset={4}>
                <Command>
                  <CommandInput placeholder="Search properties..." />
                  <CommandList className="max-h-[40vh] sm:max-h-[300px]">
                    <CommandEmpty>No properties found.</CommandEmpty>
                    <CommandGroup>
                      {targetProperties.map((property) => (
                        <CommandItem
                          key={property.id}
                          value={`${property.address} ${property.unit_number || ""} ${property.city}`}
                          onSelect={() => {
                            setTargetPropertyId(property.id);
                            setPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              targetPropertyId === property.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {property.address}
                              {property.unit_number && `, Unit ${property.unit_number}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {property.bedrooms}bd / {property.bathrooms}ba · $
                              {property.rent_price.toLocaleString()}/mo · {property.city}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "ml-2 text-[10px]",
                              property.status === "available" && "bg-green-100 text-green-700",
                              property.status === "coming_soon" && "bg-amber-100 text-amber-700",
                              property.status === "rented" && "bg-gray-100 text-gray-600",
                              property.status === "in_leasing_process" && "bg-purple-100 text-purple-700"
                            )}
                          >
                            {property.status === "in_leasing_process" ? "In Leasing" :
                             property.status === "coming_soon" ? "Coming Soon" :
                             property.status === "rented" ? "Rented" : "Available"}
                          </Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Warning */}
          {leadCount !== null && leadCount > 0 && targetPropertyId && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                This will reassign <strong>{leadCount}</strong> lead{leadCount > 1 ? "s" : ""} from{" "}
                <strong>{sourceProperty.address}</strong> to{" "}
                <strong>{targetProperty?.address}</strong>. This action cannot be easily undone.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleReassign}
            disabled={!targetPropertyId || leadCount === 0 || reassigning}
            className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
          >
            {reassigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reassigning...
              </>
            ) : (
              `Reassign ${leadCount ?? 0} Lead${(leadCount ?? 0) > 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
