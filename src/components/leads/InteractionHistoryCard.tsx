import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Phone, MessageSquare, Calendar, Mail, ArrowRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

interface Call {
  id: string;
  direction: string;
  status: string;
  duration_seconds: number | null;
  sentiment: string | null;
  summary: string | null;
  transcript: string | null;
  started_at: string;
  agent_type: string;
  key_questions: any;
}

interface Communication {
  id: string;
  channel: string;
  direction: string;
  status: string;
  body: string;
  subject: string | null;
  sent_at: string | null;
}

interface Showing {
  id: string;
  status: string;
  scheduled_at: string;
  property: {
    address: string;
  } | null;
}

interface InteractionItem {
  type: "call" | "sms" | "email" | "showing";
  id: string;
  timestamp: string;
  icon: React.ElementType;
  description: string;
  status: string;
  data?: Call | Communication | Showing;
}

interface InteractionHistoryCardProps {
  leadId: string;
  onSeeAll: () => void;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-green-600 bg-green-50",
  negative: "text-red-600 bg-red-50",
  neutral: "text-gray-600 bg-gray-50",
};

export const InteractionHistoryCard: React.FC<InteractionHistoryCardProps> = ({
  leadId,
  onSeeAll,
}) => {
  const [interactions, setInteractions] = useState<InteractionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

  useEffect(() => {
    const fetchInteractions = async () => {
      try {
        const [callsRes, commsRes, showingsRes] = await Promise.all([
          supabase
            .from("calls")
            .select("id, direction, status, duration_seconds, sentiment, summary, transcript, started_at, agent_type, key_questions")
            .eq("lead_id", leadId)
            .order("started_at", { ascending: false })
            .limit(15),
          supabase
            .from("communications")
            .select("id, channel, direction, status, body, subject, sent_at")
            .eq("lead_id", leadId)
            .order("sent_at", { ascending: false })
            .limit(15),
          supabase
            .from("showings")
            .select("id, status, scheduled_at, property:property_id(address)")
            .eq("lead_id", leadId)
            .order("scheduled_at", { ascending: false })
            .limit(10),
        ]);

        const items: InteractionItem[] = [];

        // Process calls
        (callsRes.data || []).forEach((call: Call) => {
          const duration = call.duration_seconds
            ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, "0")}`
            : "0:00";
          items.push({
            type: "call",
            id: call.id,
            timestamp: call.started_at,
            icon: Phone,
            description: `${call.direction === "inbound" ? "Inbound" : "Outbound"} Call - ${duration} min`,
            status: call.sentiment || call.status,
            data: call,
          });
        });

        // Process communications
        (commsRes.data || []).forEach((comm: Communication) => {
          const isEmail = comm.channel === "email";
          const preview = comm.body?.substring(0, 40) || "";
          items.push({
            type: isEmail ? "email" : "sms",
            id: comm.id,
            timestamp: comm.sent_at || "",
            icon: isEmail ? Mail : MessageSquare,
            description: `${comm.direction === "inbound" ? "Received" : "Sent"} ${isEmail ? "Email" : "SMS"} - ${preview}${comm.body?.length > 40 ? "..." : ""}`,
            status: comm.status,
            data: comm,
          });
        });

        // Process showings
        (showingsRes.data || []).forEach((showing: any) => {
          items.push({
            type: "showing",
            id: showing.id,
            timestamp: showing.scheduled_at,
            icon: Calendar,
            description: `Showing at ${showing.property?.address || "Property"}`,
            status: showing.status,
            data: showing,
          });
        });

        // Sort by timestamp descending
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setInteractions(items.slice(0, 10));
      } catch (error) {
        console.error("Error fetching interactions:", error);
      } finally {
        setLoading(false);
      }
    };

    if (leadId) {
      fetchInteractions();
    }
  }, [leadId]);

  const formatTimestamp = (ts: string) => {
    if (!ts) return "";
    return format(new Date(ts), "MMM d, h:mm a");
  };

  const getStatusColor = (status: string) => {
    if (status === "positive" || status === "completed" || status === "delivered") {
      return "text-green-600";
    }
    if (status === "negative" || status === "failed" || status === "no_show") {
      return "text-red-600";
    }
    return "text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <div className="text-center py-6">
        <Phone className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No interactions yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {interactions.map((item) => {
          const Icon = item.icon;
          const isClickable = item.type === "call" && item.data;

          return (
            <div
              key={`${item.type}-${item.id}`}
              className={`flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors ${
                isClickable ? "cursor-pointer" : ""
              }`}
              onClick={() => {
                if (item.type === "call" && item.data) {
                  setSelectedCall(item.data as Call);
                }
              }}
            >
              <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{item.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatTimestamp(item.timestamp)}
                </p>
              </div>
              <span className={`text-[10px] capitalize ${getStatusColor(item.status)}`}>
                {item.status}
              </span>
              {isClickable && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {interactions.length >= 10 && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 mt-3 text-xs text-muted-foreground"
          onClick={onSeeAll}
        >
          View all in Activity tab →
        </Button>
      )}

      {/* Call Detail Modal */}
      <Dialog open={!!selectedCall} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Call Details
            </DialogTitle>
          </DialogHeader>

          {selectedCall && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {/* Call Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Direction</span>
                    <p className="font-medium capitalize">{selectedCall.direction}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration</span>
                    <p className="font-medium">
                      {selectedCall.duration_seconds
                        ? `${Math.floor(selectedCall.duration_seconds / 60)}:${(selectedCall.duration_seconds % 60).toString().padStart(2, "0")}`
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Agent Type</span>
                    <p className="font-medium capitalize">{selectedCall.agent_type}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sentiment</span>
                    {selectedCall.sentiment ? (
                      <Badge
                        variant="outline"
                        className={SENTIMENT_COLORS[selectedCall.sentiment] || ""}
                      >
                        {selectedCall.sentiment}
                      </Badge>
                    ) : (
                      <p className="text-muted-foreground italic">Not analyzed</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Date</span>
                    <p className="font-medium">
                      {format(new Date(selectedCall.started_at), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>

                {/* AI Summary */}
                {selectedCall.summary && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">AI Summary</h4>
                    <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                      {selectedCall.summary}
                    </p>
                  </div>
                )}

                {/* Key Questions */}
                {selectedCall.key_questions && Array.isArray(selectedCall.key_questions) && selectedCall.key_questions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Key Questions Asked</h4>
                    <ul className="text-sm space-y-1">
                      {selectedCall.key_questions.map((q: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Full Transcript</h4>
                    <div className="text-sm bg-muted/30 p-3 rounded-md whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {selectedCall.transcript}
                    </div>
                  </div>
                )}

                {!selectedCall.transcript && !selectedCall.summary && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No transcript or summary available for this call.
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
