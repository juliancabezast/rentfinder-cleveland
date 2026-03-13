import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ImageOff,
  FileText,
  DollarSign,
  Ruler,
  Home,
  Tag,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

interface CheckPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PropertyIssue {
  field: string;
  label: string;
  severity: "critical" | "warning";
  icon: React.ReactNode;
}

function getIssues(property: Property): PropertyIssue[] {
  const issues: PropertyIssue[] = [];

  // Critical — property can't be listed without these
  if (!property.rent_price || property.rent_price <= 0) {
    issues.push({ field: "rent_price", label: "No rent price", severity: "critical", icon: <DollarSign className="h-3 w-3" /> });
  }
  if (!property.bedrooms || property.bedrooms <= 0) {
    issues.push({ field: "bedrooms", label: "No bedrooms", severity: "critical", icon: <Home className="h-3 w-3" /> });
  }
  if (!property.bathrooms || property.bathrooms <= 0) {
    issues.push({ field: "bathrooms", label: "No bathrooms", severity: "critical", icon: <Home className="h-3 w-3" /> });
  }
  if (!property.photos || !Array.isArray(property.photos) || property.photos.length === 0) {
    issues.push({ field: "photos", label: "No photos", severity: "critical", icon: <ImageOff className="h-3 w-3" /> });
  }

  // Warning — should fill in but not blocking
  if (!property.description || property.description.trim().length === 0) {
    issues.push({ field: "description", label: "No description", severity: "warning", icon: <FileText className="h-3 w-3" /> });
  }
  if (!property.square_feet || property.square_feet <= 0) {
    issues.push({ field: "square_feet", label: "No sq ft", severity: "warning", icon: <Ruler className="h-3 w-3" /> });
  }
  if (!property.property_type || property.property_type.trim().length === 0) {
    issues.push({ field: "property_type", label: "No type", severity: "warning", icon: <Tag className="h-3 w-3" /> });
  }
  return issues;
}

type IssueSummary = { property: Property; issues: PropertyIssue[]; criticalCount: number; warningCount: number };

export const CheckPropertiesDialog: React.FC<CheckPropertiesDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  const fetchAndCheck = useCallback(async () => {
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
      setLastChecked(new Date());
    } catch (err) {
      console.error("Error fetching properties for check:", err);
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id]);

  // Fetch on open
  useEffect(() => {
    if (open) fetchAndCheck();
  }, [open, fetchAndCheck]);

  // Compute results
  const withIssues: IssueSummary[] = [];
  const complete: Property[] = [];

  for (const property of properties) {
    const issues = getIssues(property);
    if (issues.length > 0) {
      const criticalCount = issues.filter((i) => i.severity === "critical").length;
      const warningCount = issues.filter((i) => i.severity === "warning").length;
      withIssues.push({ property, issues, criticalCount, warningCount });
    } else {
      complete.push(property);
    }
  }

  // Sort: most critical first, then by total issues
  withIssues.sort((a, b) => b.criticalCount - a.criticalCount || b.issues.length - a.issues.length);

  const totalCritical = withIssues.reduce((s, w) => s + w.criticalCount, 0);
  const totalWarnings = withIssues.reduce((s, w) => s + w.warningCount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Property Health Check
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAndCheck}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
          {lastChecked && (
            <p className="text-xs text-muted-foreground">
              Last checked: {lastChecked.toLocaleTimeString()} — {properties.length} properties scanned
            </p>
          )}
        </DialogHeader>

        {loading && properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Scanning all properties...</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-2 py-2">
              <div className="rounded-lg border p-2.5 text-center">
                <p className="text-xl font-bold">{properties.length}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-center">
                <p className="text-xl font-bold text-red-700">{totalCritical}</p>
                <p className="text-[10px] text-red-600">Critical</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-center">
                <p className="text-xl font-bold text-amber-700">{totalWarnings}</p>
                <p className="text-[10px] text-amber-600">Warnings</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 text-center">
                <p className="text-xl font-bold text-green-700">{complete.length}</p>
                <p className="text-[10px] text-green-600">Complete</p>
              </div>
            </div>

            {/* Results List */}
            <ScrollArea className="flex-1 min-h-0 max-h-[400px] pr-4">
              {withIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                  <p className="font-semibold text-lg">All properties look great!</p>
                  <p className="text-sm text-muted-foreground">
                    Every property has complete information.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {withIssues.map(({ property, issues, criticalCount }) => (
                    <button
                      key={property.id}
                      className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/properties/${property.id}`);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {property.address}
                            {property.unit_number && `, Unit ${property.unit_number}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {property.city}, {property.state} {property.zip_code}
                            {property.status === "coming_soon" && " · Coming Soon"}
                            {property.status === "rented" && " · Rented"}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {criticalCount > 0 && (
                            <Badge variant="outline" className="text-[10px] text-red-700 border-red-300 bg-red-50">
                              {criticalCount} critical
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {issues.map((issue) => (
                          <Badge
                            key={issue.field}
                            variant="secondary"
                            className={cn(
                              "text-[10px] gap-1 border",
                              issue.severity === "critical"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            )}
                          >
                            {issue.icon}
                            {issue.label}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))}

                  {/* Collapsible complete section */}
                  {complete.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={() => setShowComplete(!showComplete)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                      >
                        {showComplete ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        {complete.length} complete — no issues
                      </button>
                      {showComplete && (
                        <div className="mt-1.5 space-y-1">
                          {complete.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-green-100 bg-green-50/50 text-sm">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              <span className="truncate">
                                {p.address}{p.unit_number ? `, Unit ${p.unit_number}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
