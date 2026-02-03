import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service, organization_id } = await req.json();

    if (!service || !organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing service or organization_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch org credentials
    const { data: creds, error: credsError } = await supabase
      .from("organization_credentials")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    // For resend, we use the environment variable
    if (service === "resend") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        await logResult(supabase, organization_id, service, false, "Resend API key not configured");
        return new Response(
          JSON.stringify({ success: false, message: "Resend API key not configured" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      try {
        const resp = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${resendKey}` },
        });
        const success = resp.ok;
        const message = success ? "Resend connection successful" : `Resend error: ${resp.status}`;
        await logResult(supabase, organization_id, service, success, message);
        return new Response(
          JSON.stringify({ success, message }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await logResult(supabase, organization_id, service, false, errorMessage);
        return new Response(
          JSON.stringify({ success: false, message: errorMessage }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!creds) {
      return new Response(
        JSON.stringify({ success: false, error: "No credentials found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let success = false;
    let message = "";

    try {
      switch (service) {
        case "twilio": {
          const sid = creds.twilio_account_sid;
          const token = creds.twilio_auth_token;
          if (!sid || !token) throw new Error("Missing Twilio credentials");

          // Test: fetch account info
          const resp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
            {
              headers: {
                Authorization: "Basic " + btoa(`${sid}:${token}`),
              },
            }
          );
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
          const key = creds.bland_api_key;
          if (!key) throw new Error("Missing Bland.ai API key");

          // Test: list agents or account info
          const resp = await fetch("https://api.bland.ai/v1/agents", {
            headers: { Authorization: key },
          });
          success = resp.ok;
          message = success
            ? "Bland.ai connection successful"
            : `Bland.ai error: ${resp.status}`;
          break;
        }

        case "openai": {
          const key = creds.openai_api_key;
          if (!key) throw new Error("Missing OpenAI API key");

          // Test: list models (lightweight endpoint)
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
          const key = creds.persona_api_key;
          if (!key) throw new Error("Missing Persona API key");

          // Test: list inquiries or check API
          const resp = await fetch(
            "https://withpersona.com/api/v1/inquiries?page[size]=1",
            {
              headers: {
                Authorization: `Bearer ${key}`,
                "Persona-Version": "2023-01-05",
              },
            }
          );
          success = resp.ok;
          message = success
            ? "Persona connection successful"
            : `Persona error: ${resp.status}`;
          break;
        }

        case "doorloop": {
          const key = creds.doorloop_api_key;
          if (!key) throw new Error("Missing Doorloop API key");

          // Test: fetch properties endpoint
          const resp = await fetch(
            "https://api.doorloop.com/api/v1/properties?$top=1",
            {
              headers: { Authorization: `Bearer ${key}` },
            }
          );
          success = resp.ok;
          message = success
            ? "Doorloop connection successful"
            : `Doorloop error: ${resp.status}`;
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
    await logResult(supabase, organization_id, service, success, message);

    return new Response(JSON.stringify({ success, message }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (error) {
    console.error("Error in test-integration:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});

async function logResult(
  supabase: any,
  organizationId: string,
  service: string,
  success: boolean,
  message: string
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
    details: { service, success, tested_at: new Date().toISOString() },
  });
}
