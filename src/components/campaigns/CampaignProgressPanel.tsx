import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  queued: number;     // waiting in queue, never attempted
  processing: number; // claimed by a worker, send in flight
  sent: number;       // Resend accepted (not yet confirmed in inbox)
  delivered: number;  // Resend webhook: actually landed in mailbox
  opened: number;     // recipient opened
  clicked: number;    // recipient clicked
  failed: number;     // permanent failure (max retries reached)
  bounced: number;    // bounced (hard or soft)
  complained: number; // spam complaint
}

// Newer status outranks older — used so we never downgrade a row from
// "delivered" back to "sent" when multiple events exist per recipient.
function statusPriority(status: string): number {
  switch (status) {
    case "complained": return 8;
    case "bounced": return 7;
    case "clicked": return 6;
    case "opened": return 5;
    case "delivered": return 4;
    case "sent": return 3;
    case "processing": return 2;
    case "queued": return 1;
    default: return 0; // unknown / pre-status
  }
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

  const ZERO_STATS: EmailStats = {
    queued: 0, processing: 0, sent: 0, delivered: 0,
    opened: 0, clicked: 0, failed: 0, bounced: 0, complained: 0,
  };

  // Fetch email stats from email_events with campaign_id in details.
  // Each row in email_events represents an event (sent / delivered / opened /
  // etc). We group by recipient and keep the highest-priority status seen,
  // so "delivered" never gets overwritten by an earlier "sent".
  const { data: emailStats } = useQuery({
    queryKey: emailStatsKey,
    queryFn: async (): Promise<EmailStats> => {
      if (!orgId) return ZERO_STATS;
      const { data, error } = await supabase
        .from("email_events")
        .select("recipient_email, event_type, details")
        .eq("organization_id", orgId)
        .contains("details", { campaign_id: campaignId });
      if (error) throw error;

      const byRecipient = new Map<string, string>();
      for (const row of data || []) {
        const d = row.details as Record<string, unknown> | null;
        // Prefer details.status, then event_type, then last_event, then queued.
        const status =
          (d?.status as string) ||
          (row.event_type as string) ||
          (d?.last_event as string) ||
          "queued";
        const key = (row.recipient_email || "").toLowerCase();
        if (!key) continue;
        const existing = byRecipient.get(key);
        if (!existing || statusPriority(status) > statusPriority(existing)) {
          byRecipient.set(key, status);
        }
      }

      const stats = { ...ZERO_STATS };
      for (const status of byRecipient.values()) {
        switch (status) {
          case "queued": stats.queued++; break;
          case "processing": stats.processing++; break;
          case "sent": stats.sent++; break;
          case "delivered": stats.delivered++; break;
          case "opened": stats.opened++; break;
          case "clicked": stats.clicked++; break;
          case "failed": stats.failed++; break;
          case "bounced": stats.bounced++; break;
          case "complained": stats.complained++; break;
          default: stats.queued++;
        }
      }
      setLastUpdate(new Date());
      return stats;
    },
    enabled: !!orgId && !!campaignId,
    refetchInterval: 2_000,
  });

  // Fetch SMS stats from campaign_recipients
  const smsStatsKey = ["campaign-sms-stats", campaignId];
  const { data: smsStats } = useQuery({
    queryKey: smsStatsKey,
    queryFn: async () => {
      if (!orgId) return { pending: 0, sent: 0, failed: 0 };
      const [{ count: pending }, { count: sent }, { count: failed }] = await Promise.all([
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("channel", "sms")
          .in("status", ["pending", "processing"]),
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("channel", "sms")
          .eq("status", "sent"),
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("channel", "sms")
          .eq("status", "failed"),
      ]);
      return {
        pending: pending || 0,
        sent: sent || 0,
        failed: failed || 0,
      };
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

  // Realtime subscription for email_events.
  // Note: Postgres-changes filter doesn't support JSONB lookups, so we
  // subscribe at the org level and then check the campaign_id from the
  // payload before invalidating. This avoids invalidating on every
  // unrelated email in the org (transactional, other campaigns).
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
        (payload) => {
          const row = (payload.new ?? payload.old) as { details?: { campaign_id?: string } } | null;
          if (row?.details?.campaign_id !== campaignId) return;
          queryClient.invalidateQueries({ queryKey: emailStatsKey });
          queryClient.invalidateQueries({ queryKey: emailLogKey });
          setLastUpdate(new Date());
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Deduplicate by recipient — keep the latest event per email address
      const byRecipient = new Map<string, typeof emails[0]>();
      for (const e of emails) {
        const key = (e.recipient_email || e.id).toLowerCase();
        const existing = byRecipient.get(key);
        if (!existing || new Date(e.created_at) > new Date(existing.created_at)) {
          byRecipient.set(key, e);
        }
      }

      return Array.from(byRecipient.values()).map((e) => {
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
    refetchInterval: 2_000,
  });

  const stats = emailStats || ZERO_STATS;
  // "Processed" = any state past queued/processing
  const processed =
    stats.sent + stats.delivered + stats.opened + stats.clicked +
    stats.failed + stats.bounced + stats.complained;
  const progressPct = leadsWithEmail > 0 ? Math.round((processed / leadsWithEmail) * 100) : 0;
  // "Engaged" rolls up opened + clicked (recipient actually interacted)
  const engaged = stats.opened + stats.clicked;
  // "Inbox-confirmed" = delivered + opened + clicked (delivered is the floor)
  const inboxConfirmed = stats.delivered + stats.opened + stats.clicked;
  // "Hard problems" = bounced + complained + permanent failed
  const hardProblems = stats.bounced + stats.complained + stats.failed;

  const statCards = [
    { label: "With Email", value: leadsWithEmail, icon: Send, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Queued", value: stats.queued + stats.processing, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Sent", value: stats.sent + inboxConfirmed, icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Delivered", value: inboxConfirmed, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Engaged", value: engaged, icon: Mail, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Bounced / Failed", value: hardProblems, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
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

      {/* SMS stat cards — only shown if campaign has SMS recipients */}
      {smsStats && (smsStats.pending + smsStats.sent + smsStats.failed) > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">SMS Progress</h3>
            <span className="text-xs text-slate-400">
              {smsStats.sent} sent · {smsStats.pending} pending · {smsStats.failed} failed
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Card variant="glass" className="p-0">
              <CardContent className="p-4 text-center">
                <div className="mx-auto h-9 w-9 rounded-full flex items-center justify-center mb-2 bg-amber-50">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{smsStats.pending}</p>
                <p className="text-xs text-slate-500 mt-0.5">SMS Pending</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="p-0">
              <CardContent className="p-4 text-center">
                <div className="mx-auto h-9 w-9 rounded-full flex items-center justify-center mb-2 bg-emerald-50">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{smsStats.sent}</p>
                <p className="text-xs text-slate-500 mt-0.5">SMS Sent</p>
              </CardContent>
            </Card>
            <Card variant="glass" className="p-0">
              <CardContent className="p-4 text-center">
                <div className="mx-auto h-9 w-9 rounded-full flex items-center justify-center mb-2 bg-red-50">
                  <XCircle className="h-4 w-4 text-red-600" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{smsStats.failed}</p>
                <p className="text-xs text-slate-500 mt-0.5">SMS Failed</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Email stat cards */}
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Delivery Log</h3>
            <span className="text-xs text-slate-400">{emailLog.length} emails</span>
          </div>
          <Card variant="glass" className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
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
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
