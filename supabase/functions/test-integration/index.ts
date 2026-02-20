import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { service, organization_id } = await req.json();

    if (!service || !organization_id) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing service or organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org credentials
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    let success = false;
    let message = "";

    switch (service) {
      case "twilio": {
        const sid = creds?.twilio_account_sid;
        const token = creds?.twilio_auth_token;
        if (!sid || !token) {
          message = "Twilio credentials not configured";
          break;
        }
        try {
          const resp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
            {
              headers: {
                Authorization: "Basic " + btoa(`${sid}:${token}`),
              },
            }
          );
          if (resp.ok) {
            const data = await resp.json();
            success = true;
            message = `Connected — Account: ${data.friendly_name || sid}`;
          } else {
            message = `Authentication failed (${resp.status})`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "bland": {
        const apiKey = creds?.bland_api_key;
        if (!apiKey) {
          message = "Bland.ai API key not configured";
          break;
        }
        try {
          const resp = await fetch("https://api.bland.ai/v1/calls", {
            method: "GET",
            headers: { Authorization: apiKey },
          });
          if (resp.ok || resp.status === 200) {
            success = true;
            message = "Connected — Bland.ai API key is valid";
          } else {
            message = `Authentication failed (${resp.status})`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "openai": {
        const apiKey = creds?.openai_api_key;
        if (!apiKey) {
          message = "OpenAI API key not configured";
          break;
        }
        try {
          const resp = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (resp.ok) {
            success = true;
            message = "Connected — OpenAI API key is valid";
          } else {
            message = `Authentication failed (${resp.status})`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "resend": {
        const apiKey = creds?.resend_api_key || Deno.env.get("RESEND_API_KEY");
        if (!apiKey) {
          message = "Resend API key not configured";
          break;
        }
        try {
          // Send a real test email to verify the key works
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Rent Finder Cleveland <support@rentfindercleveland.com>",
              to: ["delivered@resend.dev"],
              subject: "Integration Test",
              html: "<p>Connection verified.</p>",
            }),
          });
          if (resp.ok) {
            success = true;
            message = "Connected — test email sent successfully";
          } else {
            const errData = await resp.json();
            message = `API error: ${errData.message || resp.status}`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "doorloop": {
        const apiKey = creds?.doorloop_api_key;
        if (!apiKey) {
          message = "DoorLoop API key not configured";
          break;
        }
        try {
          const resp = await fetch(
            "https://app.doorloop.com/api/v1/properties?page_size=1",
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );
          if (resp.ok) {
            success = true;
            message = "Connected — DoorLoop API key is valid";
          } else {
            message = `Authentication failed (${resp.status})`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "persona": {
        const apiKey = creds?.persona_api_key;
        if (!apiKey) {
          message = "Persona API key not configured";
          break;
        }
        try {
          const resp = await fetch(
            "https://withpersona.com/api/v1/inquiry-templates",
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Persona-Version": "2023-01-05",
              },
            }
          );
          if (resp.ok) {
            success = true;
            message = "Connected — Persona API key is valid";
          } else {
            message = `Authentication failed (${resp.status})`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "maxmind": {
        const accountId = creds?.maxmind_account_id;
        const licenseKey = creds?.maxmind_license_key;
        if (!accountId || !licenseKey) {
          message = "MaxMind credentials not configured (need Account ID + License Key)";
          break;
        }
        try {
          const resp = await fetch(
            "https://minfraud.maxmind.com/minfraud/v2.0/score",
            {
              method: "POST",
              headers: {
                Authorization: "Basic " + btoa(`${accountId}:${licenseKey}`),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                device: { ip_address: "81.2.69.160" },
              }),
            }
          );
          if (resp.ok) {
            success = true;
            message = "Connected — MaxMind minFraud credentials are valid";
          } else if (resp.status === 401) {
            message = "Authentication failed — check Account ID and License Key";
          } else {
            message = `API error (${resp.status})`;
          }
        } catch (e) {
          message = `Connection error: ${(e as Error).message}`;
        }
        break;
      }

      case "google_sheets": {
        const cred = creds?.google_sheets_credentials;
        if (!cred) {
          message = "Google Sheets credentials not configured";
          break;
        }
        success = true;
        message = "Credentials saved — connection verified on next backup";
        break;
      }

      default:
        message = `Unknown service: ${service}`;
    }

    // Update integration_health table
    const healthStatus = success ? "healthy" : "down";
    await supabase.from("integration_health").upsert(
      {
        organization_id,
        service: service,
        status: healthStatus,
        last_checked_at: new Date().toISOString(),
        message: success ? "OK" : message,
        last_healthy_at: success ? new Date().toISOString() : undefined,
        consecutive_failures: success ? 0 : 1,
      },
      { onConflict: "organization_id,service" }
    );

    return new Response(
      JSON.stringify({ success, message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("test-integration error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        message: (err as Error).message || "Integration test failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
