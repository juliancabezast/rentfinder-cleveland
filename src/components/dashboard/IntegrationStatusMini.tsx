import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IntegrationHealth {
  id: string;
  organization_id: string;
  service: string;
  status: string;
  message: string | null;
  response_ms: number | null;
  last_checked_at: string;
  last_healthy_at: string | null;
  consecutive_failures: number | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

// Services to display and their friendly names
const SERVICE_DISPLAY_MAP: Record<string, string> = {
  twilio: "Twilio",
  bland_ai: "Bland",
  openai: "OpenAI",
  persona: "Persona",
  doorloop: "Doorloop",
  resend: "Email",
};

const SERVICE_ORDER = ["twilio", "bland_ai", "openai", "persona", "doorloop", "resend"];

type HealthStatus = "healthy" | "degraded" | "down" | "not_configured" | "unknown";

export const IntegrationStatusMini: React.FC = () => {
  const { userRecord } = useAuth();
  const [healthMap, setHealthMap] = useState<Map<string, IntegrationHealth>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const orgId = userRecord?.organization_id;

  // Fetch initial data
  const fetchHealth = useCallback(async () => {
    if (!orgId) return;

    try {
      const { data, error } = await supabase
        .from("integration_health")
        .select("*")
        .eq("organization_id", orgId);

      if (error) throw error;

      const newMap = new Map<string, IntegrationHealth>();
      data?.forEach((record) => {
        newMap.set(record.service, record as IntegrationHealth);
      });
      setHealthMap(newMap);
    } catch (err) {
      console.error("Failed to fetch integration health:", err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  // Initial fetch
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Real-time subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("integration-health-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "integration_health",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          setHealthMap((prev) => {
            const updated = new Map(prev);
            const record = payload.new as IntegrationHealth;
            if (record && record.service) {
              updated.set(record.service, record);
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  // Polling fallback every 30 seconds
  useEffect(() => {
    if (!orgId) return;

    const interval = setInterval(() => {
      fetchHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, [orgId, fetchHealth]);

  // Trigger health check (shared between manual and auto)
  const triggerHealthCheck = useCallback(async (silent = false) => {
    if (!orgId || isRefreshing) return;

    setIsRefreshing(true);
    try {
      await supabase.functions.invoke("agent-health-checker", {
        body: { organization_id: orgId, mode: "full" },
      });
      if (!silent) toast.success("Pulse activated — scanning all services");
    } catch (err) {
      console.error("Failed to trigger health check:", err);
      if (!silent) toast.error("Failed to trigger health check");
    } finally {
      setTimeout(() => setIsRefreshing(false), 3000);
    }
  }, [orgId, isRefreshing]);

  // Manual refresh
  const handleRefresh = () => triggerHealthCheck(false);

  // Auto-trigger if last check > 60 minutes ago (on load + every 60 min)
  const autoCheckRef = React.useRef(false);
  useEffect(() => {
    if (!orgId || isLoading || autoCheckRef.current) return;

    // Check staleness on mount
    let mostRecent: Date | null = null;
    healthMap.forEach((h) => {
      if (h.last_checked_at) {
        const d = new Date(h.last_checked_at);
        if (!mostRecent || d > mostRecent) mostRecent = d;
      }
    });

    const isStale = !mostRecent || differenceInMinutes(new Date(), mostRecent) >= 60;
    if (isStale && healthMap.size > 0) {
      autoCheckRef.current = true;
      triggerHealthCheck(true);
    }
  }, [orgId, isLoading, healthMap, triggerHealthCheck]);

  // Recurring auto-check every 60 minutes while dashboard is open
  useEffect(() => {
    if (!orgId) return;
    const interval = setInterval(() => {
      triggerHealthCheck(true);
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [orgId, triggerHealthCheck]);

  // Get status for a service
  const getServiceStatus = (service: string): HealthStatus => {
    const health = healthMap.get(service);
    if (!health) return "unknown";
    
    const status = health.status?.toLowerCase();
    if (status === "healthy") return "healthy";
    if (status === "degraded") return "degraded";
    if (status === "down") return "down";
    if (status === "not_configured") return "not_configured";
    return "unknown";
  };

  // Get dot styling based on status
  const getStatusDotClasses = (status: HealthStatus): string => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "degraded":
        return "bg-amber-500";
      case "down":
        return "bg-red-500";
      case "not_configured":
        return "bg-muted-foreground/40";
      case "unknown":
      default:
        return "bg-muted-foreground/40";
    }
  };

  // Should the dot pulse?
  const shouldPulse = (status: HealthStatus): boolean => {
    return status === "healthy" || status === "down" || status === "unknown";
  };

  // Calculate overall status
  const overallStatus = useMemo((): { status: HealthStatus; label: string } => {
    const statuses = SERVICE_ORDER.map((service): HealthStatus => {
      const health = healthMap.get(service);
      if (!health) return "unknown";
      
      const status = health.status?.toLowerCase();
      if (status === "healthy") return "healthy";
      if (status === "degraded") return "degraded";
      if (status === "down") return "down";
      if (status === "not_configured") return "not_configured";
      return "unknown";
    });
    
    const allUnknown = statuses.every((s) => s === "unknown");
    const hasDown = statuses.some((s) => s === "down");
    const hasDegraded = statuses.some((s) => s === "degraded");
    const allHealthy = statuses.every((s) => s === "healthy" || s === "not_configured");

    if (allUnknown) return { status: "unknown", label: "Checking..." };
    if (hasDown) return { status: "down", label: "Issues" };
    if (hasDegraded) return { status: "degraded", label: "Degraded" };
    if (allHealthy) return { status: "healthy", label: "Live" };
    return { status: "unknown", label: "Checking..." };
  }, [healthMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get the most recent last_checked_at across all services
  const lastCheckTime = useMemo(() => {
    let mostRecent: Date | null = null;
    
    healthMap.forEach((health) => {
      if (health.last_checked_at) {
        const checkDate = new Date(health.last_checked_at);
        if (!mostRecent || checkDate > mostRecent) {
          mostRecent = checkDate;
        }
      }
    });

    return mostRecent;
  }, [healthMap]);

  // Get status label for tooltip
  const getStatusLabel = (status: HealthStatus): string => {
    switch (status) {
      case "healthy":
        return "Healthy";
      case "degraded":
        return "Degraded";
      case "down":
        return "Down";
      case "not_configured":
        return "Not configured";
      case "unknown":
      default:
        return "Unknown";
    }
  };

  const getOverallDotColor = (): string => {
    switch (overallStatus.status) {
      case "healthy":
        return "bg-green-500";
      case "degraded":
        return "bg-amber-500";
      case "down":
        return "bg-red-500";
      default:
        return "bg-muted-foreground/40";
    }
  };

  const getOverallTextColor = (): string => {
    switch (overallStatus.status) {
      case "healthy":
        return "text-green-600";
      case "degraded":
        return "text-amber-600";
      case "down":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  if (isLoading && healthMap.size === 0) {
    return (
      <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50">
        <span className="text-[10px] text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 max-w-[700px] overflow-x-auto scrollbar-thin">
        {/* Overall Status Indicator */}
        <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-border/50">
          <span className="relative flex h-2 w-2">
            {(overallStatus.status === "healthy" || overallStatus.status === "down") && (
              <span
                className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  overallStatus.status === "healthy" ? "bg-green-400" : "bg-red-400"
                )}
              />
            )}
            <span
              className={cn("relative inline-flex rounded-full h-2 w-2", getOverallDotColor())}
            />
          </span>
          <span className={cn("text-[10px] font-medium", getOverallTextColor())}>
            {overallStatus.label}
          </span>
        </div>

        {/* Service Status Dots */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {SERVICE_ORDER.map((service) => {
            const status = getServiceStatus(service);
            const health = healthMap.get(service);
            const displayName = SERVICE_DISPLAY_MAP[service] || service;

            return (
              <Tooltip key={service}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 shrink-0 cursor-default">
                    <span className="relative flex h-1.5 w-1.5">
                      {shouldPulse(status) && (
                        <span
                          className={cn(
                            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                            status === "healthy"
                              ? "bg-green-400"
                              : status === "down"
                              ? "bg-red-400"
                              : "bg-muted-foreground/30"
                          )}
                          style={
                            status === "unknown" || status === "not_configured"
                              ? { animationDuration: "2s" }
                              : undefined
                          }
                        />
                      )}
                      <span
                        className={cn(
                          "relative inline-flex rounded-full h-1.5 w-1.5",
                          getStatusDotClasses(status)
                        )}
                      />
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {displayName}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {displayName}: {getStatusLabel(status)}
                    </p>
                    {health?.response_ms != null && (
                      <p className="text-muted-foreground">Response: {health.response_ms}ms</p>
                    )}
                    {health?.last_checked_at && (
                      <p className="text-muted-foreground">
                        Checked:{" "}
                        {formatDistanceToNow(new Date(health.last_checked_at), {
                          addSuffix: true,
                        })}
                      </p>
                    )}
                    {health?.consecutive_failures != null && health.consecutive_failures > 0 && (
                      <p className="text-amber-600">
                        ⚠ {health.consecutive_failures} consecutive failure
                        {health.consecutive_failures > 1 ? "s" : ""}
                      </p>
                    )}
                    {health?.message && status !== "healthy" && (
                      <p className="text-muted-foreground max-w-[200px] truncate">
                        {health.message}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Last Check Time */}
        {lastCheckTime && (
          <span className="text-[9px] text-muted-foreground whitespace-nowrap shrink-0 pl-1 border-l border-border/50">
            {formatDistanceToNow(lastCheckTime, { addSuffix: true })}
          </span>
        )}

        {/* Refresh Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 ml-1"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn("h-3 w-3 transition-transform", isRefreshing && "animate-spin")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Run Pulse health check</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};