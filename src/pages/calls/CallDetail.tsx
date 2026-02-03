import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  Building2,
  Phone,
  Globe,
  CheckCircle,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

type Call = Tables<"calls">;

interface CallWithRelations extends Call {
  lead_name?: string | null;
  lead_phone?: string | null;
  property_address?: string | null;
}

const statusColors: Record<string, string> = {
  completed: "bg-success text-success-foreground",
  no_answer: "bg-muted text-muted-foreground",
  voicemail: "bg-blue-100 text-blue-800",
  busy: "bg-yellow-100 text-yellow-800",
  failed: "bg-destructive text-destructive-foreground",
  in_progress: "bg-primary text-primary-foreground",
};

const agentTypeLabels: Record<string, string> = {
  main_inbound: "Main Inbound",
  recapture: "Recapture",
  no_show_follow_up: "No Show Follow-up",
  showing_confirmation: "Showing Confirmation",
  post_showing: "Post Showing",
  campaign: "Campaign",
};

const CallDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRecord } = useAuth();

  const [call, setCall] = useState<CallWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalIdsOpen, setExternalIdsOpen] = useState(false);

  useEffect(() => {
    const fetchCall = async () => {
      if (!id) return;

      setLoading(true);
      try {
        const { data: callData, error } = await supabase
          .from("calls")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;

        // Fetch lead and property info if available
        let leadName: string | null = null;
        let leadPhone: string | null = null;
        let propertyAddress: string | null = null;

        if (callData.lead_id) {
          const { data: leadData } = await supabase
            .from("leads")
            .select("full_name, phone")
            .eq("id", callData.lead_id)
            .single();
          if (leadData) {
            leadName = leadData.full_name;
            leadPhone = leadData.phone;
          }
        }

        if (callData.property_id) {
          const { data: propData } = await supabase
            .from("properties")
            .select("address")
            .eq("id", callData.property_id)
            .single();
          if (propData) {
            propertyAddress = propData.address;
          }
        }

        setCall({
          ...callData,
          lead_name: leadName,
          lead_phone: leadPhone,
          property_address: propertyAddress,
        });
      } catch (error) {
        console.error("Error fetching call:", error);
        toast.error("Failed to load call details");
      } finally {
        setLoading(false);
      }
    };

    fetchCall();
  }, [id]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatCost = (cost: number | null | undefined) => {
    if (cost === null || cost === undefined) return "$0.0000";
    return `$${cost.toFixed(4)}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-medium">Call not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/calls")}>
          Back to Calls
        </Button>
      </div>
    );
  }

  const keyQuestions = (call.key_questions as string[] | null) || [];
  const unansweredQuestions = (call.unanswered_questions as string[] | null) || [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/calls">Calls</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Call #{id?.slice(0, 8)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/calls")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Calls
      </Button>

      {/* Header Section */}
      <Card variant="glass">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Direction Badge */}
            {call.direction === "inbound" ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex items-center gap-1">
                <PhoneIncoming className="h-3 w-3" />
                Inbound
              </Badge>
            ) : (
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1">
                <PhoneOutgoing className="h-3 w-3" />
                Outbound
              </Badge>
            )}

            {/* Status Badge */}
            <Badge className={statusColors[call.status] || "bg-muted"}>
              {call.status.replace("_", " ")}
            </Badge>

            {/* Agent Type Badge */}
            <Badge variant="outline">
              {agentTypeLabels[call.agent_type] || call.agent_type}
            </Badge>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {call.started_at
                ? format(new Date(call.started_at), "MMM d, yyyy 'at' h:mm a")
                : "Unknown"}
            </div>

            <div className="text-sm font-medium">
              Duration: {formatDuration(call.duration_seconds)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left Column (60%) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Transcript */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Call Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {call.transcript ? (
                <ScrollArea className="h-64">
                  <div className="bg-muted/30 rounded-lg p-4">
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                      {call.transcript}
                    </pre>
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Transcript will be available after call processing
                </p>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>AI Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {call.summary ? (
                <p className="text-sm leading-relaxed">{call.summary}</p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Summary will be generated once OpenAI integration is active
                </p>
              )}
            </CardContent>
          </Card>

          {/* Key Questions */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Questions Asked</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {keyQuestions.length > 0 ? (
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  {keyQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">No questions recorded</p>
              )}

              {unansweredQuestions.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm mb-2">Unanswered Questions</h4>
                    <ul className="space-y-2">
                      {unansweredQuestions.map((q, idx) => (
                        <li
                          key={idx}
                          className="text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-md px-3 py-2"
                        >
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (40%) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Call Info */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Call Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </span>
                <a
                  href={`tel:${call.phone_number}`}
                  className="text-primary hover:underline font-mono"
                >
                  {call.phone_number}
                </a>
              </div>

              {call.lead_id && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Lead
                  </span>
                  <Link
                    to={`/leads/${call.lead_id}`}
                    className="text-primary hover:underline"
                  >
                    {call.lead_name || "View Lead"}
                  </Link>
                </div>
              )}

              {call.property_id && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Property
                  </span>
                  <Link
                    to={`/properties/${call.property_id}`}
                    className="text-primary hover:underline text-right max-w-[180px] truncate"
                  >
                    {call.property_address || "View Property"}
                  </Link>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Language
                </span>
                <span>
                  {call.detected_language === "es"
                    ? "Spanish"
                    : call.detected_language === "en"
                    ? "English"
                    : call.detected_language || "Unknown"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Sentiment</span>
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
                  {call.sentiment || "Unknown"}
                </Badge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Recording Disclosure</span>
                {call.recording_disclosure_played ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Played
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    Not played
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cost Breakdown */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Twilio</span>
                <span>{formatCost(call.cost_twilio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bland.ai</span>
                <span>{formatCost(call.cost_bland)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">OpenAI</span>
                <span>{formatCost(call.cost_openai)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{formatCost(call.cost_total)}</span>
              </div>
              {call.score_change !== null && call.score_change !== 0 && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Score Impact</span>
                    <span
                      className={
                        call.score_change > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"
                      }
                    >
                      {call.score_change > 0 ? "+" : ""}
                      {call.score_change} points
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recording Player */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Recording</CardTitle>
            </CardHeader>
            <CardContent>
              {call.recording_url ? (
                <audio controls src={call.recording_url} className="w-full" />
              ) : (
                <p className="text-muted-foreground text-sm">Recording not available</p>
              )}
            </CardContent>
          </Card>

          {/* External IDs */}
          <Collapsible open={externalIdsOpen} onOpenChange={setExternalIdsOpen}>
            <Card variant="glass">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">External IDs</CardTitle>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        externalIdsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-2 text-sm pt-0">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bland Call ID</span>
                    <span className="font-mono text-xs truncate max-w-[180px]">
                      {call.bland_call_id || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Twilio Call SID</span>
                    <span className="font-mono text-xs truncate max-w-[180px]">
                      {call.twilio_call_sid || "—"}
                    </span>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};

export default CallDetail;
