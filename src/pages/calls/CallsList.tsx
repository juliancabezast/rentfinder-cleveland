import React, { useState, useEffect } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Call = Tables<"calls">;

const DIRECTION_OPTIONS = [
  { value: "all", label: "All Directions" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "no_answer", label: "No Answer" },
  { value: "voicemail", label: "Voicemail" },
  { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed" },
];

const AGENT_TYPE_OPTIONS = [
  { value: "all", label: "All Agent Types" },
  { value: "main_inbound", label: "Main Inbound" },
  { value: "recapture", label: "Recapture" },
  { value: "no_show_follow_up", label: "No Show Follow-up" },
  { value: "showing_confirmation", label: "Showing Confirmation" },
  { value: "post_showing", label: "Post Showing" },
  { value: "campaign", label: "Campaign" },
];

const statusColors: Record<string, string> = {
  completed: "bg-success text-success-foreground",
  no_answer: "bg-muted text-muted-foreground",
  voicemail: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  busy: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  failed: "bg-destructive text-destructive-foreground",
  in_progress: "bg-primary text-primary-foreground",
};

const CallsList: React.FC = () => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentTypeFilter, setAgentTypeFilter] = useState("all");

  const fetchCalls = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("calls")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("started_at", { ascending: false })
        .limit(100);

      if (directionFilter !== "all") {
        query = query.eq("direction", directionFilter);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (agentTypeFilter !== "all") {
        query = query.eq("agent_type", agentTypeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCalls(data || []);
    } catch (error) {
      console.error("Error fetching calls:", error);
      toast({
        title: "Error",
        description: "Failed to load call logs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [userRecord?.organization_id, directionFilter, statusFilter, agentTypeFilter]);

  const filteredCalls = calls.filter((call) => {
    if (!searchQuery) return true;
    return call.phone_number.includes(searchQuery);
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const TableSkeleton = () => (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Phone className="h-6 w-6" />
          Call Logs
        </h1>
        <p className="text-muted-foreground">
          View all AI and manual call recordings
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>

            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={agentTypeFilter} onValueChange={setAgentTypeFilter}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Agent Type" />
              </SelectTrigger>
              <SelectContent>
                {AGENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>
            Showing {filteredCalls.length} call records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton />
          ) : filteredCalls.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="No call logs yet"
              description={
                searchQuery || directionFilter !== "all" || statusFilter !== "all"
                  ? "No calls match your filter criteria. Try adjusting your filters."
                  : "Call logs will appear here when calls are made or received."
              }
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Agent Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.map((call) => (
                    <TableRow key={call.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        {call.direction === "inbound" ? (
                          <PhoneIncoming className="h-4 w-4 text-green-600" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {call.phone_number}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {call.agent_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[call.status] || "bg-muted"}>
                          {call.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatDuration(call.duration_seconds)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {call.sentiment && (
                          <Badge
                            variant="outline"
                            className={
                              call.sentiment === "positive"
                                ? "border-green-500 text-green-600"
                                : call.sentiment === "negative"
                                ? "border-red-500 text-red-600"
                                : "border-muted text-muted-foreground"
                            }
                          >
                            {call.sentiment}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {call.started_at
                          ? format(new Date(call.started_at), "MMM d, h:mm a")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CallsList;
