import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Mail,
  MailOpen,
  Inbox,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Zap,
  Eye,
  ExternalLink,
  Calendar,
  User,
  FileText,
  Timer,
  CloudDownload,
  MousePointerClick,
  Ban,
  Palette,
  Download,
  Copy,
  Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/ui/EmptyState";
import { EmailTemplatesTab } from "@/components/leads/nurturing/EmailTemplatesTab";

interface EmailEvent {
  id: string;
  recipient_email: string | null;
  subject: string | null;
  event_type: string | null;
  resend_email_id: string | null;
  details: any;
  created_at: string;
  lead_id: string | null;
}

interface InboundEmail {
  id: string;
  lead_id: string | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  sent_at: string | null;
  channel: string;
  direction: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "queued", label: "Queued" },
  { value: "bounced", label: "Bounced" },
  { value: "failed", label: "Failed" },
];

// Friendly labels for event types
const eventTypeLabel = (type: string | null): string => {
  const map: Record<string, string> = {
    delivery_delayed: "Queued",
    email_sent: "Notification",
    showing_confirmation: "Showing Confirmation",
    showing_reminder: "Showing Reminder",
    lead_welcome: "Welcome Email",
    password_reset: "Password Reset",
    invite: "Team Invite",
    failed: "Failed",
  };
  if (!type) return "Email";
  return map[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

type EmailStatus = "delivered" | "opened" | "clicked" | "sent" | "queued" | "bounced" | "complained" | "failed" | "unknown";

const getEmailStatus = (email: EmailEvent): EmailStatus => {
  const lastEvent = email.details?.last_event;
  const status = email.details?.status;

  // Resend sync statuses (most specific first)
  if (lastEvent === "clicked" || status === "clicked") return "clicked";
  if (lastEvent === "opened" || status === "opened") return "opened";
  if (lastEvent === "delivered" || status === "delivered") return "delivered";
  if (lastEvent === "bounced" || status === "bounced") return "bounced";
  if (lastEvent === "complained" || status === "complained") return "complained";

  // Original statuses
  if (status === "queued" && !email.resend_email_id) return "queued";
  if (status === "failed" || email.event_type === "failed") return "failed";
  if (email.resend_email_id || status === "sent" || lastEvent === "sent") return "sent";
  return "unknown";
};

const StatusBadge = ({ email }: { email: EmailEvent }) => {
  const status = getEmailStatus(email);
  switch (status) {
    case "delivered":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium">
          <CheckCircle2 className="h-3 w-3 mr-1" />Delivered
        </Badge>
      );
    case "opened":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-medium">
          <MailOpen className="h-3 w-3 mr-1" />Opened
        </Badge>
      );
    case "clicked":
      return (
        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-medium">
          <MousePointerClick className="h-3 w-3 mr-1" />Clicked
        </Badge>
      );
    case "sent":
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
          <Send className="h-3 w-3 mr-1" />Sent
        </Badge>
      );
    case "queued":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium">
          <Clock className="h-3 w-3 mr-1" />Queued
        </Badge>
      );
    case "bounced":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 font-medium">
          <Ban className="h-3 w-3 mr-1" />Bounced
        </Badge>
      );
    case "complained":
      return (
        <Badge className="bg-orange-50 text-orange-700 border-orange-200 font-medium">
          <AlertTriangle className="h-3 w-3 mr-1" />Spam
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 font-medium">
          <XCircle className="h-3 w-3 mr-1" />Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="font-medium">
          <AlertTriangle className="h-3 w-3 mr-1" />Unknown
        </Badge>
      );
  }
};

const EmailsPage = () => {
  const { userRecord } = useAuth();
  const [activeTab, setActiveTab] = useState("sending");
  const [loading, setLoading] = useState(true);

  // Sending state
  const [emails, setEmails] = useState<EmailEvent[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState<EmailEvent | null>(null);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [forceSending, setForceSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Receiving state
  const [inbound, setInbound] = useState<InboundEmail[]>([]);
  const [inboundSearch, setInboundSearch] = useState("");
  const [inboundTotal, setInboundTotal] = useState(0);
  const [inboundPage, setInboundPage] = useState(0);
  const [selectedInbound, setSelectedInbound] = useState<InboundEmail | null>(null);
  const [inboundTypeFilter, setInboundTypeFilter] = useState<"all" | "listings_update" | "inquiry">("all");

  const PAGE_SIZE = 50;

  // Stats (cumulative — matches Resend dashboard)
  const [sentCount, setSentCount] = useState(0);       // total sent (includes delivered, opened, etc.)
  const [deliveredCount, setDeliveredCount] = useState(0); // delivered (includes opened/clicked)
  const [openedCount, setOpenedCount] = useState(0);    // opened (includes clicked)
  const [queuedCount, setQueuedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [bouncedCount, setBouncedCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [autoSynced, setAutoSynced] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

  const fetchEmails = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    try {
      let query = supabase
        .from("email_events")
        .select(`
          id, recipient_email, subject, event_type,
          resend_email_id, details, created_at, lead_id
        `, { count: "exact" })
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(`recipient_email.ilike.%${search}%,subject.ilike.%${search}%`);
      }

      // Status filtering — uses details->last_event or details->status from Resend sync
      if (statusFilter !== "all") {
        switch (statusFilter) {
          case "delivered":
            query = query.contains("details", { last_event: "delivered" });
            break;
          case "opened":
            query = query.contains("details", { last_event: "opened" });
            break;
          case "clicked":
            query = query.contains("details", { last_event: "clicked" });
            break;
          case "sent":
            query = query.not("resend_email_id", "is", null);
            break;
          case "queued":
            query = query.is("resend_email_id", null).eq("event_type", "delivery_delayed");
            break;
          case "bounced":
            query = query.contains("details", { last_event: "bounced" });
            break;
          case "failed":
            query = query.eq("event_type", "failed");
            break;
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setEmails(data || []);
      setTotal(count || 0);

      // ── Compute stats via server-side count queries (no 1000-row cap) ──
      const orgFilter = { organization_id: userRecord.organization_id };
      const countQuery = (filter?: string) =>
        supabase
          .from("email_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", userRecord.organization_id);

      const [
        { count: cSent },
        { count: cDelivered },
        { count: cOpened },
        { count: cQueued },
        { count: cBounced },
        { count: cFailed },
      ] = await Promise.all([
        // Sent = has a resend_email_id (was actually sent via Resend)
        countQuery().not("resend_email_id", "is", null),
        // Delivered (delivered + opened + clicked)
        (async () => {
          const [{ count: d }, { count: o }, { count: k }] = await Promise.all([
            countQuery().contains("details", { last_event: "delivered" }),
            countQuery().contains("details", { last_event: "opened" }),
            countQuery().contains("details", { last_event: "clicked" }),
          ]);
          return { count: (d || 0) + (o || 0) + (k || 0) };
        })(),
        // Opened (opened + clicked)
        (async () => {
          const [{ count: o }, { count: k }] = await Promise.all([
            countQuery().contains("details", { last_event: "opened" }),
            countQuery().contains("details", { last_event: "clicked" }),
          ]);
          return { count: (o || 0) + (k || 0) };
        })(),
        // Queued = no resend_email_id + status queued
        countQuery().is("resend_email_id", null).eq("event_type", "delivery_delayed"),
        // Bounced
        countQuery().contains("details", { last_event: "bounced" }),
        // Failed
        countQuery().eq("event_type", "failed"),
      ]);

      setSentCount(cSent || 0);
      setDeliveredCount(cDelivered || 0);
      setOpenedCount(cOpened || 0);
      setQueuedCount(cQueued || 0);
      setBouncedCount(cBounced || 0);
      setFailedCount(cFailed || 0);
    } catch (err) {
      console.error("Error fetching emails:", err);
      toast.error("Failed to load email activity");
    } finally {
      setLoading(false);
    }
  };

  const syncFromResend = async () => {
    if (!userRecord?.organization_id) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-resend-emails", {
        body: { organization_id: userRecord.organization_id },
      });
      if (error) throw error;

      const result = data as any;
      if (result?.success) {
        const parts = [];
        if (result.created > 0) parts.push(`${result.created} new`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        if (parts.length === 0) parts.push("Already in sync");
        toast.success(`Resend sync: ${parts.join(", ")} (${result.total_from_resend} total)`);
        setLastSyncAt(new Date().toISOString());
        fetchEmails();
      } else {
        toast.error(result?.error || "Sync failed");
      }
    } catch (err) {
      console.error("Resend sync error:", err);
      toast.error("Failed to sync from Resend");
    } finally {
      setSyncing(false);
    }
  };

  const fetchInbound = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    try {
      let query = supabase
        .from("communications")
        .select("id, lead_id, recipient, subject, body, status, sent_at, channel, direction", { count: "exact" })
        .eq("organization_id", userRecord.organization_id)
        .eq("channel", "email")
        .eq("direction", "inbound")
        .order("sent_at", { ascending: false })
        .range(inboundPage * PAGE_SIZE, (inboundPage + 1) * PAGE_SIZE - 1);

      if (inboundSearch) {
        query = query.or(`recipient.ilike.%${inboundSearch}%,subject.ilike.%${inboundSearch}%,body.ilike.%${inboundSearch}%`);
      }

      if (inboundTypeFilter === "listings_update") {
        query = query.ilike("subject", "%Property Listings Update%");
      } else if (inboundTypeFilter === "inquiry") {
        query = query.not("subject", "ilike", "%Property Listings Update%");
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setInbound(data || []);
      setInboundTotal(count || 0);
      setReceivedCount(count || 0);
    } catch (err) {
      console.error("Error fetching inbound emails:", err);
      toast.error("Failed to load inbound emails");
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = () => {
    if (activeTab === "sending") fetchEmails();
    else if (activeTab === "receiving") fetchInbound();
    else setTemplateRefreshKey((k) => k + 1);
  };

  const forceProcessQueue = async () => {
    setForceSending(true);
    try {
      const { error } = await supabase.functions.invoke("process-email-queue", {
        body: {},
      });
      if (error) throw error;
      toast.success("Queue processed — emails sent");
      fetchEmails();
    } catch (err) {
      console.error("Force send error:", err);
      toast.error("Failed to process queue");
    } finally {
      setForceSending(false);
    }
  };

  // Auto-sync from Resend on first load to ensure fresh data
  useEffect(() => {
    if (!userRecord?.organization_id || autoSynced) return;
    setAutoSynced(true);
    // Run sync in background — don't block UI
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("sync-resend-emails", {
          body: { organization_id: userRecord.organization_id },
        });
        if (!error && data?.success) {
          setLastSyncAt(new Date().toISOString());
          // Refresh stats after sync
          fetchEmails();
        }
      } catch {
        // Non-blocking — if sync fails, stats still show from DB
      }
    })();
  }, [userRecord?.organization_id]);

  useEffect(() => {
    if (activeTab === "sending") fetchEmails();
    else fetchInbound();
  }, [userRecord?.organization_id, page, inboundPage, statusFilter, activeTab, inboundTypeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "sending") { setPage(0); fetchEmails(); }
      else { setInboundPage(0); fetchInbound(); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, inboundSearch]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const inboundTotalPages = Math.ceil(inboundTotal / PAGE_SIZE);

  // Parse details for display in the detail dialog
  const parseEmailDetails = (email: EmailEvent) => {
    const d = email.details || {};
    const hasHtml = !!d.html;
    const notificationType = d.notification_type || d.type || email.event_type;
    const errorMessage = d.error || d.error_message;
    const queuedAt = d.queued_at;
    const sentAt = d.sent_at;
    const lastEvent = d.last_event;
    const syncedFromResend = d.synced_from_resend === true;
    const syncedAt = d.synced_at;
    const fromAddress = d.from;
    const relatedId = d.showing_id || d.lead_id || email.lead_id;
    const relatedType = d.showing_id ? "Showing" : d.lead_id || email.lead_id ? "Lead" : null;

    return { hasHtml, notificationType, errorMessage, queuedAt, sentAt, lastEvent, syncedFromResend, syncedAt, fromAddress, relatedId, relatedType };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor outgoing and incoming email activity
            {lastSyncAt && (
              <span className="ml-2 text-xs">
                — Last sync: {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === "sending" && (
            <>
              <Button
                size="sm"
                onClick={syncFromResend}
                disabled={syncing}
                variant="default"
              >
                <CloudDownload className={`h-4 w-4 mr-1.5 ${syncing ? "animate-bounce" : ""}`} />
                {syncing ? "Syncing..." : "Sync from Resend"}
              </Button>
              {queuedCount > 0 && (
                <Button
                  size="sm"
                  onClick={forceProcessQueue}
                  disabled={forceSending}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  <Zap className="h-4 w-4 mr-1.5" />
                  {forceSending ? "Processing..." : `Force Send (${queuedCount})`}
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats — cumulative with rates like Resend dashboard */}
      {activeTab !== "templates" && (() => {
        const deliveryRate = sentCount > 0 ? ((deliveredCount / sentCount) * 100).toFixed(1) : "0.0";
        const openRate = deliveredCount > 0 ? ((openedCount / deliveredCount) * 100).toFixed(1) : "0.0";
        const bounceRate = sentCount > 0 ? ((bouncedCount / sentCount) * 100).toFixed(1) : "0.0";
        return (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Sent</p>
                <p className="text-xl font-bold">{sentCount}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Delivered</p>
                <p className="text-xl font-bold text-green-700">{deliveredCount}</p>
                <p className="text-[11px] text-green-600 font-medium">{deliveryRate}%</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Opened</p>
                <p className="text-xl font-bold text-blue-700">{openedCount}</p>
                <p className="text-[11px] text-blue-600 font-medium">{openRate}%</p>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${queuedCount > 0 ? "border-l-amber-500" : "border-l-slate-200"}`}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Queued</p>
                <p className={`text-xl font-bold ${queuedCount > 0 ? "text-amber-600" : ""}`}>{queuedCount}</p>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${bouncedCount > 0 ? "border-l-red-400" : "border-l-slate-200"}`}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Bounced</p>
                <p className={`text-xl font-bold ${bouncedCount > 0 ? "text-red-600" : ""}`}>{bouncedCount}</p>
                <p className="text-[11px] text-red-500 font-medium">{bounceRate}%</p>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${failedCount > 0 ? "border-l-red-600" : "border-l-slate-200"}`}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className={`text-xl font-bold ${failedCount > 0 ? "text-red-700" : ""}`}>{failedCount}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== "templates") setLoading(true); }}>
        <TabsList>
          <TabsTrigger value="sending" className="gap-2">
            <Send className="h-4 w-4" /> Outgoing
            {total > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{total}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="receiving" className="gap-2">
            <Inbox className="h-4 w-4" /> Incoming
            {receivedCount > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{receivedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Palette className="h-4 w-4" /> Templates
          </TabsTrigger>
        </TabsList>

        {/* ── SENDING TAB ── */}
        <TabsContent value="sending" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by recipient or subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : emails.length === 0 ? (
                <div className="p-12">
                  <EmptyState
                    icon={Mail}
                    title="No emails found"
                    description={search ? "No emails match your search" : "Outgoing email activity will appear here"}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead className="hidden md:table-cell">Subject</TableHead>
                      <TableHead className="hidden lg:table-cell w-[130px]">Category</TableHead>
                      <TableHead className="w-[160px]">Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map((email) => {
                      const status = getEmailStatus(email);
                      const isQueued = status === "queued";
                      const queuedAt = email.details?.queued_at;
                      return (
                        <TableRow
                          key={email.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedEmail(email)}
                        >
                          <TableCell>
                            <StatusBadge email={email} />
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {email.recipient_email || "—"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate md:hidden mt-0.5">
                                {email.subject || "No subject"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-sm max-w-xs truncate text-muted-foreground">
                              {email.subject || "—"}
                            </p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-xs text-muted-foreground">
                              {eventTypeLabel(email.details?.notification_type || email.event_type)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isQueued ? (
                              <div className="flex items-center gap-1.5">
                                <Timer className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                                <span className="text-xs text-amber-600 font-medium">
                                  {queuedAt
                                    ? formatDistanceToNow(new Date(queuedAt), { addSuffix: false })
                                    : "Pending"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(email.created_at), "MMM d, h:mm a")}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} emails)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── RECEIVING TAB ── */}
        <TabsContent value="receiving" className="space-y-4 mt-4">
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by sender, subject, or body..."
                value={inboundSearch}
                onChange={(e) => setInboundSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-1.5">
              {([
                { value: "all" as const, label: "All" },
                { value: "listings_update" as const, label: "Listings Updates" },
                { value: "inquiry" as const, label: "Inquiries" },
              ]).map((opt) => (
                <Button
                  key={opt.value}
                  variant={inboundTypeFilter === opt.value ? "default" : "outline"}
                  size="sm"
                  className={inboundTypeFilter === opt.value ? "bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white" : ""}
                  onClick={() => { setInboundTypeFilter(opt.value); setInboundPage(0); }}
                >
                  {opt.value === "listings_update" && <Filter className="h-3.5 w-3.5 mr-1" />}
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : inbound.length === 0 ? (
                <div className="p-12">
                  <EmptyState
                    icon={Inbox}
                    title="No inbound emails yet"
                    description="Incoming emails from Hemlane and other sources will appear here once the Resend webhook is configured"
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead className="hidden md:table-cell">Subject</TableHead>
                      <TableHead className="hidden lg:table-cell">Preview</TableHead>
                      <TableHead className="w-[160px]">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inbound.map((email) => (
                      <TableRow
                        key={email.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedInbound(email)}
                      >
                        <TableCell>
                          <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-medium">
                            <MailOpen className="h-3 w-3 mr-1" />Received
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm truncate">{email.recipient || "—"}</p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="text-sm max-w-xs truncate text-muted-foreground">
                            {email.subject || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {email.body?.substring(0, 80) || "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {email.sent_at
                              ? format(new Date(email.sent_at), "MMM d, h:mm a")
                              : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {inboundTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {inboundPage + 1} of {inboundTotalPages} ({inboundTotal} emails)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={inboundPage === 0} onClick={() => setInboundPage(inboundPage - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={inboundPage >= inboundTotalPages - 1} onClick={() => setInboundPage(inboundPage + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TEMPLATES TAB ── */}
        <TabsContent value="templates" className="mt-4">
          <EmailTemplatesTab refreshKey={templateRefreshKey} />
        </TabsContent>
      </Tabs>

      {/* ── Sending Detail Dialog ── */}
      <Dialog open={!!selectedEmail && !showHtmlPreview} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              Email Details
            </DialogTitle>
          </DialogHeader>
          {selectedEmail && (() => {
            const info = parseEmailDetails(selectedEmail);
            const status = getEmailStatus(selectedEmail);
            return (
              <div className="space-y-5">
                {/* Status + Date row */}
                <div className="flex items-center justify-between">
                  <StatusBadge email={selectedEmail} />
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(selectedEmail.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>

                {/* Info grid */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Recipient</p>
                      <p className="text-sm font-medium truncate">{selectedEmail.recipient_email || "—"}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Subject</p>
                      <p className="text-sm font-medium">{selectedEmail.subject || "—"}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                    <Send className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="text-sm font-medium">{eventTypeLabel(info.notificationType)}</p>
                    </div>
                  </div>

                  {/* From address (shown for synced emails) */}
                  {info.fromAddress && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                      <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">From</p>
                        <p className="text-sm font-medium truncate">{info.fromAddress}</p>
                      </div>
                    </div>
                  )}

                  {/* Delivery tracking from Resend */}
                  {info.lastEvent && info.lastEvent !== "sent" && (
                    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                      info.lastEvent === "delivered" ? "bg-green-50 border-green-200" :
                      info.lastEvent === "opened" ? "bg-blue-50 border-blue-200" :
                      info.lastEvent === "clicked" ? "bg-indigo-50 border-indigo-200" :
                      info.lastEvent === "bounced" ? "bg-red-50 border-red-200" :
                      info.lastEvent === "complained" ? "bg-orange-50 border-orange-200" :
                      "bg-muted/40 border-muted"
                    }`}>
                      <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${
                        info.lastEvent === "delivered" ? "text-green-600" :
                        info.lastEvent === "opened" ? "text-blue-600" :
                        info.lastEvent === "clicked" ? "text-indigo-600" :
                        info.lastEvent === "bounced" ? "text-red-600" :
                        "text-muted-foreground"
                      }`} />
                      <div>
                        <p className="text-xs font-medium capitalize">{info.lastEvent}</p>
                        <p className="text-xs text-muted-foreground">
                          Delivery event from Resend
                          {info.syncedAt && ` — synced ${formatDistanceToNow(new Date(info.syncedAt), { addSuffix: true })}`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Queue info for queued emails */}
                  {status === "queued" && info.queuedAt && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <Timer className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-amber-600 font-medium">Queued</p>
                        <p className="text-sm text-amber-700">
                          Waiting {formatDistanceToNow(new Date(info.queuedAt))} — next queue run every 2 min
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Error info for failed/bounced emails */}
                  {(status === "failed" || status === "bounced") && info.errorMessage && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-red-600 font-medium">Error</p>
                        <p className="text-sm text-red-700">{info.errorMessage}</p>
                      </div>
                    </div>
                  )}

                  {/* Synced from Resend indicator */}
                  {info.syncedFromResend && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CloudDownload className="h-3 w-3" /> Imported from Resend
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  {info.hasHtml && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHtmlPreview(true)}
                      className="gap-1.5"
                    >
                      <Eye className="h-4 w-4" />
                      Preview Email
                    </Button>
                  )}
                  {selectedEmail.resend_email_id && (
                    <span className="text-xs text-muted-foreground ml-auto font-mono">
                      ID: {selectedEmail.resend_email_id}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── HTML Preview Dialog ── */}
      <Dialog open={showHtmlPreview} onOpenChange={() => setShowHtmlPreview(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-muted-foreground" />
              Email Preview
            </DialogTitle>
          </DialogHeader>
          {selectedEmail?.details?.html && (
            <div className="border rounded-lg overflow-hidden bg-white">
              <iframe
                srcDoc={selectedEmail.details.html}
                className="w-full h-[60vh] border-0"
                sandbox="allow-same-origin"
                title="Email preview"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Receiving Detail Dialog ── */}
      <Dialog open={!!selectedInbound} onOpenChange={() => setSelectedInbound(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailOpen className="h-5 w-5 text-muted-foreground" />
              Inbound Email
            </DialogTitle>
          </DialogHeader>
          {selectedInbound && (
            <div className="space-y-5">
              {/* Status + Date row */}
              <div className="flex items-center justify-between">
                <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-medium">
                  <MailOpen className="h-3 w-3 mr-1" />Received
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedInbound.sent_at
                    ? format(new Date(selectedInbound.sent_at), "MMM d, yyyy 'at' h:mm a")
                    : "—"}
                </span>
              </div>

              {/* Info */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">From</p>
                    <p className="text-sm font-medium truncate">{selectedInbound.recipient || "—"}</p>
                  </div>
                </div>

                {selectedInbound.subject && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Subject</p>
                      <p className="text-sm font-medium">{selectedInbound.subject}</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-2">Message</p>
                  <div className="p-3 rounded-lg bg-muted/40 max-h-64 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {selectedInbound.body || "No content"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Export buttons */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground mr-auto">Export</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify({
                      from: selectedInbound.recipient,
                      subject: selectedInbound.subject,
                      body: selectedInbound.body,
                      date: selectedInbound.sent_at,
                    }, null, 2));
                    toast.success("JSON copied to clipboard");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const csv = `"From","Subject","Date","Body"\n"${(selectedInbound.recipient || '').replace(/"/g, '""')}","${(selectedInbound.subject || '').replace(/"/g, '""')}","${selectedInbound.sent_at || ''}","${(selectedInbound.body || '').replace(/"/g, '""')}"`;
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `email-${selectedInbound.id.slice(0, 8)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = `From: ${selectedInbound.recipient || '—'}\nSubject: ${selectedInbound.subject || '—'}\nDate: ${selectedInbound.sent_at || '—'}\n\n${selectedInbound.body || ''}`;
                    const blob = new Blob([text], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `email-${selectedInbound.id.slice(0, 8)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Text
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailsPage;
