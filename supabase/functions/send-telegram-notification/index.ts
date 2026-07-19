import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_user_id", user.id)
      .single();
    if (!callerRecord?.organization_id) {
      return new Response(JSON.stringify({ error: "User has no organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message : "";
    const channel = body.channel === "showings" ? "showings" : "general";
    if (!message || message.length > 4000) {
      return new Response(JSON.stringify({ error: "Invalid message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read credentials server-side (settings = legacy fallback only; route
    // creds moved into organization_credentials 2026-07-19)
    const [{ data: creds }, { data: routeSettings }] = await Promise.all([
      supabase
        .from("organization_credentials")
        .select("telegram_bot_token, telegram_chat_id, telegram_route_bot_token, telegram_route_chat_id")
        .eq("organization_id", callerRecord.organization_id)
        .single(),
      supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", callerRecord.organization_id)
        .in("key", ["telegram_route_bot_token", "telegram_route_chat_id"]),
    ]);

    const unwrapVal = (v: unknown) => {
      if (v == null) return undefined;
      const str = String(v);
      try { const p = JSON.parse(str); return typeof p === "string" ? p : str; } catch { return str; }
    };
    const settingsMap = new Map((routeSettings || []).map((s: { key: string; value: string }) => [s.key, unwrapVal(s.value)]));

    let botToken: string | undefined;
    let chatId: string | undefined;
    if (channel === "showings") {
      // Showing-related cards now live with LeasingAgent (route bot) — the old
      // Hot Leads bot is parked (2026-07-19 restructure). Pair token+chat
      // atomically; fall back to the general bot.
      const rTok = (creds?.telegram_route_bot_token || settingsMap.get("telegram_route_bot_token")) as string | undefined;
      const rChat = (creds?.telegram_route_chat_id || settingsMap.get("telegram_route_chat_id")) as string | undefined;
      const useRoute = !!rTok && !!rChat;
      botToken = useRoute ? rTok : creds?.telegram_bot_token;
      chatId = useRoute ? rChat : creds?.telegram_chat_id;
    } else {
      botToken = creds?.telegram_bot_token;
      chatId = creds?.telegram_chat_id;
    }

    if (!botToken || !chatId) {
      return new Response(JSON.stringify({ ok: false, skipped: "not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgResp.ok) {
      console.warn("Telegram sendMessage failed:", tgResp.status);
      return new Response(JSON.stringify({ ok: false }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-telegram-notification error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
