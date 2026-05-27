import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Megaphone,
  Plus,
  Mail,
  Users,
  CalendarDays,
  ChevronRight,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  MessageSquare,
  Pause,
  Play,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CampaignCreateWizard } from "@/components/campaigns/CampaignCreateWizard";
import { CampaignProgressPanel } from "@/components/campaigns/CampaignProgressPanel";
import { SmsHistoryTab } from "@/components/campaigns/SmsHistoryTab";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  property_id: string | null;
  status: string;
  total_leads: number;
  leads_with_email: number;
  emails_queued: number;
  created_at: string;
  completed_at: string | null;
  properties: { address: string; unit_number: string | null; city: string | null } | null;
}

// ── Component ────────────────────────────────────────────────────────

const CampaignsPage = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const orgId = userRecord?.organization_id;

  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Fetch campaigns
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("campaigns")
        .select(`
          id, name, property_id, status, total_leads, leads_with_email,
          emails_queued, created_at, completed_at,
          properties:property_id (address, unit_number, city)
        `)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Campaign[];
    },
    enabled: !!orgId,
  });

  // Detect if any campaign is actively sending
  const hasSending = campaigns?.some((c) => c.status === "sending" || c.status === "in_progress");

  // Fetch email stats per campaign (delivered + failed + showings)
  const { data: campaignStats } = useQuery({
    queryKey: ["campaign-stats-all", orgId],
    queryFn: async () => {
      if (!orgId || !campaigns?.length) return {};
      const stats: Record<string, { delivered: number; failed: number; showings: number }> = {};

      for (const c of campaigns) {
        // Fetch all email_events for this campaign and count statuses client-side
        // (PostgREST .or() doesn't work with JSONB paths, and total-minus-failed
        //  incorrectly counts "queued" emails as delivered)
        const { data: emailRows } = await supabase
          .from("email_events")
          .select("details")
          .eq("organization_id", orgId)
          .contains("details", { campaign_id: c.id });

        let delivered = 0;
        let failed = 0;
        for (const row of emailRows || []) {
          const d = row.details as Record<string, unknown> | null;
          const status = (d?.status as string) || "queued";
          const lastEvent = (d?.last_event as string) || "";
          if (
            status === "delivered" || status === "opened" || status === "clicked" ||
            lastEvent === "delivered" || lastEvent === "opened" || lastEvent === "clicked" ||
            (status === "sent" && lastEvent && lastEvent !== "bounced")
          ) {
            delivered++;
          } else if (
            status === "failed" || status === "bounced" ||
            lastEvent === "bounced" || status === "complained"
          ) {
            failed++;
          }
          // else: still queued/processing — don't count as delivered
        }

        // Showings count
        const { data: cl } = await supabase
          .from("campaign_leads")
          .select("lead_id")
          .eq("campaign_id", c.id);
        let showings = 0;
        if (cl && cl.length > 0) {
          const leadIds = cl.map((r) => r.lead_id);
          const { count } = await supabase
            .from("showings")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .in("lead_id", leadIds);
          showings = count || 0;
        }

        stats[c.id] = { delivered, failed, showings };
      }

      return stats;
    },
    enabled: !!orgId && !!campaigns?.length,
    refetchInterval: hasSending ? 3_000 : 30_000,
  });

  // Realtime for campaigns + email_events tables
  useEffect(() => {
    if (!orgId) return;
    const channel: RealtimeChannel = supabase
      .channel("campaigns-list")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaigns",
          filter: `organization_id=eq.${orgId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["campaigns", orgId] })
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_events",
          filter: `organization_id=eq.${orgId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["campaign-stats-all", orgId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-50 text-slate-600">Draft</Badge>;
      case "in_progress":
      case "sending":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 animate-pulse">Sending</Badge>;
      case "completed":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ── Create view ────────────────────────────────────────────────────

  if (view === "create") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Campaign</h1>
          <p className="text-sm text-slate-500 mt-1">Upload leads, assign a property, and send welcome emails</p>
        </div>
        <Card variant="glass">
          <CardContent className="p-6">
            <CampaignCreateWizard
              onComplete={() => {
                setView("list");
                queryClient.invalidateQueries({ queryKey: ["campaigns", orgId] });
              }}
              onCancel={() => setView("list")}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────

  if (view === "detail" && selectedCampaign) {
    const propertyLabel = selectedCampaign.properties
      ? `${selectedCampaign.properties.address}${selectedCampaign.properties.unit_number ? ` #${selectedCampaign.properties.unit_number}` : ""}`
      : "—";

    return (
      <CampaignDetailView
        campaign={selectedCampaign}
        propertyLabel={propertyLabel}
        onBack={() => { setView("list"); setSelectedCampaign(null); }}
        onCampaignUpdated={(updated) => setSelectedCampaign((c) => (c ? { ...c, ...updated } : c))}
      />
    );
  }

  // ── List view ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">Email campaigns and SMS history</p>
        </div>
        <Button
          onClick={() => setView("create")}
          className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="h-4 w-4" />
            Email Campaigns
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            SMS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-4">
          {/* Campaign list */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} variant="glass">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <Card variant="glass">
              <CardContent className="p-12">
                <EmptyState
                  icon={Megaphone}
                  title="No campaigns yet"
                  description="Create your first campaign to upload leads and send welcome emails"
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const stats = campaignStats?.[c.id];
                const propertyLabel = c.properties
                  ? `${c.properties.address}${c.properties.unit_number ? ` #${c.properties.unit_number}` : ""}`
                  : "No property";

                const processed = stats ? stats.delivered + stats.failed : 0;
                const isCompletedNoTracking = c.status === "completed" && processed === 0;
                const deliveredDisplay = stats
                  ? (isCompletedNoTracking ? c.emails_queued : stats.delivered)
                  : 0;
                const failedDisplay = stats?.failed ?? 0;
                const emailTotal = c.emails_queued > 0 ? c.emails_queued : processed;
                const pending = c.status !== "completed" && stats
                  ? Math.max(0, emailTotal - stats.delivered - stats.failed)
                  : 0;
                const pct = emailTotal > 0
                  ? (isCompletedNoTracking ? 100 : Math.min(100, Math.round((processed / emailTotal) * 100)))
                  : (c.status === "completed" ? 100 : 0);

                return (
                  <Card
                    key={c.id}
                    variant="glass"
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => { setSelectedCampaign(c); setView("detail"); }}
                  >
                    <CardContent className="px-5 py-3.5">
                      {/* Row 1: Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                            <Megaphone className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-slate-900 truncate">{c.name}</h3>
                              {statusBadge(c.status)}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {propertyLabel} &middot; {format(new Date(c.created_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-300 shrink-0 mt-1" />
                      </div>

                      {/* Row 2: Progress + Stats inline (stack on mobile) */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {(emailTotal > 0 || c.status === "completed") && (
                            <>
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
                                {pct}%
                              </span>
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-4 sm:flex sm:items-center sm:gap-5 sm:shrink-0 gap-2 mt-1 sm:mt-0 w-full sm:w-auto">
                          <div className="text-center min-w-0 sm:w-14">
                            <p className="text-base sm:text-lg font-bold text-slate-700 tabular-nums leading-tight">{c.total_leads}</p>
                            <p className="text-[10px] text-slate-400">Leads</p>
                          </div>
                          <div className="text-center min-w-0 sm:w-14">
                            <p className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums leading-tight">{deliveredDisplay}</p>
                            <p className="text-[10px] text-slate-400">Delivered</p>
                          </div>
                          <div className="text-center min-w-0 sm:w-14">
                            <p className={cn("text-base sm:text-lg font-bold tabular-nums leading-tight", failedDisplay > 0 ? "text-red-600" : pending > 0 ? "text-amber-600" : "text-slate-300")}>
                              {failedDisplay > 0 ? failedDisplay : pending > 0 ? pending : "—"}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {failedDisplay > 0 ? "Failed" : pending > 0 ? "Pending" : "Failed"}
                            </p>
                          </div>
                          <div className="text-center min-w-0 sm:w-14">
                            <p className="text-base sm:text-lg font-bold text-purple-600 tabular-nums leading-tight">{stats?.showings ?? 0}</p>
                            <p className="text-[10px] text-slate-400">Showings</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sms" className="mt-4">
          <SmsHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ── Detail view ──────────────────────────────────────────────────────────

interface CampaignDetailViewProps {
  campaign: Campaign;
  propertyLabel: string;
  onBack: () => void;
  onCampaignUpdated: (partial: Partial<Campaign>) => void;
}

const CampaignDetailView = ({
  campaign,
  propertyLabel,
  onBack,
  onCampaignUpdated,
}: CampaignDetailViewProps) => {
  const queryClient = useQueryClient();
  const [isMutating, setIsMutating] = useState(false);
  const isPaused = campaign.status === "paused";
  const isFinished = campaign.status === "completed" || campaign.status === "failed";

  const setStatus = async (next: "paused" | "in_progress") => {
    setIsMutating(true);
    const prev = campaign.status;
    onCampaignUpdated({ status: next });
    const { error } = await supabase
      .from("campaigns")
      .update({ status: next })
      .eq("id", campaign.id);
    if (error) {
      // rollback optimistic update
      onCampaignUpdated({ status: prev });
      toast.error(`Failed to ${next === "paused" ? "pause" : "resume"} campaign: ${error.message}`);
    } else {
      toast.success(
        next === "paused"
          ? "Campaign paused. Queued emails will hold until you resume."
          : "Campaign resumed. Pending emails will start sending again.",
      );
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    }
    setIsMutating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{campaign.name}</h1>
            {isPaused && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 gap-1">
                <Pause className="h-3 w-3" /> Paused
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {propertyLabel} &middot; Created {format(new Date(campaign.created_at), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isFinished && (
            isPaused ? (
              <Button
                onClick={() => setStatus("in_progress")}
                disabled={isMutating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Resume
              </Button>
            ) : (
              <Button
                onClick={() => setStatus("paused")}
                disabled={isMutating}
                variant="outline"
                className="gap-2"
              >
                {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                Pause
              </Button>
            )
          )}
          <Button variant="ghost" onClick={onBack}>
            Back to Campaigns
          </Button>
        </div>
      </div>

      <CampaignProgressPanel
        campaignId={campaign.id}
        totalLeads={campaign.total_leads}
        leadsWithEmail={campaign.leads_with_email}
      />
    </div>
  );
};

export default CampaignsPage;
