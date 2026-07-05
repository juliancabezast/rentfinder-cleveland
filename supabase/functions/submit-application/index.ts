import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// submit-application
//
// Public (no-JWT) endpoint that powers the marketplace multi-step rental
// application flow. It is deliberately PROGRESSIVE: the first step (name + phone)
// creates/finds a lead and returns its id, and every later step complements the
// SAME lead — so a visitor who drops off after step 1 is still captured and not
// lost. Only the FINAL step promotes the lead to `in_application` (the app's
// "Applicants" queue) and logs the $50-fee + privacy/terms acknowledgment.
//
// A separate `quiz` action lets the confirmation page enrich the lead one answer
// at a time (each click persists independently).
//
// NOTE: no payment is collected here. The $50 fee is only *acknowledged*; the
// team collects it later. This function never sees card/bank data.
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Single-tenant org resolution (never hardcode the UUID — resolve by slug, with
// a fallback to the oldest org). Mirrors leasing-tracker-lookup.
const ORG_SLUG = "rent-finder-cleveland";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if not 10/11 digits. */
function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts[0] || "";
  const last = parts.slice(1).join(" ");
  return { first, last: last || "" };
}

function isValidEmail(e: unknown): boolean {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

/** Clamp a value to a bounded, sanitized string. */
function clampStr(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  req.headers.get("cf-connecting-ip") ||
  null;

// ── Build the human-readable pinned note that the team sees on the lead ──────
function buildIntakeNote(lead: Record<string, any>, prefs: Record<string, any>): string {
  const lines: string[] = ["📝 Online rental application (marketplace)"];
  const rentType = prefs.property_types;
  const voucher =
    lead.has_voucher === true ? "Yes" : lead.has_voucher === false ? "No" : "—";
  lines.push(`• Voucher / Section 8: ${voucher}${lead.housing_authority ? ` (${lead.housing_authority})` : ""}`);
  if (lead.move_in_date) lines.push(`• Desired move-in: ${lead.move_in_date}`);
  if (prefs.household_size != null) lines.push(`• People in the home: ${prefs.household_size}`);
  if (lead.budget_min != null || lead.budget_max != null) {
    const lo = lead.budget_min != null ? `$${Number(lead.budget_min).toLocaleString()}` : "";
    const hi = lead.budget_max != null ? `$${Number(lead.budget_max).toLocaleString()}` : "";
    lines.push(`• Budget: ${[lo, hi].filter(Boolean).join(" – ") || "—"}/mo`);
  }
  if (Array.isArray(rentType) && rentType.length) lines.push(`• Open to: ${rentType.join(", ")}`);
  if (prefs.pets) lines.push(`• Pets: ${prefs.pets}`);
  if (prefs.income_source) lines.push(`• Income source: ${prefs.income_source}`);
  if (prefs.move_urgency) lines.push(`• Timeline: ${prefs.move_urgency}`);
  if (prefs.fee_acknowledged) {
    lines.push(`• ✅ Acknowledged $50 non-refundable application fee + Privacy/Terms`);
  }
  lines.push(`⚠️ Not a formal application until the $50 fee is paid. Needs ID + last 3 paystubs (income 3× rent).`);
  return lines.join("\n");
}

/** Upsert the single pinned "application" note for a lead (find-or-create). */
async function upsertIntakeNote(
  supabase: any,
  organizationId: string,
  leadId: string,
  content: string,
) {
  const { data: existing } = await supabase
    .from("lead_notes")
    .select("id")
    .eq("lead_id", leadId)
    .eq("note_type", "application")
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("lead_notes")
      .update({ content, is_pinned: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("lead_notes").insert({
      organization_id: organizationId,
      lead_id: leadId,
      note_type: "application",
      content,
      is_pinned: true,
    });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "save";

    // ── Resolve the single tenant org (by slug, fallback oldest) ────────────
    let orgId: string | null = null;
    {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", ORG_SLUG)
        .maybeSingle();
      orgId = org?.id ?? null;
      if (!orgId) {
        const { data: fallback } = await supabase
          .from("organizations")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        orgId = fallback?.id ?? null;
      }
    }
    if (!orgId) return json({ error: "org_not_found" }, 500);

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: quiz — enrich an existing lead one answer at a time
    // ════════════════════════════════════════════════════════════════════════
    if (action === "quiz") {
      const leadId = clampStr(body.lead_id, 64);
      if (!leadId) return json({ error: "Missing lead_id" }, 400);
      const answers = (body.answers && typeof body.answers === "object") ? body.answers : {};

      // Load the lead (also confirms it belongs to this org)
      const { data: lead } = await supabase
        .from("leads")
        .select("id, organization_id, intake_preferences, budget_min, budget_max, move_in_date, has_voucher, housing_authority")
        .eq("id", leadId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (!lead) return json({ error: "lead_not_found" }, 404);

      // Merge quiz answers into intake_preferences jsonb
      const prevPrefs = (lead.intake_preferences && typeof lead.intake_preferences === "object")
        ? lead.intake_preferences
        : {};
      const nextPrefs: Record<string, any> = { ...prevPrefs };

      const update: Record<string, any> = { updated_at: new Date().toISOString() };

      // Map well-known answers onto dedicated columns; keep everything in jsonb too.
      if (answers.budget_min != null && !isNaN(Number(answers.budget_min))) {
        update.budget_min = Number(answers.budget_min);
        nextPrefs.budget_min = Number(answers.budget_min);
      }
      if (answers.budget_max != null && !isNaN(Number(answers.budget_max))) {
        update.budget_max = Number(answers.budget_max);
        nextPrefs.budget_max = Number(answers.budget_max);
      }
      if (typeof answers.move_urgency === "string") nextPrefs.move_urgency = clampStr(answers.move_urgency, 40);
      if (answers.household_size != null && !isNaN(Number(answers.household_size))) {
        nextPrefs.household_size = Math.max(0, Math.min(20, Math.round(Number(answers.household_size))));
      }
      if (Array.isArray(answers.property_types)) {
        nextPrefs.property_types = answers.property_types
          .filter((t: unknown) => typeof t === "string")
          .slice(0, 4);
      }
      if (typeof answers.pets === "string") nextPrefs.pets = clampStr(answers.pets, 40);
      if (typeof answers.income_source === "string") nextPrefs.income_source = clampStr(answers.income_source, 60);

      update.intake_preferences = nextPrefs;

      const { error: upErr } = await supabase.from("leads").update(update).eq("id", leadId);
      if (upErr) {
        console.error("quiz update error:", upErr);
        return json({ error: "save_failed" }, 500);
      }

      // Refresh the pinned team-facing note
      await upsertIntakeNote(
        supabase,
        orgId,
        leadId,
        buildIntakeNote({ ...lead, ...update }, nextPrefs),
      );

      return json({ success: true, lead_id: leadId });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: save — progressive per-step core save
    // ════════════════════════════════════════════════════════════════════════
    const step: number = Number(body.step) || 0;
    const isFinal: boolean = body.final === true;

    const fullName = clampStr(body.full_name, 120);
    const e164 = toE164(body.phone);
    const email = isValidEmail(body.email) ? String(body.email).trim().slice(0, 160) : null;
    const propertyId = clampStr(body.property_id, 64);
    const hasVoucher =
      body.has_voucher === true ? true : body.has_voucher === false ? false : undefined;
    const housingAuthority = clampStr(body.housing_authority, 120);
    const moveInDate = clampStr(body.move_in_date, 20); // "YYYY-MM-DD"
    const householdSize =
      body.household_size != null && !isNaN(Number(body.household_size))
        ? Math.max(0, Math.min(20, Math.round(Number(body.household_size))))
        : undefined;

    let leadId = clampStr(body.lead_id, 64);

    // ── Step 1 (or any call without a known lead): find-or-create by phone ──
    if (!leadId) {
      if (!fullName || !e164) {
        return json({ error: "Please enter your full name and a valid phone number." }, 400);
      }

      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone", e164)
        .maybeSingle();

      if (existing) {
        leadId = existing.id;
      } else {
        const { first, last } = splitName(fullName);
        const { data: newLead, error: insErr } = await supabase
          .from("leads")
          .insert({
            organization_id: orgId,
            full_name: fullName,
            first_name: first || null,
            last_name: last || null,
            phone: e164,
            email,
            source: "website",
            source_detail: "marketplace_application",
            status: "new",
            interested_property_id: propertyId || null,
            has_voucher: hasVoucher ?? null,
          })
          .select("id")
          .single();

        if (insErr || !newLead) {
          console.error("lead insert error:", insErr);
          return json({ error: "Could not start your application. Please try again or call us." }, 500);
        }
        leadId = newLead.id;
      }
    }

    // ── Load the current lead so we merge (never blank out) existing data ───
    const { data: lead } = await supabase
      .from("leads")
      .select("id, organization_id, full_name, email, has_voucher, housing_authority, move_in_date, budget_min, budget_max, intake_preferences, interested_property_id, lead_score, status")
      .eq("id", leadId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!lead) return json({ error: "lead_not_found" }, 404);

    const prevPrefs = (lead.intake_preferences && typeof lead.intake_preferences === "object")
      ? lead.intake_preferences
      : {};
    const nextPrefs: Record<string, any> = { ...prevPrefs };
    if (householdSize !== undefined) nextPrefs.household_size = householdSize;

    // ── Build a conservative update (only set fields we actually received) ──
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (fullName) {
      update.full_name = fullName;
      const { first, last } = splitName(fullName);
      update.first_name = first || null;
      update.last_name = last || null;
    }
    if (email && !lead.email) update.email = email; // don't clobber a good email
    else if (email) update.email = email;
    if (hasVoucher !== undefined) update.has_voucher = hasVoucher;
    if (housingAuthority) update.housing_authority = housingAuthority;
    if (moveInDate) update.move_in_date = moveInDate;
    if (propertyId) update.interested_property_id = propertyId;
    if (householdSize !== undefined) update.intake_preferences = nextPrefs;

    // ── FINAL step: promote to Applicant + log consent + pinned note ────────
    let previousScore = lead.lead_score ?? 40;
    if (isFinal) {
      nextPrefs.fee_acknowledged = true;
      update.intake_preferences = nextPrefs;
      update.status = "in_application";
      update.stage = "lead";
      update.is_priority = true;
      update.priority_reason = "Started online application";

      // Modest score bump with audit row (matches app scoring convention)
      const newScore = Math.min(previousScore + 25, 100);
      update.lead_score = newScore;

      // Optional SMS/TCPA consent (NOT required to apply)
      const consent = body.consent;
      if (consent?.sms_consent) {
        update.sms_consent = true;
        update.sms_consent_at = new Date().toISOString();
        update.call_consent = true;
        update.call_consent_at = new Date().toISOString();
      }

      const { error: upErr } = await supabase.from("leads").update(update).eq("id", leadId);
      if (upErr) {
        console.error("final update error:", upErr);
        return json({ error: "Could not submit your application. Please try again." }, 500);
      }

      // Score audit trail
      if (newScore !== previousScore) {
        await supabase.from("lead_score_history").insert({
          lead_id: leadId,
          organization_id: orgId,
          previous_score: previousScore,
          new_score: newScore,
          change_amount: newScore - previousScore,
          reason_code: "application_started",
          reason_text: "Lead started an online rental application — Hot Lead boost",
          triggered_by: "engagement",
          changed_by_agent: "submit-application",
        });
      }

      // ── Consent log: $50 fee + Privacy/Terms acknowledgment (REQUIRED) ────
      const feeAck = body.fee_ack || {};
      const ip = clientIp(req);
      const ua = clampStr(body.user_agent, 400) || req.headers.get("user-agent");
      const feeEvidence =
        `Applicant acknowledged a $50 non-refundable application fee per household and agreed to the ` +
        `Privacy Policy and Terms of Service (v${clampStr(feeAck.version, 12) || "1.0"}) via web form` +
        `${feeAck.source_url ? ` at ${clampStr(feeAck.source_url, 300)}` : ""} on ${new Date().toISOString()}.` +
        `${feeAck.text ? ` Text shown: "${clampStr(feeAck.text, 600)}"` : ""}`;

      await supabase.from("consent_log").insert({
        organization_id: orgId,
        lead_id: leadId,
        consent_type: "application_fee_ack",
        granted: true,
        method: "web_form",
        evidence_text: feeEvidence,
        evidence_url: clampStr(feeAck.source_url, 300),
        ip_address: ip,
        user_agent: ua,
      });

      // ── Consent log: SMS/call (only if the optional box was checked) ──────
      if (consent?.sms_consent) {
        await supabase.from("consent_log").insert({
          organization_id: orgId,
          lead_id: leadId,
          consent_type: "sms_and_call",
          granted: true,
          method: "web_form",
          evidence_text: clampStr(consent.consent_language, 1000) ||
            "Applicant agreed to receive SMS/calls via the application form.",
          evidence_url: clampStr(consent.consent_source_url, 300),
          ip_address: ip,
          user_agent: ua,
        });
      }

      // Pinned, team-facing summary note
      await upsertIntakeNote(
        supabase,
        orgId,
        leadId,
        buildIntakeNote({ ...lead, ...update }, nextPrefs),
      );

      // System log
      await supabase.from("system_logs").insert({
        organization_id: orgId,
        level: "info",
        category: "general",
        event_type: "public_application_submitted",
        message: `Online application submitted: ${update.full_name || lead.full_name || "New applicant"}`,
        details: {
          lead_id: leadId,
          property_id: propertyId || lead.interested_property_id || null,
          source: "marketplace_application",
          sms_consent: !!consent?.sms_consent,
        },
        related_lead_id: leadId,
      });

      // ── Best-effort Telegram alert to the team (never fails the request) ──
      try {
        const { data: creds } = await supabase
          .from("organization_credentials")
          .select("telegram_bot_token, telegram_chat_id")
          .eq("organization_id", orgId)
          .maybeSingle();
        const botToken = creds?.telegram_bot_token;
        const chatId = creds?.telegram_chat_id;
        if (botToken && chatId) {
          let propAddr = "";
          const pid = propertyId || lead.interested_property_id;
          if (pid) {
            const { data: p } = await supabase
              .from("properties")
              .select("address, city, rent_price")
              .eq("id", pid)
              .maybeSingle();
            if (p) propAddr = `${p.address}, ${p.city}${p.rent_price ? ` — $${Number(p.rent_price).toLocaleString()}/mo` : ""}`;
          }
          const msg = [
            `🧾 <b>New Online Application</b>`,
            ``,
            `👤 <b>${(update.full_name || lead.full_name || "—")}</b>`,
            `📞 ${e164 || "—"}`,
            `✉️ ${update.email || lead.email || "—"}`,
            propAddr ? `📍 ${propAddr}` : `📍 No specific property`,
            update.has_voucher === true ? `🏷️ Section 8 / voucher` : ``,
            ``,
            `⚠️ Not formal until $50 fee paid. Needs ID + 3 paystubs (3× rent).`,
            `➡️ Now in Applicants.`,
          ].filter(Boolean).join("\n");
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: msg,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          });
        }
      } catch (tgErr) {
        console.warn("Telegram notify failed (non-critical):", tgErr);
      }

      return json({ success: true, lead_id: leadId, final: true });
    }

    // ── Non-final step: just persist the partial data ───────────────────────
    const { error: upErr } = await supabase.from("leads").update(update).eq("id", leadId);
    if (upErr) {
      console.error("save update error:", upErr);
      return json({ error: "Could not save your progress. Please try again." }, 500);
    }

    return json({ success: true, lead_id: leadId, step });
  } catch (err) {
    console.error("submit-application error:", err);
    return json({ error: "Internal server error. Please try again later." }, 500);
  }
});
