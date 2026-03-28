import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MessageSquare,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Phone,
  User,
  Calendar,
  Hash,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SmsLogEntry {
  id: string;
  created_at: string;
  message: string;
  level: string;
  details: {
    channel: string;
    message_id: string;
    lead_id: string;
  } | null;
  related_lead_id: string | null;
}

interface LeadInfo {
  id: string;
  full_name: string | null;
  phone: string | null;
}

const PAGE_SIZE = 50;

export const SmsHistoryTab = () => {
  const { userRecord } = useAuth();
  const orgId = userRecord?.organization_id;
  const [page, setPage] = useState(0);

  // Summary stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["sms-stats", orgId],
    queryFn: async () => {
      if (!orgId) return null;

      const [sentRes, errorRes, uniqueRes] = await Promise.all([
        supabase
          .from("system_logs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("event_type", "message_sent")
          .eq("category", "twilio"),
        supabase
          .from("system_logs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("event_type", "message_send_error")
          .eq("category", "twilio"),
        supabase
          .from("system_logs")
          .select("related_lead_id")
          .eq("organization_id", orgId)
          .eq("event_type", "message_sent")
          .eq("category", "twilio")
          .not("related_lead_id", "is", null)
          .limit(1000),
      ]);

      const uniqueLeads = new Set(
        (uniqueRes.data || []).map((r) => r.related_lead_id)
      ).size;

      const totalCost = (sentRes.count || 0) * 0.0079;

      return {
        sent: sentRes.count || 0,
        errors: errorRes.count || 0,
        uniqueLeads,
        estimatedCost: totalCost,
      };
    },
    enabled: !!orgId,
  });

  // Paginated SMS logs
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["sms-logs", orgId, page],
    queryFn: async () => {
      if (!orgId) return { logs: [], total: 0 };

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("system_logs")
        .select("id, created_at, message, level, details, related_lead_id", {
          count: "exact",
        })
        .eq("organization_id", orgId)
        .eq("category", "twilio")
        .in("event_type", ["message_sent", "message_send_error"])
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Fetch lead info for all related leads
      const leadIds = [
        ...new Set(
          (data || [])
            .map((l) => l.related_lead_id)
            .filter(Boolean) as string[]
        ),
      ];

      let leadsMap: Record<string, LeadInfo> = {};
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, full_name, phone")
          .in("id", leadIds);
        if (leads) {
          leadsMap = Object.fromEntries(leads.map((l) => [l.id, l]));
        }
      }

      return {
        logs: (data || []).map((log) => ({
          ...log,
          lead: log.related_lead_id
            ? leadsMap[log.related_lead_id] || null
            : null,
        })),
        total: count || 0,
      };
    },
    enabled: !!orgId,
  });

  const totalPages = Math.ceil((logsData?.total || 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} variant="glass">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <MessageSquare className="h-4 w-4" />
                  Total Sent
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {(stats?.sent || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Errors
                </div>
                <p className={cn("text-2xl font-bold", (stats?.errors || 0) > 0 ? "text-red-600" : "text-slate-900")}>
                  {stats?.errors || 0}
                </p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <User className="h-4 w-4" />
                  Unique Leads
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {stats?.uniqueLeads || 0}
                </p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <Hash className="h-4 w-4" />
                  Est. Cost
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  ${(stats?.estimatedCost || 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* SMS log table */}
      <Card variant="glass">
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !logsData?.logs.length ? (
            <div className="p-12">
              <EmptyState
                icon={MessageSquare}
                title="No SMS messages"
                description="No SMS messages have been sent yet"
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Twilio SID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.logs.map((log: any) => {
                    const isError = log.level === "error";
                    const details = log.details as any;
                    const messageSid = details?.message_id || "—";

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), "MMM d, yyyy h:mm a")}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {log.lead?.full_name || "Unknown"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 font-mono">
                          {log.lead?.phone || "—"}
                        </TableCell>
                        <TableCell>
                          {isError ? (
                            <Badge variant="destructive" className="text-xs">
                              Failed
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                              Sent
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-400 font-mono max-w-[180px] truncate">
                          {messageSid}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-slate-500">
                    {(logsData.total).toLocaleString()} messages total
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-slate-600">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
