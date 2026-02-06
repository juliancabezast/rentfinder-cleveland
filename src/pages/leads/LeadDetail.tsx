import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  AlertTriangle,
  Bot,
  Shield,
  CheckCircle,
  XCircle,
  Ban,
  Sparkles,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { LeadForm } from "@/components/leads/LeadForm";
import { HumanTakeoverModal } from "@/components/leads/HumanTakeoverModal";
import { ReleaseControlModal } from "@/components/leads/ReleaseControlModal";
import { ScheduleShowingDialog } from "@/components/showings/ScheduleShowingDialog";
import { LeadActivityTimeline } from "@/components/leads/LeadActivityTimeline";
import { SmartMatches } from "@/components/leads/SmartMatches";
import { MessagingCenter } from "@/components/leads/MessagingCenter";
import { PredictionCard, type LeadPrediction } from "@/components/leads/PredictionCard";
import { UpcomingAgentActions } from "@/components/leads/UpcomingAgentActions";
import { AIBriefSection } from "@/components/leads/AIBriefSection";
import { LeadDetailHeader } from "@/components/leads/LeadDetailHeader";
import { InteractionHistoryCard } from "@/components/leads/InteractionHistoryCard";
import { UpcomingActionsPreview } from "@/components/leads/UpcomingActionsPreview";
import { ScoreHistoryPreview } from "@/components/leads/ScoreHistoryPreview";
import { NotesTab } from "@/components/leads/NotesTab";
import { PinnedNotesPreview } from "@/components/leads/PinnedNotesPreview";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;
type ScoreHistory = Tables<"lead_score_history">;
type ConsentLog = Tables<"consent_log">;

interface Property {
  id: string;
  address: string;
  unit_number: string | null;
  rent_price?: number | null;
  bedrooms?: number | null;
}

interface LeadWithRelations extends Lead {
  properties?: Property | null;
  human_controller?: { full_name: string } | null;
  ai_brief_user?: { full_name: string } | null;
}

const CONSENT_TYPE_ICONS: Record<string, React.ElementType> = {
  sms_marketing: MessageSquare,
  call_recording: Phone,
  automated_calls: Bot,
  data_processing: Shield,
  email_marketing: MessageSquare,
  whatsapp_marketing: MessageSquare,
};

// Tab trigger styles (underline style)
const tabTriggerClass =
  "rounded-none border-b-2 border-transparent pb-2 pt-0 px-0 data-[state=active]:border-[#ffb22c] data-[state=active]:text-[#370d4b] data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[#6b7280] hover:text-foreground transition-colors";

const LeadDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  const [lead, setLead] = useState<LeadWithRelations | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistory[]>([]);
  const [consentLogs, setConsentLogs] = useState<ConsentLog[]>([]);
  const [prediction, setPrediction] = useState<LeadPrediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [notesCount, setNotesCount] = useState(0);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [scheduleShowingOpen, setScheduleShowingOpen] = useState(false);

  // Fetch notes count for header badge
  const fetchNotesCount = useCallback(async () => {
    if (!id) return;
    const { count } = await supabase
      .from("lead_notes")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", id);
    setNotesCount(count || 0);
  }, [id]);

  useEffect(() => {
    fetchNotesCount();
  }, [fetchNotesCount]);

  const fetchLead = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select(
          `
          *,
          properties:interested_property_id (id, address, unit_number, rent_price, bedrooms)
        `
        )
        .eq("id", id)
        .eq("organization_id", userRecord?.organization_id)
        .single();

      if (leadError) throw leadError;

      let humanControllerName: string | null = null;
      if (leadData.human_controlled_by) {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", leadData.human_controlled_by)
          .single();
        humanControllerName = userData?.full_name || null;
      }

      let aiBriefUserName: string | null = null;
      if (leadData.ai_brief_generated_by) {
        const { data: briefUserData } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", leadData.ai_brief_generated_by)
          .single();
        aiBriefUserName = briefUserData?.full_name || null;
      }

      setLead({
        ...leadData,
        human_controller: humanControllerName ? { full_name: humanControllerName } : null,
        ai_brief_user: aiBriefUserName ? { full_name: aiBriefUserName } : null,
      });

      const [historyRes, consentRes, predictionRes] = await Promise.all([
        supabase
          .from("lead_score_history")
          .select("*")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("consent_log")
          .select("*")
          .eq("lead_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("lead_predictions")
          .select("*")
          .eq("lead_id", id)
          .maybeSingle(),
      ]);

      setScoreHistory(historyRes.data || []);
      setConsentLogs(consentRes.data || []);

      if (predictionRes.data && !predictionRes.error) {
        const predData = predictionRes.data;
        setPrediction({
          ...predData,
          conversion_probability: Number(predData.conversion_probability),
          factors: (predData.factors || []) as unknown as LeadPrediction["factors"],
          predicted_outcome: predData.predicted_outcome as LeadPrediction["predicted_outcome"],
        });
      }
    } catch (error) {
      console.error("Error fetching lead:", error);
      toast({
        title: "Error",
        description: "Failed to load lead details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLead();
  }, [id, userRecord?.organization_id]);

  const handleRefreshPrediction = async () => {
    if (!lead || !userRecord?.organization_id) return;

    setPredictionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("predict-conversion", {
        body: {
          organization_id: userRecord.organization_id,
          lead_id: lead.id,
        },
      });

      if (error) throw error;

      if (data?.prediction) {
        setPrediction({
          ...data.prediction,
          conversion_probability: Number(data.prediction.conversion_probability),
          factors: (data.prediction.factors || []) as unknown as LeadPrediction["factors"],
          predicted_outcome: data.prediction.predicted_outcome as LeadPrediction["predicted_outcome"],
        });
        toast({ title: "Prediction updated" });
      }
    } catch (error) {
      console.error("Error refreshing prediction:", error);
      toast({
        title: "Error",
        description: "Failed to generate prediction.",
        variant: "destructive",
      });
    } finally {
      setPredictionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 bg-[#f4f1f1] min-h-screen p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-[#f4f1f1] min-h-screen">
        <h2 className="text-xl font-medium">Lead not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/leads")}>
          Back to Leads
        </Button>
      </div>
    );
  }

  const leadName =
    lead.full_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    "Unknown Lead";

  return (
    <div className="space-y-4 bg-[#f4f1f1] min-h-screen p-4 md:p-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/leads")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Leads
      </Button>

      {/* Human Control Banner */}
      {lead.is_human_controlled && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">
                  This lead is under manual control
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Controlled by{" "}
                  <strong>{lead.human_controller?.full_name || "Unknown"}</strong>{" "}
                  since{" "}
                  {lead.human_controlled_at
                    ? format(new Date(lead.human_controlled_at), "MMM d, yyyy 'at' h:mm a")
                    : "unknown date"}
                </p>
                {lead.human_control_reason && (
                  <p className="text-sm mt-1">
                    <strong>Reason:</strong> {lead.human_control_reason}
                  </p>
                )}
              </div>
            </div>
            {permissions.canReleaseHumanControl && (
              <Button variant="outline" size="sm" onClick={() => setReleaseOpen(true)}>
                <Bot className="mr-2 h-4 w-4" />
                Release to Automation
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Compact Header */}
      <LeadDetailHeader
        lead={lead}
        property={lead.properties}
        permissions={{
          canScheduleShowing: permissions.canScheduleShowing,
          canEditLeadInfo: permissions.canEditLeadInfo,
          canTakeHumanControl: permissions.canTakeHumanControl,
        }}
        onScheduleShowing={() => setScheduleShowingOpen(true)}
        onEdit={() => setEditOpen(true)}
        onTakeControl={() => setTakeoverOpen(true)}
        onBriefGenerated={fetchLead}
        notesCount={notesCount}
        onNotesClick={() => setActiveTab("notes")}
      />

      {/* 5 Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto p-0 bg-transparent justify-start gap-6 border-b border-[#e5e7eb] rounded-none w-full">
          <TabsTrigger value="overview" className={tabTriggerClass}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="messages" className={tabTriggerClass}>
            Messages
          </TabsTrigger>
          <TabsTrigger value="activity" className={tabTriggerClass}>
            Activity
          </TabsTrigger>
          <TabsTrigger value="notes" className={tabTriggerClass}>
            Notes
          </TabsTrigger>
          <TabsTrigger value="matching" className={tabTriggerClass}>
            Matching
          </TabsTrigger>
          <TabsTrigger value="consent" className={tabTriggerClass}>
            Consent Log
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Overview - 2x2 Grid */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top-left: Interaction History (replaces Lead Profile) */}
            <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Interaction History</h3>
              </div>
              <InteractionHistoryCard leadId={lead.id} onSeeAll={() => setActiveTab("activity")} />
            </div>

            {/* Top-right: Conversion Prediction */}
            <div className="bg-white border border-[#e5e7eb] rounded-lg">
              <PredictionCard
                prediction={prediction}
                loading={predictionLoading}
                onRefresh={handleRefreshPrediction}
                refreshing={predictionLoading}
              />
            </div>

            {/* Bottom-left: Upcoming Actions Preview */}
            <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Upcoming Actions</h3>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setActiveTab("activity")}
                >
                  See all →
                </Button>
              </div>
              <UpcomingActionsPreview leadId={lead.id} onSeeAll={() => setActiveTab("activity")} />
            </div>

            {/* Bottom-right: Score History */}
            <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-4">Score History</h3>
              <ScoreHistoryPreview history={scoreHistory} />
            </div>
          </div>

          {/* Pinned Notes Preview (if any) */}
          <PinnedNotesPreview leadId={lead.id} onSeeAll={() => setActiveTab("notes")} />
        </TabsContent>

        {/* TAB 2: Messages - Full width MessagingCenter */}
        <TabsContent value="messages">
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <MessagingCenter
              lead={{
                id: lead.id,
                phone: lead.phone,
                whatsapp_number: (lead as any).whatsapp_number,
                full_name: lead.full_name,
                sms_consent: lead.sms_consent ?? false,
                whatsapp_consent: (lead as any).whatsapp_consent ?? false,
                sms_consent_at: lead.sms_consent_at,
                whatsapp_consent_at: (lead as any).whatsapp_consent_at,
              }}
              onConsentUpdate={fetchLead}
            />
          </div>
        </TabsContent>

        {/* TAB 3: Activity */}
        <TabsContent value="activity" className="space-y-4">
          {/* AI Brief Section - Full version */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <AIBriefSection
              leadId={lead.id}
              aiBrief={lead.ai_brief}
              aiBriefGeneratedAt={lead.ai_brief_generated_at}
              aiBriefGeneratedBy={lead.ai_brief_generated_by}
              generatedByName={lead.ai_brief_user?.full_name}
              onBriefUpdated={fetchLead}
            />
          </div>

          {/* Activity Timeline */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <LeadActivityTimeline leadId={lead.id} />
          </div>

          {/* Upcoming Agent Actions - Full version */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <UpcomingAgentActions leadId={lead.id} />
          </div>
        </TabsContent>

        {/* TAB 4: Notes */}
        <TabsContent value="notes">
          <NotesTab leadId={lead.id} onNotesCountChange={setNotesCount} />
        </TabsContent>

        {/* TAB 5: Matching */}
        <TabsContent value="matching">
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <SmartMatches leadId={lead.id} leadName={leadName} />
          </div>
        </TabsContent>

        {/* TAB 6: Consent Log */}
        <TabsContent value="consent" className="space-y-4">
          {/* Consent Summary */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Consent Summary</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm font-medium">SMS Consent</span>
                {lead.sms_consent ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs">
                      {lead.sms_consent_at
                        ? format(new Date(lead.sms_consent_at), "MMM d, yyyy")
                        : "Granted"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">Not granted</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm font-medium">Call Consent</span>
                {lead.call_consent ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs">
                      {lead.call_consent_at
                        ? format(new Date(lead.call_consent_at), "MMM d, yyyy")
                        : "Granted"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">Not granted</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm font-medium">WhatsApp Consent</span>
                {(lead as any).whatsapp_consent ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs">
                      {(lead as any).whatsapp_consent_at
                        ? format(new Date((lead as any).whatsapp_consent_at), "MMM d, yyyy")
                        : "Granted"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">Not granted</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm font-medium">Do Not Contact</span>
                {lead.do_not_contact ? (
                  <div className="flex items-center gap-2 text-destructive">
                    <Ban className="h-4 w-4" />
                    <span className="text-xs">Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs">Clear</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Consent History */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-4">Consent History</h3>
            {consentLogs.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  No consent records for this lead yet. Consent will be logged when the
                  lead interacts via phone, web form, or SMS.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {consentLogs.map((log) => {
                  const Icon = CONSENT_TYPE_ICONS[log.consent_type] || Shield;
                  const isWithdrawn = log.withdrawn_at !== null;
                  const isGranted = log.granted && !isWithdrawn;

                  return (
                    <div
                      key={log.id}
                      className={`relative pl-6 pb-4 border-l-2 ${
                        isGranted
                          ? "border-green-500"
                          : isWithdrawn
                          ? "border-red-500"
                          : "border-muted"
                      }`}
                    >
                      <div
                        className={`absolute -left-2.5 w-5 h-5 rounded-full flex items-center justify-center ${
                          isGranted
                            ? "bg-green-100 text-green-600"
                            : isWithdrawn
                            ? "bg-red-100 text-red-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                      </div>

                      <div className="ml-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-medium capitalize ${
                              isWithdrawn ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {log.consent_type.replace("_", " ")}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              isGranted
                                ? "border-green-500 text-green-600"
                                : isWithdrawn
                                ? "border-red-500 text-red-600"
                                : ""
                            }
                          >
                            {isWithdrawn ? "Withdrawn" : log.granted ? "Granted" : "Denied"}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground mt-1">
                          Method: <span className="capitalize">{log.method}</span>
                        </p>

                        {log.evidence_text && (
                          <p className="text-sm text-muted-foreground mt-1 truncate max-w-md">
                            Evidence: {log.evidence_text.substring(0, 100)}
                            {log.evidence_text.length > 100 ? "..." : ""}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground mt-2">
                          {log.created_at &&
                            format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                          {isWithdrawn &&
                            log.withdrawn_at &&
                            ` • Withdrawn ${format(
                              new Date(log.withdrawn_at),
                              "MMM d, yyyy"
                            )}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            lead={lead}
            onSuccess={() => {
              setEditOpen(false);
              fetchLead();
            }}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <HumanTakeoverModal
        open={takeoverOpen}
        onOpenChange={setTakeoverOpen}
        leadId={lead.id}
        leadName={leadName}
        onSuccess={fetchLead}
      />

      <ReleaseControlModal
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        leadId={lead.id}
        leadName={leadName}
        onSuccess={fetchLead}
      />

      <ScheduleShowingDialog
        open={scheduleShowingOpen}
        onOpenChange={setScheduleShowingOpen}
        preselectedLeadId={lead.id}
        preselectedLeadName={leadName}
        onSuccess={fetchLead}
      />
    </div>
  );
};

export default LeadDetail;
