import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Svix webhook signature verification ───────────────────────────────
async function verifyWebhookSignature(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): Promise<boolean> {
  // Strip "whsec_" prefix(es) to get raw base64 key
  let rawSecret = secret;
  while (rawSecret.startsWith("whsec_")) {
    rawSecret = rawSecret.slice(6);
  }

  // Verify timestamp is within 5-minute tolerance
  const timestampSec = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSec) > 300) {
    return false;
  }

  const keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const toSign = new TextEncoder().encode(
    `${svixId}.${svixTimestamp}.${body}`
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, toSign);
  const computed =
    "v1," +
    btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  // svix-signature may contain multiple space-separated signatures
  const candidates = svixSignature.split(" ");
  return candidates.some((s) => s.trim() === computed);
}

// ── Parse Hemlane notification email HTML ─────────────────────────────
interface LeadInfo {
  name: string | null;
  phone: string | null;
  email: string | null;
  property: string | null;
  message: string | null;
}

function parseHemlaneEmail(html: string, subject: string): LeadInfo {
  // Strip HTML tags for plain-text extraction
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, "")
    .trim();

  const result: LeadInfo = {
    name: null,
    phone: null,
    email: null,
    property: null,
    message: null,
  };

  // Name patterns
  const namePatterns = [
    /Name\s*[:\-]\s*(.+)/i,
    /Tenant(?:\s+Name)?\s*[:\-]\s*(.+)/i,
    /Applicant\s*[:\-]\s*(.+)/i,
    /From\s*[:\-]\s*([A-Z][a-z]+ [A-Z][a-z]+)/,
    /Contact\s*[:\-]\s*(.+)/i,
    /Lead\s*[:\-]\s*(.+)/i,
  ];
  for (const pat of namePatterns) {
    const m = text.match(pat);
    if (m) {
      result.name = m[1].trim().substring(0, 100);
      break;
    }
  }

  // Phone patterns
  const phonePatterns = [
    /Phone\s*[:\-]\s*([\d\s\-().+]+)/i,
    /Tel(?:ephone)?\s*[:\-]\s*([\d\s\-().+]+)/i,
    /Cell\s*[:\-]\s*([\d\s\-().+]+)/i,
    /Mobile\s*[:\-]\s*([\d\s\-().+]+)/i,
    /(\+?1?\s*\(?\d{3}\)?\s*[-.\s]?\d{3}\s*[-.\s]?\d{4})/,
  ];
  for (const pat of phonePatterns) {
    const m = text.match(pat);
    if (m) {
      result.phone = m[1].trim();
      break;
    }
  }

  // Email patterns
  const emailPatterns = [
    /Email\s*[:\-]\s*([\w.+-]+@[\w.-]+\.\w+)/i,
    /E-mail\s*[:\-]\s*([\w.+-]+@[\w.-]+\.\w+)/i,
    /([\w.+-]+@[\w.-]+\.\w{2,})/,
  ];
  for (const pat of emailPatterns) {
    const m = text.match(pat);
    if (m) {
      result.email = m[1].trim().toLowerCase();
      break;
    }
  }

  // Property patterns (from email body and subject)
  const propertyPatterns = [
    /Property\s*[:\-]\s*(.+)/i,
    /(?:Address|Unit|Listing)\s*[:\-]\s*(.+)/i,
    /(?:interested in|inquiry (?:for|about)|regarding)\s+(.+?)(?:\.|$)/i,
  ];
  for (const pat of propertyPatterns) {
    const m = text.match(pat);
    if (m) {
      result.property = m[1].trim().substring(0, 200);
      break;
    }
  }
  // Also try extracting property from subject line
  if (!result.property) {
    const subjectPat = subject.match(
      /(?:New (?:Lead|Inquiry|Message).*?(?:for|at|[-–:])\s*)(.+)/i
    );
    if (subjectPat) {
      result.property = subjectPat[1].trim().substring(0, 200);
    }
  }

  // Message / notes patterns
  const messagePatterns = [
    /Message\s*[:\-]\s*([\s\S]+?)(?=\n\s*(?:Name|Phone|Email|Property|Sent|$))/i,
    /Notes?\s*[:\-]\s*([\s\S]+?)(?=\n\s*(?:Name|Phone|Email|Property|Sent|$))/i,
    /Comments?\s*[:\-]\s*([\s\S]+?)(?=\n\s*(?:Name|Phone|Email|Property|Sent|$))/i,
  ];
  for (const pat of messagePatterns) {
    const m = text.match(pat);
    if (m) {
      result.message = m[1].trim().substring(0, 500);
      break;
    }
  }

  return result;
}

// ── Main handler ──────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── 1. Read raw body & verify webhook signature ─────────────────
    const rawBody = await req.text();
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (svixId && svixTimestamp && svixSignature) {
      const verified = await verifyWebhookSignature(
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
        webhookSecret
      );
      if (!verified) {
        console.error("Esther: webhook signature verification failed");
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const payload = JSON.parse(rawBody);

    // ── 2. Only process email.received events ───────────────────────
    if (payload.type !== "email.received") {
      return new Response(
        JSON.stringify({ message: `Ignored event type: ${payload.type}` }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const eventData = payload.data || {};
    const emailId = eventData.email_id;
    const subject = eventData.subject || "";
    const fromEmail = eventData.from || "";

    if (!emailId) {
      return new Response(
        JSON.stringify({ error: "Missing email_id in webhook payload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 3. Fetch full email body from Resend API ────────────────────
    const emailResponse = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}`,
      { headers: { Authorization: `Bearer ${resendApiKey}` } }
    );

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      throw new Error(
        `Resend API returned ${emailResponse.status}: ${errText}`
      );
    }

    const emailData = await emailResponse.json();
    const htmlBody = emailData.html || emailData.text || "";

    // ── 4. Parse lead info from Hemlane notification ────────────────
    const leadInfo = parseHemlaneEmail(htmlBody, subject);

    if (!leadInfo.phone && !leadInfo.email) {
      await supabase.from("system_logs").insert({
        level: "info",
        category: "general",
        event_type: "esther_parse_skip",
        message: `Esther: skipped email — no lead contact info found. Subject: ${subject}`,
        details: { email_id: emailId, from: fromEmail, subject },
      });

      return new Response(
        JSON.stringify({ message: "Email parsed but no lead info found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Get default organization ────────────────────────────────────
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "rent-finder-cleveland")
      .single();

    const organizationId = org?.id;
    if (!organizationId) {
      throw new Error("Default organization 'rent-finder-cleveland' not found");
    }

    // ── 5. Check duplicate by phone ─────────────────────────────────
    let leadId: string;
    let isNewLead = false;

    const cleanPhone = leadInfo.phone
      ? leadInfo.phone.replace(/\D/g, "")
      : "";
    const formattedPhone = cleanPhone
      ? cleanPhone.length === 10
        ? `+1${cleanPhone}`
        : `+${cleanPhone}`
      : "";

    if (formattedPhone) {
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, source_detail")
        .eq("organization_id", organizationId)
        .eq("phone", formattedPhone)
        .maybeSingle();

      if (existingLead) {
        leadId = existingLead.id;

        // ── 6a. Update existing lead ────────────────────────────────
        const noteEntry = `[Esther ${new Date().toISOString().slice(0, 16)}] Hemlane inquiry: ${leadInfo.property || "unknown property"}. ${leadInfo.message || ""}`.trim();
        const updatedDetail = existingLead.source_detail
          ? `${existingLead.source_detail}\n${noteEntry}`
          : noteEntry;

        await supabase
          .from("leads")
          .update({
            last_contact_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source_detail: updatedDetail,
            hemlane_email_id: emailId,
          })
          .eq("id", leadId);
      } else {
        isNewLead = true;
      }
    } else {
      // No phone — try email dedup
      if (leadInfo.email) {
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id, source_detail")
          .eq("organization_id", organizationId)
          .eq("email", leadInfo.email)
          .maybeSingle();

        if (existingLead) {
          leadId = existingLead.id;

          const noteEntry = `[Esther ${new Date().toISOString().slice(0, 16)}] Hemlane inquiry: ${leadInfo.property || "unknown property"}. ${leadInfo.message || ""}`.trim();
          const updatedDetail = existingLead.source_detail
            ? `${existingLead.source_detail}\n${noteEntry}`
            : noteEntry;

          await supabase
            .from("leads")
            .update({
              last_contact_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              source_detail: updatedDetail,
              hemlane_email_id: emailId,
            })
            .eq("id", leadId);
        } else {
          // No phone at all — can't create lead (phone is NOT NULL)
          await supabase.from("system_logs").insert({
            organization_id: organizationId,
            level: "warning",
            category: "general",
            event_type: "esther_no_phone",
            message: `Esther: lead has email (${leadInfo.email}) but no phone — cannot create lead record`,
            details: {
              email_id: emailId,
              subject,
              lead_name: leadInfo.name,
              lead_email: leadInfo.email,
              property: leadInfo.property,
            },
          });

          return new Response(
            JSON.stringify({
              message: "Lead email found but no phone number — cannot create lead",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // ── 6b. Create new lead ─────────────────────────────────────────
    if (isNewLead) {
      const { data: newLead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          organization_id: organizationId,
          full_name: leadInfo.name || "Unknown (Hemlane)",
          first_name: leadInfo.name?.split(" ")[0] || null,
          last_name:
            leadInfo.name?.split(" ").slice(1).join(" ") || null,
          phone: formattedPhone,
          email: leadInfo.email || null,
          source: "hemlane_email",
          source_detail: leadInfo.property
            ? `Property: ${leadInfo.property}`
            : null,
          status: "new",
          hemlane_email_id: emailId,
        })
        .select("id")
        .single();

      if (leadErr || !newLead) {
        throw new Error(`Failed to create lead: ${leadErr?.message}`);
      }
      leadId = newLead.id;
    }

    // ── 7. Log to system_logs ───────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "esther_lead_processed",
      message: `Esther: ${isNewLead ? "new lead created" : "existing lead updated"} — ${leadInfo.name || "unknown"} (${formattedPhone || leadInfo.email})`,
      details: {
        email_id: emailId,
        subject,
        from: fromEmail,
        lead_name: leadInfo.name,
        lead_phone: formattedPhone || null,
        lead_email: leadInfo.email,
        property: leadInfo.property,
        message: leadInfo.message,
        is_new_lead: isNewLead,
      },
      related_lead_id: leadId!,
    });

    // ── 8. Record cost via zacchaeus_record_cost ────────────────────
    await supabase.rpc("zacchaeus_record_cost", {
      p_organization_id: organizationId,
      p_service: "openai",
      p_usage_quantity: 1,
      p_usage_unit: "webhook_parse",
      p_unit_cost: 0,
      p_total_cost: 0,
      p_lead_id: leadId!,
    });

    // ── 9. Return success ───────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId!,
        is_new_lead: isNewLead,
        message: `Lead ${isNewLead ? "created" : "updated"} from Hemlane email`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("agent-hemlane-parser (Esther) error:", err);

    // Log error to system_logs
    try {
      await supabase.from("system_logs").insert({
        level: "error",
        category: "general",
        event_type: "esther_error",
        message: `Esther error: ${(err as Error).message}`,
        details: {
          error: (err as Error).message,
          stack: (err as Error).stack,
        },
      });
    } catch (_) {
      // Don't let logging failure mask the original error
    }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
