import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Services to check and their test methods
const SERVICES = [
  "twilio",
  "bland",
  "openai",
  "resend",
  "doorloop",
  "persona",
  "supabase",
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { organization_id, mode } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Get org credentials ────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    const results: Array<{
      service: string;
      status: string;
      message: string;
      response_time_ms: number;
    }> = [];

    // ── Check each service ─────────────────────────────────────────
    for (const service of SERVICES) {
      const start = Date.now();
      let status = "unknown";
      let message = "";

      try {
        switch (service) {
          case "twilio": {
            const sid = creds?.twilio_account_sid;
            const token = creds?.twilio_auth_token;
            if (!sid || !token) {
              status = "not_configured";
              message = "Credentials not set";
              break;
            }
            const resp = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
              {
                headers: {
                  Authorization: "Basic " + btoa(`${sid}:${token}`),
                },
              }
            );
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "bland": {
            const apiKey = creds?.bland_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch("https://api.bland.ai/v1/calls", {
              headers: { Authorization: apiKey },
            });
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "openai": {
            const apiKey = creds?.openai_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch("https://api.openai.com/v1/models", {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "resend": {
            const apiKey =
              creds?.resend_api_key || Deno.env.get("RESEND_API_KEY");
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch("https://api.resend.com/api-keys", {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "doorloop": {
            const apiKey = creds?.doorloop_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch(
              "https://app.doorloop.com/api/v1/properties?page_size=1",
              { headers: { Authorization: `Bearer ${apiKey}` } }
            );
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "persona": {
            const apiKey = creds?.persona_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "Not configured";
              break;
            }
            status = "connected";
            message = "Credentials saved";
            break;
          }

          case "supabase": {
            // Check DB is reachable
            const { error: dbErr } = await supabase
              .from("organizations")
              .select("id")
              .limit(1)
              .single();
            status = !dbErr ? "connected" : "error";
            message = !dbErr ? "OK" : dbErr.message;
            break;
          }
        }
      } catch (e) {
        status = "error";
        message = (e as Error).message;
      }

      const elapsed = Date.now() - start;

      results.push({
        service,
        status,
        message,
        response_time_ms: elapsed,
      });

      // ── Upsert to integration_health ─────────────────────────────
      await supabase.from("integration_health").upsert(
        {
          organization_id,
          service_name: service,
          status,
          last_checked_at: new Date().toISOString(),
          response_time_ms: elapsed,
          error_message: status === "error" ? message : null,
        },
        { onConflict: "organization_id,service_name" }
      );
    }

    // ── Record cost (Zacchaeus) ────────────────────────────────────
    try {
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: organization_id,
        p_service: "openai",
        p_usage_quantity: 1,
        p_usage_unit: "health_check",
        p_unit_cost: 0,
        p_total_cost: 0,
        p_lead_id: null,
      });
    } catch {
      // Non-blocking
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("agent-health-checker error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Health check failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
