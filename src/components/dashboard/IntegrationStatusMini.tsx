import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ServiceStatus = "ok" | "warning" | "error" | "disabled";

interface ServiceInfo {
  name: string;
  shortName: string;
  status: ServiceStatus;
  category: string;
  eventTypeFilter?: string;
  credentialKey?: string; // Key to check in organization_credentials
}

const SERVICES_CONFIG: Omit<ServiceInfo, "status">[] = [
  { name: "Twilio Voice", shortName: "Voice", category: "twilio", eventTypeFilter: "voice", credentialKey: "twilio_account_sid" },
  { name: "Twilio SMS", shortName: "SMS", category: "twilio", eventTypeFilter: "sms", credentialKey: "twilio_account_sid" },
  { name: "Bland.ai", shortName: "Bland", category: "bland_ai", credentialKey: "bland_api_key" },
  { name: "OpenAI", shortName: "OpenAI", category: "openai", credentialKey: "openai_api_key" },
  { name: "Persona", shortName: "Persona", category: "persona", credentialKey: "persona_api_key" },
  { name: "Doorloop", shortName: "Doorloop", category: "doorloop", credentialKey: "doorloop_api_key" },
  { name: "Google Sheets", shortName: "Sheets", category: "google_sheets", credentialKey: null }, // No credential check - assume enabled if org exists
  { name: "Gmail", shortName: "Gmail", category: "gmail", credentialKey: null }, // No credential check - assume enabled if org exists
  { name: "Supabase", shortName: "Supabase", category: "authentication", credentialKey: null }, // Always available
];

export const IntegrationStatusMini: React.FC = () => {
  const { userRecord } = useAuth();
  const [services, setServices] = useState<ServiceInfo[]>(
    SERVICES_CONFIG.map((s) => ({ ...s, status: "disabled" as ServiceStatus }))
  );
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!userRecord?.organization_id) return;

    setChecking(true);
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Fetch organization credentials to check which integrations are configured
      const { data: credentials } = await supabase
        .from("organization_credentials")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .single();

      // Fetch recent system logs for all categories
      const { data: logs } = await supabase
        .from("system_logs")
        .select("category, level, event_type, created_at")
        .eq("organization_id", userRecord.organization_id)
        .in("category", ["twilio", "bland_ai", "openai", "persona", "doorloop", "google_sheets", "gmail", "authentication", "general"])
        .order("created_at", { ascending: false })
        .limit(200);

      const updatedServices: ServiceInfo[] = SERVICES_CONFIG.map((config) => {
        // Check if this service has credentials configured
        let isConfigured = false;
        
        if (config.credentialKey === null) {
          // Services without credential keys (Google Sheets, Gmail, Supabase) are always considered configured
          isConfigured = true;
        } else if (credentials && config.credentialKey) {
          const credValue = credentials[config.credentialKey as keyof typeof credentials];
          isConfigured = credValue !== null && credValue !== undefined && credValue !== "";
        }

        // If not configured, show as error (red)
        if (!isConfigured) {
          return { ...config, status: "error" as ServiceStatus };
        }

        // Filter logs for this service
        let serviceLogs = logs?.filter((log) => log.category === config.category) || [];

        // For Twilio, further filter by event_type
        if (config.eventTypeFilter && config.category === "twilio") {
          serviceLogs = serviceLogs.filter((log) => {
            const eventType = log.event_type?.toLowerCase() || "";
            if (config.eventTypeFilter === "voice") {
              return eventType.includes("call") || eventType.includes("voice");
            }
            if (config.eventTypeFilter === "sms") {
              return eventType.includes("sms") || eventType.includes("message");
            }
            return false;
          });
        }

        // Check for recent errors/warnings in logs
        const recentLogs = serviceLogs.filter(
          (log) => new Date(log.created_at!) > new Date(oneHourAgo)
        );
        
        const hasRecentCritical = recentLogs.some(
          (log) => log.level === "critical" || log.level === "error"
        );
        const hasRecentWarning = recentLogs.some((log) => log.level === "warning");
        
        // Also check if the most recent log (regardless of time) is an error
        const latestLog = serviceLogs[0];
        const latestIsError = latestLog && (latestLog.level === "error" || latestLog.level === "critical");

        // Determine status based on new logic
        let status: ServiceStatus = "ok"; // Default to green if configured and no errors
        
        if (hasRecentCritical || latestIsError) {
          status = "error";
        } else if (hasRecentWarning) {
          status = "warning";
        }
        // Otherwise stays "ok" (green) - configured with no issues

        return { ...config, status };
      });

      setServices(updatedServices);
    } catch (error) {
      console.error("Error checking integration status:", error);
    } finally {
      setChecking(false);
    }
  }, [userRecord?.organization_id]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case "ok":
        return "bg-green-500";
      case "warning":
        return "bg-amber-500";
      case "error":
        return "bg-red-500";
      case "disabled":
        return "bg-gray-300";
      default:
        return "bg-gray-300";
    }
  };

  // Check overall health for the "Live" indicator
  const allHealthy = services.every((s) => s.status === "ok");
  const hasErrors = services.some((s) => s.status === "error");

  return (
    <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 max-w-[600px] overflow-x-auto scrollbar-thin">
      {/* Live System Indicator */}
      <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-border/50">
        <span className="relative flex h-2 w-2">
          {allHealthy ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </>
          ) : hasErrors ? (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          )}
        </span>
        <span className={cn(
          "text-[10px] font-medium",
          allHealthy ? "text-green-600" : hasErrors ? "text-red-600" : "text-amber-600"
        )}>
          Live
        </span>
      </div>

      {/* Integration Status Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center gap-1 shrink-0"
            title={`${service.name}: ${service.status === "ok" ? "healthy" : service.status}`}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full shrink-0", getStatusColor(service.status))}
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {service.shortName}
            </span>
          </div>
        ))}
      </div>

      {/* Refresh Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 ml-1"
        onClick={checkStatus}
        disabled={checking}
      >
        <RefreshCw className={cn("h-3 w-3 transition-transform", checking && "animate-spin")} />
      </Button>
    </div>
  );
};