import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Phone,
  Mail,
  FileText,
  ChevronLeft,
  ChevronRight,
  Car,
  CheckCircle,
  Clock,
  XCircle,
  Circle,
  Navigation,
  ExternalLink,
  Calendar,
  Star,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  format,
  startOfDay,
  endOfDay,
  addDays,
  isToday,
  isWithinInterval,
  addMinutes,
} from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ShowingReportDialog } from "@/components/showings/ShowingReportDialog";
import { toast } from "sonner";

interface ShowingWithDetails {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  property: {
    id: string;
    address: string;
    unit_number: string | null;
    city: string;
    state: string;
    bedrooms: number;
    bathrooms: number;
    rent_price: number;
    special_notes: string | null;
  } | null;
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    email: string | null;
    lead_score: number | null;
    is_priority: boolean | null;
    preferred_language: string | null;
  } | null;
}

const ESTIMATED_DRIVE_TIME = 12;
const ESTIMATED_DRIVE_DISTANCE = 3.2;

const getStatusConfig = (status: string, scheduledAt: string, durationMinutes: number | null) => {
  const now = new Date();
  const start = new Date(scheduledAt);
  const duration = durationMinutes || 30;
  const end = addMinutes(start, duration);
  
  const isCurrent = isWithinInterval(now, { start, end });
  
  if (isCurrent && (status === "scheduled" || status === "confirmed")) {
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

interface MyRouteTabProps {
  onRefresh?: () => void;
}

export const MyRouteTab: React.FC<MyRouteTabProps> = ({ onRefresh }) => {
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showings, setShowings] = useState<ShowingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedShowing, setSelectedShowing] = useState<ShowingWithDetails | null>(null);

  const fetchShowings = async () => {
    if (!userRecord?.id || !userRecord?.organization_id) return;

    setLoading(true);
    try {
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();

      const query = supabase
        .from("showings")
        .select(`
          id, scheduled_at, status, duration_minutes,
          properties:property_id (
            id, address, unit_number, city, state, bedrooms, bathrooms, rent_price, special_notes
          ),
          leads:lead_id (
            id, full_name, phone, email, lead_score, is_priority, preferred_language
          )
        `)
        .eq("organization_id", userRecord.organization_id)
        .gte("scheduled_at", dayStart)
        .lte("scheduled_at", dayEnd)
        .in("status", ["scheduled", "confirmed", "completed", "no_show"])
        .order("scheduled_at", { ascending: true });

      if (userRecord.role === "leasing_agent") {
        query.eq("leasing_agent_id", userRecord.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      setShowings(
        (data || []).map((s: any) => ({
          id: s.id,
          scheduled_at: s.scheduled_at,
          status: s.status,
          duration_minutes: s.duration_minutes,
          property: s.properties,
          lead: s.leads,
        }))
      );
    } catch (error) {
      console.error("Error fetching showings:", error);
      toast.error("Failed to load route");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShowings();
  }, [selectedDate, userRecord?.id, userRecord?.organization_id]);

  const handleNavigate = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
  };

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleEmail = (email: string) => {
    window.open(`mailto:${email}`, "_self");
  };

  const handleSubmitReport = (showing: ShowingWithDetails) => {
    setSelectedShowing(showing);
    setReportDialogOpen(true);
  };

  const handleExportToGoogleMaps = () => {
    if (showings.length === 0) return;
    
    const addresses = showings
      .filter((s) => s.property)
      .map((s) => {
        const p = s.property!;
        return `${p.address}${p.unit_number ? ` ${p.unit_number}` : ""}, ${p.city}, ${p.state}`;
      });
    
    const googleMapsUrl = `https://www.google.com/maps/dir/${addresses.map(encodeURIComponent).join("/")}`;
    window.open(googleMapsUrl, "_blank");
  };

  const totalDriveTime = Math.max(0, (showings.length - 1)) * ESTIMATED_DRIVE_TIME;
  const totalDistance = Math.max(0, (showings.length - 1)) * ESTIMATED_DRIVE_DISTANCE;

  const getFullAddress = (property: ShowingWithDetails["property"]) => {
    if (!property) return "Address unavailable";
    return `${property.address}${property.unit_number ? `, ${property.unit_number}` : ""}, ${property.city}, ${property.state}`;
  };

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-muted-foreground">
          Your scheduled showings for {format(selectedDate, "EEEE, MMMM d, yyyy")}
        </p>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isToday(selectedDate) ? "default" : "outline"}
            onClick={() => setSelectedDate(new Date())}
            className="min-w-[120px]"
          >
            <Calendar className="h-4 w-4 mr-2" />
            {isToday(selectedDate) ? "Today" : format(selectedDate, "MMM d")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2 lg:min-h-[500px]">
        {/* Left Panel - Route Timeline */}
        <Card variant="glass" className="h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Route Timeline
              {showings.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {showings.length} stop{showings.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-8 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : showings.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No showings scheduled"
                description="Use the arrows to check other days"
              />
            ) : (
              <ScrollArea className="h-[calc(100vh-500px)] min-h-[400px]">
                <div className="relative pl-8">
                  <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />

                  <div className="space-y-2">
                    {showings.map((showing, index) => {
                      const statusConfig = getStatusConfig(
                        showing.status,
                        showing.scheduled_at,
                        showing.duration_minutes
                      );
                      const fullAddress = getFullAddress(showing.property);

                      return (
                        <div key={showing.id}>
                          <div className="relative flex gap-4 pb-4">
                            <div
                              className={cn(
                                "absolute -left-8 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground z-10",
                                statusConfig.bgColor,
                                statusConfig.pulse && "animate-pulse"
                              )}
                            >
                              {index + 1}
                            </div>

                            <div className="flex-1 min-w-0 bg-muted/30 rounded-xl p-4 border border-border/50">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-bold text-lg">
                                      {format(new Date(showing.scheduled_at), "h:mm a")}
                                    </span>
                                    <Badge variant="outline" className={cn("text-xs", statusConfig.color)}>
                                      <statusConfig.icon className="h-3 w-3 mr-1" />
                                      {statusConfig.label}
                                    </Badge>
                                    {showing.lead?.is_priority && (
                                      <Badge variant="destructive" className="text-xs">
                                        <Star className="h-3 w-3 mr-1" />
                                        Priority
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-medium">{fullAddress}</p>
                                </div>
                              </div>

                              <Separator className="my-3" />

                              <div className="space-y-2 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {showing.lead?.full_name || "Unknown Lead"}
                                  </span>
                                  {showing.lead?.lead_score !== null && (
                                    <Badge variant="secondary" className="text-xs">
                                      Score: {showing.lead.lead_score}
                                    </Badge>
                                  )}
                                  {showing.lead?.preferred_language && showing.lead.preferred_language !== "en" && (
                                    <Badge variant="outline" className="text-xs">
                                      <Globe className="h-3 w-3 mr-1" />
                                      {showing.lead.preferred_language.toUpperCase()}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                  {showing.lead?.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {showing.lead.phone}
                                    </span>
                                  )}
                                  {showing.lead?.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {showing.lead.email}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {showing.property && (
                                <div className="bg-background/50 rounded-lg p-2 mb-3 text-sm">
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                                    <span>{showing.property.bedrooms} bed</span>
                                    <span>{showing.property.bathrooms} bath</span>
                                    <span className="font-medium text-foreground">
                                      ${showing.property.rent_price.toLocaleString()}/mo
                                    </span>
                                  </div>
                                  {showing.property.special_notes && (
                                    <div className="mt-2 flex items-start gap-1 text-xs">
                                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                                      <span className="text-muted-foreground">
                                        {showing.property.special_notes}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  className="h-9"
                                  onClick={() => handleNavigate(fullAddress)}
                                >
                                  <Navigation className="h-4 w-4 mr-1" />
                                  Navigate
                                </Button>
                                {showing.lead?.phone && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => handleCall(showing.lead!.phone)}
                                  >
                                    <Phone className="h-4 w-4 mr-1" />
                                    Call
                                  </Button>
                                )}
                                {showing.lead?.email && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => handleEmail(showing.lead!.email!)}
                                  >
                                    <Mail className="h-4 w-4 mr-1" />
                                    Email
                                  </Button>
                                )}
                                {(showing.status === "scheduled" || showing.status === "confirmed") && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => handleSubmitReport(showing)}
                                  >
                                    <FileText className="h-4 w-4 mr-1" />
                                    Report
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          {index < showings.length - 1 && (
                            <div className="flex items-center gap-2 pl-1 py-2 text-xs text-muted-foreground">
                              <Car className="h-3 w-3" />
                              <span>~{ESTIMATED_DRIVE_TIME} min • {ESTIMATED_DRIVE_DISTANCE} mi</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Summary & Map */}
        <div className="space-y-4">
          {/* Summary Card */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Route Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold">{showings.length}</p>
                  <p className="text-sm text-muted-foreground">Stops</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold">{totalDriveTime}</p>
                  <p className="text-sm text-muted-foreground">Est. Drive (min)</p>
                </div>
              </div>
              
              {showings.length > 0 && (
                <Button
                  className="w-full mt-4"
                  variant="outline"
                  onClick={handleExportToGoogleMaps}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Full Route in Google Maps
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Map placeholder */}
          {showings.length > 0 && (
            <Card variant="glass" className="overflow-hidden">
              <CardContent className="p-0">
                <div className="aspect-video bg-muted flex items-center justify-center">
                  <div className="text-center p-4">
                    <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click "Open Full Route" above to view in Google Maps
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Showing Report Dialog */}
      {selectedShowing && (
        <ShowingReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          showingId={selectedShowing.id}
          leadId={selectedShowing.lead?.id || ""}
          propertyAddress={getFullAddress(selectedShowing.property)}
          onSuccess={() => {
            fetchShowings();
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
