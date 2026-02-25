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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/ui/EmptyState";

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
  { value: "queued", label: "Queued" },
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

const getEmailStatus = (email: EmailEvent): "sent" | "queued" | "failed" | "unknown" => {
  const status = email.details?.status;
  if (status === "queued" && !email.resend_email_id) return "queued";
  if (status === "failed" || email.event_type === "failed") return "failed";
  if (email.resend_email_id || status === "sent") return "sent";
  return "unknown";
};

const StatusBadge = ({ email }: { email: EmailEvent }) => {
  const status = getEmailStatus(email);
  switch (status) {
    case "sent":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium">
          <CheckCircle2 className="h-3 w-3 mr-1" />Sent
        </Badge>
      );
    case "queued":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium">
          <Clock className="h-3 w-3 mr-1" />Queued
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

  // Receiving state
  const [inbound, setInbound] = useState<InboundEmail[]>([]);
  const [inboundSearch, setInboundSearch] = useState("");
  const [inboundTotal, setInboundTotal] = useState(0);
  const [inboundPage, setInboundPage] = useState(0);
  const [selectedInbound, setSelectedInbound] = useState<InboundEmail | null>(null);

  const PAGE_SIZE = 50;

  // Stats
  const [sentCount, setSentCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);

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

      if (statusFilter !== "all") {
        if (statusFilter === "sent") {
          query = query.not("resend_email_id", "is", null);
        } else if (statusFilter === "queued") {
          query = query.is("resend_email_id", null).eq("event_type", "delivery_delayed");
        } else if (statusFilter === "failed") {
          query = query.eq("event_type", "failed");
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setEmails(data || []);
      setTotal(count || 0);

      // Counts for stats
      const { count: sentC } = await supabase
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", userRecord.organization_id)
        .not("resend_email_id", "is", null);
      setSentCount(sentC || 0);

      const { count: queuedC } = await supabase
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", userRecord.organization_id)
        .is("resend_email_id", null)
        .eq("event_type", "delivery_delayed");
      setQueuedCount(queuedC || 0);

      const { count: failedC } = await supabase
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", userRecord.organization_id)
        .eq("event_type", "failed");
      setFailedCount(failedC || 0);
    } catch (err) {
      console.error("Error fetching emails:", err);
      toast.error("Failed to load email activity");
    } finally {
      setLoading(false);
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
    else fetchInbound();
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

  useEffect(() => {
    if (activeTab === "sending") fetchEmails();
    else fetchInbound();
  }, [userRecord?.organization_id, page, inboundPage, statusFilter, activeTab]);

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
    const relatedId = d.showing_id || d.lead_id || email.lead_id;
    const relatedType = d.showing_id ? "Showing" : d.lead_id || email.lead_id ? "Lead" : null;

    return { hasHtml, notificationType, errorMessage, queuedAt, sentAt, relatedId, relatedType };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor outgoing and incoming email activity
          </p>
        </div>
        <div className="flex gap-2">
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
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivered</p>
                <p className="text-2xl font-bold mt-1">{sentCount}</p>
              </div>
              <div className="p-2.5 rounded-full bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${queuedCount > 0 ? "border-l-amber-500" : "border-l-slate-200"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Queued</p>
                <p className="text-2xl font-bold mt-1">{queuedCount}</p>
              </div>
              <div className={`p-2.5 rounded-full ${queuedCount > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
                <Clock className={`h-5 w-5 ${queuedCount > 0 ? "text-amber-600" : "text-slate-400"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${failedCount > 0 ? "border-l-red-500" : "border-l-slate-200"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Failed</p>
                <p className="text-2xl font-bold mt-1">{failedCount}</p>
              </div>
              <div className={`p-2.5 rounded-full ${failedCount > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                <XCircle className={`h-5 w-5 ${failedCount > 0 ? "text-red-600" : "text-slate-400"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Received</p>
                <p className="text-2xl font-bold mt-1">{receivedCount}</p>
              </div>
              <div className="p-2.5 rounded-full bg-purple-50">
                <Inbox className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setLoading(true); }}>
        <TabsList>
          <TabsTrigger value="sending" className="gap-2">
            <Send className="h-4 w-4" /> Outgoing
            {total > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{total}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="receiving" className="gap-2">
            <Inbox className="h-4 w-4" /> Incoming
            {receivedCount > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{receivedCount}</Badge>}
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
          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by sender, subject, or body..."
                value={inboundSearch}
                onChange={(e) => setInboundSearch(e.target.value)}
                className="pl-10"
              />
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

                  {/* Error info for failed emails */}
                  {status === "failed" && info.errorMessage && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-red-600 font-medium">Error</p>
                        <p className="text-sm text-red-700">{info.errorMessage}</p>
                      </div>
                    </div>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailsPage;
