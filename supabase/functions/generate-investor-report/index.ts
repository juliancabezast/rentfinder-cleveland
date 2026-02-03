import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PropertyMetrics {
  address: string;
  leads: number;
  showings: number;
  completed: number;
  status: string;
}

interface ReportMetrics {
  total_leads: number;
  total_showings: number;
  showings_completed: number;
  no_shows: number;
  conversions: number;
  avg_lead_score: number;
  voucher_leads: number;
  by_property: Record<string, PropertyMetrics>;
}

function generateReportHTML(
  investor: { full_name: string | null; email: string | null },
  metrics: ReportMetrics,
  insights: any[],
  monthName: string,
  year: number,
  orgName: string
): string {
  const firstName = investor.full_name?.split(" ")[0] || "Investor";
  
  const propertyRows = Object.values(metrics.by_property)
    .map(
      (p) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${p.address}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${p.leads}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${p.showings}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${p.completed}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${
              p.status === "available" ? "#dcfce7" : p.status === "rented" ? "#dbeafe" : "#fef3c7"
            }; color: ${
              p.status === "available" ? "#166534" : p.status === "rented" ? "#1e40af" : "#92400e"
            };">${p.status}</span>
          </td>
        </tr>
      `
    )
    .join("");

  const insightRows = insights
    .slice(0, 5)
    .map(
      (i) => `
        <div style="padding: 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 12px;">
          <h4 style="margin: 0 0 8px 0; color: #111827; font-size: 15px;">${i.headline}</h4>
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">${i.narrative}</p>
        </div>
      `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${monthName} ${year} Property Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">${orgName}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">${monthName} ${year} Property Report</p>
    </div>

    <!-- Greeting -->
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px 0; color: #111827; font-size: 16px;">Hi ${firstName},</p>
      <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
        Here's your monthly performance summary for your properties.
      </p>
    </div>

    <!-- Metrics Summary -->
    <div style="padding: 0 32px 32px;">
      <div style="display: flex; background: #f9fafb; border-radius: 12px; overflow: hidden;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 24px; text-align: center; width: 33%;">
              <div style="font-size: 32px; font-weight: bold; color: #1e40af;">${metrics.total_leads}</div>
              <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">New Leads</div>
            </td>
            <td style="padding: 24px; text-align: center; width: 33%; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
              <div style="font-size: 32px; font-weight: bold; color: #059669;">${metrics.showings_completed}</div>
              <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Showings</div>
            </td>
            <td style="padding: 24px; text-align: center; width: 33%;">
              <div style="font-size: 32px; font-weight: bold; color: #7c3aed;">${metrics.conversions}</div>
              <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Conversions</div>
            </td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Property Breakdown -->
    <div style="padding: 0 32px 32px;">
      <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px;">Property Performance</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Property</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Leads</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Showings</th>
            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Completed</th>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #6b7280;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${propertyRows}
        </tbody>
      </table>
    </div>

    ${
      insights.length > 0
        ? `
    <!-- Insights -->
    <div style="padding: 0 32px 32px;">
      <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px;">Key Insights</h3>
      ${insightRows}
    </div>
    `
        : ""
    }

    <!-- Additional Stats -->
    <div style="padding: 0 32px 32px;">
      <div style="background: #fef3c7; border-radius: 8px; padding: 16px;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          📊 <strong>Additional Stats:</strong> ${metrics.voucher_leads} voucher leads · 
          ${metrics.no_shows} no-shows · Avg. lead score: ${metrics.avg_lead_score}
        </p>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding: 0 32px 32px; text-align: center;">
      <a href="https://cleveland-lease-buddy.lovable.app" 
         style="display: inline-block; background: #1e40af; color: white; padding: 14px 32px; 
                border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">
        View Full Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
        ${orgName} · Automated Property Intelligence
      </p>
      <p style="margin: 0; font-size: 12px;">
        <a href="https://cleveland-lease-buddy.lovable.app/p/privacy" style="color: #9ca3af;">Privacy Policy</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function generateNarrativeSummary(
  metrics: ReportMetrics,
  insights: any[],
  monthName: string,
  year: number
): string {
  const propertyCount = Object.keys(metrics.by_property).length;
  
  let narrative = `${monthName} ${year} Report Summary\n\n`;
  narrative += `Your ${propertyCount} ${propertyCount === 1 ? "property" : "properties"} generated ${metrics.total_leads} new leads this month. `;
  narrative += `${metrics.showings_completed} showings were completed out of ${metrics.total_showings} scheduled. `;
  
  if (metrics.conversions > 0) {
    narrative += `Great news! You had ${metrics.conversions} ${metrics.conversions === 1 ? "conversion" : "conversions"} this month. `;
  }
  
  if (metrics.voucher_leads > 0) {
    narrative += `${metrics.voucher_leads} leads have housing vouchers. `;
  }
  
  if (metrics.no_shows > 0) {
    narrative += `There were ${metrics.no_shows} no-shows. `;
  }
  
  narrative += `The average lead score was ${metrics.avg_lead_score}.\n\n`;
  
  if (insights.length > 0) {
    narrative += "Key Insights:\n";
    insights.slice(0, 3).forEach((i, idx) => {
      narrative += `${idx + 1}. ${i.headline}: ${i.narrative}\n`;
    });
  }
  
  return narrative;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { organization_id, investor_id, month, year, send_email = true } = await req.json();

    if (!organization_id || !investor_id || !month || !year) {
      return new Response(
        JSON.stringify({ error: "organization_id, investor_id, month, and year are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get investor info
    const { data: investor, error: investorError } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", investor_id)
      .single();

    if (investorError || !investor) {
      return new Response(
        JSON.stringify({ error: "Investor not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get organization info
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();

    const orgName = org?.name || "Rent Finder Cleveland";

    // 3. Get investor's properties
    const { data: access } = await supabase
      .from("investor_property_access")
      .select("property_id")
      .eq("investor_id", investor_id);

    const propertyIds = access?.map((a) => a.property_id) || [];

    if (propertyIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Investor has no property access" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Get properties
    const { data: properties } = await supabase
      .from("properties")
      .select("id, address, unit_number, status, rent_price, city")
      .in("id", propertyIds);

    // 5. Calculate period dates
    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    // 6. Get leads for these properties this month
    const { data: leads } = await supabase
      .from("leads")
      .select("id, status, lead_score, source, interested_property_id, has_voucher")
      .in("interested_property_id", propertyIds)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd);

    // 7. Get showings
    const { data: showings } = await supabase
      .from("showings")
      .select("id, property_id, status")
      .in("property_id", propertyIds)
      .gte("scheduled_at", periodStart)
      .lt("scheduled_at", periodEnd);

    // 8. Get insights
    const { data: insights } = await supabase
      .from("investor_insights")
      .select("headline, narrative, insight_type, is_highlighted")
      .in("property_id", propertyIds)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .order("is_highlighted", { ascending: false })
      .limit(5);

    // 9. Calculate metrics
    const metrics: ReportMetrics = {
      total_leads: leads?.length || 0,
      total_showings: showings?.length || 0,
      showings_completed: showings?.filter((s) => s.status === "completed").length || 0,
      no_shows: showings?.filter((s) => s.status === "no_show").length || 0,
      conversions: leads?.filter((l) => l.status === "converted").length || 0,
      avg_lead_score: leads?.length
        ? Math.round(leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / leads.length)
        : 0,
      voucher_leads: leads?.filter((l) => l.has_voucher).length || 0,
      by_property: {},
    };

    // Per-property breakdown
    properties?.forEach((prop) => {
      const propLeads = leads?.filter((l) => l.interested_property_id === prop.id) || [];
      const propShowings = showings?.filter((s) => s.property_id === prop.id) || [];
      metrics.by_property[prop.id] = {
        address: `${prop.address}${prop.unit_number ? " " + prop.unit_number : ""}`,
        leads: propLeads.length,
        showings: propShowings.length,
        completed: propShowings.filter((s) => s.status === "completed").length,
        status: prop.status,
      };
    });

    // 10. Generate content
    const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });
    const html = generateReportHTML(investor, metrics, insights || [], monthName, year, orgName);
    const narrative = generateNarrativeSummary(metrics, insights || [], monthName, year);
    const subject = `📊 ${monthName} ${year} Property Report — ${orgName}`;

    // 11. Store report (upsert to handle regeneration)
    const { data: report, error: reportError } = await supabase
      .from("investor_reports")
      .upsert(
        {
          organization_id,
          investor_id,
          period_month: month,
          period_year: year,
          subject,
          html_content: html,
          narrative_summary: narrative,
          property_ids: propertyIds,
          metrics,
          insights: insights || [],
          status: "generated",
        },
        { onConflict: "investor_id,period_month,period_year" }
      )
      .select()
      .single();

    if (reportError) {
      console.error("Error saving report:", reportError);
      return new Response(
        JSON.stringify({ error: "Failed to save report", details: reportError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 12. Send via Resend if requested
    let emailSent = false;
    let emailError = null;

    if (send_email && investor.email) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      
      if (RESEND_API_KEY) {
        try {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${orgName} <onboarding@resend.dev>`,
              to: [investor.email],
              subject: subject,
              html: html,
            }),
          });

          const emailResult = await emailResponse.json();

          if (emailResponse.ok) {
            emailSent = true;
            await supabase
              .from("investor_reports")
              .update({
                sent_at: new Date().toISOString(),
                delivered: true,
                status: "sent",
                resend_email_id: emailResult.id || null,
              })
              .eq("id", report.id);
          } else {
            emailError = emailResult;
            await supabase
              .from("investor_reports")
              .update({ status: "failed" })
              .eq("id", report.id);
          }
        } catch (err) {
          emailError = String(err);
          await supabase
            .from("investor_reports")
            .update({ status: "failed" })
            .eq("id", report.id);
        }
      } else {
        emailError = "RESEND_API_KEY not configured";
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report.id,
        email_sent: emailSent,
        email_error: emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-investor-report:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
