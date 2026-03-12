import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Mail,
  User,
  Phone,
  Home,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Clock,
  Sparkles,
  FileText,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EstherLog {
  id: string;
  event_type: string;
  level: string;
  message: string;
  details: Record<string, any> | null;
  related_lead_id: string | null;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  esther_lead_processed: { label: "Lead Parsed", icon: CheckCircle2, color: "text-green-600" },
  esther_digest_processed: { label: "Digest Parsed", icon: FileText, color: "text-green-600" },
  esther_incomplete_lead: { label: "Incomplete Lead", icon: AlertTriangle, color: "text-amber-600" },
  esther_no_contact_info: { label: "No Contact Info", icon: User, color: "text-orange-500" },
  esther_parse_skip: { label: "Skipped", icon: XCircle, color: "text-gray-400" },
  esther_llm_parse_failed: { label: "LLM Failed", icon: XCircle, color: "text-red-600" },
  esther_digest_empty: { label: "Empty Digest", icon: FileText, color: "text-gray-400" },
  esther_digest_lead_error: { label: "Digest Error", icon: XCircle, color: "text-red-600" },
  esther_db_insert_failed: { label: "DB Error", icon: XCircle, color: "text-red-600" },
  esther_property_auto_created: { label: "Property Created", icon: Home, color: "text-blue-600" },
  esther_error: { label: "System Error", icon: XCircle, color: "text-red-600" },
  esther_note_save_failed: { label: "Note Failed", icon: AlertTriangle, color: "text-amber-600" },
};

const LEVEL_BADGE: Record<string, string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  critical: "bg-red-100 text-red-800 border-red-300",
};

function PipelineRow({ log }: { log: EstherLog }) {
  const [expanded, setExpanded] = useState(false);
  const config = EVENT_CONFIG[log.event_type] || {
    label: log.event_type,
    icon: Mail,
    color: "text-gray-500",
  };
  const Icon = config.icon;
  const d = log.details || {};

  const leadName = d.lead_name || d.parsed_name || null;
  const leadPhone = d.lead_phone || d.parsed_phone || null;
  const leadEmail = d.lead_email || d.parsed_email || null;
  const property = d.property || d.lead_property || d.parsed_property || null;
  const subject = d.subject || null;
  const isNew = d.is_new_lead === true;
  const followUps = d.follow_up || d.follow_ups || [];
  const digestStats = log.event_type === "esther_digest_processed"
    ? { total: d.total_leads, created: d.created, updated: d.updated, skipped: d.skipped }
    : null;

  return (
    <div className="border border-border/50 rounded-lg bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{config.label}</span>
            {digestStats && (
              <span className="text-xs text-muted-foreground">
                {digestStats.created} new, {digestStats.updated} updated, {digestStats.skipped} skipped
              </span>
            )}
            {!digestStats && leadName && (
              <span className="text-sm text-foreground">{leadName}</span>
            )}
            {!digestStats && !leadName && subject && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{subject}</span>
            )}
            {isNew && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">
                NEW
              </Badge>
            )}
            {!isNew && log.event_type === "esther_lead_processed" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                UPDATED
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {leadPhone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {leadPhone}
              </span>
            )}
            {leadEmail && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {leadEmail}
              </span>
            )}
            {property && (
              <span className="flex items-center gap-1 truncate max-w-[200px]">
                <Home className="h-3 w-3" /> {property}
              </span>
            )}
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${LEVEL_BADGE[log.level] || ""}`}>
          {log.level}
        </Badge>
        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/30">
          <div className="mt-3 space-y-2">
            {/* Pipeline visualization */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-700">
                <Mail className="h-3 w-3" /> Email received
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="flex items-center gap-1 px-2 py-1 rounded bg-purple-50 text-purple-700">
                <Sparkles className="h-3 w-3" /> LLM parse
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className={`flex items-center gap-1 px-2 py-1 rounded ${
                log.level === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
              }`}>
                {log.level === "error" ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {log.level === "error" ? "Failed" : isNew ? "Lead created" : "Lead updated"}
              </span>
              {followUps.length > 0 && (
                <>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-700">
                    <Clock className="h-3 w-3" /> Follow-up
                  </span>
                </>
              )}
            </div>

            {/* Extracted data */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
              {leadName && (
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{leadName}</span></div>
              )}
              {leadPhone && (
                <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{leadPhone}</span></div>
              )}
              {leadEmail && (
                <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{leadEmail}</span></div>
              )}
              {property && (
                <div><span className="text-muted-foreground">Property:</span> <span className="font-medium">{property}</span></div>
              )}
              {d.lead_listing_source && (
                <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{d.lead_listing_source}</span></div>
              )}
              {d.message && (
                <div className="col-span-2"><span className="text-muted-foreground">Message:</span> <span className="font-medium">{d.message}</span></div>
              )}
              {subject && (
                <div className="col-span-2"><span className="text-muted-foreground">Subject:</span> <span className="italic">{subject}</span></div>
              )}
              {d.email_id && (
                <div className="col-span-2"><span className="text-muted-foreground">Email ID:</span> <span className="font-mono text-[11px]">{d.email_id}</span></div>
              )}
              {d.missing_name && (
                <div className="text-amber-600">Missing name</div>
              )}
              {d.missing_phone && (
                <div className="text-amber-600">Missing phone</div>
              )}
            </div>

            {/* Follow-ups */}
            {followUps.length > 0 && (
              <div className="text-xs mt-1">
                <span className="text-muted-foreground">Follow-ups: </span>
                {(Array.isArray(followUps) ? followUps : [followUps]).map((f: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] mr-1 bg-amber-50 text-amber-700 border-amber-200">
                    {f}
                  </Badge>
                ))}
              </div>
            )}

            {/* Lead link */}
            {log.related_lead_id && (
              <a
                href={`/leads/${log.related_lead_id}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1"
              >
                View lead <ArrowRight className="h-3 w-3" />
              </a>
            )}

            {/* Error details */}
            {d.error && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mt-1 font-mono">
                {d.error}
              </div>
            )}

            {/* Body preview for debugging */}
            {d.body_preview && (
              <details className="text-xs mt-1">
                <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                  Raw email preview
                </summary>
                <pre className="mt-1 p-2 bg-gray-50 rounded text-[11px] overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {d.body_preview}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const EstherPipelineTab: React.FC = () => {
  const { userRecord } = useAuth();
  const [limit, setLimit] = useState(50);

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["esther-pipeline", userRecord?.organization_id, limit],
    queryFn: async () => {
      if (!userRecord?.organization_id) return [];
      const { data, error } = await supabase
        .from("system_logs")
        .select("id, event_type, level, message, details, related_lead_id, created_at")
        .eq("organization_id", userRecord.organization_id)
        .like("event_type", "esther_%")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as EstherLog[];
    },
    enabled: !!userRecord?.organization_id,
    refetchInterval: 15000,
  });

  // Compute quick stats from current data
  const stats = logs
    ? {
        total: logs.length,
        success: logs.filter((l) => l.event_type === "esther_lead_processed" || l.event_type === "esther_digest_processed").length,
        errors: logs.filter((l) => l.level === "error").length,
        newLeads: logs.filter((l) => l.details?.is_new_lead === true).length,
        incomplete: logs.filter((l) => l.event_type === "esther_incomplete_lead").length,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Esther — Email Pipeline
          </h2>
          <p className="text-xs text-muted-foreground">
            Real-time view of Hemlane email parsing (LLM-powered)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Events</div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-green-600">{stats.success}</div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-blue-600">{stats.newLeads}</div>
              <div className="text-xs text-muted-foreground">New Leads</div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-amber-600">{stats.incomplete}</div>
              <div className="text-xs text-muted-foreground">Incomplete</div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pipeline list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <PipelineRow key={log.id} log={log} />
          ))}
          {logs.length >= limit && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setLimit((l) => l + 50)}
            >
              Load more...
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No Esther events yet</p>
          <p className="text-xs mt-1">Events will appear here when Hemlane emails are processed</p>
        </div>
      )}
    </div>
  );
};
