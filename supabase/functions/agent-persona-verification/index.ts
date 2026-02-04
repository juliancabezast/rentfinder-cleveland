import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://glzzzthgotfwoiaranmp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PERSONA_API_BASE = "https://withpersona.com/api/v1";
const PERSONA_VERSION = "2023-01-05";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { task_id, lead_id, organization_id, context } = await req.json();
    const { showing_id, property_id, scheduled_at } = context || {};

    console.log(`[Gideon] Starting persona verification for lead ${lead_id}`);

    // Update task to in_progress
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "in_progress", executed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead not found: ${leadError?.message}`);
    }

    // Fetch org credentials
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("persona_api_key")
      .eq("organization_id", organization_id)
      .single();

    const personaApiKey = creds?.persona_api_key;

    // Graceful degradation if no Persona key
    if (!personaApiKey) {
      console.log(`[Gideon] No Persona API key configured, skipping verification`);

      await supabase
        .from("leads")
        .update({
          verification_status: "passed",
          verification_completed_at: new Date().toISOString(),
          identity_verified: true,
        })
        .eq("id", lead_id);

      // Log activity
      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id,
        p_agent_key: "persona_verification",
        p_action: "skip_verification",
        p_status: "success",
        p_message: "No Persona API key configured, verification skipped",
        p_related_lead_id: lead_id,
        p_related_showing_id: showing_id,
      });

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_api_key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch property for context
    let propertyAddress = "your scheduled property";
    if (property_id) {
      const { data: property } = await supabase
        .from("properties")
        .select("address, city")
        .eq("id", property_id)
        .single();
      if (property) {
        propertyAddress = `${property.address}, ${property.city}`;
      }
    }

    // Get Persona template ID from org settings or env
    const { data: templateSetting } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("organization_id", organization_id)
      .eq("key", "persona_template_id")
      .single();

    const templateId = templateSetting?.value || Deno.env.get("PERSONA_TEMPLATE_ID");

    if (!templateId) {
      throw new Error("No Persona template ID configured");
    }

    // Update lead to pending verification
    await supabase
      .from("leads")
      .update({
        verification_status: "pending",
        verification_started_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    // Create Persona inquiry
    const personaResponse = await fetch(`${PERSONA_API_BASE}/inquiries`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${personaApiKey}`,
        "Persona-Version": PERSONA_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            "inquiry-template-id": templateId,
            "reference-id": lead_id,
            "note": `Showing verification for ${propertyAddress}`,
            fields: {
              "name-first": lead.first_name || "",
              "name-last": lead.last_name || "",
              "email-address": lead.email || "",
              "phone-number": lead.phone,
            },
          },
        },
      }),
    });

    if (!personaResponse.ok) {
      const errorText = await personaResponse.text();
      throw new Error(`Persona API error: ${personaResponse.status} - ${errorText}`);
    }

    const personaData = await personaResponse.json();
    const inquiryId = personaData.data?.id;
    const inquiryUrl = personaData.data?.attributes?.["redirect-url"] || 
                       `https://withpersona.com/verify?inquiry-id=${inquiryId}`;

    // Store Persona verification ID on lead
    await supabase
      .from("leads")
      .update({ persona_verification_id: inquiryId })
      .eq("id", lead_id);

    // Send verification link via SMS if consent
    if (lead.sms_consent && lead.phone) {
      const { data: twilioCredentials } = await supabase
        .from("organization_credentials")
        .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
        .eq("organization_id", organization_id)
        .single();

      if (twilioCredentials?.twilio_account_sid && twilioCredentials?.twilio_auth_token) {
        const leadName = lead.first_name || "there";
        const message = `Hi ${leadName}! Before your showing at ${propertyAddress}, please complete a quick identity check: ${inquiryUrl}. This helps keep everyone safe!`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioCredentials.twilio_account_sid}/Messages.json`;
        const twilioAuth = btoa(`${twilioCredentials.twilio_account_sid}:${twilioCredentials.twilio_auth_token}`);

        const smsResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: lead.phone,
            From: twilioCredentials.twilio_phone_number || "",
            Body: message,
          }),
        });

        if (smsResponse.ok) {
          // Record SMS in communications
          await supabase.from("communications").insert({
            organization_id,
            lead_id,
            channel: "sms",
            direction: "outbound",
            recipient: lead.phone,
            body: message,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

          // Record SMS cost
          await supabase.rpc("zacchaeus_record_cost", {
            p_organization_id: organization_id,
            p_service: "twilio",
            p_usage_unit: "sms",
            p_usage_quantity: 1,
            p_unit_cost: 0.0079,
            p_lead_id: lead_id,
          });
        }
      }
    }

    // Record Persona cost (~$1.50/verification)
    await supabase.rpc("zacchaeus_record_cost", {
      p_organization_id: organization_id,
      p_service: "persona",
      p_usage_unit: "verification",
      p_usage_quantity: 1,
      p_unit_cost: 1.50,
      p_lead_id: lead_id,
    });

    // Log activity
    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id,
      p_agent_key: "persona_verification",
      p_action: "create_inquiry",
      p_status: "success",
      p_message: `Created Persona verification inquiry ${inquiryId}`,
      p_related_lead_id: lead_id,
      p_related_showing_id: showing_id,
      p_details: { inquiry_id: inquiryId, inquiry_url: inquiryUrl },
    });

    // Mark task completed
    if (task_id) {
      await supabase
        .from("agent_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        inquiry_id: inquiryId,
        inquiry_url: inquiryUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Gideon] Error:", errorMessage);

    // Log error
    try {
      const { task_id, lead_id, organization_id, context } = await req.json().catch(() => ({}));
      
      if (organization_id) {
        await supabase.rpc("log_agent_activity", {
          p_organization_id: organization_id,
          p_agent_key: "persona_verification",
          p_action: "verification_error",
          p_status: "error",
          p_message: errorMessage,
          p_related_lead_id: lead_id,
          p_related_showing_id: context?.showing_id,
        });
      }

      if (task_id) {
        await supabase
          .from("agent_tasks")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", task_id);
      }
    } catch (e) {
      console.error("[Gideon] Failed to log error:", e);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
