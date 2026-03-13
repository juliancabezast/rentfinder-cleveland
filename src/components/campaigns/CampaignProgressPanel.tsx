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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
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
        if (status === "delivered" || status === "opened" || status === "clicked") stats.delivered++;
        else if (status === "sent") stats.sent++;
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
          setLastUpdate(new Date());
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, campaignId, queryClient]);

  const stats = emailStats || { queued: 0, sent: 0, delivered: 0, failed: 0 };
  const totalEmails = stats.queued + stats.sent + stats.delivered + stats.failed;
  const processed = stats.sent + stats.delivered + stats.failed;
  const progressPct = leadsWithEmail > 0 ? Math.round((processed / leadsWithEmail) * 100) : 0;

  const statCards = [
    { label: "Total Leads", value: totalLeads, icon: Mail, color: "text-slate-600", bg: "bg-slate-50" },
    { label: "With Email", value: leadsWithEmail, icon: Send, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Queued", value: stats.queued, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Sent", value: stats.sent, icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Delivered", value: stats.delivered, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Showings Booked", value: showingsCount || 0, icon: CalendarDays, color: "text-purple-600", bg: "bg-purple-50" },
  ];

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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
    </div>
  );
};
