import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPdf, san } from "./pdf.ts";

// leasing-report-pdf — generates a de-identified owner-facing leasing PDF for a
// building and delivers it to a Telegram chat via sendDocument. Internal-only:
// the caller (the Telegram scheduling bot) must present the service-role key.
// Reuses leasing-tracker-lookup {groupKey} for all data + de-identification.
// The PDF renderer lives in ./pdf.ts (Montserrat + charts; render locally via
// scratchpad/pdf-render.ts).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aB = enc.encode(a), bB = enc.encode(b);
  const len = Math.max(aB.length, bB.length);
  let diff = aB.length ^ bB.length;
  for (let i = 0; i < len; i++) diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Internal-only: this generates + delivers a document to a Telegram chat, so
  // only a caller holding the service-role key may use it.
  if (!timingSafeEqual(req.headers.get("Authorization") || "", `Bearer ${serviceKey}`)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { organization_id, groupKey, chat_id } = body as Record<string, any>;
    const lang: "es" | "en" = body.lang === "en" ? "en" : "es";
    const bot = body.bot === "general" ? "general"
      : body.bot === "leasing" ? "leasing" : "showings";
    if (!organization_id || !groupKey || !chat_id) {
      return json({ ok: false, error: "missing organization_id, groupKey or chat_id" }, 400);
    }

    // Fetch the de-identified tracker data (reuses all redaction server-side).
    const lookupResp = await fetch(`${supabaseUrl}/functions/v1/leasing-tracker-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ groupKey }),
    });
    const data = await lookupResp.json().catch(() => ({}));
    if (!lookupResp.ok || data?.error || !data?.property) {
      return json({ ok: false, error: `lookup failed: ${data?.error || lookupResp.status}` }, 502);
    }

    const pdf = await buildPdf(data, lang);

    // Resolve the delivery bot token. LeasingAgent (route bot) is the default
    // caller; its creds now live in organization_credentials (settings = legacy
    // fallback only).
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("telegram_bot_token, telegram_showings_bot_token, telegram_route_bot_token")
      .eq("organization_id", organization_id)
      .maybeSingle();
    let leasingToken: string | undefined = (creds?.telegram_route_bot_token as string) || undefined;
    if (bot === "leasing" && !leasingToken) {
      const { data: rs } = await supabase
        .from("organization_settings").select("key, value")
        .eq("organization_id", organization_id)
        .in("key", ["telegram_route_bot_token"]);
      const unwrapVal = (v: any) => {
        if (v == null) return undefined;
        try { const p = JSON.parse(String(v)); return typeof p === "string" ? p : String(v); }
        catch { return String(v); }
      };
      leasingToken = new Map((rs || []).map((s: any) => [s.key, unwrapVal(s.value)])).get("telegram_route_bot_token");
    }
    const botToken = bot === "leasing"
      ? (leasingToken || creds?.telegram_bot_token)
      : bot === "showings"
      ? (creds?.telegram_showings_bot_token || creds?.telegram_bot_token)
      : creds?.telegram_bot_token;
    if (!botToken) return json({ ok: false, error: "no bot token" }, 400);

    const addr = san(data.property.address || "propiedad").replace(/[^\w -]/g, "").slice(0, 60).trim() || "reporte";
    const caption = lang === "en"
      ? `📄 <b>Leasing report</b>\n${san(data.property.address || "")}, ${san(data.property.city || "")}`
      : `📄 <b>Reporte de leasing</b>\n${san(data.property.address || "")}, ${san(data.property.city || "")}`;

    const form = new FormData();
    form.append("chat_id", String(chat_id));
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("document", new Blob([pdf as unknown as BlobPart], { type: "application/pdf" }), `${addr}.pdf`);

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST", body: form,
    });
    if (!tgResp.ok) {
      const t = await tgResp.text().catch(() => "");
      console.warn(`sendDocument failed ${tgResp.status}: ${t.slice(0, 200)}`);
      return json({ ok: false, error: "send_failed" }, 502);
    }
    return json({ ok: true, bytes: pdf.length });
  } catch (err) {
    console.error("leasing-report-pdf error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
