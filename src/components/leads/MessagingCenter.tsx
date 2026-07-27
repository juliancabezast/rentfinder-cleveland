import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare,
  Send,
  CheckCircle,
  CheckCheck,
  Clock,
  XCircle,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Communication {
  id: string;
  channel: string;
  direction: string;
  body: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  recipient: string;
}

interface Lead {
  id: string;
  phone: string | null;
  full_name?: string | null;
  sms_consent?: boolean;
  sms_consent_at?: string | null;
}

interface MessageTemplate {
  name: string;
  body: string;
  // "whatsapp" is a legacy value that may still exist in org-settings
  // custom templates; those templates are filtered out below.
  channel: "sms" | "whatsapp" | "both";
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    name: "Showing Reminder",
    body: "Hi {name}, just a reminder about your showing at {property} on {date} at {time}.",
    channel: "both",
  },
  {
    name: "Application Link",
    body: "Hi {name}, here's the link to apply: {link}",
    channel: "both",
  },
  {
    name: "Follow Up",
    body: "Hi {name}, we wanted to check in about your interest in {property}. Are you still looking?",
    channel: "both",
  },
];

interface MessagingCenterProps {
  lead: Lead;
  onConsentUpdate?: () => void;
}

export const MessagingCenter: React.FC<MessagingCenterProps> = ({
  lead,
  onConsentUpdate,
}) => {
  const { userRecord } = useAuth();
  const { getSetting } = useOrganizationSettings();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState("");

  // Fetch messages
  const fetchMessages = async () => {
    if (!lead.id || !userRecord?.organization_id) return;

    try {
      // Fetch newest-first with a bound so we always show the most recent window
      // (an unbounded ascending query would return the OLDEST 1,000 rows and hide
      // the newest ones past that cap), then reverse for chronological display.
      const { data, error } = await supabase
        .from("communications")
        .select("*")
        .eq("lead_id", lead.id)
        .eq("organization_id", userRecord.organization_id)
        .eq("channel", "sms")
        .order("sent_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setMessages((data || []).reverse());
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [lead.id, userRecord?.organization_id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Get custom templates from settings (skip legacy WhatsApp-only ones)
  const customTemplates = getSetting("message_templates" as any, []) as MessageTemplate[];
  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates].filter(
    (t) => t.channel !== "whatsapp"
  );

  const handleSend = async () => {
    if (!messageText.trim() || !userRecord?.organization_id) return;

    // Check consent
    if (!lead.sms_consent) {
      toast({
        title: "SMS Consent Required",
        description: "Lead has not consented to SMS messages.",
        variant: "destructive",
      });
      return;
    }

    // Block unfilled template placeholders from reaching a real prospect
    if (/\[(property|date|time|link)\]/.test(messageText)) {
      toast({
        title: "Fill in the template first",
        description:
          "Replace the [property], [date], [time], or [link] placeholders before sending.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          lead_id: lead.id,
          channel: "sms",
          body: messageText,
          organization_id: userRecord.organization_id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "Message sent" });
        setMessageText("");
        // Refresh messages
        await fetchMessages();
      } else {
        throw new Error(data?.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (template: MessageTemplate) => {
    // Replace placeholders with lead data (every occurrence, not just the first)
    const body = template.body
      .replace(/\{name\}/g, lead.full_name?.split(" ")[0] || "there")
      .replace(/\{property\}/g, "[property]")
      .replace(/\{date\}/g, "[date]")
      .replace(/\{time\}/g, "[time]")
      .replace(/\{link\}/g, "[link]");

    setMessageText(body);
  };

  const getStatusIcon = (status: string, deliveredAt: string | null, openedAt: string | null) => {
    if (openedAt) return <CheckCheck className="h-3 w-3 text-primary" />;
    if (deliveredAt) return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    if (status === "sent") return <CheckCircle className="h-3 w-3 text-muted-foreground" />;
    if (status === "failed") return <XCircle className="h-3 w-3 text-destructive" />;
    return <Clock className="h-3 w-3 text-muted-foreground" />;
  };

  const getStatusText = (status: string, deliveredAt: string | null, openedAt: string | null) => {
    if (openedAt) return "Read";
    if (deliveredAt) return "Delivered";
    if (status === "sent") return "Sent";
    if (status === "failed") return "Failed";
    return "Pending";
  };

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Messages (SMS)
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Messages Area */}
        <div
          ref={scrollRef}
          className="h-72 overflow-y-auto border rounded-lg bg-muted/20 p-3 space-y-3"
        >
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className={cn("h-16 w-3/4", i % 2 === 0 && "ml-auto")} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[80%] rounded-lg p-3 text-sm",
                  msg.direction === "outbound"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                <div
                  className={cn(
                    "flex items-center gap-1 mt-1 text-xs",
                    msg.direction === "outbound"
                      ? "text-primary-foreground/70 justify-end"
                      : "text-muted-foreground"
                  )}
                >
                  {msg.direction === "outbound" && (
                    <>
                      {getStatusIcon(msg.status, msg.delivered_at, msg.opened_at)}
                      <span>{getStatusText(msg.status, msg.delivered_at, msg.opened_at)}</span>
                      <span>•</span>
                    </>
                  )}
                  <span>
                    {msg.sent_at && format(new Date(msg.sent_at), "h:mm a")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0">
                <FileText className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {allTemplates.map((template) => (
                <DropdownMenuItem
                  key={template.name}
                  onClick={() => applyTemplate(template)}
                >
                  {template.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending || !lead.sms_consent}
          />

          <Button
            onClick={handleSend}
            disabled={sending || !messageText.trim() || !lead.sms_consent}
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Consent Status Bar */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
          <span className="flex items-center gap-1">
            SMS:{" "}
            {lead.sms_consent ? (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                ✓ Consented{" "}
                {lead.sms_consent_at &&
                  format(new Date(lead.sms_consent_at), "MMM d")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                ✗ No consent
              </Badge>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
