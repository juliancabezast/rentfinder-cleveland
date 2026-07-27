import React, { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Mail,
  Calendar,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface TimelineEvent {
  id: string;
  type: "sms" | "email" | "showing";
  timestamp: string;
  title: string;
  description?: string;
  metadata: Record<string, any>;
}

interface LeadActivityTimelineProps {
  leadId: string;
}

const ITEMS_PER_PAGE = 50;

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "messages", label: "Messages" },
  { value: "showing", label: "Showings" },
];

export const LeadActivityTimeline: React.FC<LeadActivityTimelineProps> = ({
  leadId,
}) => {
  const { userRecord } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  const fetchActivity = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    try {
      const [commsRes, showingsRes] = await Promise.all([
        supabase
          .from("communications")
          .select("*")
          .eq("lead_id", leadId)
          .eq("organization_id", userRecord.organization_id)
          .order("sent_at", { ascending: false })
          .limit(100),
        supabase
          .from("showings")
          .select("*, properties:property_id(address)")
          .eq("lead_id", leadId)
          .eq("organization_id", userRecord.organization_id)
          .order("scheduled_at", { ascending: false })
          .limit(100),
      ]);

      const allEvents: TimelineEvent[] = [];

      // Map communications
      (commsRes.data || []).forEach((comm: Tables<"communications">) => {
        allEvents.push({
          id: comm.id,
          type: comm.channel === "email" ? "email" : "sms",
          timestamp: comm.sent_at || comm.delivered_at || "",
          title: `${comm.channel === "email" ? "Email" : "SMS"} ${
            comm.direction === "outbound" ? "Sent" : "Received"
          }`,
          description: comm.body,
          metadata: {
            direction: comm.direction,
            status: comm.status,
            recipient: comm.recipient,
            subject: comm.subject,
            channel: comm.channel,
          },
        });
      });

      // Map showings
      (showingsRes.data || []).forEach((showing: any) => {
        allEvents.push({
          id: showing.id,
          type: "showing",
          timestamp: showing.scheduled_at,
          title: `Showing ${showing.status.charAt(0).toUpperCase() + showing.status.slice(1)}`,
          description: showing.agent_report || undefined,
          metadata: {
            status: showing.status,
            property_address: showing.properties?.address || "Unknown property",
            prospect_interest_level: showing.prospect_interest_level,
            leasing_agent_id: showing.leasing_agent_id,
          },
        });
      });

      // Sort by timestamp descending
      allEvents.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setEvents(allEvents);
    } catch (error) {
      console.error("Error fetching activity:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, [leadId, userRecord?.organization_id]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "messages") return events.filter((e) => e.type === "sms" || e.type === "email");
    return events.filter((e) => e.type === filter);
  }, [events, filter]);

  const visibleEvents = filteredEvents.slice(0, displayCount);
  const canLoadMore = displayCount < filteredEvents.length;

  // Events are already in memory — just reveal the next page synchronously.
  const loadMore = () => {
    setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
  };

  const getEventIcon = (event: TimelineEvent) => {
    switch (event.type) {
      case "sms":
        return MessageSquare;
      case "email":
        return Mail;
      case "showing":
        return Calendar;
      default:
        return Filter;
    }
  };

  const getEventIconBg = (event: TimelineEvent) => {
    switch (event.type) {
      case "sms":
        return event.metadata.direction === "outbound"
          ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300"
          : "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300";
      case "email":
        return "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300";
      case "showing":
        return "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getEventBorderColor = (event: TimelineEvent) => {
    switch (event.type) {
      case "sms":
        return event.metadata.direction === "outbound" ? "border-l-green-500" : "border-l-blue-500";
      case "email":
        return "border-l-indigo-500";
      case "showing":
        return "border-l-amber-500";
      default:
        return "border-l-muted";
    }
  };

  const renderEventContent = (event: TimelineEvent) => {
    switch (event.type) {
      case "sms":
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-medium">{event.title}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {event.metadata.direction === "outbound" ? "To" : "From"}:{" "}
              {event.metadata.recipient}
            </p>
            {event.description && (
              <p className="text-sm italic text-muted-foreground">
                "{event.description.substring(0, 100)}
                {event.description.length > 100 ? "..." : ""}"
              </p>
            )}
          </div>
        );

      case "email":
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-medium">{event.title}</span>
              <Badge variant="secondary" className="text-xs">
                {event.metadata.status}
              </Badge>
            </div>
            {event.metadata.subject && (
              <p className="text-sm text-muted-foreground">
                Subject: {event.metadata.subject}
              </p>
            )}
          </div>
        );

      case "showing":
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-medium">{event.title}</span>
              <Badge
                variant={
                  event.metadata.status === "completed"
                    ? "default"
                    : event.metadata.status === "no_show"
                    ? "destructive"
                    : "secondary"
                }
                className="text-xs"
              >
                {event.metadata.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Property: {event.metadata.property_address}
            </p>
            {event.metadata.status === "completed" && event.metadata.prospect_interest_level && (
              <p className="text-sm text-muted-foreground">
                Interest:{" "}
                <Badge variant="outline" className="text-xs ml-1">
                  {event.metadata.prospect_interest_level}
                </Badge>
              </p>
            )}
            {event.metadata.status === "completed" && event.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                Report: {event.description.substring(0, 80)}
                {event.description.length > 80 ? "..." : ""}
              </p>
            )}
            {event.metadata.status === "no_show" && (
              <p className="text-sm text-destructive">Lead did not attend</p>
            )}
          </div>
        );

      default:
        return <p>{event.title}</p>;
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader>
          <CardTitle className="text-lg">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6 ml-4 border-l-2 border-muted pl-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative animate-fade-up" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="absolute -left-9 w-8 h-8 rounded-full bg-muted" />
                <div className="space-y-2 p-4 rounded-lg border">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-64" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Activity Timeline</CardTitle>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) => value && setFilter(value)}
            className="flex-wrap justify-start"
          >
            {FILTER_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="text-xs px-3 py-1 h-7"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {visibleEvents.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {filter === "all"
                ? "No activity recorded yet for this lead."
                : `No ${filter === "messages" ? "messages" : filter.replace("_", " ")} found.`}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />

            <div className="space-y-4 ml-4">
              {visibleEvents.map((event, index) => {
                const Icon = getEventIcon(event);
                return (
                  <div
                    key={event.id}
                    className="relative pl-8 animate-fade-up"
                    style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
                  >
                    {/* Icon on timeline */}
                    <div
                      className={cn(
                        "absolute -left-4 w-8 h-8 rounded-full flex items-center justify-center",
                        getEventIconBg(event)
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Event card */}
                    <div
                      className={cn(
                        "p-4 rounded-lg border border-l-4 bg-card/50 hover:shadow-sm transition-shadow",
                        getEventBorderColor(event)
                      )}
                    >
                      {renderEventContent(event)}
                      <p className="text-xs text-muted-foreground mt-2">
                        {event.timestamp
                          ? format(new Date(event.timestamp), "MMM d, yyyy 'at' h:mm a")
                          : "Unknown time"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {canLoadMore && (
              <div className="mt-6 text-center">
                <Button variant="outline" onClick={loadMore}>
                  Load more ({filteredEvents.length - displayCount} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
