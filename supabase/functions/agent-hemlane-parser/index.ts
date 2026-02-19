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

/** Extract value from "LABEL\nvalue" format common in Hemlane new-inquiry emails */
function extractLabelValue(text: string, labelPattern: string): string | null {
  const pattern = new RegExp(
    `^[ \\t]*${labelPattern}[ \\t]*$\\n([^\\n]+)`,
    "im"
  );
  const m = text.match(pattern);
  return m ? m[1].trim() : null;
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

  // Excluded email domains (system emails, not lead emails)
  const excludedDomains = ["hemlane.com", "rentfindercleveland.com", "inbound.rentfindercleveland.com"];

  // ── Hemlane-specific patterns (highest priority) ─────────────────

  // Hemlane format: "{Name} sent a message about {Property}:"
  const hemlaneMessagePat = text.match(
    /([A-Za-z][A-Za-z\s'-]+?)\s+sent a message about\s+(.+?):/i
  );
  if (hemlaneMessagePat) {
    result.name = hemlaneMessagePat[1].trim().substring(0, 100);
    result.property = hemlaneMessagePat[2].trim().substring(0, 200);

    // Extract message: text between "about {Property}:" and "View and Respond"
    const msgPat = text.match(
      /sent a message about .+?:\s*\n([\s\S]+?)(?=\s*View and Respond|\s*Available Rental|\s*$)/i
    );
    if (msgPat) {
      result.message = msgPat[1].trim().substring(0, 500);
    }
  }

  // Hemlane format: "{Name} is interested in {Property}" or "New inquiry from {Name}"
  if (!result.name) {
    const inquiryPat = text.match(
      /([A-Za-z][A-Za-z\s'-]+?)\s+is interested in\s+(.+?)(?:\.|$)/im
    );
    if (inquiryPat) {
      result.name = inquiryPat[1].trim().substring(0, 100);
      if (!result.property) {
        result.property = inquiryPat[2].trim().substring(0, 200);
      }
    }
  }

  if (!result.name) {
    const fromPat = text.match(
      /(?:inquiry|message|application)\s+from\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+for|\s+about|\s*$)/im
    );
    if (fromPat) {
      result.name = fromPat[1].trim().substring(0, 100);
    }
  }

  // Hemlane "Available Rental: {address} | ${price} per month"
  if (!result.property) {
    const rentalPat = text.match(
      /Available Rental:\s*(.+?)(?:\s*\||\s*\(|$)/im
    );
    if (rentalPat) {
      result.property = rentalPat[1].trim().substring(0, 200);
    }
  }

  // ── Extract property from subject line ───────────────────────────
  if (!result.property) {
    const subjectPatterns = [
      /Rental Message from\s+(.+)/i,
      /New inquiry for\s+(.+)/i,
      /New (?:Lead|Inquiry|Message).*?(?:for|at|[-–:])\s*(.+)/i,
    ];
    for (const pat of subjectPatterns) {
      const m = subject.match(pat);
      if (m) {
        result.property = m[1].trim().substring(0, 200);
        break;
      }
    }
  }

  // ── Generic name patterns (fallback) ─────────────────────────────
  // Hemlane "New inquiry" format: "NAME\nValue" on separate lines
  if (!result.name) {
    const labelName = extractLabelValue(text, "NAME")
      || extractLabelValue(text, "TENANT(?:\\s+NAME)?")
      || extractLabelValue(text, "CONTACT")
      || extractLabelValue(text, "APPLICANT");
    if (labelName && labelName.length > 1 && labelName.length <= 100) {
      result.name = labelName;
    }
  }
  if (!result.name) {
    const namePatterns = [
      /Name\s*[:\-]\s*(.+)/i,
      /Tenant(?:\s+Name)?\s*[:\-]\s*(.+)/i,
      /Applicant\s*[:\-]\s*(.+)/i,
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
  }

  // ── Phone patterns ───────────────────────────────────────────────
  // Hemlane "New inquiry" format: "PHONE\n773-931-0649"
  const labelPhone = extractLabelValue(text, "PHONE");
  if (labelPhone && labelPhone.replace(/\D/g, "").length >= 7) {
    result.phone = labelPhone;
  }
  if (!result.phone) {
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
  }

  // ── Email patterns (exclude system domains) ──────────────────────
  // Hemlane "New inquiry" format: "EMAIL\nuser@example.com"
  const labelEmail = extractLabelValue(text, "E-?MAIL");
  if (labelEmail) {
    const emailCandidate = labelEmail.toLowerCase();
    if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(emailCandidate) && !excludedDomains.some((d) => emailCandidate.endsWith(d))) {
      result.email = emailCandidate;
    }
  }
  if (!result.email) {
    const emailPatterns = [
      /Email\s*[:\-]\s*([\w.+-]+@[\w.-]+\.\w+)/i,
      /E-mail\s*[:\-]\s*([\w.+-]+@[\w.-]+\.\w+)/i,
    ];
    for (const pat of emailPatterns) {
      const m = text.match(pat);
      if (m) {
        const candidate = m[1].trim().toLowerCase();
        if (!excludedDomains.some((d) => candidate.endsWith(d))) {
          result.email = candidate;
          break;
        }
      }
    }
  }
  // Fallback: find all emails and pick the first non-system one
  if (!result.email) {
    const allEmails = text.matchAll(/([\w.+-]+@[\w.-]+\.\w{2,})/g);
    for (const m of allEmails) {
      const candidate = m[1].trim().toLowerCase();
      if (!excludedDomains.some((d) => candidate.endsWith(d))) {
        result.email = candidate;
        break;
      }
    }
  }

  // ── Generic property patterns (fallback) ─────────────────────────
  if (!result.property) {
    const labelProperty = extractLabelValue(text, "PROPERTY")
      || extractLabelValue(text, "ADDRESS")
      || extractLabelValue(text, "LISTING");
    if (labelProperty) {
      result.property = labelProperty.substring(0, 200);
    }
  }
  if (!result.property) {
    const propertyPatterns = [
      /Property\s*[:\-]\s*(.+)/i,
      /(?:Address|Unit|Listing)\s*[:\-]\s*(.+)/i,
    ];
    for (const pat of propertyPatterns) {
      const m = text.match(pat);
      if (m) {
        result.property = m[1].trim().substring(0, 200);
        break;
      }
    }
  }

  // ── Message patterns (fallback) ──────────────────────────────────
  // Hemlane "New inquiry" format: "COMMENTS\nMulti-line message..."
  if (!result.message) {
    const commentsPat = text.match(
      /^[ \t]*COMMENTS?[ \t]*$\n([\s\S]+?)(?=\n[ \t]*(?:PROPERTY|SOURCE|NAME|PHONE|EMAIL|SENT|DATE)[ \t]*$|\s*$)/im
    );
    if (commentsPat) {
      result.message = commentsPat[1].trim().substring(0, 500);
    }
  }
  if (!result.message) {
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
  }

  return result;
}

// ── Parse Hemlane Daily Digest ("Property Listings Update") ───────────
function parseHemlaneDigest(html: string): LeadInfo[] {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, "")
    .trim();

  const leads: LeadInfo[] = [];
  const lines = text.split("\n");
  const excludedDomains = ["hemlane.com", "rentfindercleveland.com", "inbound.rentfindercleveland.com"];

  let currentProperty: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";

    // Detect property header: a non-empty line followed by dashes
    if (nextLine && /^-{5,}$/.test(nextLine) && line.length > 3) {
      if (!/^(Past \d|Daily Leads)/i.test(line)) {
        currentProperty = line;
      }
      i++;
      continue;
    }

    // Skip headers and empty lines
    if (/^(CONTACT|EMAIL \| PHONE|EMAIL|PHONE|SOURCE|DATE|\*+|-+|View My Dashboard|Website|Facebook|Twitter|LinkedIn)/i.test(line) || line === "") {
      continue;
    }

    // Look for email on this line (allow surrounding whitespace/parens)
    const emailMatch = line.match(/^[\s(]*([\w.+-]+@[\w.-]+\.\w{2,})[\s)]*$/);
    if (emailMatch && currentProperty) {
      const email = emailMatch[1].toLowerCase();
      if (excludedDomains.some((d) => email.endsWith(d))) continue;

      // Name: scan backwards for a non-email, non-phone, non-header line
      let name: string | null = null;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j].trim();
        if (
          prev &&
          !/^(CONTACT|EMAIL|PHONE|SOURCE|DATE|\*|-|$)/i.test(prev) &&
          !prev.match(/[\w.+-]+@/) &&
          !prev.match(/^\+?[\d\s\-().]{7,}$/) &&
          !prev.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) &&
          !prev.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Zillow|Apartments|Zumper|Hemlane|Facebook|Craigslist|Realtor)/i)
        ) {
          name = prev;
          break;
        }
      }

      // Phone: scan forward for a phone-like line
      let phone: string | null = null;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
        const next = lines[j].trim();
        if (next && /^[\d\s\-().+]+$/.test(next) && next.replace(/\D/g, "").length >= 7) {
          phone = next;
          break;
        }
      }

      if (phone) {
        leads.push({
          name: name?.substring(0, 100) || null,
          email,
          phone,
          property: currentProperty,
          message: null,
        });
      }
    }
  }

  return leads;
}

// ── Format phone to E.164 ─────────────────────────────────────────────
function formatPhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// ── Upsert a single lead ──────────────────────────────────────────────
async function upsertLead(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  lead: LeadInfo,
  emailId: string
): Promise<{ leadId: string; isNew: boolean } | null> {
  const phone = lead.phone ? formatPhoneE164(lead.phone) : "";

  if (!phone && !lead.email) return null;

  // Check duplicate by phone
  if (phone) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id, source_detail")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      const note = `[Esther ${new Date().toISOString().slice(0, 16)}] ${lead.property || "unknown property"}. ${lead.message || ""}`.trim();
      const detail = existing.source_detail
        ? `${existing.source_detail}\n${note}`
        : note;

      await supabase
        .from("leads")
        .update({
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_detail: detail,
          hemlane_email_id: emailId,
          // Fill in email if missing
          ...(lead.email ? { email: lead.email } : {}),
        })
        .eq("id", existing.id);

      return { leadId: existing.id, isNew: false };
    }
  }

  // Check duplicate by email
  if (lead.email && !phone) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id, source_detail")
      .eq("organization_id", organizationId)
      .eq("email", lead.email)
      .maybeSingle();

    if (existing) {
      const note = `[Esther ${new Date().toISOString().slice(0, 16)}] ${lead.property || "unknown property"}. ${lead.message || ""}`.trim();
      const detail = existing.source_detail
        ? `${existing.source_detail}\n${note}`
        : note;

      await supabase
        .from("leads")
        .update({
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_detail: detail,
          hemlane_email_id: emailId,
        })
        .eq("id", existing.id);

      return { leadId: existing.id, isNew: false };
    }
  }

  // No phone = can't create (NOT NULL constraint)
  if (!phone) return null;

  // Create new lead
  const { data: newLead, error: err } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      full_name: lead.name || "Unknown (Hemlane)",
      first_name: lead.name?.split(" ")[0] || null,
      last_name: lead.name?.split(" ").slice(1).join(" ") || null,
      phone,
      email: lead.email || null,
      source: "hemlane_email",
      source_detail: lead.property ? `Property: ${lead.property}` : null,
      status: "new",
      hemlane_email_id: emailId,
    })
    .select("id")
    .single();

  if (err || !newLead) {
    console.error(`Esther: failed to create lead ${lead.name}: ${err?.message}`);
    return null;
  }

  return { leadId: newLead.id, isNew: true };
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
    const textBody = emailData.text || "";

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

    // ── 4. Detect email type and parse ──────────────────────────────
    const isDigest = /Property Listings Update|Daily Leads Update/i.test(subject);

    if (isDigest) {
      // ── DIGEST: batch-process all leads ───────────────────────────
      // Use plain text for digest — HTML tables don't parse well
      const digestLeads = parseHemlaneDigest(textBody || htmlBody);

      if (digestLeads.length === 0) {
        await supabase.from("system_logs").insert({
          organization_id: organizationId,
          level: "info",
          category: "general",
          event_type: "esther_digest_empty",
          message: `Esther: digest email parsed but no leads found. Subject: ${subject}`,
          details: { email_id: emailId, from: fromEmail, subject },
        });

        return new Response(
          JSON.stringify({ message: "Digest parsed but no leads found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const lead of digestLeads) {
        try {
          const result = await upsertLead(supabase, organizationId, lead, emailId);
          if (result) {
            if (result.isNew) created++;
            else updated++;
          } else {
            skipped++;
          }
        } catch (e) {
          console.error(`Esther digest: error processing ${lead.name}: ${(e as Error).message}`);
          skipped++;
        }
      }

      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "info",
        category: "general",
        event_type: "esther_digest_processed",
        message: `Esther: daily digest processed — ${created} new, ${updated} updated, ${skipped} skipped (${digestLeads.length} total)`,
        details: {
          email_id: emailId,
          subject,
          total_leads: digestLeads.length,
          created,
          updated,
          skipped,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          type: "digest",
          total: digestLeads.length,
          created,
          updated,
          skipped,
          message: `Digest: ${created} new, ${updated} updated, ${skipped} skipped`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SINGLE EMAIL: parse one lead ────────────────────────────────
    const leadInfo = parseHemlaneEmail(htmlBody, subject);

    if (!leadInfo.phone && !leadInfo.email) {
      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "info",
        category: "general",
        event_type: "esther_parse_skip",
        message: `Esther: skipped email — no lead contact info found. Subject: ${subject}`,
        details: { email_id: emailId, from: fromEmail, subject },
      });

      return new Response(
        JSON.stringify({ message: "Email parsed but no lead info found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await upsertLead(supabase, organizationId, leadInfo, emailId);

    if (!result) {
      return new Response(
        JSON.stringify({ message: "Could not create lead (missing phone)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPhone = leadInfo.phone ? formatPhoneE164(leadInfo.phone) : "";

    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "esther_lead_processed",
      message: `Esther: ${result.isNew ? "new lead created" : "existing lead updated"} — ${leadInfo.name || "unknown"} (${formattedPhone || leadInfo.email})`,
      details: {
        email_id: emailId,
        subject,
        from: fromEmail,
        lead_name: leadInfo.name,
        lead_phone: formattedPhone || null,
        lead_email: leadInfo.email,
        property: leadInfo.property,
        message: leadInfo.message,
        is_new_lead: result.isNew,
      },
      related_lead_id: result.leadId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: result.leadId,
        is_new_lead: result.isNew,
        message: `Lead ${result.isNew ? "created" : "updated"} from Hemlane email`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
