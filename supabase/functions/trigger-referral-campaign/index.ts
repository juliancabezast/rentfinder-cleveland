import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a unique referral code
function generateReferralCode(name: string): string {
  const namePart = (name || "USER").split(" ")[0].toUpperCase().slice(0, 5);
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REF-${namePart}-${randomPart}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { lead_id, organization_id, action } = await req.json();

    if (action === "create_referral") {
      // Create a new referral invitation for a converted lead
      const { referred_name, referred_phone, referred_email, referral_channel } = await req.json();

      // Get the referrer lead info
      const { data: referrerLead, error: leadError } = await supabase
        .from("leads")
        .select("id, full_name, phone, organization_id")
        .eq("id", lead_id)
        .single();

      if (leadError || !referrerLead) {
        return new Response(
          JSON.stringify({ error: "Referrer lead not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate unique referral code
      const referralCode = generateReferralCode(referrerLead.full_name || "USER");

      // Get organization settings for reward amount
      const { data: settings } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", referrerLead.organization_id)
        .eq("key", "referral_program_config")
        .single();

      const config = settings?.value as { reward_amount?: number; reward_type?: string } || {};
      const rewardAmount = config.reward_amount || 100;
      const rewardType = config.reward_type || "cash";

      // Create the referral record
      const { data: referral, error: referralError } = await supabase
        .from("referrals")
        .insert({
          organization_id: referrerLead.organization_id,
          referrer_lead_id: lead_id,
          referrer_name: referrerLead.full_name,
          referrer_phone: referrerLead.phone,
          referred_name,
          referred_phone,
          referred_email,
          referral_code: referralCode,
          referral_channel,
          reward_amount: rewardAmount,
          reward_type: rewardType,
          status: "pending",
        })
        .select()
        .single();

      if (referralError) {
        console.error("Error creating referral:", referralError);
        return new Response(
          JSON.stringify({ error: "Failed to create referral", details: referralError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // TODO: Send referral invitation message via Twilio when connected
      // The message template would be:
      // "Hi {name}! Congratulations on your new home! 🏠
      // Know someone looking for an apartment? If they sign a lease, 
      // you'll receive ${reward_amount}!
      // Share this link: {referral_link}
      // Or have them mention your code: {referral_code}"

      return new Response(
        JSON.stringify({ success: true, referral }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "validate_code") {
      // Validate a referral code (for public referral page)
      const { referral_code } = await req.json();

      const { data: referral, error } = await supabase
        .from("referrals")
        .select(`
          id, referral_code, referrer_name, status, expires_at, organization_id,
          organizations:organization_id (name, slug)
        `)
        .eq("referral_code", referral_code)
        .single();

      if (error || !referral) {
        return new Response(
          JSON.stringify({ valid: false, error: "Invalid referral code" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if expired
      if (new Date(referral.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, error: "Referral code has expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if already used
      if (referral.status !== "pending") {
        return new Response(
          JSON.stringify({ valid: false, error: "Referral code has already been used" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          valid: true, 
          referrer_name: referral.referrer_name,
          organization: referral.organizations,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "submit_referral") {
      // Submit a referral from the public page
      const { referral_code, name, phone, email, consent } = await req.json();

      if (!consent) {
        return new Response(
          JSON.stringify({ error: "Consent is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the referral
      const { data: referral, error: referralError } = await supabase
        .from("referrals")
        .select("*")
        .eq("referral_code", referral_code)
        .single();

      if (referralError || !referral) {
        return new Response(
          JSON.stringify({ error: "Invalid referral code" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if expired
      if (new Date(referral.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "Referral code has expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create the new lead
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          organization_id: referral.organization_id,
          full_name: name,
          phone,
          email,
          source: "referral",
          source_detail: referral_code,
          sms_consent: consent,
          call_consent: consent,
          sms_consent_at: new Date().toISOString(),
          call_consent_at: new Date().toISOString(),
          status: "new",
        })
        .select()
        .single();

      if (leadError) {
        console.error("Error creating lead:", leadError);
        return new Response(
          JSON.stringify({ error: "Failed to create lead", details: leadError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update the referral with the new lead
      await supabase
        .from("referrals")
        .update({
          referred_lead_id: newLead.id,
          referred_name: name,
          referred_email: email,
          status: "contacted",
        })
        .eq("id", referral.id);

      // Log consent
      await supabase.from("consent_log").insert({
        organization_id: referral.organization_id,
        lead_id: newLead.id,
        consent_type: "sms_marketing",
        granted: true,
        method: "web_form",
        evidence_text: `Referral form submission with code ${referral_code}`,
      });

      return new Response(
        JSON.stringify({ success: true, lead_id: newLead.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in trigger-referral-campaign:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
