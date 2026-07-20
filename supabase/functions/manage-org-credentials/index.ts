// Broker for organization_credentials. Client can no longer read/write this
// table directly. This function authenticates the caller, verifies they are
// an admin/super_admin in their own organization, and returns non-secret
// metadata (which keys are configured + masked last-4) or performs writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SECRET_FIELDS = new Set([
  "twilio_account_sid",
  "twilio_auth_token",
  "openai_api_key",
  "doorloop_api_key",
  "resend_api_key",
  "telegram_bot_token",
  "telegram_showings_bot_token",
  "telegram_funnel_bot_token",
  "telegram_route_bot_token",
]);

// Fields that are safe to return in cleartext (public identifiers, not secrets).
const PUBLIC_FIELDS = new Set([
  "twilio_phone_number",
  "twilio_whatsapp_number",
  "telegram_chat_id",
  "telegram_showings_chat_id",
  "telegram_funnel_chat_id",
  "telegram_route_chat_id",
]);

const ALL_FIELDS = [...SECRET_FIELDS, ...PUBLIC_FIELDS];

function mask(v: string | null | undefined): string {
  if (!v) return "";
  if (v.length <= 4) return "••••" + v;
  return "••••••••" + v.slice(-4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token === anonKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData } = await admin.auth.getUser(token);
    if (!authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: caller } = await admin
      .from("users")
      .select("role, is_active, organization_id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (!caller || caller.is_active === false || !["super_admin", "admin"].includes(caller.role || "")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = caller.organization_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "get_status") {
      const { data: creds } = await admin
        .from("organization_credentials")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();

      const result: Record<string, { configured: boolean; masked: string; value?: string }> = {};
      for (const f of ALL_FIELDS) {
        const raw = (creds as any)?.[f] as string | null;
        const configured = !!(raw && typeof raw === "string" && raw.length > 0);
        const entry: { configured: boolean; masked: string; value?: string } = {
          configured,
          masked: configured ? mask(raw) : "",
        };
        if (configured && PUBLIC_FIELDS.has(f)) entry.value = raw!;
        result[f] = entry;
      }
      return new Response(JSON.stringify({ fields: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_field") {
      const field = String(body?.field || "");
      const value = String(body?.value ?? "");
      if (!ALL_FIELDS.includes(field)) {
        return new Response(JSON.stringify({ error: "Invalid field" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await admin
        .from("organization_credentials")
        .select("id")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (existing) {
        const { error } = await admin
          .from("organization_credentials")
          .update({ [field]: value, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId);
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("organization_credentials")
          .insert({ organization_id: orgId, [field]: value });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_fields") {
      const fields = body?.fields as Record<string, string> | undefined;
      if (!fields || typeof fields !== "object") {
        return new Response(JSON.stringify({ error: "Invalid fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (!ALL_FIELDS.includes(k)) continue;
        payload[k] = String(v ?? "");
      }
      if (Object.keys(payload).length === 0) {
        return new Response(JSON.stringify({ error: "No valid fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await admin
        .from("organization_credentials")
        .select("id")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (existing) {
        const { error } = await admin
          .from("organization_credentials")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId);
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("organization_credentials")
          .insert({ organization_id: orgId, ...payload });
        if (error) throw error;
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-org-credentials error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
