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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
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

const statusBadge = (email: EmailEvent) => {
  const status = email.details?.status || (email.resend_email_id ? "sent" : "unknown");
  switch (status) {
    case "sent":
      return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>;
    case "queued":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="h-3 w-3 mr-1" />Queued</Badge>;
    case "failed":
      return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    default:
      return email.resend_email_id
        ? <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>
        : <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />Unknown</Badge>;
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

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

      // Counts for stats — fetch separately for accuracy
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Outgoing and incoming email activity
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">Total Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sentCount}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{queuedCount}</p>
                <p className="text-xs text-muted-foreground">Queued</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{failedCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Inbox className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{receivedCount}</p>
                <p className="text-xs text-muted-foreground">Received</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setLoading(true); }}>
        <TabsList>
          <TabsTrigger value="sending" className="gap-2">
            <Send className="h-4 w-4" /> Sending
          </TabsTrigger>
          <TabsTrigger value="receiving" className="gap-2">
            <Inbox className="h-4 w-4" /> Receiving
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
                <div className="p-6 space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
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
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map((email) => (
                      <TableRow
                        key={email.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedEmail(email)}
                      >
                        <TableCell>{statusBadge(email)}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {email.recipient_email || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {email.subject || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {email.event_type || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(email.created_at), "MMM d, yyyy h:mm a")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
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
                <div className="p-6 space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : inbound.length === 0 ? (
                <div className="p-12">
                  <EmptyState
                    icon={Inbox}
                    title="No inbound emails"
                    description="Incoming emails from Hemlane and other sources will appear here"
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Preview</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inbound.map((email) => (
                      <TableRow
                        key={email.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedInbound(email)}
                      >
                        <TableCell>
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                            <MailOpen className="h-3 w-3 mr-1" />Received
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {email.recipient || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {email.subject || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {email.body?.substring(0, 60) || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {email.sent_at
                            ? format(new Date(email.sent_at), "MMM d, yyyy h:mm a")
                            : "—"}
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
                Page {inboundPage + 1} of {inboundTotalPages}
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

      {/* Sending Detail Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-1">{statusBadge(selectedEmail)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium mt-1">
                    {format(new Date(selectedEmail.created_at), "MMM d, yyyy h:mm:ss a")}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recipient</p>
                <p className="text-sm font-medium mt-1">{selectedEmail.recipient_email || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="text-sm font-medium mt-1">{selectedEmail.subject || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm font-medium mt-1">{selectedEmail.event_type || "—"}</p>
              </div>
              {selectedEmail.resend_email_id && (
                <div>
                  <p className="text-xs text-muted-foreground">Resend ID</p>
                  <p className="text-sm font-mono mt-1">{selectedEmail.resend_email_id}</p>
                </div>
              )}
              {selectedEmail.details && (
                <div>
                  <p className="text-xs text-muted-foreground">Details</p>
                  <pre className="text-xs mt-1 p-3 rounded-lg bg-muted overflow-auto max-h-48">
                    {JSON.stringify(selectedEmail.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receiving Detail Dialog */}
      <Dialog open={!!selectedInbound} onOpenChange={() => setSelectedInbound(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Inbound Email</DialogTitle>
          </DialogHeader>
          {selectedInbound && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 mt-1">
                    <MailOpen className="h-3 w-3 mr-1" />Received
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium mt-1">
                    {selectedInbound.sent_at
                      ? format(new Date(selectedInbound.sent_at), "MMM d, yyyy h:mm:ss a")
                      : "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">From</p>
                <p className="text-sm font-medium mt-1">{selectedInbound.recipient || "—"}</p>
              </div>
              {selectedInbound.subject && (
                <div>
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium mt-1">{selectedInbound.subject}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Body</p>
                <pre className="text-xs mt-1 p-3 rounded-lg bg-muted overflow-auto max-h-64 whitespace-pre-wrap">
                  {selectedInbound.body || "No content"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailsPage;
