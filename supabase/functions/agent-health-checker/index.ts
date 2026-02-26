import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// External API services to check
const API_SERVICES = [
  "twilio",
  "bland",
  "openai",
  "resend",
  "doorloop",
  "persona",
  "maxmind",
  "supabase",
];

// Critical edge functions to ping
const CRITICAL_EDGE_FUNCTIONS = [
  "process-email-queue",
  "agent-task-dispatcher",
  "send-notification-email",
  "send-message",
  "agent-hemlane-parser",
];

// Critical cron jobs to verify
const CRITICAL_CRONS = [
  "process-email-queue-2min",
  "nehemiah-dispatch-every-5min",
  "zacchaeus-health-check-1h",
  "hourly-telegram-report",
  "esther-doorloop-pull-15min",
];

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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Get org credentials ────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    const results: Array<{
      service: string;
      status: string;
      message: string;
      response_time_ms: number;
      category?: string;
    }> = [];

    // ═══════════════════════════════════════════════════════════════
    // 1. API CONNECTIONS
    // ═══════════════════════════════════════════════════════════════
    for (const service of API_SERVICES) {
      const start = Date.now();
      let status = "unknown";
      let message = "";

      try {
        switch (service) {
          case "twilio": {
            const sid = creds?.twilio_account_sid;
            const token = creds?.twilio_auth_token;
            if (!sid || !token) {
              status = "not_configured";
              message = "Credentials not set";
              break;
            }
            const resp = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
              {
                headers: {
                  Authorization: "Basic " + btoa(`${sid}:${token}`),
                },
              }
            );
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "bland": {
            const apiKey = creds?.bland_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch("https://api.bland.ai/v1/calls", {
              headers: { Authorization: apiKey },
            });
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "openai": {
            const apiKey = creds?.openai_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch("https://api.openai.com/v1/models", {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "resend": {
            const apiKey =
              creds?.resend_api_key || Deno.env.get("RESEND_API_KEY");
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch("https://api.resend.com/domains", {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "doorloop": {
            const apiKey = creds?.doorloop_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "API key not set";
              break;
            }
            const resp = await fetch(
              "https://app.doorloop.com/api/v1/properties?page_size=1",
              { headers: { Authorization: `Bearer ${apiKey}` } }
            );
            status = resp.ok ? "connected" : "error";
            message = resp.ok ? "OK" : `HTTP ${resp.status}`;
            break;
          }

          case "persona": {
            const apiKey = creds?.persona_api_key;
            if (!apiKey) {
              status = "not_configured";
              message = "Not configured";
              break;
            }
            status = "connected";
            message = "Credentials saved";
            break;
          }

          case "maxmind": {
            const mAccountId = creds?.maxmind_account_id;
            const mLicenseKey = creds?.maxmind_license_key;
            if (!mAccountId || !mLicenseKey) {
              status = "not_configured";
              message = "Credentials not set";
              break;
            }
            status = "connected";
            message = "Credentials saved";
            break;
          }

          case "supabase": {
            const { error: dbErr } = await supabase
              .from("organizations")
              .select("id")
              .limit(1)
              .single();
            status = !dbErr ? "connected" : "error";
            message = !dbErr ? "OK" : dbErr.message;
            break;
          }
        }
      } catch (e) {
        status = "error";
        message = (e as Error).message;
      }

      const elapsed = Date.now() - start;
      results.push({
        service,
        status,
        message,
        response_time_ms: elapsed,
        category: "api",
      });

      // Upsert to integration_health
      const healthStatus =
        status === "connected"
          ? "healthy"
          : status === "error"
          ? "down"
          : status;
      await supabase.from("integration_health").upsert(
        {
          organization_id,
          service,
          status: healthStatus,
          last_checked_at: new Date().toISOString(),
          response_ms: elapsed,
          message: healthStatus === "down" ? message : "OK",
          last_healthy_at:
            healthStatus === "healthy"
              ? new Date().toISOString()
              : undefined,
          consecutive_failures: healthStatus === "down" ? 1 : 0,
        },
        { onConflict: "organization_id,service" }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. CRON JOBS — verify they exist and ran recently
    // ═══════════════════════════════════════════════════════════════
    const cronChecks: Array<{
      name: string;
      status: string;
      message: string;
    }> = [];

    try {
      // Check if cron jobs exist
      const { data: cronJobs } = await supabase.rpc("get_cron_jobs");

      // Fallback: query directly if RPC doesn't exist
      let jobNames: string[] = [];
      if (cronJobs) {
        jobNames = cronJobs.map((j: { jobname: string }) => j.jobname);
      }

      for (const cronName of CRITICAL_CRONS) {
        if (jobNames.length > 0) {
          if (jobNames.includes(cronName)) {
            cronChecks.push({
              name: cronName,
              status: "healthy",
              message: "Scheduled",
            });
          } else {
            cronChecks.push({
              name: cronName,
              status: "down",
              message: "Cron job not found in scheduler",
            });
          }
        } else {
          cronChecks.push({
            name: cronName,
            status: "unknown",
            message: "Could not query cron scheduler",
          });
        }
      }
    } catch {
      // If we can't check cron (no permission), try checking via run details
      for (const cronName of CRITICAL_CRONS) {
        cronChecks.push({
          name: cronName,
          status: "unknown",
          message: "Cannot verify (pg_cron access limited)",
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. EDGE FUNCTIONS — ping each to verify they respond
    // ═══════════════════════════════════════════════════════════════
    const edgeFnChecks: Array<{
      name: string;
      status: string;
      message: string;
      response_time_ms: number;
    }> = [];

    for (const fn of CRITICAL_EDGE_FUNCTIONS) {
      const start = Date.now();
      try {
        // Send OPTIONS request (lightweight, no execution)
        const resp = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: "OPTIONS",
        });
        const elapsed = Date.now() - start;
        edgeFnChecks.push({
          name: fn,
          status: resp.ok || resp.status === 204 ? "healthy" : "down",
          message:
            resp.ok || resp.status === 204 ? `OK (${elapsed}ms)` : `HTTP ${resp.status}`,
          response_time_ms: elapsed,
        });
      } catch (e) {
        edgeFnChecks.push({
          name: fn,
          status: "down",
          message: (e as Error).message,
          response_time_ms: Date.now() - start,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. EMAIL QUEUE — check for stuck emails
    // ═══════════════════════════════════════════════════════════════
    let emailQueueCheck = { status: "healthy", message: "OK", queued: 0, stuck: 0 };
    try {
      const { data: queueStats } = await supabase
        .from("email_events")
        .select("id, details, created_at")
        .eq("organization_id", organization_id)
        .eq("event_type", "delivery_delayed")
        .or("details->>status.eq.queued,details->>status.eq.processing");

      const queued = queueStats?.length || 0;
      const stuck = (queueStats || []).filter((e: { created_at: string }) => {
        const age = Date.now() - new Date(e.created_at).getTime();
        return age > 30 * 60 * 1000; // stuck if queued > 30 min
      }).length;

      emailQueueCheck = {
        status: stuck > 0 ? "degraded" : queued > 50 ? "degraded" : "healthy",
        message:
          stuck > 0
            ? `${stuck} emails stuck (>30 min)`
            : queued > 0
            ? `${queued} in queue (processing normally)`
            : "Queue empty",
        queued,
        stuck,
      };
    } catch (e) {
      emailQueueCheck = {
        status: "unknown",
        message: (e as Error).message,
        queued: 0,
        stuck: 0,
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. AGENT TASK QUEUE — check for backlog
    // ═══════════════════════════════════════════════════════════════
    let taskQueueCheck = {
      status: "healthy",
      message: "OK",
      pending: 0,
      failed_24h: 0,
      completed_24h: 0,
    };
    try {
      const { data: pendingTasks } = await supabase
        .from("agent_tasks")
        .select("id, scheduled_for")
        .eq("organization_id", organization_id)
        .eq("status", "pending");

      const pending = pendingTasks?.length || 0;
      const overdue = (pendingTasks || []).filter(
        (t: { scheduled_for: string }) =>
          new Date(t.scheduled_for).getTime() < Date.now() - 15 * 60 * 1000
      ).length;

      const { count: failed24h } = await supabase
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .eq("status", "failed")
        .gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { count: completed24h } = await supabase
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .eq("status", "completed")
        .gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      taskQueueCheck = {
        status:
          overdue > 10
            ? "down"
            : overdue > 0
            ? "degraded"
            : "healthy",
        message:
          overdue > 0
            ? `${overdue} overdue tasks (>15 min past scheduled)`
            : pending > 0
            ? `${pending} pending (on schedule)`
            : "No pending tasks",
        pending,
        failed_24h: failed24h || 0,
        completed_24h: completed24h || 0,
      };
    } catch (e) {
      taskQueueCheck = {
        status: "unknown",
        message: (e as Error).message,
        pending: 0,
        failed_24h: 0,
        completed_24h: 0,
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. ERROR RATE — check system_logs for recent errors
    // ═══════════════════════════════════════════════════════════════
    let errorRateCheck = { status: "healthy", message: "OK", errors_1h: 0, errors_24h: 0 };
    try {
      const { count: errors1h } = await supabase
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .eq("level", "error")
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const { count: errors24h } = await supabase
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .eq("level", "error")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      errorRateCheck = {
        status:
          (errors1h || 0) > 10
            ? "down"
            : (errors1h || 0) > 3
            ? "degraded"
            : "healthy",
        message:
          (errors1h || 0) > 0
            ? `${errors1h} errors in last hour, ${errors24h} in 24h`
            : `${errors24h || 0} errors in 24h`,
        errors_1h: errors1h || 0,
        errors_24h: errors24h || 0,
      };
    } catch {
      errorRateCheck = { status: "unknown", message: "Could not query logs", errors_1h: 0, errors_24h: 0 };
    }

    // ═══════════════════════════════════════════════════════════════
    // BUILD HEALTH REPORT
    // ═══════════════════════════════════════════════════════════════
    const apiDown = results.filter((r) => r.status === "error");
    const edgeDown = edgeFnChecks.filter((r) => r.status === "down");
    const cronDown = cronChecks.filter((r) => r.status === "down");

    // Calculate health score (0-10)
    let score = 10;
    score -= apiDown.length * 1; // -1 per API down
    score -= edgeDown.length * 1.5; // -1.5 per edge fn down
    score -= cronDown.length * 1; // -1 per cron missing
    if (emailQueueCheck.status === "down") score -= 1.5;
    else if (emailQueueCheck.status === "degraded") score -= 0.5;
    if (taskQueueCheck.status === "down") score -= 1.5;
    else if (taskQueueCheck.status === "degraded") score -= 0.5;
    if (errorRateCheck.status === "down") score -= 1;
    else if (errorRateCheck.status === "degraded") score -= 0.5;
    score = Math.max(0, Math.round(score));

    const report = {
      score,
      generated_at: new Date().toISOString(),
      apis: {
        total: results.length,
        healthy: results.filter((r) => r.status === "connected").length,
        down: apiDown.map((r) => r.service),
        details: results,
      },
      cron_jobs: {
        total: cronChecks.length,
        healthy: cronChecks.filter((r) => r.status === "healthy").length,
        missing: cronDown.map((r) => r.name),
        details: cronChecks,
      },
      edge_functions: {
        total: edgeFnChecks.length,
        healthy: edgeFnChecks.filter((r) => r.status === "healthy").length,
        down: edgeDown.map((r) => r.name),
        details: edgeFnChecks,
      },
      email_queue: emailQueueCheck,
      task_queue: taskQueueCheck,
      error_rate: errorRateCheck,
    };

    // Log health check results
    const hasIssues =
      apiDown.length > 0 ||
      edgeDown.length > 0 ||
      cronDown.length > 0 ||
      emailQueueCheck.status !== "healthy" ||
      taskQueueCheck.status !== "healthy";

    try {
      await supabase.from("system_logs").insert({
        organization_id,
        level: hasIssues ? "warning" : "info",
        category: "general",
        event_type: "health_check_complete",
        message: `Zacchaeus health check: ${score}/10 — APIs ${report.apis.healthy}/${report.apis.total}, Crons ${report.cron_jobs.healthy}/${report.cron_jobs.total}, Edge Fns ${report.edge_functions.healthy}/${report.edge_functions.total}, Email Queue: ${emailQueueCheck.status}, Task Queue: ${taskQueueCheck.status}, Errors 1h: ${errorRateCheck.errors_1h}`,
        details: report,
      });
    } catch {
      /* non-blocking */
    }

    // Record cost
    try {
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: organization_id,
        p_service: "platform",
        p_usage_quantity: 1,
        p_usage_unit: "health_check",
        p_unit_cost: 0,
        p_total_cost: 0,
        p_lead_id: null,
      });
    } catch {
      /* non-blocking */
    }

    return new Response(
      JSON.stringify({ success: true, score, report, results }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("agent-health-checker error:", err);

    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: "general",
        event_type: "health_checker_error",
        message: `Health checker crashed: ${(err as Error).message || "Unknown error"}`,
        details: { error: String(err) },
      });
    } catch {
      /* non-blocking */
    }

    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Health check failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
