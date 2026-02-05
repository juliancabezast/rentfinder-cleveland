import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://glzzzthgotfwoiaranmp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY");

// Headers for the Leads sheet
const SHEET_HEADERS = [
  "Timestamp",
  "Name",
  "Phone",
  "Email",
  "Source",
  "Interested Property",
  "Status",
  "Lead Score",
  "Has Voucher",
  "Created At",
];

/**
 * Create a JWT for Google service account authentication
 */
async function createServiceAccountJWT(): Promise<string> {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error("Google service account credentials not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodeBase64Url = (data: string) =>
    btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = encodeBase64Url(JSON.stringify(header));
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const signatureInput = `${headerB64}.${payloadB64}`;

  // Parse the private key
  const pemKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const pemContents = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const signatureB64 = encodeBase64Url(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${signatureInput}.${signatureB64}`;
}

/**
 * Get access token from Google OAuth
 */
async function getGoogleAccessToken(): Promise<string> {
  const jwt = await createServiceAccountJWT();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google OAuth error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { task_id, lead_id, organization_id, context } = await req.json();
    const operation = context?.operation || "append";

    console.log(`[Matthew] Starting sheets backup for lead ${lead_id}, operation: ${operation}`);

    // Update task to in_progress
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "in_progress", executed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    // Check if Google credentials are configured
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      console.log(`[Matthew] No Google service account configured, skipping backup`);

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "sheets_backup",
        p_action: "skip_backup",
        p_status: "success",
        p_message: "No Google service account configured, backup skipped",
        p_related_lead_id: lead_id,
      });

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_google_credentials" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org's Google Sheets ID
    const { data: sheetsSetting } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("organization_id", organization_id)
      .eq("key", "google_sheets_id")
      .single();

    const sheetsId = sheetsSetting?.value;

    if (!sheetsId) {
      console.log(`[Matthew] No Google Sheets ID configured for org, skipping backup`);

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "sheets_backup",
        p_action: "skip_backup",
        p_status: "success",
        p_message: "No Google Sheets ID configured, backup skipped",
        p_related_lead_id: lead_id,
      });

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_sheets_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data via RPC (or directly if RPC doesn't exist)
    let leadData: any;
    try {
      const { data, error } = await supabase.rpc("format_lead_for_sheets", {
        p_lead_id: lead_id,
      });
      if (error) throw error;
      leadData = data;
    } catch {
      // Fallback to direct query
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select(`
          *,
          properties:interested_property_id (address, city)
        `)
        .eq("id", lead_id)
        .single();

      if (leadError || !lead) {
        throw new Error(`Lead not found: ${leadError?.message}`);
      }

      leadData = {
        timestamp: new Date().toISOString(),
        name: lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown",
        phone: lead.phone,
        email: lead.email || "",
        source: lead.source,
        interested_property: lead.properties
          ? `${lead.properties.address}, ${lead.properties.city}`
          : "",
        status: lead.status,
        lead_score: lead.lead_score || 0,
        has_voucher: lead.has_voucher ? "Yes" : "No",
        created_at: lead.created_at,
      };
    }

    // Get Google access token
    const accessToken = await getGoogleAccessToken();

    const sheetsApiBase = `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}`;
    const authHeaders = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // Format row data
    const rowData = [
      leadData.timestamp || new Date().toISOString(),
      leadData.name || "",
      leadData.phone || "",
      leadData.email || "",
      leadData.source || "",
      leadData.interested_property || "",
      leadData.status || "",
      String(leadData.lead_score || 0),
      leadData.has_voucher || "No",
      leadData.created_at || "",
    ];

    let result: { operation: string; row?: number };

    if (operation === "update") {
      // Search for existing row by phone number
      const searchResponse = await fetch(
        `${sheetsApiBase}/values/Leads!A:J`,
        { headers: authHeaders }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const values = searchData.values || [];
        
        // Find row with matching phone
        let targetRow = -1;
        for (let i = 1; i < values.length; i++) {
          if (values[i][2] === leadData.phone) {
            targetRow = i + 1; // 1-indexed
            break;
          }
        }

        if (targetRow > 0) {
          // Update existing row
          const updateResponse = await fetch(
            `${sheetsApiBase}/values/Leads!A${targetRow}:J${targetRow}?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: authHeaders,
              body: JSON.stringify({ values: [rowData] }),
            }
          );

          if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`Sheets update error: ${updateResponse.status} - ${errorText}`);
          }

          result = { operation: "update", row: targetRow };
        } else {
          // No existing row found, append instead
          operation === "append";
        }
      }
    }

    if (operation === "append" || !result!) {
      // Check if headers exist, create if not
      const checkResponse = await fetch(
        `${sheetsApiBase}/values/Leads!A1:J1`,
        { headers: authHeaders }
      );

      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        const existingHeaders = checkData.values?.[0];

        if (!existingHeaders || existingHeaders.length === 0) {
          // Create headers
          await fetch(
            `${sheetsApiBase}/values/Leads!A1:J1?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: authHeaders,
              body: JSON.stringify({ values: [SHEET_HEADERS] }),
            }
          );
        }
      }

      // Append new row
      const appendResponse = await fetch(
        `${sheetsApiBase}/values/Leads!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ values: [rowData] }),
        }
      );

      if (!appendResponse.ok) {
        const errorText = await appendResponse.text();

        // If sheet doesn't exist, try to create it
        if (appendResponse.status === 400 && errorText.includes("Unable to parse range")) {
          // Create the Leads sheet
          await fetch(`${sheetsApiBase}:batchUpdate`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              requests: [
                {
                  addSheet: {
                    properties: { title: "Leads" },
                  },
                },
              ],
            }),
          });

          // Add headers
          await fetch(
            `${sheetsApiBase}/values/Leads!A1:J1?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: authHeaders,
              body: JSON.stringify({ values: [SHEET_HEADERS] }),
            }
          );

          // Retry append
          const retryResponse = await fetch(
            `${sheetsApiBase}/values/Leads!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ values: [rowData] }),
            }
          );

          if (!retryResponse.ok) {
            const retryError = await retryResponse.text();
            throw new Error(`Sheets append retry error: ${retryResponse.status} - ${retryError}`);
          }

          const retryData = await retryResponse.json();
          result = {
            operation: "append",
            row: parseInt(retryData.updates?.updatedRange?.match(/\d+$/)?.[0] || "0"),
          };
        } else {
          throw new Error(`Sheets append error: ${appendResponse.status} - ${errorText}`);
        }
      } else {
        const appendData = await appendResponse.json();
        result = {
          operation: "append",
          row: parseInt(appendData.updates?.updatedRange?.match(/\d+$/)?.[0] || "0"),
        };
      }
    }

    // Log activity (Google Sheets is free)
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "sheets_backup",
      p_action: result!.operation,
      p_status: "success",
      p_message: `${result!.operation === "append" ? "Appended" : "Updated"} lead in Google Sheets row ${result!.row}`,
      p_related_lead_id: lead_id,
      p_details: { sheets_id: sheetsId, row: result!.row },
    });

    // Mark task completed
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        operation: result!.operation,
        row: result!.row,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Matthew] Error:", errorMessage);

    // Log error
    try {
      const { task_id, lead_id, organization_id } = await req.json().catch(() => ({}));
      
      if (organization_id) {
        await supabase.rpc("log_agent_activity", {
          p_organization_id: organization_id,
          p_agent_key: "sheets_backup",
          p_action: "backup_error",
          p_status: "error",
          p_message: errorMessage,
          p_related_lead_id: lead_id,
        });
      }

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
    } catch (e) {
      console.error("[Matthew] Failed to log error:", e);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
