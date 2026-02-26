import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Bot,
  Clock,
  Wifi,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Shield,
  Lightbulb,
  Search,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { AgentStats } from "./types";

// ── Types ────────────────────────────────────────────────────────────

interface SystemReport {
  health_score: number;
  findings: string[];
  recommendations: string[];
  generated_at: string;
  stats: {
    agents: { total: number; enabled: number; executedToday: number; successesToday: number; failuresToday: number };
    tasks: { pending: number; failed: number; inProgress: number };
    services: { healthy: number; total: number; down: string[] };
    costs: { totalToday: number; byService: Record<string, number> };
    errors: { count24h: number; recent: string[] };
    leads: { newToday: number; totalActive: number };
    activity: { recentFailures: number; recentSuccesses: number; topFailureActions: string[] };
  };
}

interface IntegrationHealth {
  service: string;
  status: string;
  last_checked_at: string | null;
  response_ms: number | null;
}

interface DashboardTabProps {
  stats: AgentStats;
}

// ── Health score color ───────────────────────────────────────────────

const getScoreColor = (score: number) => {
  if (score >= 8) return "text-green-600";
  if (score >= 5) return "text-amber-600";
  return "text-red-600";
};

const getScoreBarColor = (score: number) => {
  if (score >= 8) return "bg-green-500";
  if (score >= 5) return "bg-amber-500";
  return "bg-red-500";
};

// ── Component ────────────────────────────────────────────────────────

export const DashboardTab: React.FC<DashboardTabProps> = ({ stats }) => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const orgId = userRecord?.organization_id;
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Fetch saved analysis report
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["system-analysis-report", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organization_settings")
        .select("value, updated_at")
        .eq("organization_id", orgId)
        .eq("key", "system_analysis_report")
        .single();
      if (error || !data) return null;
      return data.value as unknown as SystemReport;
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  // Fetch integration health
  const { data: services } = useQuery({
    queryKey: ["integration-health", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("integration_health")
        .select("service, status, last_checked_at, response_ms")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data as IntegrationHealth[];
    },
    enabled: !!orgId,
  });

  const healthyCount = services?.filter((s) => s.status === "healthy").length || 0;
  const totalServicesCount = services?.length || 0;
  const downServices = services?.filter((s) => s.status === "down") || [];

  const handleReanalyze = async () => {
    setIsRefreshing(true);
    try {
      await supabase.functions.invoke("agent-system-analysis", {
        body: { organization_id: orgId },
      });
      await queryClient.invalidateQueries({ queryKey: ["system-analysis-report"] });
    } catch (err) {
      console.error("Re-analyze failed:", err);
    }
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Use report stats if available, otherwise fall back to props
  const rStats = report?.stats;
  const costToday = rStats?.costs.totalToday || 0;
  const errors24h = rStats?.errors.count24h || 0;
  const newLeadsToday = rStats?.leads.newToday || 0;

  return (
    <div className="space-y-4">
      {/* Bubble cards row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Agents */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Bot className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <p className={cn("text-xl font-bold", stats.enabled === stats.total ? "text-green-600" : "text-amber-600")}>
            {stats.enabled}/{stats.total}
          </p>
          <p className="text-[11px] text-muted-foreground">Agents ON</p>
        </Card>

        {/* Pending */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", stats.pendingGlobal > 0 ? "bg-amber-100" : "bg-gray-100")}>
              <Clock className={cn("h-5 w-5", stats.pendingGlobal > 0 ? "text-amber-600" : "text-gray-400")} />
            </div>
          </div>
          <p className={cn("text-xl font-bold", stats.pendingGlobal > 0 ? "text-amber-600" : "text-muted-foreground")}>
            {stats.pendingGlobal}
          </p>
          <p className="text-[11px] text-muted-foreground">Pending</p>
        </Card>

        {/* Services */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", downServices.length > 0 ? "bg-red-100" : "bg-green-100")}>
              <Wifi className={cn("h-5 w-5", downServices.length > 0 ? "text-red-600" : "text-green-600")} />
            </div>
          </div>
          <p className={cn("text-xl font-bold", downServices.length > 0 ? "text-red-600" : "text-green-600")}>
            {healthyCount}/{totalServicesCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Services</p>
        </Card>

        {/* Cost today */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xl font-bold text-blue-600">
            ${costToday.toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground">Cost Today</p>
        </Card>

        {/* Errors */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", errors24h > 0 ? "bg-red-100" : "bg-gray-100")}>
              <AlertTriangle className={cn("h-5 w-5", errors24h > 0 ? "text-red-600" : "text-gray-400")} />
            </div>
          </div>
          <p className={cn("text-xl font-bold", errors24h > 0 ? "text-red-600" : "text-muted-foreground")}>
            {errors24h}
          </p>
          <p className="text-[11px] text-muted-foreground">Errors 24h</p>
        </Card>

        {/* New Leads */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <p className="text-xl font-bold text-purple-600">{newLeadsToday}</p>
          <p className="text-[11px] text-muted-foreground">Leads Today</p>
        </Card>
      </div>

      {/* Zacchaeus AI Analysis */}
      <Card variant="glass" className="border-l-4 border-l-[#370d4b]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#370d4b]" />
              Zacchaeus System Analysis
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={isRefreshing}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              Re-analyze
            </Button>
          </div>
          {report?.generated_at && (
            <p className="text-xs text-muted-foreground">
              Generated {formatDistanceToNow(new Date(report.generated_at), { addSuffix: true })}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {reportLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-20" />
              <Skeleton className="h-16" />
            </div>
          ) : !report ? (
            <EmptyState
              icon={Activity}
              title="No analysis yet"
              description="Click Re-analyze to generate the first system report, or wait for the hourly cron"
            />
          ) : (
            <div className="space-y-4">
              {/* Health score */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Health Score</span>
                  <span className={cn("text-2xl font-bold", getScoreColor(report.health_score))}>
                    {report.health_score}/10
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", getScoreBarColor(report.health_score))}
                    style={{ width: `${report.health_score * 10}%` }}
                  />
                </div>
              </div>

              {/* Findings */}
              {report.findings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {report.findings.map((finding, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-[#370d4b]" />
                        <span className="text-foreground/80">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Recommendations
                  </h4>
                  <ul className="space-y-1.5">
                    {report.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span className="text-foreground/80">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Down services alert */}
              {downServices.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Services Down
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {downServices.map((s) => (
                      <Badge key={s.service} variant="destructive" className="text-xs">
                        {s.service}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Service health overview */}
              {services && services.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Service Status</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {services.map((svc) => (
                      <div
                        key={svc.service}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border text-xs",
                          svc.status === "healthy" ? "bg-green-50/50 border-green-200/60" :
                          svc.status === "down" ? "bg-red-50/50 border-red-200/60" :
                          "bg-gray-50/50 border-gray-200/60"
                        )}
                      >
                        <span className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          svc.status === "healthy" ? "bg-green-500" :
                          svc.status === "down" ? "bg-red-500" :
                          "bg-gray-400"
                        )} />
                        <span className="capitalize font-medium truncate">{svc.service}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
