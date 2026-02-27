import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  CheckCircle2,
  Circle,
  Loader2,
  HeartPulse,
  ClipboardCopy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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

// ── Scan steps ──────────────────────────────────────────────────────

const SCAN_STEPS = [
  { label: "Connecting to external services", detail: "Twilio, Bland, OpenAI, Resend, DoorLoop..." },
  { label: "Verifying scheduled automations", detail: "Cron jobs, email queue, task dispatcher..." },
  { label: "Pinging edge functions", detail: "Webhooks, email processor, agent dispatcher..." },
  { label: "Analyzing system activity", detail: "Error rates, task queue, email backlog..." },
  { label: "Generating health report", detail: "Scoring, findings, recommendations..." },
];

// ── Summary builder ─────────────────────────────────────────────────

function buildPlainSummary(report: SystemReport, services: IntegrationHealth[]): string[] {
  const summary: string[] = [];
  const st = report.stats;
  const healthy = services.filter((s) => s.status === "healthy").length;
  const total = services.length;
  const down = services.filter((s) => s.status === "down").map((s) => s.service);

  // 1. Services
  if (down.length === 0) {
    summary.push(`All ${total} services are connected and running normally.`);
  } else {
    summary.push(`${down.length} service${down.length > 1 ? "s" : ""} down (${down.join(", ")}). ${healthy} of ${total} working.`);
  }

  // 2. Automation
  if (st.tasks.pending > 0) {
    summary.push(`${st.tasks.pending} automated tasks are scheduled and waiting to run.`);
  } else {
    summary.push("No pending automated tasks — everything has been processed.");
  }

  // 3. Errors — with trend awareness
  const errorTrend = st.errors.trend as string | undefined;
  const errorsLastHour = st.errors.lastHour as number | undefined;
  if (st.errors.count24h === 0) {
    summary.push("Zero errors in the last 24 hours — the system is running clean.");
  } else if (errorTrend === "stopped" || errorsLastHour === 0) {
    summary.push(`${st.errors.count24h} errors in 24h, but none in the last hour — issues appear resolved.`);
  } else if (st.errors.count24h <= 5) {
    summary.push(`Only ${st.errors.count24h} minor error${st.errors.count24h > 1 ? "s" : ""} in the last 24 hours.`);
  } else {
    summary.push(`${st.errors.count24h} errors in 24h (${errorsLastHour || "?"} in last hour) — worth reviewing.`);
  }

  // 4. Leads
  const leadCount = st.leads.newToday;
  if (leadCount > 0) {
    summary.push(`${leadCount} new lead${leadCount > 1 ? "s" : ""} came in today.`);
  } else {
    summary.push("No new leads today yet.");
  }

  // 5. Cost
  if (st.costs.totalToday > 0) {
    summary.push(`Today's operating cost so far: $${st.costs.totalToday.toFixed(4)}.`);
  } else {
    summary.push("No AI costs recorded today.");
  }

  return summary;
}

// ── Error report builder for clipboard ───────────────────────────────

function buildErrorReport(report: SystemReport): string {
  const lines: string[] = [];
  const st = report.stats;

  lines.push("=== SYSTEM ERROR REPORT ===");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Health Score: ${report.health_score}/10`);
  lines.push(`Errors (24h): ${st.errors.count24h}`);
  lines.push("");

  if (st.errors.recent.length > 0) {
    lines.push("--- RECENT ERRORS ---");
    st.errors.recent.forEach((err, i) => {
      lines.push(`${i + 1}. ${err}`);
    });
    lines.push("");
  }

  if (st.activity.topFailureActions.length > 0) {
    lines.push("--- TOP FAILURE ACTIONS ---");
    st.activity.topFailureActions.forEach((action) => {
      lines.push(`- ${action}`);
    });
    lines.push("");
  }

  if (report.findings.length > 0) {
    lines.push("--- FINDINGS ---");
    report.findings.forEach((f) => {
      lines.push(`- ${f}`);
    });
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("--- RECOMMENDATIONS ---");
    report.recommendations.forEach((r) => {
      lines.push(`- ${r}`);
    });
    lines.push("");
  }

  if (st.services.down.length > 0) {
    lines.push("--- SERVICES DOWN ---");
    st.services.down.forEach((s) => {
      lines.push(`- ${s}`);
    });
    lines.push("");
  }

  lines.push(`--- STATS ---`);
  lines.push(`Tasks: ${st.tasks.pending} pending, ${st.tasks.failed} failed, ${st.tasks.inProgress} in progress`);
  lines.push(`Agents: ${st.agents.enabled}/${st.agents.total} enabled, ${st.agents.executedToday} executed today (${st.agents.successesToday} ok, ${st.agents.failuresToday} failed)`);
  lines.push(`Services: ${st.services.healthy}/${st.services.total} healthy`);
  lines.push(`Leads: ${st.leads.newToday} new today, ${st.leads.totalActive} active`);
  lines.push(`Activity: ${st.activity.recentSuccesses} successes, ${st.activity.recentFailures} failures`);

  return lines.join("\n");
}

// ── Component ────────────────────────────────────────────────────────

export const DashboardTab: React.FC<DashboardTabProps> = ({ stats }) => {
  const { userRecord } = useAuth();
  const queryClient = useQueryClient();
  const orgId = userRecord?.organization_id;
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Scan dialog state
  const [scanOpen, setScanOpen] = React.useState(false);
  const [scanStep, setScanStep] = React.useState(0);
  const [scanDone, setScanDone] = React.useState(false);
  const [scanScore, setScanScore] = React.useState<number | null>(null);
  const [scanSummary, setScanSummary] = React.useState<string[]>([]);
  const [scanReport, setScanReport] = React.useState<SystemReport | null>(null);

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

  // Real-time leads today count — uses DB-side Cleveland timezone
  const { data: leadsToday } = useQuery({
    queryKey: ["leads-today-count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      // Let Postgres compute "today" in Cleveland timezone (DST-aware)
      const { data, error } = await supabase.rpc("count_leads_today", {
        p_organization_id: orgId,
      });
      if (error) {
        // Fallback: compute Cleveland midnight in JS
        const clevelandNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
        clevelandNow.setHours(0, 0, 0, 0);
        const utcNow = new Date();
        const tzNow = new Date(utcNow.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const offset = utcNow.getTime() - tzNow.getTime();
        const midnightUtc = new Date(clevelandNow.getTime() + offset).toISOString();
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", midnightUtc);
        return count || 0;
      }
      return data || 0;
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  // Real-time complete leads today count
  const { data: completeLeadsToday } = useQuery({
    queryKey: ["complete-leads-today-count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { data, error } = await supabase.rpc("count_complete_leads_today", {
        p_organization_id: orgId,
      });
      if (error) return 0;
      return data || 0;
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  // Real-time errors 24h count
  const { data: errorsRealtime } = useQuery({
    queryKey: ["errors-24h-count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("level", "error")
        .gte("created_at", dayAgo);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  const healthyCount = services?.filter((s) => s.status === "healthy").length || 0;
  const totalServicesCount = services?.length || 0;
  const downServices = services?.filter((s) => s.status === "down") || [];

  const handleReanalyze = async () => {
    // Reset and open dialog
    setScanStep(0);
    setScanDone(false);
    setScanScore(null);
    setScanSummary([]);
    setScanOpen(true);
    setIsRefreshing(true);

    // Animate through steps while the real call happens
    const stepInterval = setInterval(() => {
      setScanStep((prev) => {
        if (prev < SCAN_STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 1800);

    try {
      // Run both health check + system analysis in parallel
      await Promise.all([
        supabase.functions.invoke("agent-health-checker", {
          body: { organization_id: orgId, mode: "full" },
        }),
        supabase.functions.invoke("agent-system-analysis", {
          body: { organization_id: orgId },
        }),
      ]);

      // Refresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["system-analysis-report"] }),
        queryClient.invalidateQueries({ queryKey: ["integration-health"] }),
      ]);

      // Wait for fresh data
      await new Promise((r) => setTimeout(r, 500));

      // Get fresh report for summary
      const { data: freshData } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId!)
        .eq("key", "system_analysis_report")
        .single();

      const { data: freshServices } = await supabase
        .from("integration_health")
        .select("service, status, last_checked_at, response_ms")
        .eq("organization_id", orgId!);

      const freshReport = freshData?.value as unknown as SystemReport;

      clearInterval(stepInterval);
      setScanStep(SCAN_STEPS.length - 1);

      if (freshReport) {
        setScanScore(freshReport.health_score);
        setScanReport(freshReport);
        setScanSummary(
          buildPlainSummary(freshReport, (freshServices || []) as IntegrationHealth[])
        );
      }

      // Small delay for the last step to be visible
      await new Promise((r) => setTimeout(r, 600));
      setScanDone(true);
    } catch (err) {
      console.error("Re-analyze failed:", err);
      clearInterval(stepInterval);
      setScanStep(SCAN_STEPS.length - 1);
      setScanScore(null);
      setScanSummary(["Analysis failed. Please try again."]);
      setScanDone(true);
    }
    setIsRefreshing(false);
  };

  const progress = scanDone
    ? 100
    : Math.min(95, ((scanStep + 1) / SCAN_STEPS.length) * 90 + 5);

  // Use report stats if available, otherwise fall back to props
  const rStats = report?.stats;
  const costToday = rStats?.costs.totalToday || 0;
  // Use real-time queries for badges (more accurate than stale report)
  const errors24h = errorsRealtime ?? rStats?.errors.count24h ?? 0;
  const newLeadsToday = leadsToday ?? rStats?.leads.newToday ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Scan Dialog ──────────────────────────────────────────── */}
      <Dialog open={scanOpen} onOpenChange={(open) => { if (scanDone) setScanOpen(open); }}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          {/* Purple gradient header */}
          <div className="bg-gradient-to-r from-[#4F46E5] to-[#6366F1] px-8 py-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-white text-xl">
                <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <HeartPulse className={cn("h-6 w-6 text-[#ffb22c]", !scanDone && "animate-pulse")} />
                </div>
                <div>
                  <span className="block">System Health Scan</span>
                  <span className="block text-sm font-normal text-white/60 mt-0.5">
                    {scanDone ? "Analysis complete" : "Analyzing your infrastructure..."}
                  </span>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Progress bar inside header */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm text-white/70 mb-2">
                <span>{scanDone ? "All checks passed" : SCAN_STEPS[scanStep]?.label || "Scanning..."}</span>
                <span className="font-mono text-white/90 font-semibold">{Math.round(progress)}%</span>
              </div>
              <div className="h-3 bg-white/15 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    scanDone
                      ? scanScore !== null && scanScore >= 8
                        ? "bg-green-400"
                        : scanScore !== null && scanScore >= 5
                        ? "bg-amber-400"
                        : "bg-red-400"
                      : "bg-[#ffb22c]"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* Steps - scanning */}
            {!scanDone && (
              <div className="space-y-4">
                {SCAN_STEPS.map((step, i) => {
                  const isDone = i < scanStep;
                  const isCurrent = i === scanStep;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-4 transition-all duration-500 ease-out",
                        i > scanStep + 1 && "opacity-0 translate-y-2",
                        i > scanStep && i <= scanStep + 1 && "opacity-25",
                      )}
                    >
                      <div className="shrink-0 mt-0.5">
                        {isDone ? (
                          <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          </div>
                        ) : isCurrent ? (
                          <div className="h-7 w-7 rounded-full bg-[#4F46E5]/10 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-[#4F46E5] animate-spin" />
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center">
                            <Circle className="h-5 w-5 text-muted-foreground/25" />
                          </div>
                        )}
                      </div>
                      <div className="pt-0.5">
                        <p className={cn(
                          "text-base font-medium transition-colors",
                          isDone ? "text-green-700" : isCurrent ? "text-foreground" : "text-muted-foreground/40"
                        )}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="text-sm text-muted-foreground mt-1 animate-fade-in">
                            {step.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Results */}
            {scanDone && (
              <div className="space-y-6 animate-fade-up">
                {/* Score - large and prominent */}
                {scanScore !== null && (
                  <div className="flex items-center justify-center py-4">
                    <div className="relative">
                      <div className={cn(
                        "h-28 w-28 rounded-full flex items-center justify-center border-4",
                        scanScore >= 8 ? "border-green-200 bg-green-50" : scanScore >= 5 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
                      )}>
                        <div className="text-center">
                          <div className={cn(
                            "text-4xl font-bold",
                            scanScore >= 8 ? "text-green-600" : scanScore >= 5 ? "text-amber-600" : "text-red-600"
                          )}>
                            {scanScore}
                          </div>
                          <div className="text-xs text-muted-foreground font-medium">/10</div>
                        </div>
                      </div>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                        <span className={cn(
                          "text-xs font-semibold px-3 py-1 rounded-full",
                          scanScore >= 8 ? "bg-green-100 text-green-700" : scanScore >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          {scanScore >= 8 ? "Healthy" : scanScore >= 5 ? "Needs Attention" : "Critical"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Plain language summary */}
                <div className="space-y-3 bg-gradient-to-br from-muted/30 to-muted/60 rounded-2xl p-5 border border-border/50">
                  <h4 className="text-base font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4 text-[#4F46E5]" />
                    What's happening right now
                  </h4>
                  <ul className="space-y-3">
                    {scanSummary.map((line, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm animate-fade-up"
                        style={{ animationDelay: `${i * 150}ms` }}
                      >
                        <span className={cn(
                          "shrink-0 mt-1.5 h-2 w-2 rounded-full",
                          i === 0 ? "bg-[#4F46E5]" : "bg-[#4F46E5]/40"
                        )} />
                        <span className="text-foreground/80 leading-relaxed">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-2">
                  {scanReport && scanReport.stats.errors.count24h > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (scanReport) {
                          navigator.clipboard.writeText(buildErrorReport(scanReport));
                          toast.success("Error report copied to clipboard");
                        }
                      }}
                      className="gap-2 text-sm h-11 rounded-xl"
                    >
                      <ClipboardCopy className="h-4 w-4" />
                      Copy Full Error Report
                    </Button>
                  ) : <div />}
                  <Button
                    onClick={() => setScanOpen(false)}
                    className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white px-8 h-11 text-base rounded-xl"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
          <p className="text-xs text-muted-foreground">Agents ON</p>
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
          <p className="text-xs text-muted-foreground">Pending</p>
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
          <p className="text-xs text-muted-foreground">Services</p>
        </Card>

        {/* Cost today */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xl font-bold text-blue-600">
            ${costToday.toFixed(4)}
          </p>
          <p className="text-xs text-muted-foreground">Cost Today</p>
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
          <p className="text-xs text-muted-foreground">Errors 24h</p>
        </Card>

        {/* New Leads */}
        <Card variant="glass" className="text-center p-3">
          <div className="flex justify-center mb-1">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <p className="text-xl font-bold text-purple-600">{newLeadsToday}</p>
          <p className="text-xs text-muted-foreground">Leads Today</p>
          {completeLeadsToday != null && completeLeadsToday < newLeadsToday && (
            <p className="text-[10px] text-muted-foreground">{completeLeadsToday} complete</p>
          )}
        </Card>
      </div>

      {/* Zacchaeus AI Analysis */}
      <Card variant="glass" className="border-l-4 border-l-[#4F46E5]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#4F46E5]" />
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
                        <span className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
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

              {/* Copy error report */}
              {report && report.stats.errors.count24h > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (report) {
                      navigator.clipboard.writeText(buildErrorReport(report));
                      toast.success("Error report copied — paste it to review");
                    }
                  }}
                  className="gap-2 w-full"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy Full Error Report ({report.stats.errors.count24h} errors)
                </Button>
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
