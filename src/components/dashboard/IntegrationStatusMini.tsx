import React, { useState, useEffect } from "react";
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
  lastCheck?: string;
}

export const IntegrationStatusMini: React.FC = () => {
  const { userRecord } = useAuth();
  const [services, setServices] = useState<ServiceInfo[]>([
    { name: "Twilio", shortName: "Twilio", status: "unknown" },
    { name: "Bland.ai", shortName: "Bland", status: "unknown" },
    { name: "OpenAI", shortName: "OpenAI", status: "unknown" },
    { name: "Resend", shortName: "Resend", status: "unknown" },
  ]);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    if (!userRecord?.organization_id) return;

    setChecking(true);
    try {
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .single();

      setServices([
        {
          name: "Twilio",
          shortName: "Twilio",
          status: creds?.twilio_account_sid && creds?.twilio_auth_token ? "ok" : "error",
          lastCheck: new Date().toISOString(),
        },
        {
          name: "Bland.ai",
          shortName: "Bland",
          status: creds?.bland_api_key ? "ok" : "error",
          lastCheck: new Date().toISOString(),
        },
        {
          name: "OpenAI",
          shortName: "OpenAI",
          status: creds?.openai_api_key ? "ok" : "error",
          lastCheck: new Date().toISOString(),
        },
        {
          name: "Resend",
          shortName: "Resend",
          status: "ok", // Resend uses env var, assume ok if project is running
          lastCheck: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Error checking integration status:", error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [userRecord?.organization_id]);

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

  return (
    <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50">
      {services.map((service) => (
        <div
          key={service.name}
          className="flex items-center gap-1"
          title={`${service.name}: ${service.status}`}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", getStatusColor(service.status))}
          />
          <span className="text-[10px] text-muted-foreground">
            {service.shortName}
          </span>
        </div>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 ml-1"
        onClick={checkStatus}
        disabled={checking}
      >
        <RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
      </Button>
    </div>
  );
};
