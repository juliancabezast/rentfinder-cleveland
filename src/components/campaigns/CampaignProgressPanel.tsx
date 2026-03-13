import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
  Send,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface CampaignProgressPanelProps {
  campaignId: string;
  totalLeads: number;
  leadsWithEmail: number;
}

interface EmailStats {
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
}

export const CampaignProgressPanel = ({
  campaignId,
  totalLeads,
  leadsWithEmail,
}: CampaignProgressPanelProps) => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const orgId = userRecord?.organization_id;

  const emailStatsKey = ["campaign-email-stats", campaignId];
  const showingsKey = ["campaign-showings", campaignId];

  // Fetch email stats from email_events with campaign_id in details
  const { data: emailStats } = useQuery({
    queryKey: emailStatsKey,
    queryFn: async (): Promise<EmailStats> => {
      if (!orgId) return { queued: 0, sent: 0, delivered: 0, failed: 0 };
      const { data, error } = await supabase
        .from("email_events")
        .select("details")
        .eq("organization_id", orgId)
        .contains("details", { campaign_id: campaignId });
      if (error) throw error;

      const stats: EmailStats = { queued: 0, sent: 0, delivered: 0, failed: 0 };
      for (const row of data || []) {
        const d = row.details as Record<string, unknown> | null;
        const status = (d?.status as string) || (d?.last_event as string) || "queued";
        if (status === "sent" || status === "delivered" || status === "opened" || status === "clicked") stats.delivered++;
        else if (status === "failed" || status === "bounced" || status === "complained") stats.failed++;
        else stats.queued++;
      }
      setLastUpdate(new Date());
      return stats;
    },
    enabled: !!orgId && !!campaignId,
    refetchInterval: 5_000,
  });

  // Fetch showings count for campaign leads
  const { data: showingsCount } = useQuery({
    queryKey: showingsKey,
    queryFn: async () => {
      if (!orgId) return 0;
      // Get lead IDs for this campaign
      const { data: cl } = await supabase
        .from("campaign_leads")
        .select("lead_id")
        .eq("campaign_id", campaignId);
      if (!cl || cl.length === 0) return 0;
      const leadIds = cl.map((r) => r.lead_id);
      const { count } = await supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("lead_id", leadIds);
      return count || 0;
    },
    enabled: !!orgId && !!campaignId,
    refetchInterval: 15_000,
  });

  // Realtime subscription for email_events
  useEffect(() => {
    if (!orgId) return;
    const channel: RealtimeChannel = supabase
      .channel(`campaign-progress-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_events",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: emailStatsKey });
          queryClient.invalidateQueries({ queryKey: emailLogKey });
          setLastUpdate(new Date());
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, campaignId, queryClient]);

  // Fetch detailed email log with lead names
  const emailLogKey = ["campaign-email-log", campaignId];
  const { data: emailLog } = useQuery({
    queryKey: emailLogKey,
    queryFn: async () => {
      if (!orgId) return [];
      // Get all email events for this campaign
      const { data: emails } = await supabase
        .from("email_events")
        .select("id, recipient_email, subject, created_at, details")
        .eq("organization_id", orgId)
        .contains("details", { campaign_id: campaignId })
        .order("created_at", { ascending: true });

      if (!emails || emails.length === 0) return [];

      // Collect lead IDs from details
      const leadIds = emails
        .map((e) => (e.details as any)?.related_entity_id)
        .filter(Boolean) as string[];

      // Fetch lead names in bulk
      const leadNameMap: Record<string, string> = {};
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, full_name, first_name, last_name")
          .in("id", leadIds);
        for (const l of leads || []) {
          leadNameMap[l.id] = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "—";
        }
      }

      return emails.map((e) => {
        const d = e.details as Record<string, unknown> | null;
        const status = (d?.status as string) || (d?.last_event as string) || "queued";
        const leadId = (d?.related_entity_id as string) || "";
        const sentAt = (d?.sent_at as string) || null;
        const errorMsg = (d?.error as string) || null;
        return {
          id: e.id,
          leadName: leadNameMap[leadId] || "—",
          email: e.recipient_email || "—",
          status,
          sentAt,
          errorMsg,
          createdAt: e.created_at,
        };
      });
    },
    enabled: !!orgId && !!campaignId,
    refetchInterval: 5_000,
  });

  const stats = emailStats || { queued: 0, sent: 0, delivered: 0, failed: 0 };
  const processed = stats.delivered + stats.failed;
  const progressPct = leadsWithEmail > 0 ? Math.round((processed / leadsWithEmail) * 100) : 0;

  const statCards = [
    { label: "Total Leads", value: totalLeads, icon: Mail, color: "text-slate-600", bg: "bg-slate-50" },
    { label: "With Email", value: leadsWithEmail, icon: Send, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Queued", value: stats.queued, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Delivered", value: stats.delivered, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Showings Booked", value: showingsCount || 0, icon: CalendarDays, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent":
      case "delivered":
      case "opened":
      case "clicked":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "failed":
      case "bounced":
      case "complained":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "processing":
        return <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "sent":
      case "delivered":
        return "Delivered";
      case "opened":
        return "Opened";
      case "clicked":
        return "Clicked";
      case "failed":
        return "Failed";
      case "bounced":
        return "Bounced";
      case "complained":
        return "Complaint";
      case "processing":
        return "Sending...";
      default:
        return "Queued";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "sent":
      case "delivered":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "opened":
      case "clicked":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "failed":
      case "bounced":
      case "complained":
        return "bg-red-50 text-red-700 border-red-200";
      case "processing":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-amber-50 text-amber-700 border-amber-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Email Progress</span>
          <span className="text-slate-500">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-3" />
        <p className="text-xs text-muted-foreground">
          Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} variant="glass" className="p-0">
            <CardContent className="p-4 text-center">
              <div className={cn("mx-auto h-9 w-9 rounded-full flex items-center justify-center mb-2", s.bg)}>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Email delivery log */}
      {emailLog && emailLog.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Delivery Log</h3>
          <Card variant="glass" className="p-0 overflow-hidden">
            <ScrollArea className="max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-3 font-medium text-slate-600">Lead</th>
                    <th className="text-left p-3 font-medium text-slate-600 hidden sm:table-cell">Email</th>
                    <th className="text-center p-3 font-medium text-slate-600">Status</th>
                    <th className="text-right p-3 font-medium text-slate-600 hidden md:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emailLog.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-slate-900 truncate max-w-[180px]">{row.leadName}</p>
                        <p className="text-xs text-slate-400 sm:hidden truncate">{row.email}</p>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className="text-slate-600 truncate block max-w-[220px]">{row.email}</span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className={cn("gap-1 text-xs", statusColor(row.status))}>
                          {statusIcon(row.status)}
                          {statusLabel(row.status)}
                        </Badge>
                        {row.errorMsg && (
                          <p className="text-[10px] text-red-400 mt-1 truncate max-w-[120px] mx-auto" title={row.errorMsg}>
                            {row.errorMsg}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right hidden md:table-cell">
                        <span className="text-xs text-slate-400">
                          {row.sentAt
                            ? format(new Date(row.sentAt), "h:mm a")
                            : row.createdAt
                              ? format(new Date(row.createdAt), "h:mm a")
                              : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </div>
      )}
    </div>
  );
};
