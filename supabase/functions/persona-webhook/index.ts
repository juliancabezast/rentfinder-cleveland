import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, persona-signature",
};

const SUPABASE_URL = "https://glzzzthgotfwoiaranmp.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Persona Webhook Handler
 * Receives verification results from Persona and updates lead status
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();
    
    console.log("[Persona Webhook] Received event:", payload.data?.attributes?.name);

    const eventName = payload.data?.attributes?.name;
    const inquiryId = payload.data?.attributes?.payload?.data?.id;
    const referenceId = payload.data?.attributes?.payload?.data?.attributes?.["reference-id"];
    const status = payload.data?.attributes?.payload?.data?.attributes?.status;

    if (!inquiryId || !referenceId) {
      console.log("[Persona Webhook] Missing inquiry or reference ID, ignoring");
      return new Response(
        JSON.stringify({ received: true, action: "ignored" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // reference-id should be our lead_id
    const leadId = referenceId;

    // Fetch the lead to get org_id
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, organization_id, persona_verification_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      console.error("[Persona Webhook] Lead not found:", leadId);
      return new Response(
        JSON.stringify({ received: true, action: "lead_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify this is the correct inquiry
    if (lead.persona_verification_id && lead.persona_verification_id !== inquiryId) {
      console.log("[Persona Webhook] Inquiry ID mismatch, ignoring");
      return new Response(
        JSON.stringify({ received: true, action: "inquiry_mismatch" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let verificationStatus: string;
    let identityVerified = false;
    let shouldNotifyAdmin = false;

    // Map Persona status to our status
    switch (status) {
      case "completed":
      case "approved":
        verificationStatus = "passed";
        identityVerified = true;
        break;
      case "declined":
      case "failed":
        verificationStatus = "failed";
        shouldNotifyAdmin = true;
        break;
      case "needs_review":
        verificationStatus = "manual_review";
        shouldNotifyAdmin = true;
        break;
      case "expired":
        verificationStatus = "expired";
        break;
      case "pending":
      case "created":
        verificationStatus = "pending";
        break;
      default:
        verificationStatus = "pending";
    }

    // Update lead
    const updateData: Record<string, any> = {
      verification_status: verificationStatus,
    };

    if (verificationStatus === "passed" || verificationStatus === "failed" || verificationStatus === "expired") {
      updateData.verification_completed_at = new Date().toISOString();
    }

    if (identityVerified) {
      updateData.identity_verified = true;
    }

    await supabase.from("leads").update(updateData).eq("id", leadId);

    // Log activity
    await supabase.rpc("log_agent_activity", {
      p_organization_id: lead.organization_id,
      p_agent_key: "persona_verification",
      p_action: "verification_result",
      p_status: verificationStatus === "passed" ? "success" : "info",
      p_message: `Persona verification ${verificationStatus} for lead`,
      p_related_lead_id: leadId,
      p_details: { inquiry_id: inquiryId, persona_status: status, our_status: verificationStatus },
    });

    // Notify admin if verification failed or needs review
    if (shouldNotifyAdmin) {
      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("organization_id", lead.organization_id)
        .in("role", ["admin", "super_admin"])
        .limit(1);

      if (admins && admins.length > 0) {
        await supabase.from("notifications").insert({
          organization_id: lead.organization_id,
          user_id: admins[0].id,
          type: "alert",
          title: `Identity Verification ${verificationStatus === "failed" ? "Failed" : "Needs Review"}`,
          message: `Lead verification requires attention. Please review before proceeding with the showing.`,
          category: "verification",
          related_lead_id: leadId,
        });
      }
    }

    console.log(`[Persona Webhook] Updated lead ${leadId} to ${verificationStatus}`);

    return new Response(
      JSON.stringify({
        received: true,
        lead_id: leadId,
        verification_status: verificationStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Persona Webhook] Error:", errorMessage);

    return new Response(
      JSON.stringify({ received: true, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
