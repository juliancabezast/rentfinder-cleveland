import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  Download,
  RefreshCw,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

type SystemLog = Tables<"system_logs">;

const SERVICES = [
  { value: "all", label: "All Services" },
  { value: "twilio", label: "Twilio" },
  { value: "bland_ai", label: "Bland.ai" },
  { value: "openai", label: "OpenAI" },
  { value: "persona", label: "Persona" },
  { value: "doorloop", label: "Doorloop" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "supabase", label: "Supabase" },
  { value: "authentication", label: "Authentication" },
  { value: "automation", label: "Automation" },
  { value: "general", label: "General" },
];

const LEVELS = [
  { value: "all", label: "All Levels" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "critical", label: "Critical" },
];

const RESOLUTION_STATUSES = [
  { value: "all", label: "All Status" },
  { value: "unresolved", label: "Unresolved" },
  { value: "resolved", label: "Resolved" },
];

const levelColors: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  error: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-destructive text-destructive-foreground",
};

const serviceIcons: Record<string, string> = {
  twilio: "📞",
  bland_ai: "🤖",
  openai: "🧠",
  persona: "🪪",
  doorloop: "🚪",
  google_sheets: "📊",
  supabase: "⚡",
  authentication: "🔐",
  automation: "⚙️",
  general: "📋",
};

interface LogEntryProps {
  log: SystemLog;
  onResolve: () => void;
}

const LogEntry: React.FC<LogEntryProps> = ({ log, onResolve }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const handleCopyDetails = async () => {
    const text = JSON.stringify(log.details, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResolve = async () => {
    if (!userRecord?.id) return;

    setIsResolving(true);
    try {
      const { error } = await supabase
        .from("system_logs")
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: userRecord.id,
          resolution_notes: resolutionNotes || null,
        })
        .eq("id", log.id);

      if (error) throw error;

      toast({
        title: "Log resolved",
        description: "The log entry has been marked as resolved.",
      });

      onResolve();
    } catch (error) {
      console.error("Error resolving log:", error);
      toast({
        title: "Error",
        description: "Failed to resolve log entry.",
        variant: "destructive",
      });
    } finally {
      setIsResolving(false);
    }
  };

  const details = log.details as Record<string, unknown> | null;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {log.created_at ? format(new Date(log.created_at), "MMM d, HH:mm:ss") : "-"}
        </TableCell>
        <TableCell>
          <Badge className={levelColors[log.level] || "bg-muted"}>
            {log.level.toUpperCase()}
          </Badge>
        </TableCell>
        <TableCell>
          <span className="flex items-center gap-1">
            <span>{serviceIcons[log.category] || "📋"}</span>
            <span className="capitalize text-xs">{log.category.replace("_", " ")}</span>
          </span>
        </TableCell>
        <TableCell className="font-medium text-xs">{log.event_type}</TableCell>
        <TableCell className="max-w-[300px] truncate text-sm">{log.message}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {log.related_lead_id && (
              <Link
                to={`/leads/${log.related_lead_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline text-xs"
              >
                Lead <ExternalLink className="inline h-3 w-3" />
              </Link>
            )}
            {log.related_call_id && (
              <Link
                to={`/calls?id=${log.related_call_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline text-xs"
              >
                Call <ExternalLink className="inline h-3 w-3" />
              </Link>
            )}
            {log.related_showing_id && (
              <Link
                to={`/showings?id=${log.related_showing_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline text-xs"
              >
                Showing <ExternalLink className="inline h-3 w-3" />
              </Link>
            )}
          </div>
        </TableCell>
        <TableCell>
          {log.is_resolved ? (
            <span className="text-xs text-muted-foreground">Resolved</span>
          ) : (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Unresolved
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-1">Full Message</h4>
                <p className="text-sm text-muted-foreground">{log.message}</p>
              </div>

              {details && Object.keys(details).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-medium">Details</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyDetails();
                      }}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <pre className="bg-background p-3 rounded-md text-xs overflow-auto max-h-48">
                    {JSON.stringify(details, null, 2)}
                  </pre>
                </div>
              )}

              {log.is_resolved && log.resolution_notes && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Resolution Notes</h4>
                  <p className="text-sm text-muted-foreground">{log.resolution_notes}</p>
                </div>
              )}

              {!log.is_resolved && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Mark as Resolved</h4>
                  <Textarea
                    placeholder="Add resolution notes (optional)..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="mb-2"
                  />
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResolve();
                    }}
                    disabled={isResolving}
                  >
                    {isResolving ? "Resolving..." : "Mark as Resolved"}
                  </Button>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const SystemLogs: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [levelFilter, setLevelFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [resolutionFilter, setResolutionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("7");

  // Stats
  const [stats, setStats] = useState({
    info: 0,
    warning: 0,
    error: 0,
    critical: 0,
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = startOfDay(subDays(new Date(), parseInt(dateRange)));
      const endDate = endOfDay(new Date());

      let query = supabase
        .from("system_logs")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (levelFilter !== "all") {
        query = query.eq("level", levelFilter);
      }
      if (serviceFilter !== "all") {
        query = query.eq("category", serviceFilter);
      }
      if (resolutionFilter === "resolved") {
        query = query.eq("is_resolved", true);
      } else if (resolutionFilter === "unresolved") {
        query = query.eq("is_resolved", false);
      }
      if (searchQuery) {
        query = query.ilike("message", `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast({
        title: "Error",
        description: "Failed to fetch system logs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [dateRange, levelFilter, serviceFilter, resolutionFilter, searchQuery, toast]);

  const fetchStats = useCallback(async () => {
    try {
      const startDate = startOfDay(subDays(new Date(), 1));
      const endDate = endOfDay(new Date());

      const { data, error } = await supabase
        .from("system_logs")
        .select("level")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (error) throw error;

      const counts = { info: 0, warning: 0, error: 0, critical: 0 };
      (data || []).forEach((log) => {
        if (log.level in counts) {
          counts[log.level as keyof typeof counts]++;
        }
      });

      setStats(counts);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    const channel = supabase
      .channel("system-logs-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "system_logs",
        },
        (payload) => {
          const newLog = payload.new as SystemLog;
          if (newLog.level === "critical") {
            toast({
              title: "Critical Error",
              description: newLog.message,
              variant: "destructive",
            });
          }
          fetchLogs();
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLogs, fetchStats, toast]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const headers = [
        "Timestamp",
        "Level",
        "Service",
        "Event Type",
        "Message",
        "Status",
        "Resolution Notes",
      ];

      const rows = logs.map((log) => [
        format(new Date(log.created_at!), "yyyy-MM-dd HH:mm:ss"),
        log.level,
        log.category,
        log.event_type,
        `"${log.message.replace(/"/g, '""')}"`,
        log.is_resolved ? "Resolved" : "Unresolved",
        log.resolution_notes ? `"${log.resolution_notes.replace(/"/g, '""')}"` : "",
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `system-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
      link.click();

      toast({ title: "Export complete", description: `Exported ${logs.length} log entries.` });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export logs.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Logs</h1>
          <p className="text-muted-foreground">
            Monitor integration events and system errors
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-muted p-3">
              <Info className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.info}</p>
              <p className="text-sm text-muted-foreground">Info (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-yellow-500/20 p-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.warning}</p>
              <p className="text-sm text-muted-foreground">Warnings (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-orange-500/20 p-3">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.error}</p>
              <p className="text-sm text-muted-foreground">Errors (24h)</p>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.critical > 0 ? "border-destructive" : ""}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-destructive/20 p-3">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{stats.critical}</p>
              <p className="text-sm text-muted-foreground">Critical (24h)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                {SERVICES.map((service) => (
                  <SelectItem key={service.value} value={service.value}>
                    {service.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={resolutionFilter} onValueChange={setResolutionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 Hours</SelectItem>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search message..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Log Entries</CardTitle>
          <CardDescription>Showing {logs.length} log entries</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Info className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No log entries found</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-32">Timestamp</TableHead>
                    <TableHead className="w-24">Level</TableHead>
                    <TableHead className="w-28">Service</TableHead>
                    <TableHead className="w-32">Event</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-24">Related</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <LogEntry key={log.id} log={log} onResolve={fetchLogs} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemLogs;
