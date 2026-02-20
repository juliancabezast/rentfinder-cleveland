import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── MaxMind risk score thresholds ────────────────────────────────────
const MAXMIND_VERIFIED_THRESHOLD = 30;  // risk_score < 30 → verified
const MAXMIND_REVIEW_THRESHOLD = 70;    // 30–70 → needs_review, > 70 → failed

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let lead_id = "";
  let organization_id = "";

  try {
    const parsed = await req.json();
    lead_id = parsed.lead_id;
    organization_id = parsed.organization_id;
    const ip_address: string | undefined = parsed.ip_address;
    const email: string | undefined = parsed.email;
    const phone: string | undefined = parsed.phone;

    // ── Validate ─────────────────────────────────────────────────────
    if (!lead_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id or organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get lead ─────────────────────────────────────────────────────
    const { data: lead } = await supabase
      .from("leads")
      .select("id, full_name, email, phone, organization_id, identity_verified, verification_status")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip if already verified
    if (lead.identity_verified === true) {
      return new Response(
        JSON.stringify({ success: true, already_verified: true, provider: "previous" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get credentials ──────────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("persona_api_key, maxmind_account_id, maxmind_license_key")
      .eq("organization_id", organization_id)
      .single();

    const hasPersona = !!creds?.persona_api_key;
    const hasMaxMind = !!creds?.maxmind_account_id && !!creds?.maxmind_license_key;

    if (!hasPersona && !hasMaxMind) {
      return new Response(
        JSON.stringify({ error: "No identity verification service configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mark verification started ────────────────────────────────────
    await supabase
      .from("leads")
      .update({
        verification_started_at: new Date().toISOString(),
        verification_status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    let provider: string | null = null;
    let verified = false;
    let verificationStatus = "failed";
    let verificationId: string | null = null;
    const details: Record<string, unknown> = {};

    // ── PLAN A: Try Persona first ────────────────────────────────────
    if (hasPersona) {
      try {
        // Check if Persona is marked as down
        const { data: personaHealth } = await supabase
          .from("integration_health")
          .select("status")
          .eq("organization_id", organization_id)
          .eq("service", "persona")
          .maybeSingle();

        const personaIsDown = personaHealth?.status === "down";

        if (!personaIsDown) {
          const personaResp = await fetch(
            "https://withpersona.com/api/v1/inquiries",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${creds!.persona_api_key}`,
                "Persona-Version": "2023-01-05",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    "reference-id": lead_id,
                    fields: {
                      "name-first": {
                        type: "string",
                        value: lead.full_name?.split(" ")[0] || "",
                      },
                      "name-last": {
                        type: "string",
                        value: lead.full_name?.split(" ").slice(1).join(" ") || "",
                      },
                      "email-address": {
                        type: "string",
                        value: email || lead.email || "",
                      },
                      "phone-number": {
                        type: "string",
                        value: phone || lead.phone || "",
                      },
                    },
                  },
                },
              }),
            }
          );

          if (personaResp.ok) {
            const personaData = await personaResp.json();
            const inquiry = personaData.data;
            verificationId = inquiry?.id || null;
            provider = "persona";

            const inquiryStatus = inquiry?.attributes?.status;
            if (inquiryStatus === "completed" || inquiryStatus === "approved") {
              verified = true;
              verificationStatus = "verified";
            } else if (inquiryStatus === "needs_review") {
              verificationStatus = "needs_review";
            } else {
              verificationStatus = "pending";
            }

            details.provider = "persona";
            details.inquiry_id = verificationId;
            details.inquiry_status = inquiryStatus;

            // Record Persona cost
            try {
              await supabase.rpc("zacchaeus_record_cost", {
                p_organization_id: organization_id,
                p_service: "persona",
                p_usage_quantity: 1,
                p_usage_unit: "verification",
                p_unit_cost: 0.5,
                p_total_cost: 0.5,
                p_lead_id: lead_id,
              });
            } catch { /* non-blocking */ }
          } else {
            console.error(`Persona API error: ${personaResp.status}`);
            details.persona_error = `HTTP ${personaResp.status}`;
          }
        } else {
          details.persona_skipped = "Service marked as down in integration_health";
        }
      } catch (personaErr) {
        console.error("Persona error:", personaErr);
        details.persona_error = (personaErr as Error).message;
      }
    }

    // ── PLAN B: Fallback to MaxMind if Persona didn't succeed ────────
    if (!provider && hasMaxMind) {
      try {
        const effectiveIp = ip_address || "0.0.0.0";
        const effectiveEmail = email || lead.email;
        const effectivePhone = phone || lead.phone;

        const maxmindBody: Record<string, unknown> = {
          device: { ip_address: effectiveIp },
        };
        if (effectiveEmail) {
          maxmindBody.email = { address: effectiveEmail };
        }
        if (effectivePhone) {
          maxmindBody.billing = { phone_number: effectivePhone };
        }

        const maxmindResp = await fetch(
          "https://minfraud.maxmind.com/minfraud/v2.0/score",
          {
            method: "POST",
            headers: {
              Authorization:
                "Basic " +
                btoa(`${creds!.maxmind_account_id}:${creds!.maxmind_license_key}`),
              "Content-Type": "application/json",
            },
            body: JSON.stringify(maxmindBody),
          }
        );

        if (maxmindResp.ok) {
          const maxmindData = await maxmindResp.json();
          const riskScore = maxmindData.risk_score ?? 100;

          provider = "maxmind";
          verificationId = maxmindData.id || null;

          if (riskScore < MAXMIND_VERIFIED_THRESHOLD) {
            verified = true;
            verificationStatus = "verified";
          } else if (riskScore < MAXMIND_REVIEW_THRESHOLD) {
            verificationStatus = "needs_review";
          } else {
            verificationStatus = "failed";
          }

          details.provider = "maxmind";
          details.risk_score = riskScore;
          details.ip_risk = maxmindData.ip_address?.risk;
          details.maxmind_id = maxmindData.id;
          details.fallback = hasPersona; // true = Persona was tried first

          // Record MaxMind cost
          try {
            await supabase.rpc("zacchaeus_record_cost", {
              p_organization_id: organization_id,
              p_service: "maxmind",
              p_usage_quantity: 1,
              p_usage_unit: "verification",
              p_unit_cost: 0.005,
              p_total_cost: 0.005,
              p_lead_id: lead_id,
            });
          } catch { /* non-blocking */ }
        } else {
          const errText = await maxmindResp.text();
          console.error(`MaxMind API error: ${maxmindResp.status} - ${errText}`);
          details.maxmind_error = `HTTP ${maxmindResp.status}`;
        }
      } catch (maxmindErr) {
        console.error("MaxMind error:", maxmindErr);
        details.maxmind_error = (maxmindErr as Error).message;
      }
    }

    // ── Update lead with verification results ────────────────────────
    const updatePayload: Record<string, unknown> = {
      verification_status: verificationStatus,
      verification_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (provider) {
      updatePayload.verification_provider = provider;
      updatePayload.identity_verified = verified;
    }

    if (verificationId && provider === "persona") {
      updatePayload.persona_verification_id = verificationId;
    }

    await supabase.from("leads").update(updatePayload).eq("id", lead_id);

    // ── Log to system_logs ───────────────────────────────────────────
    try {
      await supabase.from("system_logs").insert({
        organization_id,
        level: verified ? "info" : "warning",
        category: "general",
        event_type: "identity_verification",
        message: provider
          ? `Identity verification via ${provider}: ${verificationStatus} for ${lead.full_name || "lead"}`
          : `Identity verification failed: no provider succeeded for ${lead.full_name || "lead"}`,
        details,
        related_lead_id: lead_id,
      });
    } catch { /* non-blocking */ }

    // ── Return result ────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        provider,
        verified,
        verification_status: verificationStatus,
        verification_id: verificationId,
        details,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-identity error:", err);

    try {
      await supabase.from("system_logs").insert({
        organization_id: organization_id || null,
        level: "error",
        category: "general",
        event_type: "identity_verification_error",
        message: `Identity verification crashed: ${(err as Error).message || "Unknown error"}`,
        details: { error: String(err), lead_id },
        related_lead_id: lead_id || null,
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Identity verification failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
