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
    let { organization_id, message_sids } = await req.json();

    // ── Authenticate caller ────────────────────────────────────────
    // This runs with the service role and reads an org's Twilio credentials —
    // reject anonymous callers. Accept an internal service-role call (cron) OR a
    // logged-in user; for user callers, force the org from THEIR record so the
    // body-supplied organization_id can't be used to read another tenant's creds.
    const incomingAuth = req.headers.get("Authorization") || "";
    const callerToken = incomingAuth.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isServiceRole = callerToken.length > 0 && callerToken === serviceRoleKey;

    if (!isServiceRole) {
      if (!callerToken || callerToken === anonKey) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: authData, error: authErr } = await supabase.auth.getUser(callerToken);
      if (authErr || !authData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: callerRec } = await supabase
        .from("users")
        .select("organization_id, is_active")
        .eq("auth_user_id", authData.user.id)
        .single();
      if (!callerRec || callerRec.is_active === false || !callerRec.organization_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Force org from the caller's record — never trust the body value.
      organization_id = callerRec.organization_id;
    }

    if (!organization_id || !message_sids?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing organization_id or message_sids" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Twilio credentials
    const { data: creds, error: credsErr } = await supabase
      .from("organization_credentials")
      .select("twilio_account_sid, twilio_auth_token")
      .eq("organization_id", organization_id)
      .single();

    if (credsErr || !creds?.twilio_account_sid || !creds?.twilio_auth_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Twilio credentials not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { twilio_account_sid: sid, twilio_auth_token: token } = creds;
    const authHeader = "Basic " + btoa(`${sid}:${token}`);

    // Fetch each message from Twilio (max 20 per request to avoid timeouts)
    const sidsToFetch = (message_sids as string[]).slice(0, 20);
    const results: Record<string, { body: string; status: string; to: string; from: string; date_sent: string }> = {};

    await Promise.all(
      sidsToFetch.map(async (msgSid: string) => {
        try {
          const resp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${msgSid}.json`,
            { headers: { Authorization: authHeader } }
          );
          if (resp.ok) {
            const msg = await resp.json();
            results[msgSid] = {
              body: msg.body || "",
              status: msg.status || "unknown",
              to: msg.to || "",
              from: msg.from || "",
              date_sent: msg.date_sent || "",
            };
          }
        } catch (e) {
          console.warn(`Failed to fetch ${msgSid}:`, e);
        }
      })
    );

    return new Response(
      JSON.stringify({ success: true, messages: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-twilio-messages error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
