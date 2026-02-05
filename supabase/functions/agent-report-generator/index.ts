import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReportSection {
  title: string;
  content: string;
  data_points?: Record<string, any>;
  chart_type?: string;
}

interface ReportHighlight {
  metric: string;
  value: string;
  trend: string;
  change: string;
}

interface GeneratedReport {
  title: string;
  summary: string;
  sections: ReportSection[];
  highlights: ReportHighlight[];
}

// Generate branded HTML email for investor report
function generateReportEmail(
  report: GeneratedReport,
  orgName: string,
  investorName: string,
  dashboardUrl: string
): string {
  const highlightsHtml = report.highlights
    .map(
      (h) => `
      <div style="background: #f8f8f8; padding: 16px; border-radius: 8px; text-align: center; min-width: 140px;">
        <div style="font-size: 24px; font-weight: bold; color: #370d4b;">${h.value}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">${h.metric}</div>
        <div style="font-size: 12px; color: ${h.trend === "up" ? "#22c55e" : h.trend === "down" ? "#ef4444" : "#666"}; margin-top: 4px;">
          ${h.change} ${h.trend === "up" ? "↑" : h.trend === "down" ? "↓" : "→"}
        </div>
      </div>
    `
    )
    .join("");

  const sectionsHtml = report.sections
    .map(
      (s) => `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #370d4b; margin-bottom: 8px;">${s.title}</h3>
        <p style="color: #333; line-height: 1.6;">${s.content}</p>
      </div>
    `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f1f1;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f1f1;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #370d4b, #5a1a7a); padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">
                🏠 ${report.title}
              </h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">
                ${orgName}
              </p>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 32px 32px 16px 32px;">
              <p style="margin: 0; color: #333; font-size: 16px;">
                Hello ${investorName},
              </p>
              <p style="margin: 12px 0 0 0; color: #333; line-height: 1.6;">
                ${report.summary}
              </p>
            </td>
          </tr>
          
          <!-- Highlights -->
          <tr>
            <td style="padding: 16px 32px;">
              <h2 style="color: #370d4b; font-size: 16px; margin: 0 0 16px 0;">Key Highlights</h2>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                ${highlightsHtml}
              </div>
            </td>
          </tr>
          
          <!-- Sections -->
          <tr>
            <td style="padding: 24px 32px;">
              ${sectionsHtml}
            </td>
          </tr>
          
          <!-- CTA -->
          <tr>
            <td style="padding: 16px 32px 32px 32px; text-align: center;">
              <a href="${dashboardUrl}" style="display: inline-block; background-color: #ffb22c; color: #1a1a1a; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                View Full Report
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 32px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: #666; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} ${orgName}. All rights reserved.
                <br><br>
                This report was automatically generated. Questions? Contact your property manager.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const resendKey = Deno.env.get("RESEND_API_KEY");

  let reportsGenerated = 0;
  let emailsSent = 0;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "on_demand";
    const targetOrgId = body.organization_id;
    const targetInvestorId = body.investor_id;

    // Calculate date range
    let startDate: string;
    let endDate: string;
    let periodMonth: number;
    let periodYear: number;

    if (mode === "monthly") {
      // Previous calendar month
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = lastMonth.toISOString().split("T")[0];
      endDate = lastMonthEnd.toISOString().split("T")[0];
      periodMonth = lastMonth.getMonth() + 1;
      periodYear = lastMonth.getFullYear();
    } else {
      // Last 30 days
      endDate = new Date().toISOString().split("T")[0];
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const now = new Date();
      periodMonth = now.getMonth() + 1;
      periodYear = now.getFullYear();
    }

    // Determine which orgs to process
    let orgsToProcess: { id: string; name: string }[] = [];

    if (mode === "monthly") {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("status", "active");
      orgsToProcess = orgs || [];
    } else if (targetOrgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", targetOrgId)
        .single();
      if (org) orgsToProcess = [org];
    } else {
      throw new Error("organization_id required for on_demand mode");
    }

    for (const org of orgsToProcess) {
      const orgId = org.id;

      // Find investors for this org
      let investorsQuery = supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("organization_id", orgId)
        .eq("role", "viewer");

      if (targetInvestorId) {
        investorsQuery = investorsQuery.eq("id", targetInvestorId);
      }

      const { data: investors } = await investorsQuery;

      if (!investors || investors.length === 0) {
        console.log(`Org ${orgId}: No investors found`);
        continue;
      }

      // Fetch org's OpenAI API key
      const { data: creds } = await supabase
        .from("organization_credentials")
        .select("openai_api_key")
        .eq("organization_id", orgId)
        .single();

      const openaiKey = creds?.openai_api_key || Deno.env.get("OPENAI_API_KEY");

      if (!openaiKey) {
        console.log(`Org ${orgId}: No OpenAI API key configured, skipping`);
        continue;
      }

      for (const investor of investors) {
        try {
          // Find investor's assigned properties
          const { data: accessRecords } = await supabase
            .from("investor_property_access")
            .select("property_id")
            .eq("investor_id", investor.id)
            .eq("organization_id", orgId);

          if (!accessRecords || accessRecords.length === 0) {
            console.log(`Investor ${investor.id}: No properties assigned, skipping`);
            continue;
          }

          const propertyIds = accessRecords.map((r) => r.property_id);

          // Gather performance data for all properties
          const allPerformance: Record<string, any> = {};
          for (const propId of propertyIds) {
            const { data: perfData } = await supabase.rpc("get_property_performance", {
              p_organization_id: orgId,
              p_property_id: propId,
              p_start_date: startDate,
              p_end_date: endDate,
            });
            if (perfData) {
              allPerformance[propId] = perfData;
            }
          }

          // Fetch existing insights for these properties
          const { data: insights } = await supabase
            .from("investor_insights")
            .select("*")
            .eq("organization_id", orgId)
            .in("property_id", propertyIds)
            .gte("period_start", startDate)
            .lte("period_end", endDate);

          // Fetch conversion predictions for leads on these properties
          const { data: predictions } = await supabase
            .from("conversion_predictions")
            .select("*, leads!inner(interested_property_id)")
            .eq("organization_id", orgId)
            .eq("is_current", true)
            .in("leads.interested_property_id", propertyIds);

          // Generate report via OpenAI
          const systemPrompt = `You are a professional report writer for a property management company.
Generate a monthly investor report based on the property performance data.

The report should have these sections:
1. Executive Summary (2-3 sentences overview)
2. Property Performance (per property: key metrics, trends, notable events)
3. Lead Pipeline (funnel metrics, conversion rates, quality indicators)
4. Market Intelligence (from transcript analysis: competitor insights, pricing feedback, demand signals)
5. Cost Efficiency (total spend, cost per lead, cost per showing, ROI indicators)
6. Recommendations (2-3 actionable items based on data)

Return JSON:
{
  "title": "Monthly Property Report - January 2025",
  "summary": "Executive summary paragraph...",
  "sections": [
    {
      "title": "Property Performance",
      "content": "Narrative content...",
      "data_points": {"total_leads": 45, "showings": 12},
      "chart_type": "bar"
    }
  ],
  "highlights": [
    {"metric": "Lead-to-Showing Rate", "value": "27%", "trend": "up", "change": "+5%"},
    {"metric": "Total Spend", "value": "$234.50", "trend": "down", "change": "-12%"},
    {"metric": "Days on Market", "value": "18", "trend": "neutral", "change": "0"}
  ]
}

Write professionally but accessibly. Investors want to know:
- Is my property performing well?
- Are we spending money wisely?
- What should we do differently?
- Are there market signals I should know about?`;

          const reportData = {
            properties: allPerformance,
            insights: insights || [],
            predictions: predictions || [],
            period: { start: startDate, end: endDate },
          };

          const openaiResponse = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                  { role: "system", content: systemPrompt },
                  {
                    role: "user",
                    content: `Generate report for investor with ${propertyIds.length} properties.\n\nData:\n${JSON.stringify(reportData, null, 2)}`,
                  },
                ],
                response_format: { type: "json_object" },
                max_tokens: 4000,
              }),
            }
          );

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error(`OpenAI error for investor ${investor.id}:`, errorText);
            continue;
          }

          const openaiData = await openaiResponse.json();
          const content = openaiData.choices?.[0]?.message?.content;

          if (!content) {
            console.error(`No content from OpenAI for investor ${investor.id}`);
            continue;
          }

          let parsed: GeneratedReport;
          try {
            parsed = JSON.parse(content);
          } catch {
            console.error(`Failed to parse OpenAI response for investor ${investor.id}`);
            continue;
          }

          // Generate HTML content
          const investorName = `${investor.first_name || ""} ${investor.last_name || ""}`.trim() || "Investor";
          const dashboardUrl = `https://cleveland-lease-buddy.lovable.app/dashboard`;
          const htmlContent = generateReportEmail(parsed, org.name, investorName, dashboardUrl);

          // Insert report
          const { data: reportRecord, error: insertError } = await supabase
            .from("investor_reports")
            .insert({
              organization_id: orgId,
              investor_id: investor.id,
              property_ids: propertyIds,
              subject: parsed.title,
              html_content: htmlContent,
              narrative_summary: parsed.summary,
              metrics: { highlights: parsed.highlights },
              insights: parsed.sections,
              period_month: periodMonth,
              period_year: periodYear,
              status: "generated",
            })
            .select("id")
            .single();

          if (insertError) {
            console.error(`Failed to insert report:`, insertError);
            continue;
          }

          reportsGenerated++;

          // Send email via Resend
          if (resendKey && investor.email) {
            try {
              const emailResponse = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: `${org.name} <reports@rentfindercleveland.com>`,
                  to: [investor.email],
                  subject: parsed.title,
                  html: htmlContent,
                }),
              });

              const emailData = await emailResponse.json();

              if (emailResponse.ok) {
                // Update report with email info
                await supabase
                  .from("investor_reports")
                  .update({
                    sent_at: new Date().toISOString(),
                    resend_email_id: emailData.id,
                    status: "sent",
                  })
                  .eq("id", reportRecord.id);

                emailsSent++;

                // Record Resend cost
                await supabase.rpc("zacchaeus_record_cost", {
                  p_organization_id: orgId,
                  p_service: "resend_email",
                  p_usage_quantity: 1,
                  p_usage_unit: "emails",
                  p_unit_cost: 0.001,
                  p_total_cost: 0.001,
                });
              } else {
                console.error(`Failed to send email to ${investor.email}:`, emailData);
              }
            } catch (emailError) {
              console.error(`Email error for ${investor.email}:`, emailError);
            }
          }

          // Record OpenAI cost
          const inputTokens = openaiData.usage?.prompt_tokens || 0;
          const outputTokens = openaiData.usage?.completion_tokens || 0;
          const cost = (inputTokens * 2.5 + outputTokens * 10) / 1_000_000;

          await supabase.rpc("zacchaeus_record_cost", {
            p_organization_id: orgId,
            p_service: "openai",
            p_usage_quantity: inputTokens + outputTokens,
            p_usage_unit: "tokens",
            p_unit_cost: cost / (inputTokens + outputTokens || 1),
            p_total_cost: cost,
          });

        } catch (investorError) {
          console.error(`Error processing investor ${investor.id}:`, investorError);
        }
      }
    }

    // Log summary
    await supabase.rpc("log_agent_activity", {
      p_organization_id: targetOrgId || orgsToProcess[0]?.id,
      p_agent_key: "report_generator",
      p_action: "generate_complete",
      p_status: "success",
      p_message: `Generated ${reportsGenerated} reports, sent ${emailsSent} emails`,
      p_details: {
        mode,
        reports_generated: reportsGenerated,
        emails_sent: emailsSent,
        period_start: startDate,
        period_end: endDate,
      },
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({
        success: true,
        reports_generated: reportsGenerated,
        emails_sent: emailsSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Report generator error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
