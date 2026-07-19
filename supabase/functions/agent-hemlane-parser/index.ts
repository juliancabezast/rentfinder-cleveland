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

// ── Lead info interface ────────────────────────────────────────────────
interface LeadInfo {
  name: string | null;
  phone: string | null;
  email: string | null;
  property: string | null;
  message: string | null;
  listingSource: string | null;
}

// ── Strip HTML to plain text ──────────────────────────────────────────
// Entities are DECODED (not deleted): "O&#39;Brien" must stay "O'Brien" —
// stripping apostrophes/accents corrupted names and broke dup-matching (F27).
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|td|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:#39|#x27|apos|rsquo|#8217);/gi, "'")
    .replace(/&(?:#34|quot|ldquo|rdquo);/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, n) => {
      try { return String.fromCodePoint(parseInt(n, 10)); } catch { return " "; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; }
    })
    .replace(/&#?\w+;/g, " ")
    .trim();
}

// ── LLM-powered email parsing ─────────────────────────────────────────
const LLM_PARSE_SINGLE_PROMPT = `You are an email parser for a property management company. Extract lead information from this Hemlane notification email.

RULES:
- Extract the prospective tenant's name, phone, email, property address, message/comments, and listing source (Zillow, Apartments.com, Zumper, etc.)
- IGNORE system emails (from @hemlane.com, @rentfindercleveland.com) — only extract the LEAD's contact info
- Phone numbers in footers, support lines, or "Questions?" sections are NOT lead phones — ignore them
- If a field is not found, use null
- For property: extract the full street address. Include unit number if present.
- For name: extract the person's real name, not "Hemlane" or system names
- For message: extract what the lead wrote (their inquiry text), not system boilerplate

Respond with ONLY valid JSON, no markdown:
{"name": "string|null", "phone": "string|null", "email": "string|null", "property": "string|null", "message": "string|null", "listingSource": "string|null"}`;

const LLM_PARSE_DIGEST_PROMPT = `You are an email parser for a property management company. This is a Hemlane daily digest email containing MULTIPLE leads grouped by property.

RULES:
- Extract EVERY lead from the digest. Each lead has some combination of: name, email, phone, property address, listing source.
- Properties are typically street addresses that serve as section headers. Associate each lead with its property.
- IGNORE system emails (@hemlane.com, @rentfindercleveland.com)
- IGNORE footer content, navigation links, boilerplate text
- Listing sources include: Zillow, Apartments.com, Zumper, Facebook, Craigslist, Realtor.com, HotPads, Rent.com, Trulia
- Phone numbers in footers, support lines, or "Questions?" sections are NOT lead phones — ignore them. If the SAME phone number appears attached to multiple different people, it is boilerplate — use null for those.
- If a field is not found for a lead, use null
- Do NOT skip leads — extract every single one even if incomplete

Respond with ONLY a valid JSON array, no markdown:
[{"name": "string|null", "phone": "string|null", "email": "string|null", "property": "string|null", "message": null, "listingSource": "string|null"}, ...]`;

interface LLMParseFlags {
  truncatedInput: boolean;
  finishLength: boolean;
  salvaged: boolean;
}

// Recover a truncated JSON array by cutting at the last complete object (F12)
function salvageJsonArray(s: string): unknown[] | null {
  const start = s.indexOf("[");
  if (start === -1) return null;
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace <= start) return null;
  try {
    const arr = JSON.parse(s.slice(start, lastBrace + 1) + "]");
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

async function callLLMParser(
  openaiKey: string,
  systemPrompt: string,
  emailContent: string,
  subject: string,
  flags?: LLMParseFlags
): Promise<unknown> {
  // 48k chars ≈ 12k tokens — well within gpt-4o-mini's 128k context. The old
  // 12k cap silently clipped dense digests (~20+ leads) mid-list (F12).
  const MAX_INPUT = 48000;
  if (flags && emailContent.length > MAX_INPUT) flags.truncatedInput = true;
  const truncated = emailContent.substring(0, MAX_INPUT);
  const userMessage = `Subject: ${subject}\n\n---EMAIL BODY---\n${truncated}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      // 2000 destroyed the WHOLE digest at ~35 leads (truncated JSON → parse
      // throw → all leads lost). 8000 gives ~4x headroom (F12).
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const finishLength = data.choices?.[0]?.finish_reason === "length";
  if (flags && finishLength) flags.finishLength = true;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty LLM response");

  // Strip markdown fences if present
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    // Completion was cut off mid-array — salvage the complete objects instead
    // of losing the entire digest (F12).
    if (finishLength) {
      const salvaged = salvageJsonArray(cleaned);
      if (salvaged) {
        if (flags) flags.salvaged = true;
        console.warn(`Esther: JSON truncated at max_tokens — salvaged ${salvaged.length} complete objects`);
        return salvaged;
      }
    }
    throw parseErr;
  }
}

// System domains whose addresses must never become a lead's contact email.
// Suffix-aware but dot-anchored: matches "hemlane.com" and "mail.hemlane.com"
// (a subdomain sender would otherwise poison leads.email and cascade
// cross-person merges via the email dup-check) while NOT matching unrelated
// domains like "myhemlane.com" (F26).
const SYSTEM_EMAIL_DOMAINS = ["hemlane.com", "rentfindercleveland.com"];
function isSystemEmailDomain(dom: string): boolean {
  return SYSTEM_EMAIL_DOMAINS.some((d) => dom === d || dom.endsWith("." + d));
}

function validateLeadInfo(raw: any): LeadInfo {
  const email = typeof raw.email === "string" ? raw.email.toLowerCase().trim() : null;
  const emailDomain = email && email.includes("@") ? email.split("@").pop() || "" : "";
  return {
    name: typeof raw.name === "string" && raw.name.trim().length > 1 ? raw.name.trim().substring(0, 100) : null,
    phone: typeof raw.phone === "string" && raw.phone.replace(/\D/g, "").length >= 7 ? raw.phone.trim() : null,
    email: email && /^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(email) && !isSystemEmailDomain(emailDomain) ? email : null,
    property: typeof raw.property === "string" && raw.property.trim().length > 3 ? raw.property.trim().substring(0, 200) : null,
    message: typeof raw.message === "string" && raw.message.trim().length > 0 ? raw.message.trim().substring(0, 500) : null,
    listingSource: typeof raw.listingSource === "string" && raw.listingSource.trim().length > 0 && !/hemlane/i.test(raw.listingSource) ? raw.listingSource.trim().substring(0, 100) : null,
  };
}

async function parseHemlaneEmailLLM(
  openaiKey: string,
  html: string,
  subject: string,
  flags?: LLMParseFlags
): Promise<{ lead: LeadInfo; extras: LeadInfo[] }> {
  const text = htmlToText(html);
  const raw = await callLLMParser(openaiKey, LLM_PARSE_SINGLE_PROMPT, text, subject, flags);
  // Defensive: if the model returns an array for a multi-lead email that
  // slipped past the digest heuristic, process ALL of them instead of
  // silently dropping everyone after the first (F11).
  if (Array.isArray(raw)) {
    const all = raw.map((r: any) => validateLeadInfo(r));
    const [first, ...rest] = all;
    console.warn(`Esther LLM parseEmail: model returned ARRAY of ${all.length} — processing all`);
    return { lead: first || validateLeadInfo({}), extras: rest.filter((l) => l.phone || l.email) };
  }
  const result = validateLeadInfo(raw);
  console.log(`Esther LLM parseEmail: name=${result.name}, property=${result.property || "NONE"}, email=${result.email}, phone=${result.phone}, message=${result.message ? "yes" : "no"}`);
  return { lead: result, extras: [] };
}

// Null out any phone shared by 3+ different digest leads — that's platform
// boilerplate (office/footer number), and via the phone dup-check it would
// collapse N different people into one lead (F17).
function stripBoilerplatePhones(leads: LeadInfo[]): number {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const d = l.phone?.replace(/\D/g, "");
    if (d && d.length >= 10) counts.set(d, (counts.get(d) || 0) + 1);
  }
  let stripped = 0;
  for (const l of leads) {
    const d = l.phone?.replace(/\D/g, "");
    if (d && (counts.get(d) || 0) >= 3) {
      l.phone = null;
      stripped++;
    }
  }
  return stripped;
}

async function parseHemlaneDigestLLM(
  openaiKey: string,
  html: string,
  subject: string,
  flags?: LLMParseFlags
): Promise<{ leads: LeadInfo[]; rawTotal: number; noContact: LeadInfo[] }> {
  const text = htmlToText(html);
  const raw = await callLLMParser(openaiKey, LLM_PARSE_DIGEST_PROMPT, text, subject, flags);

  if (!Array.isArray(raw)) {
    console.error("Esther LLM digest: expected array, got", typeof raw);
    return { leads: [], rawTotal: 0, noContact: [] };
  }

  const all = raw.map((r: any) => validateLeadInfo(r));
  const stripped = stripBoilerplatePhones(all);
  if (stripped > 0) console.warn(`Esther LLM digest: nulled boilerplate phone on ${stripped} leads`);
  const leads = all.filter((l: LeadInfo) => l.phone || l.email);
  // Contact-less digest entries used to vanish with only a console.log —
  // return them so the caller can log/shell them (F12 observability)
  const noContact = all.filter((l: LeadInfo) => !l.phone && !l.email && (l.name || l.property));
  console.log(`Esther LLM digest: parsed ${leads.length} actionable leads from ${raw.length} total (${noContact.length} contact-less)`);
  for (const l of leads.slice(0, 5)) {
    console.log(`  → name=${l.name}, email=${l.email}, phone=${l.phone}, property=${l.property}, source=${l.listingSource}`);
  }
  return { leads, rawTotal: raw.length, noContact };
}

// ── Format phone to E.164 ─────────────────────────────────────────────
function formatPhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Invalid phone (too short, too long, or no digits) — don't create ghost records
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

// Normalize address for matching: abbreviate directions + street types
function normalizeAddress(addr: string): string {
  return addr.trim()
    .replace(/\s*\[Esther\b.*$/i, "")       // Strip leaked timestamps
    .replace(/\./g, "")                       // Strip ALL periods (N. → N, St. → St, Mt. → Mt)
    .replace(/,?\s*(?:Unit|Apt|#)\s*\w+$/i, "") // Strip unit suffix
    .replace(/\bMt\b/gi, "Mount")            // Mt → Mount (DB uses "Mount Auburn")
    .replace(/\bNorth\b/gi, "N").replace(/\bSouth\b/gi, "S")
    .replace(/\bEast\b/gi, "E").replace(/\bWest\b/gi, "W")
    .replace(/\bStreet\b/gi, "St").replace(/\bAvenue\b/gi, "Ave")
    .replace(/\bRoad\b/gi, "Rd").replace(/\bDrive\b/gi, "Dr")
    .replace(/\bBoulevard\b/gi, "Blvd").replace(/\bLane\b/gi, "Ln")
    .replace(/\bPlace\b/gi, "Pl").replace(/\bCourt\b/gi, "Ct")
    .replace(/\bCircle\b/gi, "Cir").replace(/\bTerrace\b/gi, "Ter")
    .replace(/\bParkway\b/gi, "Pkwy")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Unit matching helper (flexible: "A" matches "A (Down)", "B" matches "B (Up)") ──
function unitsMatch(inputUnit: string | null, propUnit: string | null): boolean {
  if (!inputUnit || !propUnit) return true; // if either is missing, treat as match
  const a = inputUnit.toLowerCase().trim();
  const b = propUnit.toLowerCase().trim();
  if (a === b) return true;
  // "a" matches "a (down)", "b" matches "b (up)", "down" matches "a (down)", etc.
  if (b.startsWith(a + " ") || b.startsWith(a + "(")) return true;
  if (a.startsWith(b + " ") || a.startsWith(b + "(")) return true;
  // "down" matches "a (down)", "up" matches "b (up)"
  if (b.includes(`(${a})`) || b.includes(`(${a} `) || b.includes(` ${a})`)) return true;
  if (a.includes(`(${b})`) || a.includes(`(${b} `) || a.includes(` ${b})`)) return true;
  return false;
}

// ── Match property by address (match only — NEVER creates properties) ──
async function matchProperty(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  propertyAddress: string
): Promise<string | null> {
  // Clean input: strip [Esther ...] timestamps that may have leaked in
  const cleanInput = propertyAddress.replace(/\s*\[Esther\b.*$/i, "").replace(/\.\s*$/, "").trim();
  if (!cleanInput || cleanInput.length < 5) return null;

  // Extract unit number — handle Hemlane's "Unit Unit A" (double "Unit") format
  const unitMatch = cleanInput.match(/,?\s*(?:Unit\s+)*(?:Unit|Apt|#)\s*(\w+)/i);
  const unitNumber = unitMatch && unitMatch[1].toLowerCase() !== "unit" ? unitMatch[1] : null;

  // Main address: first part before comma, without unit suffix
  const mainAddress = cleanInput.split(",")[0]
    .replace(/,?\s*(?:Unit\s+)*(?:Unit|Apt|#)\s*\w+$/i, "")
    .trim();

  // Street number for candidate lookup
  const streetNumber = mainAddress.match(/^(\d+)/)?.[1];
  if (!streetNumber) {
    console.log(`Esther: no street number in "${cleanInput}", skipping property match`);
    return null;
  }

  // Fetch ALL properties with same street number (one query, compare in JS)
  const { data: candidates } = await supabase
    .from("properties")
    .select("id, address, unit_number")
    .eq("organization_id", organizationId)
    .ilike("address", `${streetNumber} %`)
    .limit(50);

  if (!candidates || candidates.length === 0) {
    console.log(`Esther: no property candidates for "${cleanInput}"`);
    return null;
  }

  const normInput = normalizeAddress(mainAddress).toLowerCase();
  const inputUnit = unitNumber?.toLowerCase() || null;

  // Pass 1: exact normalized match
  for (const prop of candidates) {
    const normProp = normalizeAddress(prop.address).toLowerCase();
    if (normProp === normInput && unitsMatch(inputUnit, prop.unit_number)) {
      console.log(`Esther: matched property (normalized) "${cleanInput}" → ${prop.id} "${prop.address} #${prop.unit_number}"`);
      return prop.id;
    }
  }

  // Pass 2: match by street number + main street name word
  const dirs = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  const normWords = normInput.split(" ").filter(w => w.length > 0);
  const inputStreetWord = normWords.find((w, i) => i > 0 && !dirs.has(w));

  if (inputStreetWord) {
    for (const prop of candidates) {
      const propWords = normalizeAddress(prop.address).toLowerCase().split(" ").filter(w => w.length > 0);
      const propStreetWord = propWords.find((w, i) => i > 0 && !dirs.has(w));
      if (propStreetWord && propStreetWord === inputStreetWord && normWords[0] === propWords[0]) {
        if (unitsMatch(inputUnit, prop.unit_number)) {
          console.log(`Esther: matched property (fuzzy) "${cleanInput}" → ${prop.id} "${prop.address} #${prop.unit_number}"`);
          return prop.id;
        }
      }
    }
  }

  // Pass 3: AI-powered match using OpenAI — ask GPT to pick the best match
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey && candidates.length > 0) {
      const candidateList = candidates.map((p) =>
        `ID: ${p.id} | Address: ${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}`
      ).join("\n");

      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 100,
          messages: [
            {
              role: "system",
              content: `You are an address matching assistant. Given a lead's property address and a list of existing properties, determine if any existing property matches. Addresses may use different formats (Ave vs Avenue, St vs Street, N vs North, etc). Unit numbers like "A" should match "A (Down)", "B" should match "B (Up)". Respond with ONLY the ID of the best match, or "NONE" if no match exists. Do not explain.`,
            },
            {
              role: "user",
              content: `Lead address: "${cleanInput}"\n\nExisting properties:\n${candidateList}`,
            },
          ],
        }),
      });

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const answer = (aiData.choices?.[0]?.message?.content || "").trim();
        if (answer !== "NONE" && answer.length > 10) {
          // Verify the returned ID is actually in our candidates
          const matched = candidates.find((c) => c.id === answer);
          if (matched) {
            console.log(`Esther: matched property (AI) "${cleanInput}" → ${matched.id} "${matched.address} #${matched.unit_number}"`);
            return matched.id;
          }
        }
      }
    }
  } catch (aiErr) {
    console.warn("Esther: AI property match failed:", aiErr);
  }

  // No match found — lead will be created without property assignment
  console.log(`Esther: no property match for "${cleanInput}" — skipping property assignment`);
  return null;
}

// NOTE: Auto-create property removed — only humans may add properties.
// When Esther can't match a property, it logs the unmatched address for manual review.

// ── Upsert a single lead ──────────────────────────────────────────────
async function upsertLead(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  lead: LeadInfo,
  emailId: string
): Promise<{ leadId: string; isNew: boolean; missingName: boolean; missingPhone: boolean } | null> {
  const phone = lead.phone ? formatPhoneE164(lead.phone) : null;

  // Skip if no contact info — lead is not actionable without phone or email
  if (!phone && !lead.email) {
    console.log(`Esther: skipping lead "${lead.name || "unknown"}" — no phone or email`);
    return null;
  }

  // Build source detail string
  const sourceVia = lead.listingSource ? ` (via ${lead.listingSource})` : "";
  const propertyDetail = lead.property ? `Property: ${lead.property}${sourceVia}` : null;

  // Match property in DB — auto-create if not found
  let propertyId = lead.property
    ? await matchProperty(supabase, organizationId, lead.property)
    : null;

  // Log unmatched property for manual review (never auto-create)
  if (!propertyId && lead.property) {
    console.log(`Esther: no property match for "${lead.property}" — skipping (only humans add properties)`);
    try {
      // NOTE: level must be 'warning' — 'warn' violates system_logs_level_check
      // and the insert silently no-ops (supabase-js returns {error}, never throws).
      const { error: logErr } = await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "warning",
        category: "general",
        event_type: "esther_property_unmatched",
        message: `Esther could not match property: ${lead.property}. Lead will be created without property. Add the property manually if needed.`,
        details: { parsed_property: lead.property, lead_name: lead.name, lead_phone: lead.phone },
      });
      if (logErr) console.error(`Esther: property_unmatched log insert failed: ${logErr.message}`);
    } catch { /* non-blocking */ }
  }

  console.log(`Esther upsert: lead="${lead.name}" property="${lead.property || "NONE"}" → propertyId=${propertyId || "NULL"}`);

  const trimmedName = lead.name?.trim() || null;

  // ── Helper: update an existing lead (shared by all dup paths) ────
  const updateExistingLead = async (existing: { id: string; full_name: string | null; source_detail: string | null; phone?: string | null }, dupType: string) => {
    // Tag state drives the fallback + "new interest" note below.
    const { data: anyTag } = await supabase
      .from("lead_property_interests")
      .select("id")
      .eq("lead_id", existing.id)
      .limit(1)
      .maybeSingle();
    const hasTags = !!anyTag;

    // Fallback: if no property from parser and the lead has no tags yet,
    // try extracting from existing source_detail
    if (!propertyId && !hasTags && existing.source_detail) {
      const sdAddress = existing.source_detail.match(
        /Property:\s*(\d+\s+[A-Za-z][\w\s]+?(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Place|Pl|Court|Ct|Circle|Cir|Terrace|Ter|Parkway|Pkwy))/i
      );
      if (sdAddress) {
        console.log(`Esther: fallback property from source_detail: "${sdAddress[1]}"`);
        propertyId = await matchProperty(supabase, organizationId, sdAddress[1]);
      }
    }

    // A genuinely NEW interest (property not yet tagged on a lead that already
    // had interests) gets a note — tags accumulate, nothing is replaced (F29)
    let propertyChanged = false;
    if (propertyId && hasTags) {
      const { data: sameTag } = await supabase
        .from("lead_property_interests")
        .select("id")
        .eq("lead_id", existing.id)
        .eq("property_id", propertyId)
        .limit(1)
        .maybeSingle();
      propertyChanged = !sameTag;
    }

    // Store clean property reference (don't concatenate — audit trail lives in lead_notes)
    const detail = lead.property
      ? `Property: ${lead.property}${sourceVia}`
      : existing.source_detail;

    // Fix name if existing is a placeholder/fallback:
    // - starts with "Hemlane Lead" (auto-generated fallback)
    // - contains "{" (template leak)
    // - starts with "detail" (parse artifact)
    // - contains 7+ consecutive digits (phone number embedded in name)
    // - existing has no name at all
    const needsNameFix = lead.name && lead.name.length > 2 && (
      !existing.full_name ||
      existing.full_name.includes("{") ||
      existing.full_name.startsWith("Hemlane Lead") ||
      existing.full_name.startsWith("detail") ||
      /\d{7,}/.test(existing.full_name.replace(/\D/g, ""))
    );

    // NOTE: hemlane_email_id is intentionally NOT overwritten on updates —
    // it records the email that CREATED the lead (F13: overwriting destroyed
    // provenance and made digest retries skip unprocessed leads).
    const { error: updateErr } = await supabase
      .from("leads")
      .update({
        last_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_detail: detail,
        ...(lead.email && !(existing as any).email ? { email: lead.email } : {}),
        ...(phone && !(existing as any).phone ? { phone } : {}),
        ...(needsNameFix ? {
          full_name: lead.name,
          first_name: lead.name!.split(" ")[0] || null,
          last_name: lead.name!.split(" ").slice(1).join(" ") || null,
        } : {}),
      })
      .eq("id", existing.id);

    if (updateErr) {
      console.error(`Esther: lead update failed for ${existing.id}: ${updateErr.message}`);
    } else {
      console.log(`Esther: updated existing lead ${existing.id} (${dupType}) — property=${propertyId || "NONE"}`);
    }

    // Accumulate the property-interest tag (bumps recency when asked again)
    if (propertyId) {
      const { error: tagErr } = await supabase.rpc("add_lead_property_tag", {
        p_lead_id: existing.id,
        p_property_id: propertyId,
        p_source: "hemlane_email",
      });
      if (tagErr) console.error(`Esther: property tag failed for ${existing.id}: ${tagErr.message}`);
    }

    if (propertyChanged) {
      await saveLeadNote(
        supabase, organizationId, existing.id,
        `Lead is now also inquiring about ${lead.property} — added as an additional property-interest tag (previous interests kept).`
      );
    }

    // Merge-type updates get a full audit event — fragment/name merges were
    // previously invisible, making mis-merge rates unmeasurable (F14/F15)
    if (dupType !== "phone dup" && dupType !== "email dup") {
      try {
        await supabase.from("system_logs").insert({
          organization_id: organizationId,
          level: "info",
          category: "general",
          event_type: "esther_lead_merged",
          message: `Esther merge (${dupType}): lead ${existing.id} "${existing.full_name || "?"}" ← incoming "${trimmedName || lead.email || phone || "?"}"`,
          details: {
            dup_type: dupType,
            lead_id: existing.id,
            before: { full_name: existing.full_name, phone: existing.phone ?? null, email: (existing as any).email ?? null },
            incoming: { name: trimmedName, phone, email: lead.email, property: lead.property },
            email_id: emailId,
          },
          related_lead_id: existing.id,
        });
      } catch { /* non-blocking */ }
    }

    if (lead.message) {
      await saveLeadNote(supabase, organizationId, existing.id, lead.message);
      const intents = detectAllIntents(lead.message);
      for (const intent of intents) {
        // Skip if same intent was already scored within 7 days — the old
        // 30-min window let identical platform-prefill messages re-boost the
        // same lead day after day (max 8x observed → score saturation, F16)
        const { data: recentBoost } = await supabase
          .from("lead_score_history")
          .select("id")
          .eq("lead_id", existing.id)
          .eq("reason_code", intent.reason_code)
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();
        if (recentBoost) {
          console.log(`Esther: skipping ${intent.reason_code} boost for ${existing.id} — already applied recently`);
          continue;
        }

        const { error: rpcErr } = await supabase.rpc("log_score_change", {
          _lead_id: existing.id,
          _change_amount: intent.boost,
          _reason_code: intent.reason_code,
          _reason_text: intent.reason,
          _triggered_by: "engagement",
          _changed_by_agent: "esther",
        });
        if (rpcErr) console.error(`Esther: score boost failed (${intent.reason_code}): ${rpcErr.message}`);
      }
    }

    // Signal the shell→contact transition: a name-only (or contactless) lead
    // that just gained a phone via this email is only NOW actionable, so the
    // caller fires a 🆕 new-lead alert even though this is technically an UPDATE
    // (Hemlane's paired-email flow merges the phone in as isNew=false).
    const gainedPhone = !!phone && !(existing as any).phone;
    const finalName = (needsNameFix && lead.name)
      ? lead.name
      : ((existing as any).full_name || lead.name || null);
    return {
      leadId: existing.id, isNew: false, missingName: false, missingPhone: false,
      gainedPhone,
      finalName,
      finalPhone: phone || (existing as any).phone || null,
      finalProperty: lead.property || null,
    };
  };

  // ── Dup check 1: by phone ──────────────────────────────────────────
  if (phone) {
    const { data: existing, error: dupErr } = await supabase
      .from("leads")
      .select("id, full_name, source_detail, phone, email")
      .eq("organization_id", organizationId)
      .eq("phone", phone)
      .maybeSingle();

    if (dupErr) {
      // maybeSingle throws when multiple rows match — use first one
      console.warn(`Esther: multiple leads with phone ${phone}, using first`);
      const { data: first } = await supabase
        .from("leads")
        .select("id, full_name, source_detail, phone, email")
        .eq("organization_id", organizationId)
        .eq("phone", phone)
        .limit(1)
        .single();
      if (first) return updateExistingLead(first, "phone dup (multi)");
    }

    if (existing) return updateExistingLead(existing, "phone dup");
  }

  // ── Dup check 2: by email ─────────────────────────────────────────
  if (lead.email) {
    const { data: existing, error: dupErr } = await supabase
      .from("leads")
      .select("id, full_name, source_detail, phone, email")
      .eq("organization_id", organizationId)
      .eq("email", lead.email)
      .maybeSingle();

    if (dupErr) {
      console.warn(`Esther: multiple leads with email ${lead.email}, using first`);
      const { data: first } = await supabase
        .from("leads")
        .select("id, full_name, source_detail, phone, email")
        .eq("organization_id", organizationId)
        .eq("email", lead.email)
        .limit(1)
        .single();
      if (first) return updateExistingLead(first, "email dup (multi)");
    }

    if (existing) return updateExistingLead(existing, "email dup");
  }

  // ── Dup check 3: Hemlane fragmented notification merge ──────────────
  // Hemlane sends 2 emails per inquiry:
  //   "New inquiry for {property}" → has email + phone, NO name
  //   "Rental Message from {property}" → has name + message, NO email/phone
  // SAFETY: Only merge when there is EXACTLY ONE incomplete lead for this
  // property in the window. Multiple people can inquire about the same unit,
  // so if there are 2+ incomplete leads we cannot safely determine which one
  // corresponds to this fragment — skip the merge and create a new lead.
  if (propertyId) {
    const mergeWindowAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Property match via tag membership (lead_property_interests) — the legacy
    // single-column equality missed leads whose latest interest moved on.
    const { data: recentSameProperty, error: dup3Err } = await supabase
      .from("leads")
      .select("id, full_name, source_detail, phone, email, lead_property_interests!inner(property_id)")
      .eq("organization_id", organizationId)
      .eq("source", "hemlane_email")
      .eq("lead_property_interests.property_id", propertyId)
      .gte("created_at", mergeWindowAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    if (dup3Err) console.error(`Esther: dup check 3 (fragment-merge) query failed: ${dup3Err.message}`);

    if (recentSameProperty) {
      // Filter to only TRUE fragments. A complete email-only lead (real name,
      // no phone) must NOT receive a different person's phone — that grafts
      // person Y's number onto person X's consent trail (TCPA exposure, F14).
      const weHaveName = trimmedName && trimmedName.length > 2;
      const weHavePhone = !!phone;
      const incompleteCandidates = recentSameProperty.filter((c) => {
        const namePlaceholder = !c.full_name || c.full_name.startsWith("Hemlane Lead");
        // We bring the name; candidate lacks one → the classic Hemlane pair
        if (weHaveName && namePlaceholder) return true;
        // We bring a phone: only graft into a nameless fragment, or into a
        // lead whose name matches ours exactly
        if (weHavePhone && !c.phone) {
          if (namePlaceholder) return true;
          if (trimmedName && c.full_name && c.full_name.toLowerCase() === trimmedName.toLowerCase()) return true;
        }
        return false;
      });

      // Only merge if EXACTLY ONE incomplete lead — ambiguity means different people
      if (incompleteCandidates.length === 1) {
        const candidate = incompleteCandidates[0];
        console.log(`Esther: fragment-merge (15min, 1 match) → ${candidate.id} "${candidate.full_name}" + incoming "${trimmedName || phone}"`);
        return updateExistingLead(candidate, "fragment-merge");
      } else if (incompleteCandidates.length > 1) {
        console.log(`Esther: skipping fragment-merge — ${incompleteCandidates.length} incomplete leads for same property (ambiguous)`);
      }
    }
  }

  // ── Dup check 4: phone digits embedded in existing lead name ──────
  // Catches "Hemlane Lead (614) 972-3153" when new email has name but same phone.
  if (phone) {
    const phoneDigits = phone.replace(/\D/g, "").slice(-7); // last 7 digits
    if (phoneDigits.length === 7) {
      const { data: phoneInName, error: dup4Err } = await supabase
        .from("leads")
        .select("id, full_name, source_detail, phone, email")
        .eq("organization_id", organizationId)
        .eq("source", "hemlane_email")
        .like("full_name", `%${phoneDigits.slice(0, 3)}%${phoneDigits.slice(3)}%`)
        .limit(1)
        .maybeSingle();

      if (dup4Err) console.error(`Esther: dup check 4 (phone-in-name) query failed: ${dup4Err.message}`);

      if (phoneInName) {
        console.log(`Esther: found phone-in-name match → ${phoneInName.id} "${phoneInName.full_name}" (phone digits ${phoneDigits})`);
        return updateExistingLead(phoneInName, "phone-in-name dup");
      }
    }
  }

  // ── Dup check 5: contact half arriving after a name-only shell ──────
  // The "Rental Message" (name, no contact) may now create a shell lead; when
  // the paired "New inquiry" (contact, no name) arrives later, merge into the
  // shell instead of creating a nameless duplicate (F03).
  if (propertyId && (!trimmedName || trimmedName.length <= 2)) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: shells, error: dup5Err } = await supabase
      .from("leads")
      .select("id, full_name, source_detail, phone, email, lead_property_interests!inner(property_id)")
      .eq("organization_id", organizationId)
      .eq("source", "hemlane_email")
      .eq("lead_property_interests.property_id", propertyId)
      .is("phone", null)
      .is("email", null)
      .gte("created_at", dayAgo)
      .limit(2);

    if (dup5Err) console.error(`Esther: dup check 5 (shell-merge) query failed: ${dup5Err.message}`);

    // Exactly-one rule, same as fragment-merge: ambiguity means different people
    if (shells && shells.length === 1) {
      console.log(`Esther: shell-merge → ${shells[0].id} "${shells[0].full_name}" gains contact ${phone || lead.email}`);
      const mergedResult = await updateExistingLead(shells[0], "shell-merge");
      // The shell had NO contact until this email supplied it — record the
      // transactional-reply basis now, exactly as the create-new-lead path
      // does at insert (review finding: consent-evidence regression).
      try {
        const { error: consentErr } = await supabase.from("consent_log").insert({
          organization_id: organizationId,
          lead_id: shells[0].id,
          consent_type: "transactional_reply",
          granted: true,
          method: "listing_inquiry",
          evidence_text: `Inbound listing inquiry via ${lead.listingSource || "Hemlane"}${lead.property ? ` for ${lead.property}` : ""} — contact info supplied by paired email (shell-merge). Reply-only, not marketing consent. Received ${new Date().toISOString()}. Email ID: ${emailId}`,
        });
        if (consentErr) console.error(`Esther: shell-merge consent_log insert failed: ${consentErr.message}`);
      } catch { /* non-blocking */ }
      return mergedResult;
    }
  }

  // ── Direction B: recover name from paired "Rental Message" email ──
  // If we have no name but have a property, check system_logs for a recent
  // esther_no_contact_info event with the same property that captured the name.
  // Window: 24h to mirror Direction A — Hemlane pairs can arrive hours apart (F25).
  let recoveredName: string | null = null;
  if (!lead.name && lead.property) {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSkipped } = await supabase
      .from("system_logs")
      .select("details")
      .eq("organization_id", organizationId)
      .eq("event_type", "esther_no_contact_info")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentSkipped) {
      // Exactly-one-distinct-name guard (review finding): with the window now
      // 24h, several different people's Rental Messages can sit in the log —
      // if more than one distinct name matches this property, we can't know
      // whose contact email this is, so recover nothing.
      const normProperty = normalizeAddress(lead.property).toLowerCase();
      const matchingNames = new Set<string>();
      let firstMatch: string | null = null;
      for (const log of recentSkipped) {
        const logProperty = (log.details as any)?.lead_property;
        const logName = (log.details as any)?.lead_name;
        if (logName && logName.length > 2 && logProperty) {
          const normLogProp = normalizeAddress(logProperty).toLowerCase();
          if (normLogProp === normProperty) {
            matchingNames.add(logName.toLowerCase().trim());
            if (!firstMatch) firstMatch = logName;
          }
        }
      }
      if (matchingNames.size === 1 && firstMatch) {
        recoveredName = firstMatch;
        console.log(`Esther: recovered name "${firstMatch}" from paired Rental Message for property "${lead.property}"`);
      } else if (matchingNames.size > 1) {
        console.log(`Esther: Direction B — ${matchingNames.size} distinct names for property "${lead.property}" (ambiguous), not recovering`);
      }
    }
  }

  // Build display name
  const displayPhone = phone
    ? phone.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")
    : null;
  const fallbackIdentifier = displayPhone || lead.email || "unknown";
  const fullName = lead.name || recoveredName || `Hemlane Lead ${fallbackIdentifier}`;

  // Create new lead — NO marketing/SMS/call consent. An inbound email inquiry
  // is NOT TCPA prior express written consent; we may only reply transactionally.
  const { data: newLead, error: err } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      full_name: fullName,
      first_name: (lead.name || recoveredName)?.split(" ")[0] || null,
      last_name: (lead.name || recoveredName)?.split(" ").slice(1).join(" ") || null,
      phone: phone || null,
      email: lead.email || null,
      source: "hemlane_email",
      source_detail: propertyDetail,
      status: "new",
      hemlane_email_id: emailId,
      sms_consent: false,
      call_consent: false,
    })
    .select("id")
    .single();

  if (err || !newLead) {
    console.error(`Esther: failed to create lead ${fullName}: ${err?.message}`);
    try {
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
      });
    } catch (_) { /* don't mask original error */ }
    // THROW, don't return null: returning null conflated "not actionable"
    // with "DB failed", so a transient DB error got terminally marked
    // skipped and the lead was unreplayably lost (review finding). Throwing
    // marks the inbound email 'failed' → the reconcile cron replays it.
    throw new Error(`Lead insert failed: ${err?.message || "no row returned"}`);
  }

  const leadId = newLead.id;
  const now = new Date().toISOString();

  // Seed the property-interest tag for the brand-new lead
  if (propertyId) {
    const { error: tagErr } = await supabase.rpc("add_lead_property_tag", {
      p_lead_id: leadId,
      p_property_id: propertyId,
      p_source: "hemlane_email",
    });
    if (tagErr) console.error(`Esther: property tag failed for new lead ${leadId}: ${tagErr.message}`);
  }

  const listingPlatform = lead.listingSource || "Hemlane";
  const evidenceText = `Inbound listing inquiry via ${listingPlatform}${lead.property ? ` for ${lead.property}` : ""} — reply-only, not marketing consent. Received ${now}. Email ID: ${emailId}`;

  // ── Save initial message as a lead note ──────────────────────────
  if (lead.message) {
    await saveLeadNote(supabase, organizationId, leadId, lead.message);
  }

  // ── Record transactional reply basis (NOT marketing/TCPA consent) ─
  // An inbound email inquiry does not grant SMS/call/marketing consent; it only
  // establishes a legitimate basis to reply transactionally to the inquiry.
  {
    const { error: consentErr } = await supabase.from("consent_log").insert({
      organization_id: organizationId,
      lead_id: leadId,
      consent_type: "transactional_reply",
      granted: true,
      method: "listing_inquiry",
      evidence_text: evidenceText,
    });
    if (consentErr) {
      console.error(`Esther: consent_log insert failed (transactional_reply): ${consentErr.message}`);
    }
  }

  // ── Helper: call log_score_change with proper error handling ────
  const applyScoreBoost = async (amount: number, reasonCode: string, reasonText: string, triggeredBy: string) => {
    const { error: rpcErr } = await supabase.rpc("log_score_change", {
      _lead_id: leadId,
      _change_amount: amount,
      _reason_code: reasonCode,
      _reason_text: reasonText,
      _triggered_by: triggeredBy,
      _changed_by_agent: "esther",
    });
    if (rpcErr) {
      console.error(`Esther: score boost failed (${reasonCode}, +${amount}): ${rpcErr.message}`);
    } else {
      console.log(`Esther: score boost applied (${reasonCode}, +${amount}) for lead ${leadId}`);
    }
  };

  // ── Base score: inbound inquiry = real lead (+10) ─────────────
  await applyScoreBoost(10, "inbound_inquiry", "Lead initiated contact via Hemlane property listing", "engagement");

  // ── Bonus: complete contact info (+5) ─────────────────────────
  if (phone && lead.email) {
    await applyScoreBoost(5, "complete_contact", "Lead provided both phone and email", "engagement");
  }

  // ── Score boost if lead has a matched property (+10) ──────────
  if (propertyId) {
    await applyScoreBoost(10, "property_matched", "Lead associated with a property on creation", "engagement");
  }

  // ── Auto-score based on message intent (boosts stack) ─────────
  if (lead.message) {
    const intents = detectAllIntents(lead.message);
    for (const intent of intents) {
      await applyScoreBoost(intent.boost, intent.reason_code, intent.reason, "engagement");
    }
  }

  return {
    leadId, isNew: true, missingName: !lead.name, missingPhone: !phone,
    gainedPhone: false,
    finalName: fullName,
    finalPhone: phone || null,
    finalProperty: lead.property || null,
  };
}

// ── Save lead note (handles missing created_by gracefully) ───────────
async function saveLeadNote(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  leadId: string,
  message: string
): Promise<void> {
  const content = `[Hemlane inquiry] ${message}`;

  // Dedup: the nightly digest re-delivers the same message text — 1,069
  // byte-identical duplicate note rows had accumulated (F13)
  try {
    const { data: dupNote } = await supabase
      .from("lead_notes")
      .select("id")
      .eq("lead_id", leadId)
      .eq("content", content)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (dupNote) {
      console.log(`Esther: identical note already saved <24h for lead ${leadId} — skipping duplicate`);
      return;
    }
  } catch { /* fall through to insert */ }

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
    try {
      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "warning",
        category: "general",
        event_type: "esther_note_save_failed",
        message: `Esther: could not save lead note. Error: ${error.message}`,
        details: { lead_id: leadId, error: error.message, error_code: error.code },
      });
    } catch (_) { /* don't mask original error */ }
  }
}

// Platform prefill templates — one listing-site click, not typed intent.
// 1,606 byte-identical "I would like to schedule a tour." notes were earning
// the same +35 as a hand-written paragraph → 80% of leads in is_priority (F16).
const PLATFORM_PREFILLS = new Set([
  "i would like to schedule a tour.",
  "i would like to schedule a tour",
  "i'd like to schedule a tour.",
  "i'd like to schedule a tour",
  "i'm interested in your property. please contact me with more information.",
  "i am interested in your property. please contact me with more information.",
  "i'm interested in this property and would like to schedule a tour.",
]);

// ── Schedule the one-shot +48h enrichment retry (audit F18) ─────────────
// Existence-guarded so webhook retries / digest replays don't stack tasks
// (two tasks would mean two "still interested?" emails).
async function scheduleEnrichmentFollowup(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  leadId: string,
  context: Record<string, unknown>
): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("lead_id", leadId)
      .eq("action_type", "enrichment_followup")
      .in("status", ["pending", "in_progress"])
      .limit(1)
      .maybeSingle();
    if (existing) return false;
    const { error } = await supabase.from("agent_tasks").insert({
      organization_id: organizationId,
      lead_id: leadId,
      agent_type: "esther",
      action_type: "enrichment_followup",
      status: "pending",
      scheduled_for: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      context,
    });
    if (error) {
      console.error(`Esther: enrichment_followup task insert failed: ${error.message}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Create a "shell" lead: named prospect with a message but NO contact ──
// F03: ~110 named prospects (68% with explicit tour intent) used to be
// discarded when their contact-bearing pair email never arrived. A shell keeps
// them visible (IncompleteTab) and mergeable when contact shows up (dup check 5).
async function createShellLead(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  lead: LeadInfo,
  emailId: string,
  propertyId: string | null,
  rawPhone: string | null
): Promise<{ leadId: string; attached: boolean } | null> {
  const name = lead.name!.trim();

  // Same person re-inquiring within 7 days → attach the message, don't spawn
  // one shell per attempt (Shakya Monteith sent 7 in 3 days).
  // Restricted to other SHELLS (phone+email both null): a same-named lead
  // with real contact info may be a different person — attaching a stranger's
  // message there would cross-contaminate records (review finding).
  // Name comparison happens IN JS: PostgREST rewrites '*' to '%' in ilike
  // patterns, so an email-supplied name like "A*" would wildcard-match and
  // inject notes into other prospects' leads (review finding — confirmed
  // against live PostgREST).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: shellCandidates } = await supabase
    .from("leads")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .eq("source", "hemlane_email")
    .is("phone", null)
    .is("email", null)
    .gte("created_at", sevenDaysAgo)
    .limit(50);
  const existing = (shellCandidates || []).find(
    (c) => (c.full_name || "").toLowerCase().trim() === name.toLowerCase()
  ) || null;

  if (existing) {
    console.log(`Esther: shell — attaching message to existing lead ${existing.id} "${existing.full_name}"`);
    if (lead.message) {
      await saveLeadNote(supabase, organizationId, existing.id, `${lead.message}${lead.property ? ` [re: ${lead.property}]` : ""}`);
    }
    return { leadId: existing.id, attached: true };
  }

  const sourceVia = lead.listingSource ? ` (via ${lead.listingSource})` : "";
  const { data: shell, error } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      full_name: name,
      first_name: name.split(" ")[0] || null,
      last_name: name.split(" ").slice(1).join(" ") || null,
      phone: null,
      email: null,
      source: "hemlane_email",
      source_detail: lead.property ? `Property: ${lead.property}${sourceVia} — NEEDS CONTACT INFO` : "NEEDS CONTACT INFO",
      status: "new",
      hemlane_email_id: emailId,
      sms_consent: false,
      call_consent: false,
    })
    .select("id")
    .single();

  if (error || !shell) {
    console.error(`Esther: shell lead insert failed: ${error?.message}`);
    return null;
  }

  // Seed the property-interest tag for the shell lead
  if (propertyId) {
    const { error: shellTagErr } = await supabase.rpc("add_lead_property_tag", {
      p_lead_id: shell.id,
      p_property_id: propertyId,
      p_source: "hemlane_email",
    });
    if (shellTagErr) console.error(`Esther: property tag failed for shell ${shell.id}: ${shellTagErr.message}`);
  }

  const noteParts = [
    lead.message || null,
    rawPhone ? `Unparseable phone found in email: ${rawPhone}` : null,
    "This prospect has no phone/email yet — Hemlane only sent their name and message. Check Hemlane inbox or wait for the paired inquiry email.",
  ].filter(Boolean);
  await saveLeadNote(supabase, organizationId, shell.id, noteParts.join(" · "));

  const boost = async (amount: number, code: string, text: string) => {
    const { error: rpcErr } = await supabase.rpc("log_score_change", {
      _lead_id: shell.id,
      _change_amount: amount,
      _reason_code: code,
      _reason_text: text,
      _triggered_by: "engagement",
      _changed_by_agent: "esther",
    });
    if (rpcErr) console.error(`Esther: shell score boost failed (${code}): ${rpcErr.message}`);
  };
  await boost(10, "inbound_inquiry", "Lead initiated contact via Hemlane property listing");
  if (propertyId) await boost(10, "property_matched", "Lead associated with a property on creation");
  if (lead.message) {
    for (const intent of detectAllIntents(lead.message)) {
      await boost(intent.boost, intent.reason_code, intent.reason);
    }
  }

  try {
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "esther_shell_created",
      message: `Esther: shell lead created for "${name}" (no contact info yet)${lead.property ? ` — ${lead.property}` : ""}`,
      details: { lead_id: shell.id, lead_name: name, lead_property: lead.property, lead_message: lead.message, email_id: emailId, unparseable_phone: rawPhone },
      related_lead_id: shell.id,
    });
  } catch { /* non-blocking */ }

  console.log(`Esther: shell lead created ${shell.id} "${name}"`);
  return { leadId: shell.id, attached: false };
}

// ── Detect intent signals in lead messages (all matching boosts stack) ────
function detectAllIntents(message: string): { boost: number; reason: string; reason_code: string }[] {
  const m = message.toLowerCase();

  // Prefill click → engagement tier only, never the hand-typed showing tier
  if (PLATFORM_PREFILLS.has(m.trim())) {
    return [{ boost: 20, reason: "Standard listing-site tour-request template (platform prefill)", reason_code: "inquiry_intent" }];
  }

  const intents: { boost: number; reason: string; reason_code: string }[] = [];

  // Tier 1 — Showing / tour intent (+35)
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
      intents.push({ boost: 35, reason: "Lead expressed showing/tour intent in inquiry message", reason_code: "showing_intent" });
      break;
    }
  }

  // Fair Housing: source of income (Section 8 / housing vouchers) must NOT boost the lead
  // score. Voucher status is captured for property matching only, never for scoring/ranking.

  // Tier 3 — General engagement signals (+20)
  const engagementPatterns = [
    /\b(how\s+much|what.*rent|price|cost|monthly)\b/,
    /\b(available|availability|still\s+available|is\s+(it|this)\s+available)\b/,
    /\b(apply|application|how\s+(do|can)\s+(i|we)\s+apply)\b/,
  ];
  for (const pat of engagementPatterns) {
    if (pat.test(m)) {
      intents.push({ boost: 20, reason: "Lead asked about availability/pricing/application in inquiry", reason_code: "inquiry_intent" });
      break;
    }
  }

  return intents;
}

// ── Main handler ──────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let organizationId: string | undefined;
  let processedEmailId: string | null = null; // set once the inbound_emails row exists (for catch-block failure marking)
  const estherStartTime = Date.now();

  // ── Test mode: skip signature verification with service_role auth ──
  // (used by reconcile-inbound-emails to replay pending/failed emails)
  const authHeader = req.headers.get("authorization") || "";
  const isTestMode = authHeader === `Bearer ${serviceRoleKey}`;

  try {
    // ── 1. Read raw body & verify webhook signature ─────────────────
    const rawBody = await req.text();
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!isTestMode) {
      // FAIL CLOSED: with no secret configured, this public endpoint would
      // accept unsigned forged lead emails (F32)
      if (!webhookSecret) {
        console.error("Esther: RESEND_WEBHOOK_SECRET not configured — rejecting unsigned webhook");
        return new Response(
          JSON.stringify({ error: "Webhook secret not configured" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Signature verification is MANDATORY
      if (!svixId || !svixTimestamp || !svixSignature) {
        console.error("Esther: missing Svix signature headers (verification required)");
        return new Response(
          JSON.stringify({ error: "Missing webhook signature headers" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
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
    let replyToEmail: string | null = null;
    if (emailData.reply_to) {
      const replyTos = Array.isArray(emailData.reply_to) ? emailData.reply_to : [emailData.reply_to];
      for (const rt of replyTos) {
        const rtMatch = String(rt).toLowerCase().match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
        if (rtMatch && !isSystemEmailDomain(rtMatch[0].split("@").pop() || "")) {
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

    organizationId = org?.id;
    if (!organizationId) {
      throw new Error("Default organization 'rent-finder-cleveland' not found");
    }

    // ── Get OpenAI key for LLM parsing (+ Telegram for billing alerts) ──
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key, telegram_bot_token, telegram_chat_id")
      .eq("organization_id", organizationId)
      .single();
    const openaiKey = creds?.openai_api_key;
    if (!openaiKey) {
      console.warn("Esther: no OpenAI API key found — LLM parsing unavailable");
    }

    // ── PERSIST FIRST (audit tier b): raw email into inbound_emails ──
    // The row is idempotency key, re-processable dead-letter queue, inbound
    // archive, and reconciliation source all at once (F04/F06/F13/F21).
    // Every terminal path below MUST call markInbound().
    const { data: priorInbound } = await supabase
      .from("inbound_emails")
      .select("status, attempts")
      .eq("email_id", emailId)
      .maybeSingle();

    if (priorInbound && (priorInbound.status === "processed" || priorInbound.status === "skipped")) {
      console.log(`Esther: email ${emailId} already ${priorInbound.status} — skipping`);
      return new Response(
        JSON.stringify({ message: `Email already ${priorInbound.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (priorInbound) {
      // pending/failed → this is a retry (svix redelivery or reconcile replay).
      // Optimistic claim on attempts: if a concurrent processor already bumped
      // it (svix retry racing the reconcile cron), yield instead of running
      // the pipeline twice (review finding). NOTE: the reconcile cron bumps
      // attempts itself before replaying, so its own POST arrives with the
      // fresh value and claims cleanly.
      const { data: claimed } = await supabase
        .from("inbound_emails")
        .update({ attempts: (priorInbound.attempts || 0) + 1 })
        .eq("email_id", emailId)
        .eq("attempts", priorInbound.attempts || 0)
        .select("email_id");
      if (!claimed || claimed.length === 0) {
        console.log(`Esther: email ${emailId} claimed by a concurrent processor — yielding`);
        return new Response(
          JSON.stringify({ message: "Email is being processed by a concurrent delivery" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const { error: ieInsErr } = await supabase.from("inbound_emails").insert({
        email_id: emailId,
        organization_id: organizationId,
        from_email: fromEmail,
        subject,
        reply_to: replyToEmail,
        raw_html: htmlBody ? htmlBody.substring(0, 500_000) : null,
        raw_text: textBody ? textBody.substring(0, 500_000) : null,
        attempts: 1,
      });
      if (ieInsErr && ieInsErr.code === "23505") {
        // Concurrent duplicate delivery — the other invocation owns this email.
        // If it dies, its row goes 'failed' and the reconcile cron replays it.
        console.log(`Esther: email ${emailId} being processed concurrently — yielding`);
        return new Response(
          JSON.stringify({ message: "Email is being processed by a concurrent delivery" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (ieInsErr) {
        // Non-fatal: continue processing without persistence rather than drop the lead
        console.error(`Esther: inbound_emails insert failed: ${ieInsErr.message}`);
      }
    }
    processedEmailId = emailId;

    const markInbound = async (
      status: "processed" | "skipped" | "failed",
      outcome: string,
      leadId?: string | null,
      lastError?: string
    ) => {
      try {
        const { error: mkErr } = await supabase
          .from("inbound_emails")
          .update({
            status,
            outcome: outcome.substring(0, 200),
            lead_id: leadId ?? null,
            processed_at: new Date().toISOString(),
            ...(lastError ? { last_error: lastError.substring(0, 500) } : {}),
          })
          .eq("email_id", emailId);
        if (mkErr) console.error(`Esther: markInbound(${status}/${outcome}) failed: ${mkErr.message}`);
      } catch { /* non-blocking */ }
    };

    // ── Hemlane billing/account alerts: escalate to a human ─────────
    // These used to fall through to esther_parse_skip and die silently — the
    // account went delinquent with ~11 unseen warnings (audit F02, 2026-07-10).
    const fromDomain = (fromEmail.toLowerCase().match(/@([\w.-]+)/)?.[1]) || "";
    const isBillingAlert =
      (fromDomain === "hemlane.com" || fromDomain.endsWith(".hemlane.com")) &&
      /payment.{0,20}(fail|declin|issue|unsuccessful|problem)|subscription.{0,30}(fail|attention|delinquen|cancel|expir|past due)|suspend|past due|delinquen|action (needed|required)|update.{0,15}payment/i.test(subject);
    if (isBillingAlert) {
      console.warn(`Esther: Hemlane billing/account alert — "${subject}"`);
      try {
        const { error: logErr } = await supabase.from("system_logs").insert({
          organization_id: organizationId,
          level: "warning",
          category: "general",
          event_type: "esther_billing_alert",
          message: `Hemlane billing/account alert: ${subject}`,
          details: { email_id: emailId, from: fromEmail, subject, body_preview: (textBody || htmlBody).substring(0, 1200) },
        });
        if (logErr) console.error(`Esther: billing alert log failed: ${logErr.message}`);
      } catch { /* non-blocking */ }
      if (creds?.telegram_bot_token && creds?.telegram_chat_id) {
        try {
          await fetch(`https://api.telegram.org/bot${creds.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: creds.telegram_chat_id,
              text: `🚨 ALERTA HEMLANE (cuenta/facturación)\n\n"${subject}"\n\nRevisar el dashboard de Hemlane cuanto antes — de esta cuenta depende todo el canal de leads (~140/semana).`,
            }),
          });
        } catch (tgErr) {
          console.error(`Esther: telegram billing alert failed: ${(tgErr as Error).message}`);
        }
      } else {
        console.warn("Esther: no Telegram credentials — billing alert logged only");
      }
      await markInbound("skipped", "billing_alert");
      return new Response(
        JSON.stringify({ message: "Hemlane billing alert escalated", subject }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NOTE: the old leads.hemlane_email_id idempotency check is gone — it made
    // digest retries skip every unprocessed lead (F13). inbound_emails.status
    // above is the real idempotency now.

    // ── 4. Detect email type and parse ──────────────────────────────

    // Skip non-lead emails from Hemlane (CSV exports, system notifications,
    // marketing). GATED on the Hemlane sender domain — a prospect writing
    // "Re: question about the premium unit" must never match (review finding).
    const fromIsHemlane = fromDomain === "hemlane.com" || fromDomain.endsWith(".hemlane.com");
    const isNonLeadEmail = fromIsHemlane &&
      /Prospective Tenant Download|Your Hemlane .* Download|Payment Received|Maintenance Request|Subscription Renewal|Hemlane Premium|Upgrade your|Advertising Receipt|reaches your inbox/i.test(subject);
    if (isNonLeadEmail) {
      console.log(`Esther: skipping non-lead email — "${subject}"`);
      await markInbound("skipped", "non_lead");
      return new Response(
        JSON.stringify({ message: "Skipped — not a lead email", subject }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Digest detection: exact subjects PLUS a structural fallback — if Hemlane
    // renames the digest again, an email carrying 3+ distinct prospect emails
    // must still take the multi-lead path instead of losing all but one (F11)
    const bodyTextEarly = htmlToText(htmlBody || textBody || "");
    const distinctProspectEmails = new Set(
      (bodyTextEarly.toLowerCase().match(/[\w.+-]+@[\w.-]+\.\w{2,}/g) || [])
        .filter((e) => !isSystemEmailDomain(e.split("@").pop() || ""))
    );
    // Known single-lead subjects and direct replies/forwards NEVER take the
    // digest path (review finding: a quoted thread can carry 3+ addresses and
    // the digest path has no shell / From-fallback / Direction-A logic).
    const isKnownSingleSubject = /New inquiry for|Rental Message from/i.test(subject) || /^\s*(re|fwd?):/i.test(subject);
    const looksMultiLead = distinctProspectEmails.size >= 3 && !isKnownSingleSubject;
    const isDigest = /Property Listings Update|Daily Leads Update/i.test(subject) || looksMultiLead;
    if (looksMultiLead && !/Property Listings Update|Daily Leads Update/i.test(subject)) {
      console.warn(`Esther: structural digest heuristic fired — ${distinctProspectEmails.size} distinct prospect emails, subject "${subject}"`);
    }

    if (isDigest) {
      // ── DIGEST: batch-process all leads (LLM-powered) ────────────
      let digestLeads: LeadInfo[] = [];
      let digestRawTotal = 0;
      let digestNoContact: LeadInfo[] = [];
      const parseFlags: LLMParseFlags = { truncatedInput: false, finishLength: false, salvaged: false };
      if (openaiKey) {
        try {
          const parsed = await parseHemlaneDigestLLM(openaiKey, htmlBody || textBody, subject, parseFlags);
          digestLeads = parsed.leads;
          digestRawTotal = parsed.rawTotal;
          digestNoContact = parsed.noContact;
          console.log(`Esther: LLM digest parse returned ${digestLeads.length} leads (${digestRawTotal} raw)`);
        } catch (llmErr) {
          console.error(`Esther: LLM digest parse failed, no fallback: ${(llmErr as Error).message}`);
          await supabase.from("system_logs").insert({
            organization_id: organizationId,
            level: "error",
            category: "general",
            event_type: "esther_llm_parse_failed",
            message: `Esther: LLM digest parsing failed: ${(llmErr as Error).message}`,
            details: { email_id: emailId, subject, error: (llmErr as Error).message },
          });
          await markInbound("failed", "digest_llm_parse_failed", null, (llmErr as Error).message);
          // 503 → svix/Resend retries for ~24h. A transient OpenAI failure must
          // not permanently lose the whole digest (10-14 leads). No side effects
          // have happened yet, so a retried delivery is safe.
          return new Response(
            JSON.stringify({ error: "LLM digest parsing failed — retry requested", detail: (llmErr as Error).message }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.error("Esther: no OpenAI key — cannot parse digest");
        try {
          await supabase.from("system_logs").insert({
            organization_id: organizationId,
            level: "error",
            category: "general",
            event_type: "esther_llm_parse_failed",
            message: "Esther: no OpenAI API key configured — digest left for webhook retry",
            details: { email_id: emailId, subject },
          });
        } catch { /* non-blocking */ }
        await markInbound("failed", "no_openai_key");
        return new Response(
          JSON.stringify({ error: "No OpenAI API key configured — retry requested" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse-capacity warnings become queryable events, not console noise (F12)
      if (parseFlags.truncatedInput || parseFlags.finishLength) {
        try {
          await supabase.from("system_logs").insert({
            organization_id: organizationId,
            level: "warning",
            category: "general",
            event_type: "esther_digest_truncated",
            message: `Esther digest hit a parse-capacity limit: ${parseFlags.truncatedInput ? "input truncated at 48k chars" : ""}${parseFlags.truncatedInput && parseFlags.finishLength ? " + " : ""}${parseFlags.finishLength ? `completion cut at max_tokens${parseFlags.salvaged ? " (salvaged)" : ""}` : ""}. Some leads may be missing — compare with Hemlane.`,
            details: { email_id: emailId, subject, ...parseFlags, parsed_leads: digestLeads.length },
          });
        } catch { /* non-blocking */ }
      }

      // Contact-less digest entries: log each (they used to vanish silently)
      for (const nc of digestNoContact) {
        try {
          await supabase.from("system_logs").insert({
            organization_id: organizationId,
            level: "info",
            category: "general",
            event_type: "esther_no_contact_info",
            message: `Esther digest: lead without contact info — Name: ${nc.name || "unknown"}, Property: ${nc.property || "unknown"}`,
            details: { email_id: emailId, from: fromEmail, subject, lead_name: nc.name, lead_property: nc.property, lead_message: nc.message, source: "digest" },
          });
        } catch { /* non-blocking */ }
      }

      // Log parsed digest summary for debugging
      console.log(`Esther digest: parsed ${digestLeads.length} leads from ${htmlBody ? "HTML" : "text"} body`);
      for (const dl of digestLeads.slice(0, 5)) {
        console.log(`  → name=${dl.name}, email=${dl.email}, phone=${dl.phone}, property=${dl.property}, source=${dl.listingSource}`);
      }

      if (digestLeads.length === 0) {
        await supabase.from("system_logs").insert({
          organization_id: organizationId,
          level: "info",
          category: "general",
          event_type: "esther_digest_empty",
          message: `Esther: digest email parsed but no leads found. Subject: ${subject}`,
          details: { email_id: emailId, from: fromEmail, subject, raw_total: digestRawTotal },
        });

        await markInbound("processed", "digest_empty");
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

            if (lead.email) {
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
                      <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
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
                    queue: true,
                  },
                });
                digestFollowUps.push(`email → ${lead.email}`);
              } catch (emailErr) {
                console.error(`Esther digest: email send failed for ${lead.email}: ${(emailErr as Error).message}`);
                digestFollowUps.push(`email FAILED → ${lead.email}`);
              }
            }

            // Digest-created incomplete leads get the same +48h enrichment
            // retry as single-path ones (review finding: they were the only
            // incomplete leads WITHOUT it).
            const scheduledTask = await scheduleEnrichmentFollowup(supabase, organizationId, result.leadId, {
              missing_name: result.missingName,
              missing_phone: result.missingPhone,
              lead_email: lead.email,
              property: lead.property,
              source: "digest",
            });
            if (scheduledTask) digestFollowUps.push(`enrichment task → ${lead.email || leadPhone || result.leadId}`);
          }
        } catch (e) {
          console.error(`Esther digest: error processing ${lead.name}: ${(e as Error).message}`);
          try {
            await supabase.from("system_logs").insert({
              organization_id: organizationId,
              level: "error",
              category: "general",
              event_type: "esther_digest_lead_error",
              message: `Esther digest: failed to process lead ${lead.name || lead.email || lead.phone}. ${(e as Error).message}`,
              details: { lead, error: (e as Error).message },
            });
          } catch (_) { /* don't mask original error */ }
          skipped++;
        }
      }

      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: "info",
        category: "general",
        event_type: "esther_digest_processed",
        message: `Esther: daily digest processed — ${created} new, ${updated} updated, ${skipped} skipped (${digestLeads.length} actionable of ${digestRawTotal} raw)${digestFollowUps.length > 0 ? `. Follow-ups: ${digestFollowUps.length}` : ""}`,
        details: {
          email_id: emailId,
          subject,
          total_leads: digestLeads.length,
          raw_total: digestRawTotal,
          no_contact: digestNoContact.length,
          created,
          updated,
          skipped,
          follow_ups: digestFollowUps,
        },
      });

      // Telegram: NO immediate per-digest message anymore. The 9:00 PM evening
      // digest (agent-daily-report mode=evening) aggregates today's digests from
      // the esther_digest_processed system_logs rows written above.

      await markInbound("processed", `digest:${created}c/${updated}u/${skipped}s of ${digestRawTotal} raw`);

      // Track Esther execution (digest success)
      try {
        const execMs = Date.now() - estherStartTime;
        await Promise.all([
          supabase.from("agent_activity_log").insert({
            organization_id: organizationId,
            agent_key: "esther",
            action: "digest_parsed",
            status: "success",
            message: `Digest: ${created} new, ${updated} updated, ${skipped} skipped`,
            execution_ms: execMs,
          }),
          supabase.rpc("log_agent_execution", {
            p_organization_id: organizationId,
            p_agent_key: "esther",
            p_success: true,
            p_execution_ms: execMs,
          }),
        ]);
      } catch (_) { /* non-blocking */ }

      // ── Store inbound digest email as communication record ────────
      try {
        const { error: commErr } = await supabase.from("communications").insert({
          organization_id: organizationId,
          recipient: fromEmail,
          subject: subject || "(no subject)",
          body: textBody || htmlBody || "",
          channel: "email",
          direction: "inbound",
          status: "delivered",
          sent_at: new Date().toISOString(),
        });
        if (commErr) console.error(`Esther: digest archive insert failed: ${commErr.message}`);
      } catch (_) { /* non-blocking */ }

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

    // ── SINGLE EMAIL: parse one lead (LLM-powered) ────────────────
    let leadInfo: LeadInfo;
    let extraLeads: LeadInfo[] = [];
    const singleFlags: LLMParseFlags = { truncatedInput: false, finishLength: false, salvaged: false };
    if (openaiKey) {
      try {
        const parsed = await parseHemlaneEmailLLM(openaiKey, htmlBody, subject, singleFlags);
        leadInfo = parsed.lead;
        extraLeads = parsed.extras;
        if (singleFlags.truncatedInput) console.warn("Esther: single-email input truncated at 48k chars");
        console.log(`Esther: LLM single parse → name=${leadInfo.name}, email=${leadInfo.email}, phone=${leadInfo.phone}${extraLeads.length ? ` (+${extraLeads.length} extras)` : ""}`);
      } catch (llmErr) {
        console.error(`Esther: LLM single parse failed: ${(llmErr as Error).message}`);
        await supabase.from("system_logs").insert({
          organization_id: organizationId,
          level: "error",
          category: "general",
          event_type: "esther_llm_parse_failed",
          message: `Esther: LLM single email parsing failed: ${(llmErr as Error).message}`,
          details: { email_id: emailId, subject, error: (llmErr as Error).message },
        });
        await markInbound("failed", "llm_parse_failed", null, (llmErr as Error).message);
        // 503 → svix/Resend retries for ~24h. A transient OpenAI outage must NOT
        // permanently lose the email (returning 200 here lost 3 real inquiries).
        // No side effects have happened yet, so a retried delivery is safe.
        return new Response(
          JSON.stringify({ error: "LLM parsing failed — retry requested", detail: (llmErr as Error).message }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.error("Esther: no OpenAI key — cannot parse email");
      try {
        await supabase.from("system_logs").insert({
          organization_id: organizationId,
          level: "error",
          category: "general",
          event_type: "esther_llm_parse_failed",
          message: "Esther: no OpenAI API key configured — email left for webhook retry",
          details: { email_id: emailId, subject },
        });
      } catch { /* non-blocking */ }
      await markInbound("failed", "no_openai_key");
      return new Response(
        JSON.stringify({ error: "No OpenAI API key configured — retry requested" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use reply_to email as fallback if parser didn't find one
    if (!leadInfo.email && replyToEmail) {
      leadInfo.email = replyToEmail;
    }

    // From-address fallback: direct prospect replies (to reply@inbound.…)
    // carry the lead's address in the From header, which the LLM never sees —
    // without this, a bare "yes, I'm still interested" reply would be
    // discarded as contact-less (F05 reply loop).
    if (!leadInfo.email && !leadInfo.phone) {
      const fromMatch = fromEmail.toLowerCase().match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
      if (fromMatch && !isSystemEmailDomain(fromMatch[0].split("@").pop() || "")) {
        leadInfo.email = fromMatch[0];
        console.log(`Esther: using From address as contact fallback: ${leadInfo.email}`);
      }
    }

    // A 7-9 digit phone passes validateLeadInfo but can't be E.164-formatted —
    // it used to make the lead vanish with only a console.log (F24). Treat it
    // as no-phone and keep the raw digits as a note for the shell/lead.
    let unparseablePhone: string | null = null;
    if (leadInfo.phone && !formatPhoneE164(leadInfo.phone)) {
      unparseablePhone = leadInfo.phone;
      leadInfo.phone = null;
      console.warn(`Esther: unparseable phone "${unparseablePhone}" — keeping as note`);
    }

    // No contact info (phone or email) → merge the name into its pair, or
    // create a SHELL lead so the prospect survives (F03: ~110 named prospects
    // with tour intent used to evaporate here).
    if (!leadInfo.phone && !leadInfo.email) {
      const hasPartialInfo = !!(leadInfo.name || leadInfo.property);
      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: hasPartialInfo ? "info" : "warning",
        category: "general",
        event_type: hasPartialInfo ? "esther_no_contact_info" : "esther_parse_skip",
        message: hasPartialInfo
          ? `Esther: no phone or email in this email. Name: ${leadInfo.name || "unknown"}, Property: ${leadInfo.property || "unknown"}`
          : `Esther: skipped email — no lead info found at all. Subject: ${subject}`,
        details: {
          email_id: emailId,
          from: fromEmail,
          subject,
          lead_name: leadInfo.name,
          lead_property: leadInfo.property,
          lead_message: leadInfo.message,
          body_preview: (textBody || htmlBody).substring(0, 1500),
        },
      });

      if (!hasPartialInfo) {
        await markInbound("skipped", "no_lead_info");
        return new Response(
          JSON.stringify({ message: "Email parsed but no lead info found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Direction A: merge the name into the paired nameless lead ──
      // Hemlane pairs: "Rental Message from {property}" (name, no contact) +
      // "New inquiry for {property}" (contact, no name), hours apart.
      // HARDENED (F15): propertyId match only (the old ilike fallback crossed
      // units in the same building), EXACTLY-ONE placeholder rule, audited.
      if (leadInfo.name && leadInfo.name.length > 2) {
        const propertyId = leadInfo.property
          ? await matchProperty(supabase, organizationId, leadInfo.property)
          : null;

        if (propertyId) {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: recentCandidates } = await supabase
            .from("leads")
            .select("id, full_name, source_detail, phone, email, lead_property_interests!inner(property_id)")
            .eq("organization_id", organizationId)
            .eq("source", "hemlane_email")
            .eq("lead_property_interests.property_id", propertyId)
            .gte("created_at", twentyFourHoursAgo)
            .order("created_at", { ascending: false })
            .limit(10);

          const isPlaceholder = (name: string | null) =>
            !name || name.startsWith("Hemlane Lead") || /^\+?\d[\d\s()-]{6,}$/.test(name) || /\d{7,}/.test((name || "").replace(/\D/g, ""));
          const placeholders = (recentCandidates || []).filter((c) => isPlaceholder(c.full_name));

          if (placeholders.length === 1) {
            const candidate = placeholders[0];
            const { error: fixErr } = await supabase
              .from("leads")
              .update({
                full_name: leadInfo.name,
                first_name: leadInfo.name!.split(" ")[0] || null,
                last_name: leadInfo.name!.split(" ").slice(1).join(" ") || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", candidate.id);
            if (!fixErr) {
              console.log(`Esther: Direction A name merge → ${candidate.id} "${candidate.full_name}" → "${leadInfo.name}"`);
              if (leadInfo.message) {
                await saveLeadNote(supabase, organizationId, candidate.id, leadInfo.message);
                // Direction A merges never applied intent boosts (F07)
                for (const intent of detectAllIntents(leadInfo.message)) {
                  const { error: rpcErr } = await supabase.rpc("log_score_change", {
                    _lead_id: candidate.id,
                    _change_amount: intent.boost,
                    _reason_code: intent.reason_code,
                    _reason_text: intent.reason,
                    _triggered_by: "engagement",
                    _changed_by_agent: "esther",
                  });
                  if (rpcErr) console.error(`Esther: Direction A score boost failed: ${rpcErr.message}`);
                }
              }
              try {
                await supabase.from("system_logs").insert({
                  organization_id: organizationId,
                  level: "info",
                  category: "general",
                  event_type: "esther_lead_merged",
                  message: `Esther merge (direction-A name): lead ${candidate.id} "${candidate.full_name || "?"}" → "${leadInfo.name}"`,
                  details: {
                    dup_type: "direction-A name",
                    lead_id: candidate.id,
                    before: { full_name: candidate.full_name },
                    incoming: { name: leadInfo.name, property: leadInfo.property },
                    email_id: emailId,
                  },
                  related_lead_id: candidate.id,
                });
              } catch { /* non-blocking */ }
              await markInbound("processed", "name_merged", candidate.id);
              return new Response(
                JSON.stringify({ message: "Name merged into paired lead", lead_id: candidate.id }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } else if (placeholders.length > 1) {
            console.log(`Esther: Direction A — ${placeholders.length} placeholder candidates (ambiguous), creating shell instead`);
          }
        }
      }

      // ── No merge target → SHELL lead (name + property + message, no contact) ──
      if (leadInfo.name && leadInfo.name.length > 2) {
        const propertyId = leadInfo.property
          ? await matchProperty(supabase, organizationId, leadInfo.property)
          : null;
        const shell = await createShellLead(supabase, organizationId, leadInfo, emailId, propertyId, unparseablePhone);
        if (shell) {
          await markInbound("processed", shell.attached ? "message_attached" : "shell_created", shell.leadId);
          return new Response(
            JSON.stringify({ message: shell.attached ? "Message attached to existing lead" : "Shell lead created (needs contact info)", lead_id: shell.leadId }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      await markInbound("skipped", "no_contact_discarded");
      return new Response(
        JSON.stringify({ message: "Lead has name/property but no contact info — no merge target or shell possible" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await upsertLead(supabase, organizationId, leadInfo, emailId);

    // Fire a 🆕 new-lead alert for a genuinely new insert OR a name-only shell
    // that just gained a phone. Hemlane sends each inquiry as TWO emails ~20s
    // apart (name-only "Rental Message" → shell, then "New inquiry" with the
    // phone), so the actionable moment lands as an UPDATE (isNew=false) — gating
    // only on isNew silently dropped every paired lead's alert. telegram-notify
    // skips any phone-less payload, so a still-contactless lead makes no card
    // until its phone arrives. Best-effort; never blocks parsing.
    const notifyNewLead = async (r: any, li: any) => {
      if (!r || !(r.isNew || r.gainedPhone)) return;
      const name = (r.isNew ? (li.name || r.finalName) : (r.finalName || li.name)) || "Hemlane lead";
      const ph = r.finalPhone || (li.phone ? formatPhoneE164(li.phone) : null);
      const interest = li.property || r.finalProperty || null;
      try {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            channel: "report", event: "new_lead",
            payload: {
              name,
              source: `Hemlane${li.listingSource ? ` (${li.listingSource})` : ""}`,
              phone: ph, interest,
            },
          }),
        });
      } catch (_) { /* best-effort */ }
    };

    // Multi-lead email that slipped into the single path: process the rest (F11)
    let extrasProcessed = 0;
    for (const extra of extraLeads) {
      try {
        const r = await upsertLead(supabase, organizationId, extra, emailId);
        if (r) { extrasProcessed++; await notifyNewLead(r, extra); }
      } catch (e) {
        console.error(`Esther: extra lead failed: ${(e as Error).message}`);
      }
    }

    if (!result) {
      await markInbound(extrasProcessed > 0 ? "processed" : "skipped", extrasProcessed > 0 ? `extras_only:${extrasProcessed}` : "not_actionable");
      return new Response(
        JSON.stringify({ message: "Could not create lead (no phone or email)", extras_processed: extrasProcessed }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPhone = leadInfo.phone ? formatPhoneE164(leadInfo.phone) : null;
    const contactId = formattedPhone || leadInfo.email || "unknown";
    const followUpActions: string[] = [];

    // ── Real-time new-lead alert (single-email path). Digest leads are
    // summarized in one batch message instead (never per-lead). ──
    await notifyNewLead(result, leadInfo);

    // ── Schedule follow-up when data is incomplete ────────────────────
    if (result.isNew && (result.missingName || result.missingPhone)) {
      const scheduleAt = new Date();
      scheduleAt.setMinutes(scheduleAt.getMinutes() + 2);

      if (leadInfo.email) {
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
              <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
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
            queue: true,
          },
        });
        followUpActions.push("info-request email sent");
        } catch (emailErr) {
          console.error(`Esther: email send failed for ${leadInfo.email}: ${(emailErr as Error).message}`);
          followUpActions.push("info-request email FAILED");
        }
      } else {
        // No phone AND no email → flag for manual admin review
        followUpActions.push("flagged for manual review (no contact info)");
      }

      // One-shot enrichment retry at +48h (F18): the dispatcher re-sends the
      // info request ONLY if the lead is still missing name/phone by then.
      const scheduled = await scheduleEnrichmentFollowup(supabase, organizationId, result.leadId, {
        missing_name: result.missingName,
        missing_phone: result.missingPhone,
        lead_email: leadInfo.email,
        property: leadInfo.property,
      });
      if (scheduled) followUpActions.push("enrichment retry scheduled (+48h)");

      const missingFields = [result.missingName && "name", result.missingPhone && "phone"].filter(Boolean).join(", ");
      const actionsText = followUpActions.length > 0 ? followUpActions.join(", ") : "none";

      await supabase.from("system_logs").insert({
        organization_id: organizationId,
        level: followUpActions.some((a) => a.includes("manual review")) ? "error" : "warning",
        category: "general",
        event_type: "esther_incomplete_lead",
        message: `Esther: lead created with incomplete data (${contactId}). Missing: ${missingFields}. Actions: ${actionsText}`,
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

    // ── Track Esther execution (success) ──────────────────────────────
    try {
      const execMs = Date.now() - estherStartTime;
      await Promise.all([
        supabase.from("agent_activity_log").insert({
          organization_id: organizationId,
          agent_key: "esther",
          action: "email_parsed",
          status: "success",
          message: `${result.isNew ? "New lead" : "Updated lead"}: ${leadInfo.name || "unknown"}${actionSuffix}`,
          execution_ms: execMs,
          related_lead_id: result.leadId || null,
        }),
        supabase.rpc("log_agent_execution", {
          p_organization_id: organizationId,
          p_agent_key: "esther",
          p_success: true,
          p_execution_ms: execMs,
        }),
      ]);
    } catch (_) { /* non-blocking */ }

    // ── Store inbound email as communication record ─────────────────
    try {
      // NOTE: status must be one of communications_status_check (sent/delivered/
      // failed/opened/clicked) — 'received' violated it and the archive silently
      // no-oped for every single email since 2026-03-12.
      const { error: commErr } = await supabase.from("communications").insert({
        organization_id: organizationId,
        lead_id: result.leadId || null,
        recipient: fromEmail,
        subject: subject || "(no subject)",
        body: textBody || htmlBody || "",
        channel: "email",
        direction: "inbound",
        status: "delivered",
        sent_at: new Date().toISOString(),
      });
      if (commErr) console.error(`Esther: inbound archive insert failed: ${commErr.message}`);
    } catch (_) { /* non-blocking — don't fail the webhook */ }

    await markInbound(
      "processed",
      `${result.isNew ? "lead_created" : "lead_updated"}${extrasProcessed > 0 ? ` +${extrasProcessed} extras` : ""}`,
      result.leadId
    );

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: result.leadId,
        is_new_lead: result.isNew,
        missing_name: result.missingName,
        missing_phone: result.missingPhone,
        follow_up: followUpActions,
        ...(extrasProcessed > 0 ? { extras_processed: extrasProcessed } : {}),
        message: `Lead ${result.isNew ? "created" : "updated"} from Hemlane email${actionSuffix}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-hemlane-parser (Esther) error:", err);

    // Mark the persisted email as failed so the reconcile cron can replay it
    if (processedEmailId) {
      try {
        await supabase
          .from("inbound_emails")
          .update({ status: "failed", outcome: "error", last_error: String((err as Error).message || err).substring(0, 500), processed_at: new Date().toISOString() })
          .eq("email_id", processedEmailId);
      } catch { /* non-blocking */ }
    }

    // Log error to system_logs
    try {
      await supabase.from("system_logs").insert({
        organization_id: organizationId || null,
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

    // Track Esther execution (failure)
    try {
      await supabase.rpc("log_agent_execution", {
        p_organization_id: organizationId || null,
        p_agent_key: "esther",
        p_success: false,
        p_execution_ms: Date.now() - estherStartTime,
      });
    } catch (_) { /* non-blocking */ }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
