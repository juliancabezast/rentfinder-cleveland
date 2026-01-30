import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, MapPin, User, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay, endOfDay, addDays, parseISO } from "date-fns";

interface ShowingWithDetails {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  property_address?: string;
  property_city?: string;
  lead_name?: string;
  lead_phone?: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
  { value: "all", label: "All Time" },
];

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  completed: "bg-muted text-muted-foreground",
  no_show: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground line-through",
  rescheduled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const ShowingsList: React.FC = () => {
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [showings, setShowings] = useState<ShowingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("week");

  const fetchShowings = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("showings")
        .select(
          `
          id, scheduled_at, status, duration_minutes,
          properties(address, city),
          leads(full_name, phone)
        `
        )
        .eq("organization_id", userRecord.organization_id)
        .order("scheduled_at", { ascending: true });

      // Date filter
      const now = new Date();
      if (dateFilter === "today") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(now).toISOString());
      } else if (dateFilter === "tomorrow") {
        const tomorrow = addDays(now, 1);
        query = query
          .gte("scheduled_at", startOfDay(tomorrow).toISOString())
          .lte("scheduled_at", endOfDay(tomorrow).toISOString());
      } else if (dateFilter === "week") {
        query = query
          .gte("scheduled_at", startOfDay(now).toISOString())
          .lte("scheduled_at", endOfDay(addDays(now, 7)).toISOString());
      }

      // Status filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setShowings(
        (data || []).map((s: any) => ({
          id: s.id,
          scheduled_at: s.scheduled_at,
          status: s.status,
          duration_minutes: s.duration_minutes,
          property_address: s.properties?.address,
          property_city: s.properties?.city,
          lead_name: s.leads?.full_name,
          lead_phone: s.leads?.phone,
        }))
      );
    } catch (error) {
      console.error("Error fetching showings:", error);
      toast({
        title: "Error",
        description: "Failed to load showings.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShowings();
  }, [userRecord?.organization_id, statusFilter, dateFilter]);

  const ShowingCardSkeleton = () => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
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
            <CalendarDays className="h-6 w-6" />
            Showings
          </h1>
          <p className="text-muted-foreground">
            Manage property showings and appointments
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
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
        </CardContent>
      </Card>

      {/* Showings List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <ShowingCardSkeleton key={i} />
          ))}
        </div>
      ) : showings.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="No showings scheduled"
              description={
                statusFilter !== "all" || dateFilter !== "all"
                  ? "No showings match your filter criteria. Try adjusting your filters."
                  : "Showings will appear here when leads schedule property tours."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {showings.map((showing) => (
            <Card
              key={showing.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/showings/${showing.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {/* Time */}
                  <div className="flex items-center gap-3 sm:w-32 shrink-0">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {format(parseISO(showing.scheduled_at), "MMM")}
                      </span>
                      <span className="text-lg font-bold text-primary leading-none">
                        {format(parseISO(showing.scheduled_at), "d")}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {format(parseISO(showing.scheduled_at), "h:mm a")}
                      </p>
                      {showing.duration_minutes && (
                        <p className="text-xs text-muted-foreground">
                          {showing.duration_minutes} min
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {showing.property_address && (
                      <p className="font-medium flex items-center gap-1 truncate">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        {showing.property_address}
                        {showing.property_city && `, ${showing.property_city}`}
                      </p>
                    )}
                    {showing.lead_name && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <User className="h-3 w-3" />
                        {showing.lead_name}
                        {showing.lead_phone && ` • ${showing.lead_phone}`}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <Badge
                    className={
                      statusColors[showing.status] || "bg-muted text-muted-foreground"
                    }
                  >
                    {showing.status.replace("_", " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShowingsList;
