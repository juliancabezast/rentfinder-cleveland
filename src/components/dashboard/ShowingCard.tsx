import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, User, FileText, Navigation } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface ShowingCardProps {
  showing: {
    id: string;
    scheduled_at: string;
    status: string;
    property_address?: string;
    lead_name?: string;
    lead_phone?: string;
    duration_minutes?: number;
  };
  onGetDirections?: (propertyAddress: string) => void;
  onSubmitReport?: (showingId: string) => void;
  variant?: "default" | "compact";
  loading?: boolean;
}

export const ShowingCard = ({
  showing,
  onGetDirections,
  onSubmitReport,
  variant = "default",
  loading = false,
}: ShowingCardProps) => {
  if (loading) {
    return (
      <Card>
        <CardContent className={cn("p-4", variant === "compact" && "p-3")}>
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const scheduledDate = parseISO(showing.scheduled_at);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-500">Confirmed</Badge>;
      case "scheduled":
        return <Badge variant="outline">Scheduled</Badge>;
      case "completed":
        return <Badge className="bg-blue-500">Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      case "no_show":
        return <Badge variant="destructive">No Show</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (variant === "compact") {
    return (
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">
                  {format(scheduledDate, "h:mm")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(scheduledDate, "a")}
                </div>
              </div>
              <div className="border-l pl-3">
                <p className="font-medium text-sm truncate max-w-[200px]">
                  {showing.property_address || "Address N/A"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {showing.lead_name || "Lead N/A"}
                </p>
              </div>
            </div>
            {getStatusBadge(showing.status)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold">
                {format(scheduledDate, "h:mm a")}
              </span>
              {getStatusBadge(showing.status)}
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-sm">
                {showing.property_address || "Address N/A"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {showing.lead_name || "Unknown"}
                {showing.lead_phone && ` • ${showing.lead_phone}`}
              </span>
            </div>

            {showing.duration_minutes && (
              <span className="text-xs text-muted-foreground">
                Duration: {showing.duration_minutes} min
              </span>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            {onGetDirections && showing.property_address && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onGetDirections(showing.property_address!)}
              >
                <Navigation className="h-4 w-4 mr-1" />
                Directions
              </Button>
            )}
            {onSubmitReport && showing.status === "confirmed" && (
              <Button
                size="sm"
                onClick={() => onSubmitReport(showing.id)}
              >
                <FileText className="h-4 w-4 mr-1" />
                Submit Report
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const ShowingCardSkeleton = ({ variant = "default" }: { variant?: "default" | "compact" }) => (
  <ShowingCard
    showing={{
      id: "",
      scheduled_at: new Date().toISOString(),
      status: "",
    }}
    variant={variant}
    loading
  />
);
