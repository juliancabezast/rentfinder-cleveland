import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { MessageSquare, Calendar, Mail, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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
  type: "sms" | "email" | "showing";
  id: string;
  timestamp: string;
  icon: React.ElementType;
  description: string;
  status: string;
  data?: Communication | Showing;
}

interface InteractionHistoryCardProps {
  leadId: string;
  onSeeAll: () => void;
}

export const InteractionHistoryCard: React.FC<InteractionHistoryCardProps> = ({
  leadId,
  onSeeAll,
}) => {
  const [interactions, setInteractions] = useState<InteractionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInteractions = async () => {
      try {
        const [commsRes, showingsRes] = await Promise.all([
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

        if (commsRes.error) console.error("Error fetching communications:", commsRes.error);
        if (showingsRes.error) console.error("Error fetching showings:", showingsRes.error);

        const items: InteractionItem[] = [];

        // Process communications (deduplicate by channel+direction+timestamp+body)
        const seenComms = new Set<string>();
        (commsRes.data || []).forEach((comm: Communication) => {
          const dedupeKey = `${comm.channel}|${comm.direction}|${comm.sent_at}|${comm.body?.substring(0, 60)}`;
          if (seenComms.has(dedupeKey)) return;
          seenComms.add(dedupeKey);

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
        <Mail className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No interactions yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {interactions.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={`${item.type}-${item.id}`}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
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
    </>
  );
};
