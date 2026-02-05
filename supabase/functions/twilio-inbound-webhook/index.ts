import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
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

// Generate TwiML response
function twiml(content: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`,
    {
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    }
  );
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

  try {
    // Parse Twilio form data
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;

    console.log(`Inbound call: From=${from}, To=${to}, CallSid=${callSid}, Status=${callStatus}`);

    // Validate required fields
    if (!from || !to || !callSid) {
      console.error("Missing required Twilio fields");
      return twiml("<Say>Sorry, we could not process your call. Please try again.</Say>");
    }

    const normalizedTo = normalizePhone(to);
    const normalizedFrom = normalizePhone(from);

    // Look up organization by Twilio phone number
    const { data: credentials, error: credError } = await supabase
      .from("organization_credentials")
      .select("organization_id, bland_api_key, twilio_phone_number")
      .or(`twilio_phone_number.eq.${normalizedTo},twilio_phone_number.eq.${to}`)
      .limit(1)
      .single();

    if (credError || !credentials) {
      console.error("No organization found for number:", normalizedTo, credError);

      return twiml("<Say>Sorry, this number is not configured. Please contact support.</Say>");
    }

    const orgId = credentials.organization_id;
    const blandApiKey = credentials.bland_api_key;

    // Fetch organization details
    const { data: org } = await supabase
      .from("organizations")
      .select("name, timezone, default_language")
      .eq("id", orgId)
      .single();

    // Create or find lead (Noah dedup trigger will handle duplicates)
    const { data: newLead, error: leadInsertError } = await supabase
      .from("leads")
      .insert({
        organization_id: orgId,
        phone: normalizedFrom,
        source: "inbound_call",
        source_detail: `Twilio CallSid: ${callSid}`,
        status: "new",
        call_consent: true, // They called us, implicit consent
        call_consent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    let leadId: string;
    
    if (leadInsertError || !newLead) {
      // Noah may have blocked insert due to duplicate - find existing lead
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone", normalizedFrom)
        .limit(1)
        .single();

      if (existingLead) {
        leadId = existingLead.id;
        // Update last contact
        await supabase
          .from("leads")
          .update({ last_contact_at: new Date().toISOString() })
          .eq("id", leadId);
      } else {
        console.error("Failed to create or find lead:", leadInsertError);
        return twiml("<Say>We're experiencing technical difficulties. Please call back shortly.</Say>");
      }
    } else {
      leadId = newLead.id;
    }

    // Fetch available properties for context
    const { data: properties } = await supabase
      .from("properties")
      .select("id, address, city, state, zip_code, bedrooms, bathrooms, rent_price, status, description, pet_policy, section_8_accepted")
      .eq("organization_id", orgId)
      .in("status", ["available", "coming_soon"])
      .order("rent_price", { ascending: true })
      .limit(10);

    // Fetch FAQ documents
    const { data: faqs } = await supabase
      .from("faq_documents")
      .select("title, content, category")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .limit(20);

    // Build property context for AI
    let propertyContext = "Available Properties:\n";
    if (properties && properties.length > 0) {
      properties.forEach((p, i) => {
        propertyContext += `${i + 1}. ${p.address}, ${p.city} ${p.state} ${p.zip_code} - ${p.bedrooms}BR/${p.bathrooms}BA - $${p.rent_price}/mo`;
        if (p.section_8_accepted) propertyContext += " (Section 8 accepted)";
        if (p.status === "coming_soon") propertyContext += " (Coming Soon)";
        propertyContext += `\n   ${p.description?.slice(0, 200) || "No description"}\n`;
      });
    } else {
      propertyContext += "No properties currently available. Ask the caller to leave their contact info.\n";
    }

    let faqContext = "\nFrequently Asked Questions:\n";
    if (faqs && faqs.length > 0) {
      faqs.forEach((f) => {
        faqContext += `Q: ${f.title}\nA: ${f.content.slice(0, 300)}\n\n`;
      });
    }

    // Get org settings
    const { data: voiceIdSetting } = await supabase.rpc("get_org_setting", {
      p_organization_id: orgId,
      p_key: "bland_voice_id",
      p_default: '"default"',
    });

    const { data: languageSetting } = await supabase.rpc("get_org_setting", {
      p_organization_id: orgId,
      p_key: "voice_language_primary",
      p_default: '"en"',
    });

    const { data: disclosureSetting } = await supabase.rpc("get_org_setting", {
      p_organization_id: orgId,
      p_key: "recording_disclosure_text",
      p_default: '"This call may be recorded for quality assurance and training purposes."',
    });

    const voiceId = typeof voiceIdSetting === "string" ? voiceIdSetting.replace(/"/g, "") : "default";
    const language = typeof languageSetting === "string" ? languageSetting.replace(/"/g, "") : "en";
    const recordingDisclosure = typeof disclosureSetting === "string" ? disclosureSetting.replace(/"/g, "") : "This call may be recorded for quality assurance and training purposes.";

    // Check if Bland API key is available
    if (!blandApiKey) {
      console.error("No Bland.ai API key configured for org:", orgId);
      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "main_inbound",
        p_action: "bland_dispatch_failed",
        p_status: "failure",
        p_message: "No Bland.ai API key configured",
        p_details: { lead_id: leadId },
        p_lead_id: leadId,
        p_execution_ms: Date.now() - startTime,
      });
      return twiml("<Say>We're experiencing technical difficulties. Please call back shortly or leave a message.</Say><Record maxLength='120' />");
    }

    // Build Bland.ai task prompt
    const orgName = org?.name || "our leasing team";
    const taskPrompt = `You are an AI leasing assistant for ${orgName}. 

FIRST: Say this exactly: "${recordingDisclosure}"

Then greet the caller warmly. If they speak Spanish, switch to Spanish for the rest of the call.

Your goals:
1. Help the caller find a rental property that fits their needs
2. Capture their contact information (name, email if possible)
3. Understand their requirements (move-in date, budget, bedrooms needed)
4. Ask if they have a housing voucher (Section 8)
5. Offer to schedule a showing if they're interested
6. Get consent for follow-up: "Is it okay if we follow up with you by text or phone about available properties?"

${propertyContext}

${faqContext}

Be helpful, professional, and empathetic. If you don't know an answer, say you'll have a team member follow up.
At the end, thank them and confirm any next steps.`;

    // Get the webhook URL for Bland to call back
    const webhookUrl = `${supabaseUrl}/functions/v1/bland-call-webhook`;

    // Dispatch to Bland.ai
    const blandResponse = await fetch("https://api.bland.ai/v1/calls", {
      method: "POST",
      headers: {
        "Authorization": blandApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: normalizedFrom,
        task: taskPrompt,
        voice: voiceId !== "default" ? voiceId : undefined,
        language: language,
        webhook: webhookUrl,
        record: true,
        max_duration: 15, // 15 minutes max
        metadata: {
          organization_id: orgId,
          lead_id: leadId,
          twilio_call_sid: callSid,
          source: "twilio_inbound",
        },
        wait_for_greeting: true,
        first_sentence: `${recordingDisclosure} Hello! Thank you for calling ${orgName}. How can I help you find your new home today?`,
      }),
    });

    if (!blandResponse.ok) {
      const errorText = await blandResponse.text();
      console.error("Bland.ai API error:", errorText);
      
      await supabase.rpc("log_agent_activity", {
        p_organization_id: orgId,
        p_agent_key: "main_inbound",
        p_action: "bland_dispatch_failed",
        p_status: "failure",
        p_message: `Bland.ai API error: ${blandResponse.status}`,
        p_details: { error: errorText, lead_id: leadId },
        p_lead_id: leadId,
        p_execution_ms: Date.now() - startTime,
      });

      return twiml("<Say>We're experiencing technical difficulties. Please call back shortly.</Say>");
    }

    const blandData = await blandResponse.json();
    console.log("Bland.ai call dispatched:", blandData);

    // Log success
    await supabase.rpc("log_agent_activity", {
      p_organization_id: orgId,
      p_agent_key: "main_inbound",
      p_action: "inbound_call_dispatched",
      p_status: "success",
      p_message: `Inbound call from ${normalizedFrom} dispatched to Bland.ai`,
      p_details: {
        bland_call_id: blandData.call_id,
        twilio_call_sid: callSid,
        properties_in_context: properties?.length || 0,
      },
      p_lead_id: leadId,
      p_execution_ms: Date.now() - startTime,
    });

    // Return TwiML to hold the caller (Bland.ai will handle the actual conversation)
    return twiml(`
      <Say>Please hold while we connect you with our leasing assistant.</Say>
      <Pause length="2"/>
      <Say>Thank you for your patience.</Say>
      <Pause length="120"/>
    `);

  } catch (error: unknown) {
    console.error("Twilio inbound webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Try to log the error
    try {
      await supabase.rpc("log_agent_activity", {
        p_organization_id: null,
        p_agent_key: "main_inbound",
        p_action: "inbound_call_error",
        p_status: "failure",
        p_message: `Unexpected error: ${errorMessage}`,
        p_details: { error: String(error) },
        p_execution_ms: Date.now() - startTime,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return twiml("<Say>We're experiencing technical difficulties. Please call back shortly.</Say>");
  }
});
