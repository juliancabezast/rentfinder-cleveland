import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Activity, RefreshCw, Clock, User, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveAgentKey } from "@/components/agents/constants";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  agent_key: string;
  action: string;
  status: string;
  message: string;
  execution_ms: number | null;
  created_at: string;
  related_lead_id: string | null;
  leads: { full_name: string; interested_property_id: string | null; properties: { address: string } | null } | null;
}

// ── Agent biblical names ─────────────────────────────────────────────

const BIBLICAL_NAMES: Record<string, string> = {
  aaron: "Aaron",
  esther: "Esther",
  nehemiah: "Nehemiah",
  ruth: "Ruth",
  elijah: "Elijah",
  samuel: "Samuel",
  zacchaeus: "Zacchaeus",
};

const getAgentName = (key: string) => {
  const canonical = resolveAgentKey(key);
  return BIBLICAL_NAMES[canonical] || canonical;
};

// ── Status styling ───────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-emerald-50/40 border-emerald-100/60", text: "bg-green-100 text-green-700", dot: "bg-emerald-500" },
  failure: { bg: "bg-red-50/40 border-red-100/60", text: "bg-red-100 text-red-700", dot: "bg-red-500" },
  skipped: { bg: "bg-gray-50/40 border-gray-100/60", text: "bg-gray-100 text-gray-700", dot: "bg-gray-400" },
  in_progress: { bg: "bg-blue-50/40 border-blue-100/60", text: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
};

const getStatusStyle = (status: string) =>
  STATUS_STYLES[status] || STATUS_STYLES.skipped;

// ── Component ────────────────────────────────────────────────────────

export const AgentActivityPanel = () => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const orgId = userRecord?.organization_id;
  const queryKey = ["live-agent-activity", orgId];

  // ── Query ────────────────────────────────────────────────────────────
  const { data: entries, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("agent_activity_log")
        .select(`
          id, agent_key, action, status, message, execution_ms, created_at, related_lead_id,
          leads:related_lead_id (full_name, interested_property_id, properties:interested_property_id (address))
        `)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setLastUpdate(new Date());
      return data as ActivityEntry[];
    },
    enabled: !!orgId,
    refetchInterval: 10_000,
  });

  // ── Realtime subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const channel: RealtimeChannel = supabase
      .channel("live-panel-agent-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_activity_log",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
          setLastUpdate(new Date());
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey });
    setTimeout(() => setIsRefreshing(false), 600);
  }, [queryClient, queryKey]);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Card variant="glass" className="h-full flex flex-col border-l-2 border-l-purple-400/50">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <Activity className="h-4 w-4 text-purple-500" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-purple-500 animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-purple-500" />
            </div>
            Agent Activity
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 text-muted-foreground hover:text-foreground transition-colors",
                isRefreshing && "animate-spin"
              )}
            />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </p>
      </CardHeader>

      {/* Content */}
      <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-muted">
                <div className="flex items-center gap-2 mb-1.5">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-14 rounded ml-auto" />
                </div>
                <Skeleton className="h-3 w-full ml-8" />
              </div>
            ))}
          </div>
        ) : !entries || entries.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Agent actions will appear here as they execute"
          />
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {entries.map((entry, index) => {
                const style = getStatusStyle(entry.status);
                const agentName = getAgentName(entry.agent_key);
                const time = new Date(entry.created_at);
                const leadName = entry.leads?.full_name;
                const propertyAddress = entry.leads?.properties?.address;

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "p-2.5 rounded-lg border transition-all",
                      style.bg,
                      index === 0 && "animate-fade-up"
                    )}
                  >
                    {/* Row 1: avatar + time + status badge */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white",
                        style.dot
                      )}>
                        {agentName.charAt(0)}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {format(time, "h:mm a")} &middot;{" "}
                        {formatDistanceToNow(time, { addSuffix: true })}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] h-4 px-1.5 ml-auto", style.text)}
                      >
                        {entry.status}
                      </Badge>
                    </div>

                    {/* Row 2: agent + action */}
                    <p className="text-sm leading-snug ml-8">
                      <span className="font-semibold text-purple-700 dark:text-purple-400">
                        {agentName}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}{entry.action.replace(/_/g, " ")}
                      </span>
                    </p>

                    {/* Row 3: lead + property */}
                    {(leadName || propertyAddress) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 ml-8 mt-1">
                        {leadName && (
                          <span className="flex items-center gap-1 text-[11px] text-foreground/70">
                            <User className="h-3 w-3 shrink-0" />
                            {leadName}
                          </span>
                        )}
                        {propertyAddress && (
                          <span className="flex items-center gap-1 text-[11px] text-foreground/70">
                            <Home className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[180px]">{propertyAddress}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 4: execution time */}
                    {entry.execution_ms != null && entry.execution_ms > 0 && (
                      <p className="text-[10px] text-muted-foreground ml-8 mt-0.5">
                        {entry.execution_ms}ms
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {entries && entries.length > 0 && (
          <div className="pt-3 mt-2 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {entries.length} recent actions
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
