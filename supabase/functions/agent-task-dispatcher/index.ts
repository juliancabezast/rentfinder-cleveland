import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TaskResult {
  taskId: string;
  status: "dispatched" | "skipped" | "failed" | "human_controlled";
  reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: TaskResult[] = [];
  let dispatched = 0;
  let skipped = 0;
  let failed = 0;
  let humanControlled = 0;

  try {
    // Query pending tasks that are due
    const { data: tasks, error: tasksError } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (tasksError) {
      throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
    }

    if (!tasks || tasks.length === 0) {
      // Log that dispatcher ran but found no tasks
      await logActivity(supabase, null, "task_dispatcher", "queue_check", "success", 
        "No pending tasks found in queue", { tasks_checked: 0 }, null, Date.now() - startTime);

      return new Response(
        JSON.stringify({ 
          success: true, 
          dispatched: 0, 
          skipped: 0, 
          failed: 0, 
          human_controlled: 0,
          message: "No pending tasks to process"
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Process each task
    for (const task of tasks) {
      const taskStartTime = Date.now();
      
      try {
        // 1. Fetch the lead to get organization_id and check status
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id, organization_id, is_human_controlled, first_name, last_name, do_not_contact")
          .eq("id", task.lead_id)
          .single();

        if (leadError || !lead) {
          // Lead not found - mark task as failed
          await updateTaskStatus(supabase, task.id, "failed", null, "Lead not found");
          await logActivity(supabase, task.organization_id, "task_dispatcher", "task_failed", "failure",
            `Task ${task.id} failed: Lead ${task.lead_id} not found`, 
            { task_id: task.id, reason: "lead_not_found" }, task.lead_id, Date.now() - taskStartTime, task.id);
          
          results.push({ taskId: task.id, status: "failed", reason: "Lead not found" });
          failed++;
          continue;
        }

        // 2. Check if lead is human controlled
        if (lead.is_human_controlled) {
          await updateTaskStatus(supabase, task.id, "paused_human_control", null, "Lead is under human control");
          await logActivity(supabase, lead.organization_id, "task_dispatcher", "task_paused", "skipped",
            `Task ${task.id} paused: Lead ${lead.first_name || ''} ${lead.last_name || ''} is under human control`,
            { task_id: task.id, lead_id: lead.id, reason: "human_controlled" }, lead.id, Date.now() - taskStartTime, task.id);
          
          results.push({ taskId: task.id, status: "human_controlled", reason: "Lead is under human control" });
          humanControlled++;
          continue;
        }

        // 3. Check if the agent for this task is enabled
        const { data: agent, error: agentError } = await supabase
          .from("agents_registry")
          .select("agent_key, is_enabled, status, biblical_name")
          .eq("organization_id", lead.organization_id)
          .eq("agent_key", task.agent_type)
          .single();

        if (agentError || !agent) {
          await updateTaskStatus(supabase, task.id, "failed", null, "Agent not found in registry");
          await logActivity(supabase, lead.organization_id, "task_dispatcher", "task_failed", "failure",
            `Task ${task.id} failed: Agent ${task.agent_type} not found in registry`,
            { task_id: task.id, agent_type: task.agent_type, reason: "agent_not_found" }, lead.id, Date.now() - taskStartTime, task.id);
          
          results.push({ taskId: task.id, status: "failed", reason: "Agent not found" });
          failed++;
          continue;
        }

        if (!agent.is_enabled) {
          await updateTaskStatus(supabase, task.id, "failed", null, `Agent ${agent.biblical_name} is disabled`);
          await logActivity(supabase, lead.organization_id, "task_dispatcher", "task_skipped", "skipped",
            `Task ${task.id} skipped: Agent ${agent.biblical_name} (${task.agent_type}) is disabled`,
            { task_id: task.id, agent_key: task.agent_type, reason: "agent_disabled" }, lead.id, Date.now() - taskStartTime, task.id);
          
          results.push({ taskId: task.id, status: "skipped", reason: `Agent ${agent.biblical_name} is disabled` });
          skipped++;
          continue;
        }

        // 4. Compliance check for call/sms tasks
        if (task.action_type === "call" || task.action_type === "sms") {
          const { data: complianceResult, error: complianceError } = await supabase
            .rpc("joseph_compliance_check", {
              p_organization_id: lead.organization_id,
              p_lead_id: lead.id,
              p_action_type: task.action_type,
              p_agent_key: task.agent_type
            });

          if (complianceError) {
            await updateTaskStatus(supabase, task.id, "failed", null, `Compliance check error: ${complianceError.message}`);
            await logActivity(supabase, lead.organization_id, "task_dispatcher", "compliance_error", "failure",
              `Task ${task.id} failed: Compliance check error`,
              { task_id: task.id, error: complianceError.message }, lead.id, Date.now() - taskStartTime, task.id);
            
            results.push({ taskId: task.id, status: "failed", reason: "Compliance check error" });
            failed++;
            continue;
          }

          if (complianceResult && !complianceResult.passed) {
            const violations = complianceResult.violations || [];
            const violationCodes = violations.map((v: { code: string }) => v.code).join(", ");
            
            await updateTaskStatus(supabase, task.id, "failed", null, `Compliance blocked: ${violationCodes}`);
            await logActivity(supabase, lead.organization_id, "task_dispatcher", "compliance_blocked", "failure",
              `Task ${task.id} blocked by compliance: ${violationCodes}`,
              { task_id: task.id, violations: complianceResult.violations }, lead.id, Date.now() - taskStartTime, task.id);
            
            results.push({ taskId: task.id, status: "failed", reason: `Compliance: ${violationCodes}` });
            failed++;
            continue;
          }
        }

        // 5. Update task to in_progress (prevents duplicate dispatches)
        await updateTaskStatus(supabase, task.id, "in_progress", new Date().toISOString(), null);

        // 6. Dispatch to the agent (simulated for now)
        // In future sprints, this will invoke the actual agent Edge Function
        const dispatchResult = simulateAgentDispatch(task, lead, agent);

        // 7. Mark task as completed
        await supabase
          .from("agent_tasks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString()
          })
          .eq("id", task.id);

        await logActivity(supabase, lead.organization_id, "task_dispatcher", "task_dispatched", "success",
          `Task dispatched to ${agent.biblical_name}: ${task.action_type} for lead ${lead.first_name || ''} ${lead.last_name || ''}`,
          { 
            task_id: task.id, 
            agent_key: task.agent_type,
            action_type: task.action_type,
            dispatch_result: dispatchResult
          }, lead.id, Date.now() - taskStartTime, task.id);

        results.push({ taskId: task.id, status: "dispatched" });
        dispatched++;

      } catch (taskError) {
        // Individual task error - log and continue
        const errorMessage = taskError instanceof Error ? taskError.message : "Unknown error";
        
        await updateTaskStatus(supabase, task.id, "failed", null, errorMessage);
        await logActivity(supabase, task.organization_id, "task_dispatcher", "task_error", "failure",
          `Task ${task.id} error: ${errorMessage}`,
          { task_id: task.id, error: errorMessage }, task.lead_id, Date.now() - taskStartTime, task.id);
        
        results.push({ taskId: task.id, status: "failed", reason: errorMessage });
        failed++;
      }
    }

    const executionMs = Date.now() - startTime;

    // Log summary
    await logActivity(supabase, null, "task_dispatcher", "batch_complete", "success",
      `Processed ${tasks.length} tasks: ${dispatched} dispatched, ${skipped} skipped, ${failed} failed, ${humanControlled} human-controlled`,
      { dispatched, skipped, failed, human_controlled: humanControlled, results }, null, executionMs);

    return new Response(
      JSON.stringify({
        success: true,
        dispatched,
        skipped,
        failed,
        human_controlled: humanControlled,
        execution_ms: executionMs,
        results
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Task dispatcher error:", error);

    await logActivity(supabase, null, "task_dispatcher", "dispatcher_error", "failure",
      `Task dispatcher failed: ${errorMessage}`,
      { error: errorMessage }, null, Date.now() - startTime);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 }
    );
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateTaskStatus(
  supabase: any,
  taskId: string,
  status: string,
  executedAt: string | null,
  pauseReason: string | null
) {
  const updateData: Record<string, unknown> = { status };
  if (executedAt) updateData.executed_at = executedAt;
  if (pauseReason) updateData.pause_reason = pauseReason;
  if (status === "paused_human_control") updateData.paused_at = new Date().toISOString();

  await supabase.from("agent_tasks").update(updateData).eq("id", taskId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function simulateAgentDispatch(
  task: Record<string, unknown>,
  lead: Record<string, unknown>,
  agent: Record<string, unknown>
): Record<string, unknown> {
  // In future sprints, this will call the actual agent Edge Function
  // For now, we simulate the dispatch
  
  const agentFunctionMap: Record<string, string> = {
    recapture: "agent-recapture",
    showing_confirmation: "agent-showing-confirmation",
    no_show_followup: "agent-no-show-followup",
    post_showing: "agent-post-showing",
    welcome_sequence: "agent-welcome-sequence",
    campaign_voice: "agent-campaign-voice",
    sms_inbound: "twilio-sms-inbound",
  };

  const targetFunction = agentFunctionMap[task.agent_type as string] || null;

  return {
    simulated: true,
    message: "Agent not yet implemented - simulated dispatch",
    target_function: targetFunction,
    would_call: {
      lead_id: lead.id,
      action_type: task.action_type,
      context: task.context
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logActivity(
  supabase: any,
  organizationId: string | null,
  agentKey: string,
  action: string,
  status: string,
  message: string,
  details: Record<string, unknown> | null,
  leadId: string | null,
  executionMs: number,
  taskId?: string
) {
  try {
    // Use the first available org if none provided
    let orgId = organizationId;
    if (!orgId) {
      const { data: firstOrg } = await supabase
        .from("organizations")
        .select("id")
        .limit(1)
        .single();
      orgId = firstOrg?.id;
    }

    if (!orgId) return; // Can't log without org

    await supabase.rpc("log_agent_activity", {
      p_organization_id: orgId,
      p_agent_key: agentKey,
      p_action: action,
      p_status: status,
      p_message: message,
      p_details: details || {},
      p_lead_id: leadId,
      p_call_id: null,
      p_showing_id: null,
      p_property_id: null,
      p_task_id: taskId || null,
      p_execution_ms: executionMs,
      p_cost: 0
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}
