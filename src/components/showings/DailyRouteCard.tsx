import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Phone,
  FileText,
  ChevronRight,
  Car,
  CheckCircle,
  Clock,
  XCircle,
  Circle,
  Navigation,
} from "lucide-react";
import { format, isWithinInterval, addMinutes } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ShowingReportDialog } from "@/components/showings/ShowingReportDialog";

interface ShowingWithDetails {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  property: {
    address: string;
    unit_number: string | null;
    city: string;
    bedrooms: number;
    bathrooms: number;
    rent_price: number;
  } | null;
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    lead_score: number | null;
    is_priority: boolean | null;
  } | null;
}

interface DailyRouteCardProps {
  showings: ShowingWithDetails[];
  loading?: boolean;
  onRefresh?: () => void;
}

// Rough driving time estimate between showings (in minutes)
const ESTIMATED_DRIVE_TIME = 12;
const ESTIMATED_DRIVE_DISTANCE = 3.2; // miles

const getStatusConfig = (status: string, scheduledAt: string, durationMinutes: number | null) => {
  const now = new Date();
  const start = new Date(scheduledAt);
  const duration = durationMinutes || 30;
  const end = addMinutes(start, duration);
  
  // Check if this is the current showing
  const isCurrent = isWithinInterval(now, { start, end });
  
  if (isCurrent && (status === 'scheduled' || status === 'confirmed')) {
    return {
      icon: Circle,
      color: "text-blue-500",
      bgColor: "bg-blue-500",
      label: "In Progress",
      pulse: true,
    };
  }
  
  switch (status) {
    case "confirmed":
      return {
        icon: CheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-600",
        label: "Confirmed",
        pulse: false,
      };
    case "completed":
      return {
        icon: CheckCircle,
        color: "text-muted-foreground",
        bgColor: "bg-muted-foreground",
        label: "Completed",
        pulse: false,
      };
    case "no_show":
      return {
        icon: XCircle,
        color: "text-destructive",
        bgColor: "bg-destructive",
        label: "No Show",
        pulse: false,
      };
    case "scheduled":
    default:
      return {
        icon: Clock,
        color: "text-amber-500",
        bgColor: "bg-amber-500",
        label: "Scheduled",
        pulse: false,
      };
  }
};

const getNumberedCircle = (index: number) => {
  const circles = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  return circles[index] || `(${index + 1})`;
};

export const DailyRouteCard: React.FC<DailyRouteCardProps> = ({
  showings,
  loading = false,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedShowing, setSelectedShowing] = useState<ShowingWithDetails | null>(null);

  const handleNavigate = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
  };

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleSubmitReport = (showing: ShowingWithDetails) => {
    setSelectedShowing(showing);
    setReportDialogOpen(true);
  };

  const totalDriveTime = (showings.length - 1) * ESTIMATED_DRIVE_TIME;
  const totalDistance = (showings.length - 1) * ESTIMATED_DRIVE_DISTANCE;

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-20" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-8 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showings.length === 0) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Today's Route
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              No showings scheduled for today.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Today's Route — {showings.length} Showing{showings.length !== 1 ? "s" : ""}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/showings/route")}
          >
            Expand <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="relative pl-6">
              {/* Vertical Timeline Line */}
              <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-border" />

              <div className="space-y-1">
                {showings.map((showing, index) => {
                  const statusConfig = getStatusConfig(
                    showing.status,
                    showing.scheduled_at,
                    showing.duration_minutes
                  );
                  const fullAddress = showing.property
                    ? `${showing.property.address}${showing.property.unit_number ? `, ${showing.property.unit_number}` : ""}, ${showing.property.city}`
                    : "Address unavailable";

                  return (
                    <div key={showing.id}>
                      {/* Showing Stop */}
                      <div className="relative flex gap-4 pb-3">
                        {/* Number Circle */}
                        <div
                          className={cn(
                            "absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground z-10",
                            statusConfig.bgColor,
                            statusConfig.pulse && "animate-pulse"
                          )}
                        >
                          {index + 1}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 bg-muted/30 rounded-lg p-3 border border-border/50">
                          {/* Time and Address */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">
                                  {format(new Date(showing.scheduled_at), "h:mm a")}
                                </span>
                                <span className="text-muted-foreground">—</span>
                                <span className="text-sm font-medium truncate">
                                  {fullAddress}
                                </span>
                              </div>
                              
                              {/* Lead and Property Details */}
                              <div className="text-xs text-muted-foreground mt-1">
                                {showing.lead?.full_name || "Unknown Lead"}
                                {showing.property && (
                                  <>
                                    {" · "}
                                    {showing.property.bedrooms}BR · ${showing.property.rent_price.toLocaleString()}
                                  </>
                                )}
                              </div>

                              {/* Status */}
                              <div className="flex items-center gap-1 mt-2">
                                <statusConfig.icon className={cn("h-3.5 w-3.5", statusConfig.color)} />
                                <span className={cn("text-xs font-medium", statusConfig.color)}>
                                  {statusConfig.label}
                                </span>
                                {showing.lead?.is_priority && (
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">
                                    Priority
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 mt-3 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => handleNavigate(fullAddress)}
                            >
                              <Navigation className="h-3 w-3 mr-1" />
                              Navigate
                            </Button>
                            {showing.lead?.phone && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleCall(showing.lead!.phone)}
                              >
                                <Phone className="h-3 w-3 mr-1" />
                                Call
                              </Button>
                            )}
                            {(showing.status === "confirmed" || showing.status === "scheduled") && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleSubmitReport(showing)}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Report
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Driving Time Between Stops */}
                      {index < showings.length - 1 && (
                        <div className="relative flex items-center gap-2 py-2 pl-1 text-xs text-muted-foreground">
                          <div className="absolute -left-6 w-6 flex justify-center">
                            <div className="w-0.5 h-full" />
                          </div>
                          <Car className="h-3.5 w-3.5 ml-1" />
                          <span>~{ESTIMATED_DRIVE_TIME} min · {ESTIMATED_DRIVE_DISTANCE} miles</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Route Summary */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t text-sm text-muted-foreground">
              <span>
                Total: ~{totalDriveTime} min driving · {totalDistance.toFixed(1)} miles
              </span>
            </div>
          </ScrollArea>

          {/* Full Route Button */}
          <Button
            variant="link"
            className="w-full mt-3 text-sm"
            onClick={() => navigate("/showings/route")}
          >
            Open Full Route Map →
          </Button>
        </CardContent>
      </Card>

      {/* Report Dialog */}
      {selectedShowing && (
        <ShowingReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          showingId={selectedShowing.id}
          leadId={selectedShowing.lead?.id || ""}
          propertyAddress={
            selectedShowing.property
              ? `${selectedShowing.property.address}, ${selectedShowing.property.city}`
              : undefined
          }
          onSuccess={() => {
            setReportDialogOpen(false);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
};

export const DailyRouteCardSkeleton: React.FC = () => (
  <Card variant="glass">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-8 w-20" />
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-6 w-6 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
