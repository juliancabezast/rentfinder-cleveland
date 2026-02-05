import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalize phone number to E.164 format
function normalizePhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

// Map Bland.ai status to our call status
function mapBlandStatus(blandStatus: string): string {
  const statusMap: Record<string, string> = {
    completed: "completed",
    answered: "completed",
    no_answer: "no_answer",
    busy: "busy",
    failed: "failed",
    voicemail: "voicemail",
    canceled: "cancelled",
  };
  return statusMap[blandStatus?.toLowerCase()] || "completed";
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let orgId: string | null = null;
  let leadId: string | null = null;

  try {
    // Parse Bland.ai webhook data
    const data = await req.json();
    console.log("Bland.ai webhook received:", JSON.stringify(data).slice(0, 500));

    // Extract fields from Bland.ai response
    const {
      call_id: blandCallId,
      status: blandStatus,
      transcript,
      transcripts, // Alternative field name
      summary,
      recording_url,
      duration,
      to,
      from,
      metadata,
      answered_by,
      analysis,
      concatenated_transcript, // Another alternative
      variables, // Captured variables from the call
    } = data;

    // Get organization and lead from metadata
    orgId = metadata?.organization_id;
    leadId = metadata?.lead_id;
    const twilioCallSid = metadata?.twilio_call_sid;

    if (!orgId || !leadId) {
      console.error("Missing organization_id or lead_id in metadata");
      return new Response(
        JSON.stringify({ success: false, error: "Missing metadata" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get the transcript text (Bland.ai may use different field names)
    const transcriptText = transcript || concatenated_transcript || 
      (Array.isArray(transcripts) ? transcripts.map((t: any) => `${t.speaker}: ${t.text}`).join("\n") : null);

    // Calculate call timing
    const durationSeconds = duration || 0;
    const endedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - durationSeconds * 1000).toISOString();

    // Map status
    const callStatus = mapBlandStatus(blandStatus);

    // Create call record
    const { data: callRecord, error: callError } = await supabase
      .from("calls")
      .insert({
        organization_id: orgId,
        lead_id: leadId,
        direction: "inbound",
        phone_number: normalizePhone(to || from || ""),
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        status: callStatus,
        transcript: transcriptText,
        summary: summary || null,
        recording_url: recording_url || null,
        agent_type: "main_inbound",
        bland_call_id: blandCallId,
        twilio_call_sid: twilioCallSid,
        recording_disclosure_played: true,
        sentiment: analysis?.sentiment || null,
        detected_language: analysis?.language || null,
      })
      .select("id")
      .single();

    if (callError) {
      console.error("Failed to create call record:", callError);
      throw new Error(`Failed to create call record: ${callError.message}`);
    }

    const callId = callRecord.id;

    // Handle campaign voice calls (Joshua)
    const agentType = metadata?.agent_type;
    const campaignId = metadata?.campaign_id;
    const campaignRecipientId = metadata?.campaign_recipient_id;
    const taskId = metadata?.task_id;

    if (agentType === "campaign_voice" && campaignRecipientId) {
      // Update campaign recipient with call result
      await supabase
        .from("campaign_recipients")
        .update({
          status: callStatus === "completed" ? "delivered" : "failed",
          delivered_at: callStatus === "completed" ? new Date().toISOString() : null,
          call_id: callId,
          error_message: callStatus !== "completed" ? `Call status: ${callStatus}` : null,
        })
        .eq("id", campaignRecipientId);

      // Update campaign delivered_count
      if (callStatus === "completed" && campaignId) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("delivered_count")
          .eq("id", campaignId)
          .single();

        await supabase
          .from("campaigns")
          .update({ delivered_count: (campaign?.delivered_count || 0) + 1 })
          .eq("id", campaignId);

        // Check if campaign is complete
        const { count: pendingCount } = await supabase
          .from("campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .in("status", ["pending", "queued", "sent"]);

        if (pendingCount === 0) {
          await supabase
            .from("campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", campaignId);
        }
      }

      // Complete the task
      if (taskId) {
        await supabase
          .from("agent_tasks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result_call_id: callId,
          })
          .eq("id", taskId);
      }

      console.log(`Campaign voice call processed: recipient ${campaignRecipientId}, status ${callStatus}`);
    }

    // Extract lead info from analysis or variables
    const extractedData: Record<string, any> = {};
    
    // Check Bland.ai analysis for extracted info
    if (analysis) {
      if (analysis.name) extractedData.full_name = analysis.name;
      if (analysis.email) extractedData.email = analysis.email;
      if (analysis.move_in_date) extractedData.move_in_date = analysis.move_in_date;
      if (analysis.has_voucher !== undefined) extractedData.has_voucher = analysis.has_voucher;
      if (analysis.voucher_amount) extractedData.voucher_amount = analysis.voucher_amount;
      if (analysis.budget) {
        const budgetMatch = String(analysis.budget).match(/\d+/g);
        if (budgetMatch) {
          extractedData.budget_max = parseInt(budgetMatch[budgetMatch.length - 1]);
          if (budgetMatch.length > 1) {
            extractedData.budget_min = parseInt(budgetMatch[0]);
          }
        }
      }
    }

    // Check variables captured during call
    if (variables) {
      if (variables.name && !extractedData.full_name) extractedData.full_name = variables.name;
      if (variables.email && !extractedData.email) extractedData.email = variables.email;
      if (variables.move_in_date && !extractedData.move_in_date) extractedData.move_in_date = variables.move_in_date;
    }

    // Try to extract name parts
    if (extractedData.full_name) {
      const nameParts = extractedData.full_name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        extractedData.first_name = nameParts[0];
        extractedData.last_name = nameParts.slice(1).join(" ");
      } else if (nameParts.length === 1) {
        extractedData.first_name = nameParts[0];
      }
    }

    // Check for consent in transcript
    let callConsentGiven = false;
    let smsConsentGiven = false;
    
    if (transcriptText) {
      const transcriptLower = transcriptText.toLowerCase();
      // Look for affirmative responses to follow-up consent
      const consentPhrases = ["yes you can", "yes, you can", "that's fine", "that is fine", "sure", "yes please", "yes, please", "of course", "definitely", "absolutely"];
      const followUpMentioned = transcriptLower.includes("follow up") || transcriptLower.includes("text") || transcriptLower.includes("call you");
      
      if (followUpMentioned) {
        for (const phrase of consentPhrases) {
          if (transcriptLower.includes(phrase)) {
            callConsentGiven = true;
            smsConsentGiven = true;
            break;
          }
        }
      }
    }

    // Update lead with extracted info
    const leadUpdate: Record<string, any> = {
      last_contact_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add extracted data if present
    if (extractedData.first_name) leadUpdate.first_name = extractedData.first_name;
    if (extractedData.last_name) leadUpdate.last_name = extractedData.last_name;
    if (extractedData.full_name) leadUpdate.full_name = extractedData.full_name;
    if (extractedData.email) leadUpdate.email = extractedData.email;
    if (extractedData.move_in_date) leadUpdate.move_in_date = extractedData.move_in_date;
    if (extractedData.has_voucher !== undefined) leadUpdate.has_voucher = extractedData.has_voucher;
    if (extractedData.voucher_amount) leadUpdate.voucher_amount = extractedData.voucher_amount;
    if (extractedData.budget_min) leadUpdate.budget_min = extractedData.budget_min;
    if (extractedData.budget_max) leadUpdate.budget_max = extractedData.budget_max;

    // Update consent if given
    if (callConsentGiven) {
      leadUpdate.call_consent = true;
      leadUpdate.call_consent_at = new Date().toISOString();
    }
    if (smsConsentGiven) {
      leadUpdate.sms_consent = true;
      leadUpdate.sms_consent_at = new Date().toISOString();
    }

    // Get current lead status
    const { data: currentLead } = await supabase
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .single();

    // Update status if was 'new'
    if (currentLead?.status === "new") {
      leadUpdate.status = "contacted";
    }

    // Update lead
    await supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", leadId);

    // Log consent if given
    if (callConsentGiven || smsConsentGiven) {
      await supabase.from("consent_log").insert({
        organization_id: orgId,
        lead_id: leadId,
        consent_type: callConsentGiven && smsConsentGiven ? "call_and_sms" : callConsentGiven ? "call" : "sms",
        granted: true,
        method: "verbal_ai_call",
        call_id: callId,
        evidence_text: "Consent captured during AI call - affirmative response to follow-up question",
      });
    }

    // Record costs
    const durationMinutes = durationSeconds / 60;
    
    // Bland.ai cost: $0.09/min
    if (durationMinutes > 0) {
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: orgId,
        p_service: "bland_ai",
        p_usage_quantity: durationMinutes,
        p_usage_unit: "minutes",
        p_unit_cost: 0.09,
        p_total_cost: durationMinutes * 0.09,
        p_lead_id: leadId,
        p_call_id: callId,
      });

      // Twilio cost: $0.014/min
      await supabase.rpc("zacchaeus_record_cost", {
        p_organization_id: orgId,
        p_service: "twilio_voice",
        p_usage_quantity: durationMinutes,
        p_usage_unit: "minutes",
        p_unit_cost: 0.014,
        p_total_cost: durationMinutes * 0.014,
        p_lead_id: leadId,
        p_call_id: callId,
      });
    }

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: orgId,
      p_agent_key: "main_inbound",
      p_action: "call_completed",
      p_status: "success",
      p_message: `Call completed: ${durationSeconds}s, status: ${callStatus}`,
      p_details: {
        bland_call_id: blandCallId,
        call_id: callId,
        duration_seconds: durationSeconds,
        has_transcript: !!transcriptText,
        extracted_name: extractedData.full_name || null,
        consent_captured: callConsentGiven || smsConsentGiven,
      },
      p_lead_id: leadId,
      p_call_id: callId,
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, call_id: callId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("Bland webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log error but return 200 to prevent retries
    try {
      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "main_inbound",
        p_action: "webhook_error",
        p_status: "failure",
        p_message: `Bland webhook processing error: ${errorMessage}`,
        p_details: { error: String(error) },
        p_lead_id: leadId,
        p_execution_ms: Date.now() - startTime,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    // Return 200 to prevent Bland.ai from retrying
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
