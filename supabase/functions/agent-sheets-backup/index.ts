import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// agent-sheets-backup — mirrors leads into a Google Sheet via an Apps Script
// Web App webhook (no GCP / service account). Two modes:
//   • upsert (default)  — one lead per call, matched by Lead ID (col A). Enqueued
//     by the auto_task_sheets_sync trigger and run by agent-task-dispatcher.
//   • full_export       — the entire leads table in batches; clears + rewrites
//     the Leads tab. Run once for the initial load.
//
// Config (organization_settings): google_sheets_webhook_url + google_sheets_webhook_secret.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Column order — MUST match the Apps Script + header row. Lead ID first (upsert key).
const HEADERS = [
  "Lead ID", "Name", "Phone", "Email", "Status", "Score", "Source",
  "Interest Cities", "Interest Properties", "Voucher", "Voucher Amount",
  "Move-in", "Created", "Last Contact",
];

const NY = "America/New_York";
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: NY, month: "2-digit", day: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

interface LeadRow {
  id: string; full_name: string | null; first_name: string | null; last_name: string | null;
  phone: string | null; email: string | null; status: string | null; lead_score: number | null;
  source: string | null; has_voucher: boolean | null; voucher_amount: number | null;
  move_in_date: string | null; created_at: string | null; last_contact_at: string | null;
}
type TagInfo = { cities: string[]; addresses: string[] };

function buildRow(l: LeadRow, tags: TagInfo): (string | number)[] {
  const name = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unknown";
  return [
    l.id,
    name,
    l.phone || "",
    l.email || "",
    l.status || "",
    l.lead_score ?? 0,
    l.source || "",
    tags.cities.join(", "),
    tags.addresses.join(", "),
    l.has_voucher ? "Yes" : "No",
    l.voucher_amount != null ? String(l.voucher_amount) : "",
    l.move_in_date || "",
    fmtDate(l.created_at),
    fmtDate(l.last_contact_at),
  ];
}

const LEAD_COLS =
  "id, full_name, first_name, last_name, phone, email, status, lead_score, source, has_voucher, voucher_amount, move_in_date, created_at, last_contact_at";

async function postWebhook(url: string, secret: string, payload: Record<string, unknown>) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, headers: HEADERS, ...payload }),
    redirect: "follow",
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Webhook ${resp.status}: ${text.slice(0, 300)}`);
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let task_id: string | undefined, lead_id: string | undefined, organization_id: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    ({ task_id, lead_id, organization_id } = body);
    const context = body.context;
    const mode = body.mode || context?.mode; // "full_export" | undefined
    const operation = context?.operation || "upsert";

    if (task_id) {
      await supabase.from("agent_tasks")
        .update({ status: "in_progress", executed_at: new Date().toISOString() })
        .eq("id", task_id);
    }

    // Resolve webhook config.
    const { data: cfg } = await supabase
      .from("organization_settings").select("key, value")
      .eq("organization_id", organization_id)
      .in("key", ["google_sheets_webhook_url", "google_sheets_webhook_secret"]);
    const cfgMap = new Map((cfg || []).map((s: { key: string; value: string }) => [s.key, s.value]));
    const unwrap = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      try { const p = JSON.parse(s); return typeof p === "string" ? p : s; } catch { return s; }
    };
    const webhookUrl = unwrap(cfgMap.get("google_sheets_webhook_url"));
    const secret = unwrap(cfgMap.get("google_sheets_webhook_secret"));

    if (!webhookUrl) {
      if (task_id) await supabase.from("agent_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task_id);
      return json({ success: true, skipped: true, reason: "no_webhook_configured" });
    }

    // ── FULL EXPORT ────────────────────────────────────────────────────────
    if (mode === "full_export") {
      // Page all leads.
      const leads: LeadRow[] = [];
      const PAGE = 1000;
      for (let from = 0; from < 200000; from += PAGE) {
        const { data, error } = await supabase
          .from("leads").select(LEAD_COLS)
          .eq("organization_id", organization_id).not("is_demo", "is", true)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        leads.push(...((data as LeadRow[]) || []));
        if (!data || data.length < PAGE) break;
      }

      // All tag pairs → per-lead cities/addresses.
      const tagsByLead = new Map<string, TagInfo>();
      for (let from = 0; from < 500000; from += PAGE) {
        const { data, error } = await supabase
          .from("lead_property_interests")
          .select("lead_id, properties:property_id(address, city)")
          .eq("organization_id", organization_id)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of (data as any[]) || []) {
          const t = tagsByLead.get(r.lead_id) || { cities: [], addresses: [] };
          const city = r.properties?.city, addr = r.properties?.address;
          if (city && !t.cities.includes(city)) t.cities.push(city);
          if (addr && !t.addresses.includes(addr)) t.addresses.push(addr);
          tagsByLead.set(r.lead_id, t);
        }
        if (!data || data.length < PAGE) break;
      }

      const rows = leads.map((l) => buildRow(l, tagsByLead.get(l.id) || { cities: [], addresses: [] }));

      // Send in chunks: first chunk mode "full" (clears + headers), rest "append".
      const CHUNK = 2000;
      let sent = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        await postWebhook(webhookUrl, secret, { mode: i === 0 ? "full" : "append", rows: slice });
        sent += slice.length;
      }
      if (rows.length === 0) await postWebhook(webhookUrl, secret, { mode: "full", rows: [] });

      await supabase.rpc("log_agent_activity", {
        p_organization_id: organization_id, p_agent_key: "sheets_backup",
        p_action: "full_export", p_status: "success",
        p_message: `Full export: ${sent} leads written to Google Sheet`,
      }).catch(() => {});

      return json({ success: true, mode: "full_export", rows: sent });
    }

    // ── INCREMENTAL UPSERT (one lead) ──────────────────────────────────────
    if (!lead_id) {
      if (task_id) await supabase.from("agent_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task_id);
      return json({ success: true, skipped: true, reason: "no_lead_id" });
    }

    const { data: lead, error: leadErr } = await supabase
      .from("leads").select(LEAD_COLS).eq("id", lead_id).single();
    if (leadErr || !lead) throw new Error(`Lead not found: ${leadErr?.message}`);

    const { data: tagRows } = await supabase
      .from("lead_property_interests")
      .select("properties:property_id(address, city)")
      .eq("lead_id", lead_id);
    const tags: TagInfo = { cities: [], addresses: [] };
    for (const r of (tagRows as any[]) || []) {
      const city = r.properties?.city, addr = r.properties?.address;
      if (city && !tags.cities.includes(city)) tags.cities.push(city);
      if (addr && !tags.addresses.includes(addr)) tags.addresses.push(addr);
    }

    const row = buildRow(lead as LeadRow, tags);
    await postWebhook(webhookUrl, secret, { mode: "upsert", row });

    await supabase.rpc("log_agent_activity", {
      p_organization_id: organization_id, p_agent_key: "sheets_backup",
      p_action: operation, p_status: "success",
      p_message: `Synced lead to Google Sheet (${operation})`, p_related_lead_id: lead_id,
    }).catch(() => {});

    if (task_id) await supabase.from("agent_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task_id);
    return json({ success: true, mode: "upsert", lead_id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[sheets-backup] error:", msg);
    try {
      if (organization_id) {
        await supabase.rpc("log_agent_activity", {
          p_organization_id: organization_id, p_agent_key: "sheets_backup",
          p_action: "backup_error", p_status: "error", p_message: msg, p_related_lead_id: lead_id,
        }).catch(() => {});
      }
      if (task_id) await supabase.from("agent_tasks").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", task_id);
    } catch { /* ignore */ }
    return json({ success: false, error: msg }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
