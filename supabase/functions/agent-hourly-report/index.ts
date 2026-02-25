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

// ── Helpers ──────────────────────────────────────────────────────────

// Convert a local-timezone midnight to UTC ISO string
function localMidnightToUtc(dateStr: string, tz: string): string {
  // dateStr format: "YYYY-MM-DD"
  // Create a date at noon UTC to avoid DST edge cases, then compute offset
  const noon = new Date(`${dateStr}T12:00:00Z`);
  // Get the local time representation in the target timezone
  const localStr = noon.toLocaleString("en-US", { timeZone: tz });
  const localNoon = new Date(localStr);
  // Offset = UTC noon - local noon (in ms)
  const offsetMs = noon.getTime() - localNoon.getTime();
  // Midnight local = midnight + offset to get UTC
  const midnightLocal = new Date(`${dateStr}T00:00:00Z`);
  const midnightUtc = new Date(midnightLocal.getTime() + offsetMs);
  return midnightUtc.toISOString();
}

function startOfDay(date: Date, tz: string): string {
  const dateStr = date.toLocaleDateString("en-CA", { timeZone: tz });
  return localMidnightToUtc(dateStr, tz);
}

function startOfWeek(date: Date, tz: string): string {
  // Get current day-of-week in timezone (0=Sun)
  const dayStr = date.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[dayStr] ?? 0;
  // Go back to Monday
  const msBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mon = new Date(date.getTime() - msBack * 86400000);
  const monStr = mon.toLocaleDateString("en-CA", { timeZone: tz });
  return localMidnightToUtc(monStr, tz);
}

function startOfMonth(date: Date, tz: string): string {
  const parts = date.toLocaleDateString("en-CA", { timeZone: tz }).split("-");
  return localMidnightToUtc(`${parts[0]}-${parts[1]}-01`, tz);
}

function countByField(rows: any[], field: string): Record<string, number> {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const val = r[field] || "unknown";
    map[val] = (map[val] || 0) + 1;
  });
  return map;
}

function topN(map: Record<string, number>, n: number, labels?: Record<string, string>): string {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => `${count} ${labels?.[key] || key.replace(/_/g, " ")}`)
    .join(", ");
}

function sumField(rows: any[], field: string): number {
  return rows.reduce((sum: number, r: any) => sum + (parseFloat(r[field]) || 0), 0);
}

// ── Main ─────────────────────────────────────────────────────────────

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

    // ── Time boundaries ─────────────────────────────────────────
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const sinceHour = oneHourAgo.toISOString();
    const sinceDay = startOfDay(now, timezone);
    const sinceWeek = startOfWeek(now, timezone);
    const sinceMonth = startOfMonth(now, timezone);

    // ── PARALLEL QUERIES ────────────────────────────────────────
    // Group 1: Hourly data (detailed)
    // Group 2: Daily data (for costs, emails, sms, errors)
    // Group 3: Weekly + monthly counts
    // Group 4: Top properties
    const [
      // ── Hourly ──
      hourLeadsRes,
      hourCallsRes,
      hourShowingsConfRes,
      hourShowingsCompRes,
      hourShowingsNSRes,
      hourTasksRes,
      // ── Daily ──
      dayLeadsRes,
      dayCallsRes,
      dayShowingsCompRes,
      dayEmailsRes,
      daySmsRes,
      dayErrorsRes,
      dayHotLeadsRes,
      // ── Weekly ──
      weekLeadsRes,
      weekShowingsCompRes,
      weekConvertedRes,
      // ── Monthly ──
      monthLeadsRes,
      monthShowingsCompRes,
      monthConvertedRes,
      // ── Top properties ──
      topPropertiesRes,
      // ── Agent queue ──
      agentQueueRes,
    ] = await Promise.all([
      // ── HOURLY ──────────────────────────────────────────────
      // Leads (last hour)
      supabase
        .from("leads")
        .select("id, source")
        .eq("organization_id", organizationId)
        .gte("created_at", sinceHour)
        .limit(500),
      // Calls (last hour)
      supabase
        .from("calls")
        .select("id, direction, duration_seconds, cost_total, cost_twilio, cost_bland, cost_openai")
        .eq("organization_id", organizationId)
        .gte("started_at", sinceHour)
        .limit(500),
      // Showings confirmed (last hour)
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "confirmed")
        .gte("updated_at", sinceHour),
      // Showings completed (last hour)
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", sinceHour),
      // Showings no-show (last hour)
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "no_show")
        .gte("updated_at", sinceHour),
      // Agent tasks completed (last hour)
      supabase
        .from("agent_tasks")
        .select("id, agent_type")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", sinceHour)
        .limit(500),

      // ── DAILY ───────────────────────────────────────────────
      // Leads today
      supabase
        .from("leads")
        .select("id, source, lead_score")
        .eq("organization_id", organizationId)
        .gte("created_at", sinceDay)
        .limit(1000),
      // Calls today (with cost fields)
      supabase
        .from("calls")
        .select("id, direction, duration_seconds, cost_total, cost_twilio, cost_bland, cost_openai")
        .eq("organization_id", organizationId)
        .gte("started_at", sinceDay)
        .limit(1000),
      // Showings completed today
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", sinceDay),
      // Emails sent today
      supabase
        .from("communications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("channel", "email")
        .eq("direction", "outbound")
        .gte("created_at", sinceDay),
      // SMS sent today
      supabase
        .from("communications")
        .select("id, cost_twilio", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("channel", "sms")
        .eq("direction", "outbound")
        .gte("created_at", sinceDay)
        .limit(1000),
      // Errors today (with messages)
      supabase
        .from("system_logs")
        .select("id, message, level, created_at")
        .eq("organization_id", organizationId)
        .in("level", ["error", "critical"])
        .gte("created_at", sinceDay)
        .order("created_at", { ascending: false })
        .limit(10),
      // Hot leads today (score >= 80)
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("lead_score", 80)
        .gte("created_at", sinceDay),

      // ── WEEKLY ──────────────────────────────────────────────
      // Leads this week
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", sinceWeek),
      // Showings completed this week
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", sinceWeek),
      // Converted leads this week
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "converted")
        .gte("updated_at", sinceWeek),

      // ── MONTHLY ─────────────────────────────────────────────
      // Leads this month
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", sinceMonth),
      // Showings completed this month
      supabase
        .from("showings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("updated_at", sinceMonth),
      // Converted leads this month
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "converted")
        .gte("updated_at", sinceMonth),

      // ── TOP 5 PROPERTIES ────────────────────────────────────
      // Leads grouped by interested_property_id (last 30 days)
      supabase
        .from("leads")
        .select("interested_property_id, properties:interested_property_id(address)")
        .eq("organization_id", organizationId)
        .not("interested_property_id", "is", null)
        .gte("created_at", sinceMonth)
        .limit(1000),

      // ── AGENT QUEUE ─────────────────────────────────────────
      supabase
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["pending", "in_progress"]),
    ]);

    // ══════════════════════════════════════════════════════════════
    // PROCESS DATA
    // ══════════════════════════════════════════════════════════════

    // ── HOURLY SECTION ──────────────────────────────────────────
    const hourLeads = hourLeadsRes.data || [];
    const hourLeadCount = hourLeads.length;
    const hourSourceBreakdown = topN(countByField(hourLeads, "source"), 5, SOURCE_LABELS);

    const hourCalls = hourCallsRes.data || [];
    const hourCallCount = hourCalls.length;
    const hourInbound = hourCalls.filter((c: any) => c.direction === "inbound").length;
    const hourOutbound = hourCalls.filter((c: any) => c.direction === "outbound").length;
    const hourCallMin = Math.round(
      hourCalls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60
    );

    const hourTasks = hourTasksRes.data || [];
    const hourTaskCount = hourTasks.length;
    const hourTaskBreakdown = topN(countByField(hourTasks, "agent_type"), 5, AGENT_LABELS);

    const hourConfirmed = hourShowingsConfRes.count || 0;
    const hourCompleted = hourShowingsCompRes.count || 0;
    const hourNoShow = hourShowingsNSRes.count || 0;

    // ── DAILY SECTION ───────────────────────────────────────────
    const dayLeads = dayLeadsRes.data || [];
    const dayLeadCount = dayLeads.length;
    const dayHotLeads = dayHotLeadsRes.count || 0;

    const dayCalls = dayCallsRes.data || [];
    const dayCallCount = dayCalls.length;
    const dayCallMin = Math.round(
      dayCalls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60
    );
    const dayShowingsCompleted = dayShowingsCompRes.count || 0;

    const dayEmailCount = dayEmailsRes.count || 0;
    const daySmsCount = daySmsRes.count || 0;

    // ── DAILY COSTS ─────────────────────────────────────────────
    const dayCostTwilio = sumField(dayCalls, "cost_twilio");
    const dayCostBland = sumField(dayCalls, "cost_bland");
    const dayCostOpenai = sumField(dayCalls, "cost_openai");
    const dayCostCallsTotal = sumField(dayCalls, "cost_total");
    // SMS costs from communications
    const daySmsCost = sumField(daySmsRes.data || [], "cost_twilio");
    const dayTotalCost = dayCostCallsTotal + daySmsCost;

    // ── ERRORS (with details) ───────────────────────────────────
    const dayErrors = dayErrorsRes.data || [];
    const dayErrorCount = dayErrors.length;

    // ── WEEKLY / MONTHLY ────────────────────────────────────────
    const weekLeadCount = weekLeadsRes.count || 0;
    const weekShowings = weekShowingsCompRes.count || 0;
    const weekConverted = weekConvertedRes.count || 0;

    const monthLeadCount = monthLeadsRes.count || 0;
    const monthShowings = monthShowingsCompRes.count || 0;
    const monthConverted = monthConvertedRes.count || 0;

    // ── TOP 5 PROPERTIES ────────────────────────────────────────
    const leadPropertyRows = topPropertiesRes.data || [];
    const propCounts: Record<string, { address: string; count: number }> = {};
    leadPropertyRows.forEach((row: any) => {
      const pid = row.interested_property_id;
      if (!pid) return;
      if (!propCounts[pid]) {
        const addr = row.properties?.address || "Unknown";
        propCounts[pid] = { address: addr, count: 0 };
      }
      propCounts[pid].count++;
    });
    const top5Props = Object.values(propCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ── Agent queue ─────────────────────────────────────────────
    const agentQueueCount = agentQueueRes.count || 0;

    // ══════════════════════════════════════════════════════════════
    // BUILD MESSAGE
    // ══════════════════════════════════════════════════════════════

    const hourLabel = now.toLocaleString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const lines: string[] = [
      `<b>📊 ${orgName} — ${hourLabel}</b>`,
    ];

    // ── LAST HOUR ───────────────────────────────────────────────
    lines.push(``, `━━ <b>LAST HOUR</b> ━━`);
    lines.push(`👥 <b>Leads:</b> ${hourLeadCount} new${hourSourceBreakdown ? ` (${hourSourceBreakdown})` : ""}`);
    lines.push(`📞 <b>Calls:</b> ${hourCallCount}${hourCallCount > 0 ? ` (${hourOutbound} out, ${hourInbound} in) · ${hourCallMin} min` : ""}`);
    lines.push(`🤖 <b>Agents:</b> ${hourTaskCount} tasks${hourTaskBreakdown ? ` (${hourTaskBreakdown})` : ""}`);
    lines.push(`🏠 <b>Showings:</b> ${hourConfirmed} confirmed, ${hourCompleted} completed${hourNoShow > 0 ? `, ${hourNoShow} no-show` : ""}`);

    // Quiet hour note
    const isQuiet = hourLeadCount === 0 && hourCallCount === 0 && hourTaskCount === 0;
    if (isQuiet) {
      lines.push(`😴 <i>Quiet hour — no activity</i>`);
    }

    // ── TODAY ────────────────────────────────────────────────────
    lines.push(``, `━━ <b>TODAY</b> ━━`);
    lines.push(`👥 ${dayLeadCount} leads${dayHotLeads > 0 ? ` · 🔥 ${dayHotLeads} hot (80+)` : ""}`);
    lines.push(`📞 ${dayCallCount} calls · ${dayCallMin} min`);
    lines.push(`🏠 ${dayShowingsCompleted} showings completed`);
    lines.push(`✉️ ${dayEmailCount} emails · 💬 ${daySmsCount} SMS`);
    lines.push(`💰 Cost: $${dayTotalCost.toFixed(2)}`);

    // ── WEEK / MONTH ────────────────────────────────────────────
    lines.push(``, `━━ <b>WEEK / MONTH</b> ━━`);
    lines.push(`📅 Week: ${weekLeadCount} leads · ${weekShowings} showings · ${weekConverted} converted`);
    lines.push(`📆 Month: ${monthLeadCount} leads · ${monthShowings} showings · ${monthConverted} converted`);

    // ── TOP 5 PROPERTIES ────────────────────────────────────────
    if (top5Props.length > 0) {
      lines.push(``, `━━ <b>TOP 5 PROPERTIES</b> ━━`);
      top5Props.forEach((p, i) => {
        lines.push(`${i + 1}. ${p.address} — ${p.count} leads`);
      });
    }

    // ── ERRORS ──────────────────────────────────────────────────
    if (dayErrorCount > 0) {
      lines.push(``, `━━ <b>⚠️ ERRORS (${dayErrorCount})</b> ━━`);
      dayErrors.slice(0, 5).forEach((e: any) => {
        // Truncate long messages to 80 chars
        const msg = (e.message || "Unknown error").slice(0, 80);
        lines.push(`• ${msg}`);
      });
      if (dayErrorCount > 5) {
        lines.push(`<i>... and ${dayErrorCount - 5} more</i>`);
      }
    } else {
      lines.push(``, `✅ No errors today`);
    }

    // ── DAILY COST BREAKDOWN ────────────────────────────────────
    if (dayTotalCost > 0) {
      lines.push(``, `━━ <b>💰 DAILY COST</b> ━━`);
      const costParts: string[] = [];
      if (dayCostTwilio > 0) costParts.push(`Twilio: $${dayCostTwilio.toFixed(2)}`);
      if (dayCostBland > 0) costParts.push(`Bland: $${dayCostBland.toFixed(2)}`);
      if (dayCostOpenai > 0) costParts.push(`OpenAI: $${dayCostOpenai.toFixed(2)}`);
      if (daySmsCost > 0) costParts.push(`SMS: $${daySmsCost.toFixed(2)}`);
      if (costParts.length > 0) {
        lines.push(costParts.join(` · `));
      }
      lines.push(`<b>Total: $${dayTotalCost.toFixed(2)}</b>`);
    }

    // ── AGENT QUEUE ─────────────────────────────────────────────
    if (agentQueueCount > 0) {
      lines.push(``, `🔄 <b>Agent queue:</b> ${agentQueueCount} pending`);
    }

    const message = lines.join("\n");

    // ── Send to Telegram ──────────────────────────────────────
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

    // ── Log success ───────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "hourly_report_sent",
      message: `Telegram report: ${dayLeadCount} leads today, ${dayCallCount} calls, cost $${dayTotalCost.toFixed(2)}`,
      details: {
        telegram_message_id: telegramResult.result?.message_id,
        hour: { leads: hourLeadCount, calls: hourCallCount, tasks: hourTaskCount },
        day: { leads: dayLeadCount, calls: dayCallCount, emails: dayEmailCount, sms: daySmsCount, cost: dayTotalCost },
        week: { leads: weekLeadCount, showings: weekShowings, converted: weekConverted },
        month: { leads: monthLeadCount, showings: monthShowings, converted: monthConverted },
        errors: dayErrorCount,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        telegram_message_id: telegramResult.result?.message_id,
        summary: {
          hour: { leads: hourLeadCount, calls: hourCallCount, tasks: hourTaskCount },
          day: { leads: dayLeadCount, calls: dayCallCount, emails: dayEmailCount, sms: daySmsCount, cost: dayTotalCost },
          week: { leads: weekLeadCount, showings: weekShowings, converted: weekConverted },
          month: { leads: monthLeadCount, showings: monthShowings, converted: monthConverted },
          errors: dayErrorCount,
          agent_queue: agentQueueCount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-hourly-report error:", err);

    // Log error (non-blocking)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceRoleKey);
      await sb.from("system_logs").insert({
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
