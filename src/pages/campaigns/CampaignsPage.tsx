import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
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
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CampaignCreateWizard } from "@/components/campaigns/CampaignCreateWizard";
import { CampaignProgressPanel } from "@/components/campaigns/CampaignProgressPanel";
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{selectedCampaign.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {propertyLabel} &middot; Created {format(new Date(selectedCampaign.created_at), "MMM d, yyyy")}
            </p>
          </div>
          <Button variant="ghost" onClick={() => { setView("list"); setSelectedCampaign(null); }}>
            Back to Campaigns
          </Button>
        </div>

        <CampaignProgressPanel
          campaignId={selectedCampaign.id}
          totalLeads={selectedCampaign.total_leads}
          leadsWithEmail={selectedCampaign.leads_with_email}
        />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">Upload lead databases and send bulk welcome emails</p>
        </div>
        <Button
          onClick={() => setView("create")}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

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

            return (
              <Card
                key={c.id}
                variant="glass"
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setSelectedCampaign(c); setView("detail"); }}
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                      <Megaphone className="h-6 w-6 text-indigo-600" />
                    </div>

                    {/* Info + Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 truncate">{c.name}</h3>
                        {statusBadge(c.status)}
                      </div>
                      <p className="text-sm text-slate-500">
                        {propertyLabel} &middot; {format(new Date(c.created_at), "MMM d, yyyy")}
                      </p>
                      {/* Mini progress bar */}
                      {c.emails_queued > 0 && stats && (
                        <div className="mt-2 flex items-center gap-2">
                          <Progress
                            value={Math.min(100, Math.round(((stats.delivered + stats.failed) / c.emails_queued) * 100))}
                            className="h-1.5 flex-1"
                          />
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {Math.min(stats.delivered + stats.failed, c.emails_queued)}/{c.emails_queued}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-slate-500">
                          <Users className="h-3.5 w-3.5" />
                          <span>{c.total_leads}</span>
                        </div>
                        <p className="text-xs text-slate-400">Leads</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{stats?.delivered ?? "—"}</span>
                        </div>
                        <p className="text-xs text-slate-400">Delivered</p>
                      </div>
                      {stats && c.emails_queued - stats.delivered - stats.failed > 0 && (
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-amber-600">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{c.emails_queued - stats.delivered - stats.failed}</span>
                          </div>
                          <p className="text-xs text-slate-400">Pending</p>
                        </div>
                      )}
                      {(stats?.failed ?? 0) > 0 && (
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>{stats.failed}</span>
                          </div>
                          <p className="text-xs text-slate-400">Failed</p>
                        </div>
                      )}
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-purple-600">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>{stats?.showings ?? "—"}</span>
                        </div>
                        <p className="text-xs text-slate-400">Showings</p>
                      </div>
                    </div>

                    <ChevronRight className="h-5 w-5 text-slate-300 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignsPage;
