import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ServiceStatus = "ok" | "warning" | "error" | "unknown";

interface ServiceInfo {
  name: string;
  shortName: string;
  status: ServiceStatus;
  category: string;
  eventTypeFilter?: string; // For splitting Twilio into Voice/SMS
}

const SERVICES_CONFIG: Omit<ServiceInfo, "status">[] = [
  { name: "Twilio Voice", shortName: "Voice", category: "twilio", eventTypeFilter: "voice" },
  { name: "Twilio SMS", shortName: "SMS", category: "twilio", eventTypeFilter: "sms" },
  { name: "Bland.ai", shortName: "Bland", category: "bland_ai" },
  { name: "OpenAI", shortName: "OpenAI", category: "openai" },
  { name: "Persona", shortName: "Persona", category: "persona" },
  { name: "Doorloop", shortName: "Doorloop", category: "doorloop" },
  { name: "Google Sheets", shortName: "Sheets", category: "google_sheets" },
  { name: "Gmail", shortName: "Gmail", category: "gmail" },
  { name: "Supabase", shortName: "Supabase", category: "authentication" },
];

export const IntegrationStatusMini: React.FC = () => {
  const { userRecord } = useAuth();
  const [services, setServices] = useState<ServiceInfo[]>(
    SERVICES_CONFIG.map((s) => ({ ...s, status: "unknown" as ServiceStatus }))
  );
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!userRecord?.organization_id) return;

    setChecking(true);
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Fetch recent system logs for all categories
      const { data: logs } = await supabase
        .from("system_logs")
        .select("category, level, event_type, created_at")
        .eq("organization_id", userRecord.organization_id)
        .in("category", ["twilio", "bland_ai", "openai", "persona", "doorloop", "google_sheets", "gmail", "authentication", "general"])
        .order("created_at", { ascending: false })
        .limit(200);

      const updatedServices: ServiceInfo[] = SERVICES_CONFIG.map((config) => {
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

        if (serviceLogs.length === 0) {
          // No logs found - unknown status
          return { ...config, status: "unknown" as ServiceStatus };
        }

        const latestLog = serviceLogs[0];
        const recentErrors = serviceLogs.filter(
          (log) =>
            (log.level === "error" || log.level === "critical") &&
            new Date(log.created_at!) > new Date(oneHourAgo)
        );

        // Determine status
        let status: ServiceStatus = "ok";
        
        if (latestLog.level === "error" || latestLog.level === "critical") {
          status = "error";
        } else if (latestLog.level === "warning" || recentErrors.length > 0) {
          status = "warning";
        }

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
      default:
        return "bg-gray-300";
    }
  };

  // Check if all services are healthy for the "Live" indicator
  const allHealthy = services.every((s) => s.status === "ok" || s.status === "unknown");
  const hasErrors = services.some((s) => s.status === "error");

  return (
    <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 max-w-[600px] overflow-x-auto scrollbar-thin">
      {/* Live System Indicator */}
      <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-border/50">
        <span className="relative flex h-2 w-2">
          {allHealthy && !hasErrors ? (
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
          allHealthy && !hasErrors ? "text-green-600" : hasErrors ? "text-red-600" : "text-amber-600"
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
            title={`${service.name}: ${service.status}`}
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
        <RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
      </Button>
    </div>
  );
};
