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

  try {
    const { lead_id, user_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Gather all lead data ───────────────────────────────────────
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get recent calls
    const { data: calls } = await supabase
      .from("calls")
      .select("id, direction, status, duration_seconds, ai_summary, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Get recent messages
    const { data: messages } = await supabase
      .from("messages")
      .select("id, direction, channel, body, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get showings
    const { data: showings } = await supabase
      .from("showings")
      .select("id, status, scheduled_at, property_id")
      .eq("lead_id", lead_id)
      .order("scheduled_at", { ascending: false })
      .limit(5);

    // Get score history
    const { data: scores } = await supabase
      .from("lead_score_history")
      .select("score, change_reason, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // ── Get OpenAI key ─────────────────────────────────────────────
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", lead.organization_id)
      .single();

    const openaiKey = creds?.openai_api_key;

    let brief: string;

    if (openaiKey) {
      // ── Generate AI brief via OpenAI ─────────────────────────────
      const context = {
        lead: {
          name: lead.full_name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          source: lead.source,
          score: lead.lead_score,
          budget: `$${lead.budget_min || "?"} - $${lead.budget_max || "?"}`,
          bedrooms_needed: lead.bedrooms_needed,
          has_voucher: lead.has_voucher,
          voucher_amount: lead.voucher_amount,
          move_in_date: lead.move_in_date,
          preferred_language: lead.preferred_language,
          created_at: lead.created_at,
          last_contact: lead.last_contact_at,
        },
        calls: (calls || []).map((c) => ({
          direction: c.direction,
          status: c.status,
          duration: c.duration_seconds,
          summary: c.ai_summary,
          date: c.created_at,
        })),
        messages: (messages || []).map((m) => ({
          direction: m.direction,
          channel: m.channel,
          body: m.body?.substring(0, 200),
          date: m.created_at,
        })),
        showings: (showings || []).map((s) => ({
          status: s.status,
          scheduled: s.scheduled_at,
        })),
        scores: (scores || []).map((s) => ({
          score: s.score,
          reason: s.change_reason,
          date: s.created_at,
        })),
      };

      const aiResp = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a leasing agent assistant. Generate a concise lead brief (3-5 sentences) summarizing this lead's journey, current status, key needs, and recommended next action. Be specific and actionable. Write in English.",
              },
              {
                role: "user",
                content: JSON.stringify(context),
              },
            ],
            max_tokens: 300,
            temperature: 0.3,
          }),
        }
      );

      if (!aiResp.ok) {
        throw new Error(`OpenAI API error: ${aiResp.status}`);
      }

      const aiData = await aiResp.json();
      brief = aiData.choices?.[0]?.message?.content || "Unable to generate brief.";
    } else {
      // ── Fallback: Generate rule-based brief ──────────────────────
      const parts: string[] = [];

      parts.push(
        `${lead.full_name || "Lead"} (${lead.status}) from ${lead.source || "unknown source"}.`
      );

      if (lead.budget_max) {
        parts.push(`Budget up to $${lead.budget_max}/mo.`);
      }
      if (lead.bedrooms_needed) {
        parts.push(`Looking for ${lead.bedrooms_needed} bedrooms.`);
      }
      if (lead.has_voucher) {
        parts.push(
          `Has housing voucher${lead.voucher_amount ? ` ($${lead.voucher_amount})` : ""}.`
        );
      }

      const callCount = calls?.length || 0;
      const msgCount = messages?.length || 0;
      const showingCount = showings?.length || 0;
      parts.push(
        `Activity: ${callCount} calls, ${msgCount} messages, ${showingCount} showings.`
      );

      if (lead.lead_score) {
        parts.push(`Current score: ${lead.lead_score}/100.`);
      }

      brief = parts.join(" ");
    }

    // ── Save brief to lead ─────────────────────────────────────────
    await supabase
      .from("leads")
      .update({
        ai_brief: brief,
        ai_brief_generated_at: new Date().toISOString(),
        ai_brief_generated_by: user_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead_id);

    // ── Record cost ────────────────────────────────────────────────
    if (openaiKey) {
      try {
        await supabase.rpc("zacchaeus_record_cost", {
          p_organization_id: lead.organization_id,
          p_service: "openai",
          p_usage_quantity: 1,
          p_usage_unit: "lead_brief",
          p_unit_cost: 0.001,
          p_total_cost: 0.001,
          p_lead_id: lead_id,
        });
      } catch {
        // Non-blocking
      }
    }

    return new Response(
      JSON.stringify({ success: true, brief }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-lead-brief error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Failed to generate brief",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
