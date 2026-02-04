import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ServiceHealth {
  healthy: boolean;
  message: string;
  tested_at: string;
}

interface HealthReport {
  services: Record<string, ServiceHealth>;
  agents_affected: number;
  execution_ms: number;
}

interface Credentials {
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  bland_api_key?: string;
  openai_api_key?: string;
  persona_api_key?: string;
  doorloop_api_key?: string;
}

interface Agent {
  id: string;
  agent_key: string;
  biblical_name: string;
  required_services: string[] | null;
  status: string;
  is_enabled: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { service, organization_id, mode = "single" } = body;

    // Validate organization_id
    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing organization_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mode: single = test one service (backward compatible with test-integration)
    // Mode: full = test all services and update agent statuses
    if (mode === "single" && service) {
      const result = await testSingleService(supabase, organization_id, service);
      return new Response(
        JSON.stringify(result),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Full health check mode
    const healthReport = await runFullHealthCheck(supabase, organization_id, startTime);

    return new Response(
      JSON.stringify({
        success: true,
        ...healthReport
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Health checker error:", error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 }
    );
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function testSingleService(
  supabase: any,
  organizationId: string,
  service: string
): Promise<{ success: boolean; message: string }> {
  const startTime = Date.now();
  
  // Fetch org credentials
  const { data: creds } = await supabase
    .from("organization_credentials")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  const credentials = creds as Credentials | null;
  let success = false;
  let message = "";

  try {
    switch (service) {
      case "resend": {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (!resendKey) {
          message = "Resend API key not configured";
          break;
        }
        const resp = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${resendKey}` },
        });
        success = resp.ok;
        message = success ? "Resend connection successful" : `Resend error: ${resp.status}`;
        break;
      }

      case "twilio": {
        const sid = credentials?.twilio_account_sid;
        const token = credentials?.twilio_auth_token;
        if (!sid || !token) {
          message = "Missing Twilio credentials";
          break;
        }
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
          headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
        });
        success = resp.ok;
        if (!success) {
          const errorData = await resp.json().catch(() => ({}));
          message = `Twilio error: ${resp.status} - ${errorData.message || "Unknown error"}`;
        } else {
          message = "Twilio connection successful";
        }
        break;
      }

      case "bland_ai": {
        const key = credentials?.bland_api_key;
        if (!key) {
          message = "Missing Bland.ai API key";
          break;
        }
        const resp = await fetch("https://api.bland.ai/v1/agents", {
          headers: { Authorization: key },
        });
        success = resp.ok;
        message = success ? "Bland.ai connection successful" : `Bland.ai error: ${resp.status}`;
        break;
      }

      case "openai": {
        const key = credentials?.openai_api_key;
        if (!key) {
          message = "Missing OpenAI API key";
          break;
        }
        const resp = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        success = resp.ok;
        if (!success) {
          const errorData = await resp.json().catch(() => ({}));
          message = `OpenAI error: ${resp.status} - ${errorData.error?.message || "Unknown error"}`;
        } else {
          message = "OpenAI connection successful";
        }
        break;
      }

      case "persona": {
        const key = credentials?.persona_api_key;
        if (!key) {
          message = "Missing Persona API key";
          break;
        }
        const resp = await fetch("https://withpersona.com/api/v1/inquiries?page[size]=1", {
          headers: { Authorization: `Bearer ${key}`, "Persona-Version": "2023-01-05" },
        });
        success = resp.ok;
        message = success ? "Persona connection successful" : `Persona error: ${resp.status}`;
        break;
      }

      case "doorloop": {
        const key = credentials?.doorloop_api_key;
        if (!key) {
          message = "Missing Doorloop API key";
          break;
        }
        const resp = await fetch("https://api.doorloop.com/api/v1/properties?$top=1", {
          headers: { Authorization: `Bearer ${key}` },
        });
        success = resp.ok;
        message = success ? "Doorloop connection successful" : `Doorloop error: ${resp.status}`;
        break;
      }

      default:
        message = `Unknown service: ${service}`;
    }
  } catch (error) {
    success = false;
    message = error instanceof Error ? error.message : "Unknown error";
  }

  // Log result
  await logResult(supabase, organizationId, service, success, message, Date.now() - startTime);

  return { success, message };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runFullHealthCheck(
  supabase: any,
  organizationId: string,
  startTime: number
): Promise<HealthReport> {
  const services = ["twilio", "bland_ai", "openai", "persona", "doorloop", "resend"];
  const serviceHealth: Record<string, ServiceHealth> = {};

  // Fetch credentials once
  const { data: creds } = await supabase
    .from("organization_credentials")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  const credentials = creds as Credentials | null;

  // Test all services in parallel
  const testPromises = services.map(async (service) => {
    const testStart = Date.now();
    let healthy = false;
    let message = "";

    try {
      switch (service) {
        case "resend": {
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (!resendKey) {
            message = "Resend API key not configured";
            break;
          }
          const resp = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${resendKey}` },
          });
          healthy = resp.ok;
          message = healthy ? "Connected" : `Error: ${resp.status}`;
          break;
        }

        case "twilio": {
          const sid = credentials?.twilio_account_sid;
          const token = credentials?.twilio_auth_token;
          if (!sid || !token) {
            message = "Not configured";
            break;
          }
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
            headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
          });
          healthy = resp.ok;
          message = healthy ? "Connected" : `Error: ${resp.status}`;
          break;
        }

        case "bland_ai": {
          const key = credentials?.bland_api_key;
          if (!key) {
            message = "Not configured";
            break;
          }
          const resp = await fetch("https://api.bland.ai/v1/agents", {
            headers: { Authorization: key },
          });
          healthy = resp.ok;
          message = healthy ? "Connected" : `Error: ${resp.status}`;
          break;
        }

        case "openai": {
          const key = credentials?.openai_api_key;
          if (!key) {
            message = "Not configured";
            break;
          }
          const resp = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
          });
          healthy = resp.ok;
          message = healthy ? "Connected" : `Error: ${resp.status}`;
          break;
        }

        case "persona": {
          const key = credentials?.persona_api_key;
          if (!key) {
            message = "Not configured";
            break;
          }
          const resp = await fetch("https://withpersona.com/api/v1/inquiries?page[size]=1", {
            headers: { Authorization: `Bearer ${key}`, "Persona-Version": "2023-01-05" },
          });
          healthy = resp.ok;
          message = healthy ? "Connected" : `Error: ${resp.status}`;
          break;
        }

        case "doorloop": {
          const key = credentials?.doorloop_api_key;
          if (!key) {
            message = "Not configured";
            break;
          }
          const resp = await fetch("https://api.doorloop.com/api/v1/properties?$top=1", {
            headers: { Authorization: `Bearer ${key}` },
          });
          healthy = resp.ok;
          message = healthy ? "Connected" : `Error: ${resp.status}`;
          break;
        }
      }
    } catch (error) {
      healthy = false;
      message = error instanceof Error ? error.message : "Connection failed";
    }

    serviceHealth[service] = {
      healthy,
      message,
      tested_at: new Date().toISOString()
    };

    // Log individual service test
    await logResult(supabase, organizationId, service, healthy, message, Date.now() - testStart);
  });

  await Promise.all(testPromises);

  // Now update agent statuses based on service health
  const agentsAffected = await updateAgentStatuses(supabase, organizationId, serviceHealth);

  const executionMs = Date.now() - startTime;

  // Log the full health check completion
  await supabase.rpc("log_agent_activity", {
    p_organization_id: organizationId,
    p_agent_key: "health_checker",
    p_action: "full_health_check",
    p_status: "success",
    p_message: `Health check complete: ${Object.values(serviceHealth).filter(s => s.healthy).length}/${services.length} services healthy, ${agentsAffected} agents affected`,
    p_details: { services: serviceHealth, agents_affected: agentsAffected },
    p_lead_id: null,
    p_call_id: null,
    p_showing_id: null,
    p_property_id: null,
    p_task_id: null,
    p_execution_ms: executionMs,
    p_cost: 0
  });

  return {
    services: serviceHealth,
    agents_affected: agentsAffected,
    execution_ms: executionMs
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateAgentStatuses(
  supabase: any,
  organizationId: string,
  serviceHealth: Record<string, ServiceHealth>
): Promise<number> {
  let agentsAffected = 0;

  // Fetch all agents for this organization
  const { data: agents, error } = await supabase
    .from("agents_registry")
    .select("id, agent_key, biblical_name, required_services, status, is_enabled")
    .eq("organization_id", organizationId);

  if (error || !agents) {
    console.error("Failed to fetch agents:", error);
    return 0;
  }

  for (const agentData of agents) {
    const agent = agentData as Agent;
    
    // Skip disabled agents
    if (!agent.is_enabled) continue;

    const requiredServices = agent.required_services || [];
    if (requiredServices.length === 0) continue;

    // Check if all required services are healthy
    const allHealthy = requiredServices.every((service: string) => {
      const health = serviceHealth[service];
      return health?.healthy === true;
    });

    const unhealthyServices = requiredServices.filter((service: string) => {
      const health = serviceHealth[service];
      return health?.healthy !== true;
    });

    let newStatus = agent.status;
    let statusChanged = false;

    if (!allHealthy && agent.status !== "degraded" && agent.status !== "disabled") {
      // At least one required service is down - degrade the agent
      newStatus = "degraded";
      statusChanged = true;
    } else if (allHealthy && agent.status === "degraded") {
      // All services are back up - restore to idle
      newStatus = "idle";
      statusChanged = true;
    }

    if (statusChanged) {
      await supabase
        .from("agents_registry")
        .update({ 
          status: newStatus,
          last_error_message: newStatus === "degraded" 
            ? `Degraded due to unhealthy services: ${unhealthyServices.join(", ")}`
            : null,
          last_error_at: newStatus === "degraded" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq("id", agent.id);

      // Log the status change
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organizationId,
        p_agent_key: "health_checker",
        p_action: "agent_status_changed",
        p_status: newStatus === "degraded" ? "failure" : "success",
        p_message: newStatus === "degraded"
          ? `Agent ${agent.biblical_name} degraded: required services down (${unhealthyServices.join(", ")})`
          : `Agent ${agent.biblical_name} restored: all required services healthy`,
        p_details: { 
          agent_key: agent.agent_key,
          old_status: agent.status,
          new_status: newStatus,
          required_services: requiredServices,
          unhealthy_services: unhealthyServices
        },
        p_lead_id: null,
        p_call_id: null,
        p_showing_id: null,
        p_property_id: null,
        p_task_id: null,
        p_execution_ms: 0,
        p_cost: 0
      });

      agentsAffected++;
    }
  }

  return agentsAffected;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logResult(
  supabase: any,
  organizationId: string,
  service: string,
  success: boolean,
  message: string,
  executionMs: number
) {
  const categoryMap: Record<string, string> = {
    twilio: "twilio",
    bland_ai: "bland_ai",
    openai: "openai",
    persona: "persona",
    doorloop: "doorloop",
    resend: "general",
  };

  await supabase.from("system_logs").insert({
    organization_id: organizationId,
    level: success ? "info" : "error",
    category: categoryMap[service] || "general",
    event_type: "integration_test",
    message,
    details: { 
      service, 
      success, 
      tested_at: new Date().toISOString(),
      execution_ms: executionMs
    },
  });
}
