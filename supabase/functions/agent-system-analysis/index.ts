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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

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

    // 6. Error logs (24h)
    const { data: errorLogs } = await supabase
      .from("system_logs")
      .select("level, message, category")
      .eq("organization_id", organization_id)
      .in("level", ["error", "critical"])
      .gte("created_at", dayAgo)
      .limit(20);

    const errorCount24h = errorLogs?.length || 0;

    // 7. Lead counts
    const { count: newLeadsToday } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .gte("created_at", todayStart);

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
      errors: { count24h: errorCount24h, recent: errorLogs?.slice(0, 5).map((e) => e.message) || [] },
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

Current System Status:
- Agents: ${stats.agents.enabled}/${stats.agents.total} enabled, ${stats.agents.executedToday} executed today (${stats.agents.successesToday} success, ${stats.agents.failuresToday} failures)
- Task Queue: ${stats.tasks.pending} pending, ${stats.tasks.inProgress} in progress, ${stats.tasks.failed} failed
- Services: ${stats.services.healthy}/${stats.services.total} healthy${stats.services.down.length > 0 ? `, DOWN: ${stats.services.down.join(", ")}` : ""}
- Costs Today: $${stats.costs.totalToday.toFixed(2)}${Object.keys(stats.costs.byService).length > 0 ? ` (${Object.entries(stats.costs.byService).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join(", ")})` : ""}
- Errors (24h): ${stats.errors.count24h}${stats.errors.recent.length > 0 ? `\n  Recent: ${stats.errors.recent.slice(0, 3).join("; ")}` : ""}
- Leads: ${stats.leads.newToday} new today, ${stats.leads.totalActive} total active
- Recent Activity: ${stats.activity.recentSuccesses} successes, ${stats.activity.recentFailures} failures${stats.activity.topFailureActions.length > 0 ? `\n  Top failure actions: ${stats.activity.topFailureActions.join(", ")}` : ""}

Respond in JSON format with:
{
  "health_score": <1-10 integer>,
  "findings": ["<finding 1>", "<finding 2>", ...],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", ...]
}

Rules:
- health_score: 10 = perfect, 1 = critical failure
- findings: 3-5 concise observations about what's happening
- recommendations: 2-3 actionable suggestions
- Be specific about numbers, don't be vague
- If there are failures, diagnose possible causes
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
