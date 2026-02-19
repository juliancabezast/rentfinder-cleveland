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
  listingSource: string | null;
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
    // Remove <style> and <script> blocks FIRST (their content leaks as false text)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|td|li|h[1-6])>/gi, "\n")
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
    listingSource: null,
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
      /^[ \t]*COMMENTS?[ \t]*$\n([\s\S]+?)(?=\n[ \t]*(?:PROPERTY|SOURCE|NAME|PHONE|EMAIL|SENT|DATE|Respond to)[ \t]*)/im
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

  // ── Listing source (Zillow, Apartments.com, etc.) ──────────────
  const labelSource = extractLabelValue(text, "SOURCE");
  if (labelSource && !/hemlane/i.test(labelSource)) {
    result.listingSource = labelSource.substring(0, 100);
  }
  if (!result.listingSource) {
    const sourcePat = text.match(/Source\s*[:\-]\s*(.+)/i);
    if (sourcePat) {
      const src = sourcePat[1].trim();
      if (!/hemlane/i.test(src)) {
        result.listingSource = src.substring(0, 100);
      }
    }
  }

  return result;
}

// ── Parse Hemlane Daily Digest ("Property Listings Update") ───────────
function parseHemlaneDigest(html: string): LeadInfo[] {
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|td|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, "")
    .trim();

  const leads: LeadInfo[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const excludedDomains = ["hemlane.com", "rentfindercleveland.com", "inbound.rentfindercleveland.com"];

  // Known listing sources for detection
  const LISTING_SOURCES = ["Zillow", "Zumper", "Zumper.com", "Apartments.com", "Apartments", "Hemlane", "Facebook", "Craigslist", "Realtor", "Realtor.com", "Trulia", "HotPads", "Rent.com"];
  const listingSourceSet = new Set(LISTING_SOURCES.map((s) => s.toLowerCase()));

  // Skip patterns: table headers, navigation, boilerplate
  const isSkipLine = (l: string) =>
    /^(CONTACT|EMAIL\s*[|I]\s*PHONE|SOURCE|DATE|\*+|-{3,}|View My Dashboard|Website|Facebook Marketplace|Twitter|LinkedIn|Past \d|Daily Leads|These prospective)/i.test(l);

  // Detect address-like lines: starts with number + has street-like words, or ends with "Unit X"
  const isAddressLine = (l: string) =>
    /^\d+\s+\w/.test(l) && (
      /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|place|pl|court|ct|circle|cir|terrace|parkway)\b/i.test(l) ||
      /,?\s*unit\s+\w/i.test(l)
    );

  let currentProperty: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Property header detection ─────────────────────────────────
    // Strategy 1: line followed by dashes (original format)
    if (i + 1 < lines.length && /^-{5,}$/.test(lines[i + 1]) && line.length > 3) {
      if (!isSkipLine(line)) {
        currentProperty = line;
      }
      i++;
      continue;
    }

    // Strategy 2: address-like line followed by "CONTACT" within 1-3 lines
    if (isAddressLine(line)) {
      for (let k = i + 1; k <= Math.min(lines.length - 1, i + 3); k++) {
        if (/^CONTACT/i.test(lines[k])) {
          currentProperty = line;
          break;
        }
      }
      continue;
    }

    if (isSkipLine(line)) continue;

    // ── Email detection → build lead record ───────────────────────
    const emailMatch = line.match(/^[\s(]*([\w.+-]+@[\w.-]+\.\w{2,})[\s)]*$/);
    if (emailMatch) {
      const email = emailMatch[1].toLowerCase();
      if (excludedDomains.some((d) => email.endsWith(d))) continue;

      // Name: scan backwards for a non-email, non-phone, non-header, non-source line
      let name: string | null = null;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j];
        if (
          !isSkipLine(prev) &&
          !prev.match(/[\w.+-]+@/) &&
          !prev.match(/^\+?[\d\s\-().]{7,}$/) &&
          !prev.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/) &&
          !prev.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i) &&
          !listingSourceSet.has(prev.toLowerCase()) &&
          !isAddressLine(prev)
        ) {
          name = prev;
          break;
        }
      }

      // Phone: scan forward for a phone-like line
      let phone: string | null = null;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
        const next = lines[j];
        if (/^[\d\s\-().+]+$/.test(next) && next.replace(/\D/g, "").length >= 7) {
          phone = next;
          break;
        }
      }

      // Listing source: scan forward for a known source name (within 5 lines after email)
      let listingSource: string | null = null;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 6); j++) {
        const next = lines[j];
        if (listingSourceSet.has(next.toLowerCase())) {
          listingSource = next;
          break;
        }
        // Also try partial match for "Zumper.com" etc.
        const srcMatch = LISTING_SOURCES.find((s) => next.toLowerCase() === s.toLowerCase());
        if (srcMatch) {
          listingSource = srcMatch;
          break;
        }
      }

      if (phone || email) {
        leads.push({
          name: name?.substring(0, 100) || null,
          email,
          phone,
          property: currentProperty,
          message: null,
          listingSource,
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

// ── Match property by address ────────────────────────────────────────
async function matchProperty(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  propertyAddress: string
): Promise<string | null> {
  // Strategy 1: full address as search term (works if DB address contains digest address)
  const { data: exact } = await supabase
    .from("properties")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("address", `%${propertyAddress}%`)
    .limit(1)
    .maybeSingle();
  if (exact?.id) return exact.id;

  // Strategy 2: street part only (before first comma — "3549 E 105th St, Cleveland" → "3549 E 105th St")
  const streetPart = propertyAddress.split(",")[0].trim();
  if (streetPart && streetPart !== propertyAddress) {
    const { data: street } = await supabase
      .from("properties")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("address", `%${streetPart}%`)
      .limit(1)
      .maybeSingle();
    if (street?.id) return street.id;
  }

  // Strategy 3: extract street number + street name prefix (first 3 words)
  const numberMatch = propertyAddress.match(/^(\d+\s+\S+(?:\s+\S+)?)/);
  if (numberMatch) {
    const prefix = numberMatch[1].trim();
    const { data: prefix_match } = await supabase
      .from("properties")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("address", `%${prefix}%`)
      .limit(1)
      .maybeSingle();
    if (prefix_match?.id) return prefix_match.id;
  }

  return null;
}

// ── Upsert a single lead ──────────────────────────────────────────────
async function upsertLead(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  lead: LeadInfo,
  emailId: string
): Promise<{ leadId: string; isNew: boolean; missingName: boolean; missingPhone: boolean } | null> {
  const phone = lead.phone ? formatPhoneE164(lead.phone) : null;

  // Only skip if we truly have nothing (no contact info AND no name/property)
  if (!phone && !lead.email && !lead.name && !lead.property) return null;

  // Build source detail string
  const sourceVia = lead.listingSource ? ` (via ${lead.listingSource})` : "";
  const propertyDetail = lead.property ? `Property: ${lead.property}${sourceVia}` : null;

  // Match property in DB
  const propertyId = lead.property
    ? await matchProperty(supabase, organizationId, lead.property)
    : null;

  // Check duplicate by phone
  if (phone) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id, full_name, source_detail, interested_property_id")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      const note = `[Esther ${new Date().toISOString().slice(0, 16)}] ${lead.property || "unknown property"}${sourceVia}. ${lead.message || ""}`.trim();
      const detail = existing.source_detail
        ? `${existing.source_detail}\n${note}`
        : note;

      // Fix name if existing is garbage (from previous parse bugs) and we have a real name
      const needsNameFix = lead.name && existing.full_name && (
        existing.full_name.includes("{") ||
        existing.full_name.startsWith("Hemlane Lead") ||
        existing.full_name.startsWith("detail")
      );

      await supabase
        .from("leads")
        .update({
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_detail: detail,
          hemlane_email_id: emailId,
          ...(lead.email ? { email: lead.email } : {}),
          ...(propertyId && !existing.interested_property_id ? { interested_property_id: propertyId } : {}),
          ...(needsNameFix ? {
            full_name: lead.name,
            first_name: lead.name!.split(" ")[0] || null,
            last_name: lead.name!.split(" ").slice(1).join(" ") || null,
          } : {}),
        })
        .eq("id", existing.id);

      // Save message as note on existing lead too
      if (lead.message) {
        await saveLeadNote(supabase, organizationId, existing.id, lead.message);
      }

      // Auto-score existing lead if message shows intent
      if (lead.message) {
        const intent = detectHighIntent(lead.message);
        if (intent) {
          await supabase.rpc("log_score_change", {
            _lead_id: existing.id,
            _change_amount: intent.boost,
            _reason_code: "inquiry_intent",
            _reason_text: intent.reason,
            _triggered_by: "engagement",
            _changed_by_agent: "esther",
          }).catch((e: Error) => console.error(`Esther: score boost failed: ${e.message}`));
        }
      }

      // Add property to lead_properties (multi-property support)
      if (propertyId) {
        await supabase.from("lead_properties").upsert({
          organization_id: organizationId,
          lead_id: existing.id,
          property_id: propertyId,
          source: "hemlane_email",
          listing_source: lead.listingSource || null,
        }, { onConflict: "lead_id,property_id" }).catch(() => {});
      }

      return { leadId: existing.id, isNew: false, missingName: false, missingPhone: false };
    }
  }

  // Check duplicate by email
  if (lead.email) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id, full_name, source_detail, phone, interested_property_id")
      .eq("organization_id", organizationId)
      .eq("email", lead.email)
      .maybeSingle();

    if (existing) {
      const note = `[Esther ${new Date().toISOString().slice(0, 16)}] ${lead.property || "unknown property"}${sourceVia}. ${lead.message || ""}`.trim();
      const detail = existing.source_detail
        ? `${existing.source_detail}\n${note}`
        : note;

      // Fix name if existing is garbage (from previous parse bugs) and we have a real name
      const needsNameFix = lead.name && existing.full_name && (
        existing.full_name.includes("{") ||
        existing.full_name.startsWith("Hemlane Lead") ||
        existing.full_name.startsWith("detail")
      );

      await supabase
        .from("leads")
        .update({
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_detail: detail,
          hemlane_email_id: emailId,
          ...(phone && !existing.phone ? { phone } : {}),
          ...(propertyId && !existing.interested_property_id ? { interested_property_id: propertyId } : {}),
          ...(needsNameFix ? {
            full_name: lead.name,
            first_name: lead.name!.split(" ")[0] || null,
            last_name: lead.name!.split(" ").slice(1).join(" ") || null,
          } : {}),
        })
        .eq("id", existing.id);

      // Save message as note on existing lead too
      if (lead.message) {
        await saveLeadNote(supabase, organizationId, existing.id, lead.message);
      }

      // Auto-score existing lead if message shows intent
      if (lead.message) {
        const intent = detectHighIntent(lead.message);
        if (intent) {
          await supabase.rpc("log_score_change", {
            _lead_id: existing.id,
            _change_amount: intent.boost,
            _reason_code: "inquiry_intent",
            _reason_text: intent.reason,
            _triggered_by: "engagement",
            _changed_by_agent: "esther",
          }).catch((e: Error) => console.error(`Esther: score boost failed: ${e.message}`));
        }
      }

      // Add property to lead_properties (multi-property support)
      if (propertyId) {
        await supabase.from("lead_properties").upsert({
          organization_id: organizationId,
          lead_id: existing.id,
          property_id: propertyId,
          source: "hemlane_email",
          listing_source: lead.listingSource || null,
        }, { onConflict: "lead_id,property_id" }).catch(() => {});
      }

      return { leadId: existing.id, isNew: false, missingName: false, missingPhone: false };
    }
  }

  // Build display name
  const displayPhone = phone
    ? phone.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")
    : null;
  const fallbackIdentifier = displayPhone || lead.email || "unknown";
  const fullName = lead.name || `Hemlane Lead ${fallbackIdentifier}`;

  // Create new lead — with consent flags since they initiated contact
  const { data: newLead, error: err } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      full_name: fullName,
      first_name: lead.name?.split(" ")[0] || null,
      last_name: lead.name?.split(" ").slice(1).join(" ") || null,
      phone: phone || null,
      email: lead.email || null,
      source: "hemlane_email",
      source_detail: propertyDetail,
      status: "new",
      hemlane_email_id: emailId,
      interested_property_id: propertyId,
      sms_consent: true,
      sms_consent_at: new Date().toISOString(),
      call_consent: true,
      call_consent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (err || !newLead) {
    console.error(`Esther: failed to create lead ${fullName}: ${err?.message}`);
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "error",
      category: "general",
      event_type: "esther_db_insert_failed",
      message: `Esther: DB insert failed for lead ${fullName}. Error: ${err?.message}`,
      details: {
        lead_name: lead.name,
        lead_phone: phone,
        lead_email: lead.email,
        lead_property: lead.property,
        lead_listing_source: lead.listingSource,
        hemlane_email_id: emailId,
        error: err?.message,
        error_code: err?.code,
      },
    }).catch(() => {});
    return null;
  }

  const leadId = newLead.id;
  const now = new Date().toISOString();
  const listingPlatform = lead.listingSource || "Hemlane";
  const evidenceText = `Lead initiated contact via ${listingPlatform} property listing${lead.property ? ` for ${lead.property}` : ""}. Inbound inquiry = implicit consent to be contacted back. Received ${now}. Email ID: ${emailId}`;

  // ── Add to lead_properties junction table ─────────────────────────
  if (propertyId) {
    await supabase.from("lead_properties").insert({
      organization_id: organizationId,
      lead_id: leadId,
      property_id: propertyId,
      source: "hemlane_email",
      listing_source: lead.listingSource || null,
    }).catch(() => {});
  }

  // ── Save initial message as a lead note ──────────────────────────
  if (lead.message) {
    await saveLeadNote(supabase, organizationId, leadId, lead.message);
  }

  // ── Record consent (inbound inquiry = they contacted us) ─────────
  const consentTypes = ["automated_calls", "sms_marketing", "email_marketing"] as const;
  for (const consentType of consentTypes) {
    const { error: consentErr } = await supabase.from("consent_log").insert({
      organization_id: organizationId,
      lead_id: leadId,
      consent_type: consentType,
      granted: true,
      method: "web_form",
      evidence_text: evidenceText,
    });
    if (consentErr) {
      console.error(`Esther: consent_log insert failed (${consentType}): ${consentErr.message}`);
    }
  }

  // ── Auto-score based on message intent ──────────────────────────
  if (lead.message) {
    const intent = detectHighIntent(lead.message);
    if (intent) {
      await supabase.rpc("log_score_change", {
        _lead_id: leadId,
        _change_amount: intent.boost,
        _reason_code: "inquiry_intent",
        _reason_text: intent.reason,
        _triggered_by: "engagement",
        _changed_by_agent: "esther",
      }).catch((e: Error) => console.error(`Esther: score boost failed: ${e.message}`));
    }
  }

  return { leadId, isNew: true, missingName: !lead.name, missingPhone: !phone };
}

// ── Save lead note (handles missing created_by gracefully) ───────────
async function saveLeadNote(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  leadId: string,
  message: string
): Promise<void> {
  const content = `[Hemlane inquiry] ${message}`;

  // Try with created_by as null first
  const { error } = await supabase.from("lead_notes").insert({
    organization_id: organizationId,
    lead_id: leadId,
    content,
    note_type: "general",
    is_pinned: false,
    created_by: null,
  });

  if (error) {
    console.error(`Esther: lead_notes insert failed: ${error.message} (code: ${error.code})`);
    // Log to system_logs so we can see the failure in the dashboard
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "warn",
      category: "general",
      event_type: "esther_note_save_failed",
      message: `Esther: could not save lead note. Error: ${error.message}`,
      details: { lead_id: leadId, error: error.message, error_code: error.code },
    }).catch(() => {});
  }
}

// ── Detect high-intent language in lead messages ─────────────────────
function detectHighIntent(message: string): { boost: number; reason: string } | null {
  const m = message.toLowerCase();

  // Tier 1 — Showing / tour intent (+35 → hits 85 priority threshold)
  const showingPatterns = [
    /schedul\w*\s+(a\s+)?(tour|showing|visit|viewing|walkthrough)/,
    /\b(want|like|love|interested)\b.*\b(tour|showing|visit|see|view)\b/,
    /\b(can|could)\s+(i|we)\s+(tour|visit|see|view|come\s+see)/,
    /\bset\s+up\s+a?\s*(tour|showing|visit|viewing)\b/,
    /\b(book|request)\s+a?\s*(tour|showing|visit|viewing)\b/,
    /\bwhen\s+can\s+(i|we)\s+(tour|see|visit|view|come)/,
    /\b(move[\s-]?in|ready\s+to\s+move|looking\s+to\s+move)\b/,
  ];
  for (const pat of showingPatterns) {
    if (pat.test(m)) {
      return { boost: 35, reason: "Lead expressed showing/tour intent in inquiry message" };
    }
  }

  // Tier 2 — Strong engagement signals (+20 → score 70, not priority but elevated)
  const engagementPatterns = [
    /\b(how\s+much|what.*rent|price|cost|monthly)\b/,
    /\b(available|availability|still\s+available|is\s+(it|this)\s+available)\b/,
    /\b(apply|application|how\s+(do|can)\s+(i|we)\s+apply)\b/,
    /\b(voucher|section\s*8|hcv)\b/,
  ];
  for (const pat of engagementPatterns) {
    if (pat.test(m)) {
      return { boost: 20, reason: "Lead asked about availability/pricing/application in inquiry" };
    }
  }

  return null;
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

    // ── Extract reply_to as fallback contact email ────────────────
    const excludedEmailDomains = ["hemlane.com", "rentfindercleveland.com", "inbound.rentfindercleveland.com"];
    let replyToEmail: string | null = null;
    if (emailData.reply_to) {
      const replyTos = Array.isArray(emailData.reply_to) ? emailData.reply_to : [emailData.reply_to];
      for (const rt of replyTos) {
        const rtMatch = String(rt).toLowerCase().match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
        if (rtMatch && !excludedEmailDomains.some((d) => rtMatch[0].endsWith(d))) {
          replyToEmail = rtMatch[0];
          break;
        }
      }
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
      const digestFollowUps: string[] = [];

      for (const lead of digestLeads) {
        try {
          const result = await upsertLead(supabase, organizationId, lead, emailId);
          if (!result) {
            skipped++;
            continue;
          }

          if (result.isNew) created++;
          else updated++;

          // Schedule follow-up for incomplete new leads
          if (result.isNew && (result.missingName || result.missingPhone)) {
            const scheduleAt = new Date();
            scheduleAt.setMinutes(scheduleAt.getMinutes() + 2);
            const leadPhone = lead.phone ? formatPhoneE164(lead.phone) : null;

            if (leadPhone) {
              // Has phone → Ruth SMS
              await supabase.from("agent_tasks").insert({
                organization_id: organizationId,
                lead_id: result.leadId,
                agent_type: "sms_inbound",
                action_type: "sms",
                scheduled_for: scheduleAt.toISOString(),
                status: "pending",
                context: {
                  task: "intro_missing_info",
                  source: "esther_digest_auto",
                  instruction: "Lead arrived from Hemlane digest without a name. Send a friendly intro SMS to gather their name and what property they are interested in.",
                  parsed_property: lead.property || null,
                },
              });
              digestFollowUps.push(`Ruth SMS → ${leadPhone}`);
            } else if (lead.email) {
              // No phone, has email → send email
              const propertyMention = lead.property
                ? ` about <strong>${lead.property}</strong>`
                : "";
              try {
                await supabase.functions.invoke("send-notification-email", {
                  body: {
                    to: lead.email,
                    subject: "Thanks for your interest! — Rent Finder Cleveland",
                    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                      <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
                        <h1 style="margin:0;color:#ffb22c;font-size:20px;">Thanks for reaching out!</h1>
                      </div>
                      <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                        <p>Hi there! We received your inquiry${propertyMention} and would love to help you find the perfect rental.</p>
                        <p>To get you set up quickly, could you reply with:</p>
                        <ul>
                          <li><strong>Your full name</strong></li>
                          <li><strong>Best phone number</strong> to reach you</li>
                        </ul>
                        <p>Once we have that, our team will reach out to schedule a showing at a time that works for you.</p>
                        <br>
                        <p style="color:#666;font-size:14px;">— The Rent Finder Cleveland Team</p>
                      </div>
                    </div>`,
                    notification_type: "lead_info_request",
                    organization_id: organizationId,
                    related_entity_id: result.leadId,
                    related_entity_type: "lead",
                    from_name: "Rent Finder Cleveland",
                  },
                });
                digestFollowUps.push(`email → ${lead.email}`);
              } catch (emailErr) {
                console.error(`Esther digest: email send failed for ${lead.email}: ${(emailErr as Error).message}`);
                digestFollowUps.push(`email FAILED → ${lead.email}`);
              }
            }
          }
        } catch (e) {
          console.error(`Esther digest: error processing ${lead.name}: ${(e as Error).message}`);
          await supabase.from("system_logs").insert({
            organization_id: organizationId,
            level: "error",
            category: "general",
            event_type: "esther_digest_lead_error",
            message: `Esther digest: failed to process lead ${lead.name || lead.email || lead.phone}. ${(e as Error).message}`,
            details: { lead, error: (e as Error).message },
          }).catch(() => {});
          skipped++;
        }
      }

      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "info",
        category: "general",
        event_type: "esther_digest_processed",
        message: `Esther: daily digest processed — ${created} new, ${updated} updated, ${skipped} skipped (${digestLeads.length} total)${digestFollowUps.length > 0 ? `. Follow-ups: ${digestFollowUps.length}` : ""}`,
        details: {
          email_id: emailId,
          subject,
          total_leads: digestLeads.length,
          created,
          updated,
          skipped,
          follow_ups: digestFollowUps,
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

    // Use reply_to email as fallback if parser didn't find one
    if (!leadInfo.email && replyToEmail) {
      leadInfo.email = replyToEmail;
    }

    // Only skip if we truly have NOTHING useful
    if (!leadInfo.phone && !leadInfo.email && !leadInfo.name && !leadInfo.property) {
      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "warn",
        category: "general",
        event_type: "esther_parse_skip",
        message: `Esther: skipped email — no lead info found at all. Subject: ${subject}`,
        details: {
          email_id: emailId,
          from: fromEmail,
          subject,
          body_preview: (textBody || htmlBody).substring(0, 1500),
        },
      });

      return new Response(
        JSON.stringify({ message: "Email parsed but no lead info found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await upsertLead(supabase, organizationId, leadInfo, emailId);

    if (!result) {
      return new Response(
        JSON.stringify({ message: "Could not create lead (no phone or email)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPhone = leadInfo.phone ? formatPhoneE164(leadInfo.phone) : null;
    const contactId = formattedPhone || leadInfo.email || "unknown";
    const followUpActions: string[] = [];

    // ── Schedule follow-up when data is incomplete ────────────────────
    if (result.isNew && (result.missingName || result.missingPhone)) {
      const scheduleAt = new Date();
      scheduleAt.setMinutes(scheduleAt.getMinutes() + 2);

      if (formattedPhone) {
        // Has phone → Ruth sends intro SMS to get name
        await supabase.from("agent_tasks").insert({
          organization_id: organizationId,
          lead_id: result.leadId,
          agent_type: "sms_inbound",
          action_type: "sms",
          scheduled_for: scheduleAt.toISOString(),
          status: "pending",
          context: {
            task: "intro_missing_info",
            source: "esther_auto",
            instruction: "Lead arrived from Hemlane without a name. Send a friendly intro SMS to gather their name and what property they are interested in.",
            parsed_property: leadInfo.property || null,
            parsed_message: leadInfo.message || null,
          },
        });
        followUpActions.push("Ruth SMS scheduled");
      } else if (leadInfo.email) {
        // No phone, has email → send email asking for name + phone
        const propertyMention = leadInfo.property
          ? ` about <strong>${leadInfo.property}</strong>`
          : "";

        try {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: leadInfo.email,
            subject: "Thanks for your interest! — Rent Finder Cleveland",
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;color:#ffb22c;font-size:20px;">Thanks for reaching out!</h1>
              </div>
              <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
                <p>Hi there! We received your inquiry${propertyMention} and would love to help you find the perfect rental.</p>
                <p>To get you set up quickly, could you reply with:</p>
                <ul>
                  <li><strong>Your full name</strong></li>
                  <li><strong>Best phone number</strong> to reach you</li>
                </ul>
                <p>Once we have that, our team will reach out to schedule a showing at a time that works for you.</p>
                <br>
                <p style="color:#666;font-size:14px;">— The Rent Finder Cleveland Team</p>
              </div>
            </div>`,
            notification_type: "lead_info_request",
            organization_id: organizationId,
            related_entity_id: result.leadId,
            related_entity_type: "lead",
            from_name: "Rent Finder Cleveland",
          },
        });
        followUpActions.push("info-request email sent");
        } catch (emailErr) {
          console.error(`Esther: email send failed for ${leadInfo.email}: ${(emailErr as Error).message}`);
          followUpActions.push("info-request email FAILED");
        }
      }

      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "warn",
        category: "general",
        event_type: "esther_incomplete_lead",
        message: `Esther: lead created with incomplete data (${contactId}). Missing: ${[result.missingName && "name", result.missingPhone && "phone"].filter(Boolean).join(", ")}. Actions: ${followUpActions.join(", ")}.`,
        details: {
          email_id: emailId,
          from: fromEmail,
          subject,
          lead_id: result.leadId,
          parsed_phone: formattedPhone,
          parsed_email: leadInfo.email,
          parsed_property: leadInfo.property,
          missing_name: result.missingName,
          missing_phone: result.missingPhone,
          follow_up: followUpActions,
          body_preview: (textBody || htmlBody).substring(0, 1000),
        },
        related_lead_id: result.leadId,
      });
    }

    const actionSuffix = followUpActions.length > 0 ? ` [${followUpActions.join(", ")}]` : "";

    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "esther_lead_processed",
      message: `Esther: ${result.isNew ? "new lead created" : "existing lead updated"} — ${leadInfo.name || "no name parsed"} (${contactId})${actionSuffix}`,
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
        missing_name: result.missingName,
        missing_phone: result.missingPhone,
      },
      related_lead_id: result.leadId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: result.leadId,
        is_new_lead: result.isNew,
        missing_name: result.missingName,
        missing_phone: result.missingPhone,
        follow_up: followUpActions,
        message: `Lead ${result.isNew ? "created" : "updated"} from Hemlane email${actionSuffix}`,
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
