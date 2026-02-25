import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_LABELS: Record<string, string> = {
  inbound_call: "inbound call",
  hemlane_email: "Hemlane",
  hemlane: "Hemlane",
  website: "website",
  referral: "referral",
  manual: "manual",
  sms: "SMS",
  campaign: "campaign",
  csv_import: "CSV import",
};

const AGENT_LABELS: Record<string, string> = {
  recapture: "recapture",
  no_show_follow_up: "no-show follow-up",
  showing_confirmation: "confirmation",
  post_showing: "post-showing",
  campaign: "campaign",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let organizationId = "";

  try {
    const body = await req.json().catch(() => ({}));
    organizationId = body.organization_id || "";

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get Telegram credentials ──────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("organization_id", organizationId)
      .single();

    if (!creds?.telegram_bot_token || !creds?.telegram_chat_id) {
      return new Response(
        JSON.stringify({ error: "Telegram credentials not configured. Add them in Settings > Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get org name + timezone ───────────────────────────────────
    const { data: org } = await supabase
      .from("organizations")
      .select("name, timezone")
      .eq("id", organizationId)
      .single();

    const timezone = org?.timezone || "America/New_York";
    const orgName = org?.name || "Rent Finder";

    // ── Time window: last 1 hour ──────────────────────────────────
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const since = oneHourAgo.toISOString();

    // ── Parallel queries ──────────────────────────────────────────
    const [
      leadsRes,
      callsRes,
      showingsConfirmedRes,
      showingsCompletedRes,
      showingsNoShowRes,
      tasksRes,
      errorsRes,
    ] = await Promise.all([
      // New leads
      supabase
        .from("leads")
        .select("id, source")
        .eq("organization_id", organizationId)
        .gte("created_at", since),
      // Calls
      supabase
        .from("calls")
        .select("id, direction, agent_type, duration_seconds, cost_total")
        .eq("organization_id", organizationId)
        .gte("started_at", since),
      // Showings confirmed
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "confirmed")
        .gte("updated_at", since),
      // Showings completed
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", since),
      // Showings no-show
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "no_show")
        .gte("updated_at", since),
      // Agent tasks completed
      supabase
        .from("agent_tasks")
        .select("id, agent_type, action_type")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", since),
      // Errors
      supabase
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("level", ["error", "critical"])
        .gte("created_at", since),
    ]);

    // ── Process leads ─────────────────────────────────────────────
    const newLeads = leadsRes.data || [];
    const newLeadsCount = newLeads.length;
    const leadsBySource: Record<string, number> = {};
    newLeads.forEach((l: any) => {
      const src = l.source || "unknown";
      leadsBySource[src] = (leadsBySource[src] || 0) + 1;
    });
    const sourceBreakdown = Object.entries(leadsBySource)
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => `${count} ${SOURCE_LABELS[src] || src}`)
      .join(", ");

    // ── Process calls ─────────────────────────────────────────────
    const calls = callsRes.data || [];
    const totalCalls = calls.length;
    const inboundCalls = calls.filter((c: any) => c.direction === "inbound").length;
    const outboundCalls = calls.filter((c: any) => c.direction === "outbound").length;
    const totalDurationMin = Math.round(
      calls.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0) / 60
    );
    const callCost = calls.reduce(
      (sum: number, c: any) => sum + parseFloat(c.cost_total || "0"), 0
    );

    // ── Process showings ──────────────────────────────────────────
    const confirmedCount = showingsConfirmedRes.count || 0;
    const completedCount = showingsCompletedRes.count || 0;
    const noShowCount = showingsNoShowRes.count || 0;

    // ── Process agent tasks ───────────────────────────────────────
    const completedTasks = tasksRes.data || [];
    const totalTasks = completedTasks.length;
    const tasksByType: Record<string, number> = {};
    completedTasks.forEach((t: any) => {
      const type = t.agent_type || "other";
      tasksByType[type] = (tasksByType[type] || 0) + 1;
    });
    const taskBreakdown = Object.entries(tasksByType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${count} ${AGENT_LABELS[type] || type.replace(/_/g, " ")}`)
      .join(", ");

    // ── Process errors ────────────────────────────────────────────
    const errorCount = errorsRes.count || 0;

    // ── Format timestamp ──────────────────────────────────────────
    const hourLabel = now.toLocaleString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // ── Build message ─────────────────────────────────────────────
    const lines: string[] = [
      `<b>📊 ${orgName} — ${hourLabel}</b>`,
      ``,
      `👥 <b>Leads:</b> ${newLeadsCount} new${sourceBreakdown ? ` (${sourceBreakdown})` : ""}`,
      `📞 <b>Calls:</b> ${totalCalls} total${totalCalls > 0 ? ` (${outboundCalls} out, ${inboundCalls} in) · ${totalDurationMin} min` : ""}`,
      `🤖 <b>Agents:</b> ${totalTasks} tasks${taskBreakdown ? ` (${taskBreakdown})` : ""}`,
      `🏠 <b>Showings:</b> ${confirmedCount} confirmed, ${completedCount} completed, ${noShowCount} no-show`,
      `⚠️ <b>Errors:</b> ${errorCount}`,
      ``,
      `💰 <b>Est. cost:</b> $${callCost.toFixed(2)}`,
    ];

    // Quiet hour note
    const isQuiet = newLeadsCount === 0 && totalCalls === 0 && totalTasks === 0;
    if (isQuiet) {
      lines.push(``, `😴 <i>Quiet hour — no activity</i>`);
    }

    const message = lines.join("\n");

    // ── Send to Telegram ──────────────────────────────────────────
    const telegramUrl = `https://api.telegram.org/bot${creds.telegram_bot_token}/sendMessage`;
    const telegramResp = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: creds.telegram_chat_id,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const telegramResult = await telegramResp.json();

    if (!telegramResp.ok) {
      throw new Error(
        `Telegram API error: ${telegramResult.description || telegramResp.status}`
      );
    }

    // ── Log success ───────────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "hourly_report_sent",
      message: `Telegram report: ${newLeadsCount} leads, ${totalCalls} calls, ${totalTasks} tasks`,
      details: {
        telegram_message_id: telegramResult.result?.message_id,
        leads: newLeadsCount,
        calls: totalCalls,
        tasks: totalTasks,
        errors: errorCount,
        cost: callCost,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        telegram_message_id: telegramResult.result?.message_id,
        summary: { leads: newLeadsCount, calls: totalCalls, tasks: totalTasks, errors: errorCount },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-hourly-report error:", err);

    // Log error (non-blocking)
    try {
      await supabase.from("system_logs").insert({
        organization_id: organizationId || null,
        level: "error",
        category: "general",
        event_type: "hourly_report_error",
        message: `Hourly report failed: ${(err as Error).message || "Unknown error"}`,
        details: { error: String(err) },
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({ error: (err as Error).message || "Hourly report failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
