import React, { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

interface IntegrationStatus {
  key: string;
  label: string;
  status: "connected" | "warning" | "error" | "not_configured";
  lastTested?: string;
  message?: string;
}

const INTEGRATIONS = [
  { key: "twilio", label: "Twilio", credentialKeys: ["twilio_account_sid", "twilio_auth_token"] },
  { key: "bland_ai", label: "Bland.ai", credentialKeys: ["bland_api_key"] },
  { key: "openai", label: "OpenAI", credentialKeys: ["openai_api_key"] },
  { key: "persona", label: "Persona", credentialKeys: ["persona_api_key"] },
  { key: "maxmind", label: "MaxMind", credentialKeys: ["maxmind_account_id", "maxmind_license_key"] },
  { key: "doorloop", label: "Doorloop", credentialKeys: ["doorloop_api_key"] },
  { key: "resend", label: "Resend", credentialKeys: [] }, // Stored as env secret
];

export const IntegrationHealth: React.FC = () => {
  const { userRecord } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchIntegrationStatus = async () => {
    if (!userRecord?.organization_id) return;

    try {
      // Fetch credentials
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .single();

      // Fetch integration health statuses
      const { data: testLogs } = await supabase
        .from("integration_health")
        .select("*")
        .eq("organization_id", userRecord.organization_id);

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const statuses: IntegrationStatus[] = INTEGRATIONS.map((integration) => {
        // Check if credentials exist
        let hasCredentials = false;
        if (integration.key === "resend") {
          // Resend is stored as env secret, assume configured if we've had successful tests
          hasCredentials = true; // Will be verified by test
        } else if (creds) {
          hasCredentials = integration.credentialKeys.every((k) => {
            const value = creds[k as keyof typeof creds];
            return value && typeof value === "string" && value.length > 0;
          });
        }

        if (!hasCredentials && integration.key !== "resend") {
          return {
            key: integration.key,
            label: integration.label,
            status: "not_configured",
          };
        }

        // Find the health record for this service
        const healthRecord = testLogs?.find((row: any) => row.service === integration.key);

        if (!healthRecord) {
          if (integration.key === "resend") {
            return {
              key: integration.key,
              label: integration.label,
              status: "not_configured",
            };
          }
          return {
            key: integration.key,
            label: integration.label,
            status: "warning",
            message: "Not tested yet",
          };
        }

        const testDate = new Date(healthRecord.last_checked_at);
        const isHealthy = healthRecord.status === "healthy";

        if (!isHealthy) {
          return {
            key: integration.key,
            label: integration.label,
            status: "error",
            lastTested: healthRecord.last_checked_at,
            message: healthRecord.message,
          };
        }

        if (testDate < twentyFourHoursAgo) {
          return {
            key: integration.key,
            label: integration.label,
            status: "warning",
            lastTested: healthRecord.last_checked_at,
            message: "Test was over 24 hours ago",
          };
        }

        return {
          key: integration.key,
          label: integration.label,
          status: "connected",
          lastTested: healthRecord.last_checked_at,
          message: healthRecord.message,
        };
      });

      setIntegrations(statuses);
      setLastChecked(new Date());
    } catch (error) {
      console.error("Error fetching integration status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrationStatus();
  }, [userRecord?.organization_id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchIntegrationStatus();
    setRefreshing(false);
  };

  const getStatusColor = (status: IntegrationStatus["status"]) => {
    switch (status) {
      case "connected":
        return "bg-emerald-500";
      case "warning":
        return "bg-amber-500";
      case "error":
        return "bg-red-500";
      case "not_configured":
      default:
        return "bg-muted-foreground/30";
    }
  };

  const getStatusEmoji = (status: IntegrationStatus["status"]) => {
    switch (status) {
      case "connected":
        return "🟢";
      case "warning":
        return "🟡";
      case "error":
        return "🔴";
      case "not_configured":
      default:
        return "⚪";
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className="animate-pulse">
        <CardContent className="py-4">
          <div className="h-6 w-32 bg-muted rounded mb-3" />
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-20 bg-muted rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Integration Status</h3>
          <div className="flex items-center gap-2">
            {lastChecked && (
              <span className="text-xs text-muted-foreground">
                Last checked: {formatDistanceToNow(lastChecked, { addSuffix: true })}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <TooltipProvider>
          <div className="flex flex-wrap gap-2">
            {integrations.map((integration) => (
              <Tooltip key={integration.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                      border transition-colors cursor-default focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                      ${
                        integration.status === "connected"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-400"
                          : integration.status === "warning"
                          ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-400"
                          : integration.status === "error"
                          ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-400"
                          : "bg-muted/50 border-muted text-muted-foreground"
                      }
                    `}
                    aria-label={`${integration.label}: ${
                      integration.status === "connected" ? "Connected" :
                      integration.status === "warning" ? "Needs attention" :
                      integration.status === "error" ? "Connection failed" : "Not configured"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${getStatusColor(integration.status)}`}
                      aria-hidden="true"
                    />
                    {integration.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <p className="font-medium">
                      {getStatusEmoji(integration.status)}{" "}
                      {integration.status === "connected"
                        ? "Connected"
                        : integration.status === "warning"
                        ? "Needs attention"
                        : integration.status === "error"
                        ? "Connection failed"
                        : "Not configured"}
                    </p>
                    {integration.message && (
                      <p className="text-muted-foreground mt-1 max-w-[200px]">
                        {integration.message}
                      </p>
                    )}
                    {integration.lastTested && (
                      <p className="text-muted-foreground mt-1">
                        Tested: {formatDistanceToNow(new Date(integration.lastTested), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};
