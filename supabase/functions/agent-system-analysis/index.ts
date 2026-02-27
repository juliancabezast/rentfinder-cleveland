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

  let organization_id = "";
  try {
    const parsed = await req.json();
    organization_id = parsed.organization_id;

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Gather system data ───────────────────────────────────────────

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Get org timezone for correct "today" calculation
    const { data: orgData } = await supabase
      .from("organizations")
      .select("timezone")
      .eq("id", organization_id)
      .single();

    const orgTz = orgData?.timezone || "America/New_York";

    // Compute "today start" in org timezone (DST-aware)
    const todayInTz = new Date(now.toLocaleString("en-US", { timeZone: orgTz }));
    todayInTz.setHours(0, 0, 0, 0);
    // Convert back to UTC: find the offset between UTC and org timezone
    const utcNow = now.getTime();
    const tzNow = new Date(now.toLocaleString("en-US", { timeZone: orgTz })).getTime();
    const tzOffset = utcNow - tzNow; // ms difference
    const todayStart = new Date(todayInTz.getTime() + tzOffset).toISOString();

    // 1. Agent stats
    const { data: agents } = await supabase
      .from("agents_registry")
      .select("biblical_name, agent_key, is_enabled, status, executions_today, successes_today, failures_today, last_execution_at")
      .eq("organization_id", organization_id);

    // 2. Pending/failed tasks
    const { data: taskCounts } = await supabase
      .from("agent_tasks")
      .select("agent_type, status")
      .eq("organization_id", organization_id)
      .in("status", ["pending", "in_progress", "failed"]);

    const pendingCount = taskCounts?.filter((t) => t.status === "pending").length || 0;
    const failedCount = taskCounts?.filter((t) => t.status === "failed").length || 0;
    const inProgressCount = taskCounts?.filter((t) => t.status === "in_progress").length || 0;

    // 3. Recent activity (last 50)
    const { data: recentActivity } = await supabase
      .from("agent_activity_log")
      .select("agent_key, action, status, created_at")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const recentFailures = recentActivity?.filter((a) => a.status === "failure") || [];
    const recentSuccesses = recentActivity?.filter((a) => a.status === "success") || [];

    // 4. Integration health
    const { data: integrationHealth } = await supabase
      .from("integration_health")
      .select("service, status, last_checked_at, response_ms, message")
      .eq("organization_id", organization_id);

    const healthyServices = integrationHealth?.filter((h) => h.status === "healthy").length || 0;
    const totalServices = integrationHealth?.length || 0;
    const downServices = integrationHealth?.filter((h) => h.status === "down") || [];

    // 5. Today's costs
    const { data: costRecords } = await supabase
      .from("cost_records")
      .select("service, total_cost")
      .eq("organization_id", organization_id)
      .gte("created_at", todayStart);

    const totalCostToday = costRecords?.reduce((sum, r) => sum + (r.total_cost || 0), 0) || 0;
    const costByService: Record<string, number> = {};
    costRecords?.forEach((r) => {
      costByService[r.service] = (costByService[r.service] || 0) + (r.total_cost || 0);
    });

    // 6. Error logs (24h) — with time breakdown to detect trends
    const { data: errorLogs } = await supabase
      .from("system_logs")
      .select("level, message, category, event_type, created_at")
      .eq("organization_id", organization_id)
      .in("level", ["error", "critical"])
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    const errorCount24h = errorLogs?.length || 0;
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const errorsLastHour = errorLogs?.filter((e) => e.created_at >= oneHourAgo).length || 0;
    const errorsPrevHour = errorLogs?.filter((e) => e.created_at >= twoHoursAgo && e.created_at < oneHourAgo).length || 0;

    // Group errors by event_type to detect patterns
    const errorsByType: Record<string, { count: number; lastSeen: string; sample: string }> = {};
    errorLogs?.forEach((e) => {
      const key = e.event_type || e.category || "unknown";
      if (!errorsByType[key]) {
        errorsByType[key] = { count: 0, lastSeen: e.created_at, sample: e.message };
      }
      errorsByType[key].count++;
      if (e.created_at > errorsByType[key].lastSeen) {
        errorsByType[key].lastSeen = e.created_at;
      }
    });

    // Detect resolved issues: errors that stopped >1h ago
    const resolvedIssues = Object.entries(errorsByType)
      .filter(([, v]) => v.lastSeen < oneHourAgo)
      .map(([type, v]) => `${type} (${v.count} occurrences, last seen ${Math.round((now.getTime() - new Date(v.lastSeen).getTime()) / 60000)}min ago — likely resolved)`);

    const ongoingIssues = Object.entries(errorsByType)
      .filter(([, v]) => v.lastSeen >= oneHourAgo)
      .map(([type, v]) => `${type}: ${v.count} occurrences, last: "${v.sample.substring(0, 100)}"`);

    // 6b. Check failed tasks — distinguish old vs recent failures
    const { data: failedTasks24h } = await supabase
      .from("agent_tasks")
      .select("action_type, completed_at, context")
      .eq("organization_id", organization_id)
      .eq("status", "failed")
      .gte("completed_at", dayAgo)
      .order("completed_at", { ascending: false })
      .limit(50);

    const failedLastHour = failedTasks24h?.filter((t) => t.completed_at && t.completed_at >= oneHourAgo).length || 0;
    const failedPrevHours = (failedTasks24h?.length || 0) - failedLastHour;

    const failedByAction: Record<string, number> = {};
    failedTasks24h?.forEach((t) => {
      failedByAction[t.action_type] = (failedByAction[t.action_type] || 0) + 1;
    });

    // 7. Lead counts — use DB function for Cleveland timezone + clean filter
    const { data: newLeadsTodayData } = await supabase.rpc("count_leads_today", {
      p_organization_id: organization_id,
    });
    const newLeadsToday = newLeadsTodayData || 0;

    const { count: totalActiveLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .not("status", "eq", "lost")
      .not("status", "eq", "converted");

    // ── Build stats object ───────────────────────────────────────────

    const stats = {
      agents: {
        total: agents?.length || 0,
        enabled: agents?.filter((a) => a.is_enabled).length || 0,
        executedToday: agents?.reduce((s, a) => s + (a.executions_today || 0), 0) || 0,
        successesToday: agents?.reduce((s, a) => s + (a.successes_today || 0), 0) || 0,
        failuresToday: agents?.reduce((s, a) => s + (a.failures_today || 0), 0) || 0,
      },
      tasks: { pending: pendingCount, failed: failedCount, inProgress: inProgressCount },
      services: { healthy: healthyServices, total: totalServices, down: downServices.map((s) => s.service) },
      costs: { totalToday: totalCostToday, byService: costByService },
      errors: {
        count24h: errorCount24h,
        lastHour: errorsLastHour,
        prevHour: errorsPrevHour,
        trend: errorsLastHour === 0 ? "stopped" : errorsLastHour < errorsPrevHour ? "decreasing" : errorsLastHour > errorsPrevHour ? "increasing" : "steady",
        ongoingIssues,
        resolvedIssues,
        recent: errorLogs?.slice(0, 5).map((e) => e.message) || [],
      },
      failedTasks: {
        total24h: failedTasks24h?.length || 0,
        lastHour: failedLastHour,
        prevHours: failedPrevHours,
        byAction: failedByAction,
        trend: failedLastHour === 0 ? "stopped" : "ongoing",
      },
      leads: { newToday: newLeadsToday || 0, totalActive: totalActiveLeads || 0 },
      activity: {
        recentFailures: recentFailures.length,
        recentSuccesses: recentSuccesses.length,
        topFailureActions: [...new Set(recentFailures.map((f) => f.action))].slice(0, 3),
      },
    };

    // ── Call OpenAI for analysis ─────────────────────────────────────

    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", organization_id)
      .single();

    const openaiKey = creds?.openai_api_key;
    let analysis = {
      health_score: 5,
      findings: ["AI analysis unavailable — OpenAI key not configured"],
      recommendations: ["Configure OpenAI API key in Settings > Credentials"],
      generated_at: now.toISOString(),
      stats,
    };

    if (openaiKey) {
      const prompt = `You are Zacchaeus, the AI system health monitor for a property management SaaS called Rent Finder Cleveland. Analyze the current system status and provide a concise report.

IMPORTANT: Focus on what's happening RIGHT NOW, not just 24h totals. If errors occurred earlier but stopped in the last hour, the issue is likely RESOLVED — score should reflect current health, not past problems.

Current System Status:
- Agents: ${stats.agents.enabled}/${stats.agents.total} enabled, ${stats.agents.executedToday} executed today (${stats.agents.successesToday} success, ${stats.agents.failuresToday} failures)
- Task Queue: ${stats.tasks.pending} pending, ${stats.tasks.inProgress} in progress, ${stats.tasks.failed} failed
- Services: ${stats.services.healthy}/${stats.services.total} healthy${stats.services.down.length > 0 ? `, DOWN: ${stats.services.down.join(", ")}` : ""}
- Costs Today: $${stats.costs.totalToday.toFixed(2)}${Object.keys(stats.costs.byService).length > 0 ? ` (${Object.entries(stats.costs.byService).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join(", ")})` : ""}
- Errors (24h total): ${stats.errors.count24h} | Last hour: ${stats.errors.lastHour} | Previous hour: ${stats.errors.prevHour} | Trend: ${stats.errors.trend}
${stats.errors.ongoingIssues.length > 0 ? `  ONGOING issues: ${stats.errors.ongoingIssues.join("; ")}` : "  No ongoing error patterns detected."}
${stats.errors.resolvedIssues.length > 0 ? `  RESOLVED issues (errors stopped): ${stats.errors.resolvedIssues.join("; ")}` : ""}
- Failed Tasks (24h): ${stats.failedTasks.total24h} total | Last hour: ${stats.failedTasks.lastHour} | Trend: ${stats.failedTasks.trend}${Object.keys(stats.failedTasks.byAction).length > 0 ? `\n  By type: ${Object.entries(stats.failedTasks.byAction).map(([k, v]) => `${k}: ${v}`).join(", ")}` : ""}
- Leads: ${stats.leads.newToday} new today, ${stats.leads.totalActive} total active
- Recent Activity: ${stats.activity.recentSuccesses} successes, ${stats.activity.recentFailures} failures${stats.activity.topFailureActions.length > 0 ? `\n  Top failure actions: ${stats.activity.topFailureActions.join(", ")}` : ""}

Respond in JSON format with:
{
  "health_score": <1-10 integer>,
  "findings": ["<finding 1>", "<finding 2>", ...],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", ...]
}

Rules:
- health_score: 10 = perfect, 1 = critical. Base this on CURRENT state, not just 24h totals
- If error trend is "stopped" and no ongoing issues, that means the problem was fixed — score 8-10
- If all services are healthy and no ongoing errors, score should be 8+
- findings: 3-5 concise observations about what's happening NOW
- recommendations: 2-3 actionable suggestions (if issues are resolved, say so)
- Be specific about numbers, don't be vague
- Mark resolved issues clearly as "RESOLVED" in findings
- Keep each finding/recommendation under 100 characters`;

      try {
        const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: "json_object" },
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            analysis = {
              health_score: Math.max(1, Math.min(10, parsed.health_score || 5)),
              findings: parsed.findings || [],
              recommendations: parsed.recommendations || [],
              generated_at: now.toISOString(),
              stats,
            };
          }

          // Record cost
          const promptTokens = aiData.usage?.prompt_tokens || 0;
          const completionTokens = aiData.usage?.completion_tokens || 0;
          const cost = (promptTokens * 0.00000015) + (completionTokens * 0.0000006);
          try {
            await supabase.rpc("zacchaeus_record_cost", {
              p_organization_id: organization_id,
              p_service: "openai",
              p_usage_quantity: 1,
              p_usage_unit: "system_analysis",
              p_unit_cost: cost,
              p_total_cost: cost,
              p_lead_id: null,
            });
          } catch { /* non-blocking */ }
        }
      } catch (aiErr) {
        console.error("OpenAI call failed:", aiErr);
        analysis.findings = [`AI analysis failed: ${(aiErr as Error).message}`, ...analysis.findings.filter((f) => !f.startsWith("AI analysis"))];
      }
    }

    // ── Save report to organization_settings ─────────────────────────

    await supabase
      .from("organization_settings")
      .upsert(
        {
          organization_id,
          key: "system_analysis_report",
          category: "agents",
          value: analysis,
          description: "Zacchaeus hourly system analysis report",
          updated_at: now.toISOString(),
        },
        { onConflict: "organization_id,key" }
      );

    // ── Log to activity ──────────────────────────────────────────────

    try {
      await supabase.from("agent_activity_log").insert({
        organization_id,
        agent_key: "zacchaeus",
        action: "system_analysis",
        status: "success",
        message: `System analysis complete. Health: ${analysis.health_score}/10. ${analysis.findings.length} findings, ${analysis.recommendations.length} recommendations.`,
        details: { health_score: analysis.health_score },
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-system-analysis error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "System analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
