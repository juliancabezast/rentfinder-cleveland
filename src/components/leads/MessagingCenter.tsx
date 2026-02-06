import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Lock,
  CheckCircle,
  CheckCheck,
  Clock,
  XCircle,
  ChevronDown,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// WhatsApp brand icon (simplified SVG path)
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

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
  phone: string;
  whatsapp_number?: string | null;
  full_name?: string | null;
  sms_consent?: boolean;
  whatsapp_consent?: boolean;
  sms_consent_at?: string | null;
  whatsapp_consent_at?: string | null;
}

interface MessageTemplate {
  name: string;
  body: string;
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
  {
    name: "Consent Request (WhatsApp)",
    body: "Hi {name}, would you like to receive updates about available properties via WhatsApp? Reply YES to opt in.",
    channel: "sms",
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

  const [activeTab, setActiveTab] = useState<"sms" | "whatsapp">("sms");
  const [messages, setMessages] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState("");

  // Fetch messages
  const fetchMessages = async () => {
    if (!lead.id) return;

    try {
      const { data, error } = await supabase
        .from("communications")
        .select("*")
        .eq("lead_id", lead.id)
        .in("channel", ["sms", "whatsapp"])
        .order("sent_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [lead.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  const filteredMessages = messages.filter((m) => m.channel === activeTab);

  // Get custom templates from settings
  const customTemplates = getSetting("message_templates" as any, []) as MessageTemplate[];
  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates];

  const handleSend = async () => {
    if (!messageText.trim() || !userRecord?.organization_id) return;

    // Check consent
    if (activeTab === "sms" && !lead.sms_consent) {
      toast({
        title: "SMS Consent Required",
        description: "Lead has not consented to SMS messages.",
        variant: "destructive",
      });
      return;
    }
    if (activeTab === "whatsapp" && !lead.whatsapp_consent) {
      toast({
        title: "WhatsApp Consent Required",
        description: "Lead has not consented to WhatsApp messages.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          lead_id: lead.id,
          channel: activeTab,
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
    // Replace placeholders with lead data
    let body = template.body
      .replace("{name}", lead.full_name?.split(" ")[0] || "there")
      .replace("{property}", "[property]")
      .replace("{date}", "[date]")
      .replace("{time}", "[time]")
      .replace("{link}", "[link]");

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
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Messages
        </CardTitle>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "sms" | "whatsapp")}>
          <TabsList className="h-8">
            <TabsTrigger value="sms" className="text-xs px-3 h-7 gap-1">
              <MessageSquare className="h-3 w-3" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="text-xs px-3 h-7 gap-1">
              {!lead.whatsapp_consent && <Lock className="h-3 w-3" />}
              <WhatsAppIcon className="h-3 w-3" />
              WhatsApp
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              {activeTab === "whatsapp" && !lead.whatsapp_consent ? (
                <>
                  <Lock className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">WhatsApp messaging requires consent</p>
                  <p className="text-xs mt-1">Send a consent request via SMS first</p>
                </>
              ) : (
                <>
                  <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No messages yet</p>
                </>
              )}
            </div>
          ) : (
            filteredMessages.map((msg) => (
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
                  {msg.channel === "whatsapp" && (
                    <WhatsAppIcon className="h-3 w-3 ml-1" />
                  )}
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
              {allTemplates
                .filter((t) => t.channel === "both" || t.channel === activeTab)
                .map((template) => (
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
            disabled={
              sending ||
              (activeTab === "sms" && !lead.sms_consent) ||
              (activeTab === "whatsapp" && !lead.whatsapp_consent)
            }
          />

          <Button
            onClick={handleSend}
            disabled={
              sending ||
              !messageText.trim() ||
              (activeTab === "sms" && !lead.sms_consent) ||
              (activeTab === "whatsapp" && !lead.whatsapp_consent)
            }
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
          <div className="flex items-center gap-4">
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
            <span className="flex items-center gap-1">
              WhatsApp:{" "}
              {lead.whatsapp_consent ? (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  ✓ Consented{" "}
                  {lead.whatsapp_consent_at &&
                    format(new Date(lead.whatsapp_consent_at), "MMM d")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  ✗ No consent
                </Badge>
              )}
            </span>
          </div>
          {!lead.whatsapp_consent && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => {
                setActiveTab("sms");
                setMessageText(
                  `Hi ${lead.full_name?.split(" ")[0] || "there"}, would you like to receive updates about available properties via WhatsApp? Reply YES to opt in.`
                );
              }}
            >
              Request Consent
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
