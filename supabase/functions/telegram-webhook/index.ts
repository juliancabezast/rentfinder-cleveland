import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Commands that trigger a report
const REPORT_TRIGGERS = new Set([
  "report", "reporte", "r", "/report", "/reporte", "/r",
  "informe", "/informe", "status", "/status",
]);

// Help response
const HELP_TEXT = `<b>📊 Rent Finder Bot</b>

Comandos disponibles:
• <b>report</b> — Enviar reporte completo
• <b>status</b> — Igual que report
• <b>help</b> — Ver este mensaje

El reporte automático se envía cada hora.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const update = await req.json();

    // Telegram sends updates with a "message" object
    const message = update?.message;
    if (!message?.text || !message?.chat?.id) {
      // Not a text message, ignore silently
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim().toLowerCase();

    // ── Find organization by chat_id ────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("organization_id, telegram_bot_token")
      .eq("telegram_chat_id", chatId)
      .single();

    if (!creds) {
      // Unknown chat, respond with info
      await sendTelegramReply(
        chatId,
        "⚠️ This chat is not linked to any organization. Configure your Telegram Chat ID in Settings > Integrations.",
        update
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = creds.telegram_bot_token;
    const organizationId = creds.organization_id;

    // ── Handle commands ─────────────────────────────────────────
    if (REPORT_TRIGGERS.has(text)) {
      // Send "typing" action so user sees the bot is working
      await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      });

      // Invoke the hourly report function
      const reportResp = await fetch(`${supabaseUrl}/functions/v1/agent-hourly-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ organization_id: organizationId }),
      });

      const reportResult = await reportResp.json();

      if (!reportResp.ok || reportResult.error) {
        await sendTelegram(botToken, chatId,
          `❌ Error generating report: ${reportResult.error || "Unknown error"}`
        );
      }
      // If successful, agent-hourly-report already sends the message to Telegram

    } else if (text === "help" || text === "/help" || text === "ayuda" || text === "/ayuda") {
      await sendTelegram(botToken, chatId, HELP_TEXT);

    } else {
      // Unknown command — gentle nudge
      await sendTelegram(botToken, chatId,
        `💡 Escribe <b>report</b> para recibir el reporte, o <b>help</b> para ver comandos.`
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendTelegram(botToken: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

async function sendTelegramReply(chatId: string, text: string, update: any) {
  // For unknown chats we don't have the bot token, so we can't reply
  // This is a no-op fallback — the user needs to configure their chat_id first
  console.log(`Cannot reply to unlinked chat ${chatId}: ${text}`);
}
