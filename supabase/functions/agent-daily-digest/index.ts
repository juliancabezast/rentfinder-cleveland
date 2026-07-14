import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// agent-daily-digest — one morning summary to the RFC Report Telegram bot.
// Cron-driven (daily). Yesterday's intake + today's agenda + what needs
// attention. DST-aware boundaries in America/New_York.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORG_SLUG = "rent-finder-cleveland";
const ORG_TZ = "America/New_York";
const HOT_THRESHOLD = 85;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Local-timezone midnight → UTC ISO (DST-safe).
function localMidnightToUtc(dateStr: string, tz: string): string {
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Date(noon.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = noon.getTime() - localNoon.getTime();
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs).toISOString();
}
function ymd(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve org (single tenant).
    const { data: org } = await supabase
      .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
    const orgId = org?.id
      ?? (await supabase.from("organizations").select("id").limit(1).maybeSingle()).data?.id;
    if (!orgId) return json({ ok: false, skipped: "no_org" });

    const now = new Date();
    const todayStr = ymd(now, ORG_TZ);
    const yStr = ymd(new Date(now.getTime() - 86400000), ORG_TZ);
    const tomorrowStr = ymd(new Date(now.getTime() + 86400000), ORG_TZ);
    const todayStart = localMidnightToUtc(todayStr, ORG_TZ);
    const yStart = localMidnightToUtc(yStr, ORG_TZ);
    const tomorrowStart = localMidnightToUtc(tomorrowStr, ORG_TZ);
    const dayAgo = new Date(now.getTime() - 86400000).toISOString();

    const HIDDEN = ["lost", "converted"];

    // Parallel metric queries (head:true count-only where possible).
    const [
      newLeadsY, showingsToday, hotAwaiting, backlog, convertedY, byMonthTopProps,
    ] = await Promise.all([
      // New leads yesterday
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId).eq("is_demo", false)
        .gte("created_at", yStart).lt("created_at", todayStart),
      // Showings scheduled for today
      supabase.from("showings").select("id, scheduled_at, leads(full_name), properties(address, unit_number)")
        .eq("organization_id", orgId)
        .gte("scheduled_at", todayStart).lt("scheduled_at", tomorrowStart)
        .order("scheduled_at", { ascending: true }),
      // Hot leads awaiting contact (score≥threshold, active, no contact in 24h)
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId).eq("is_demo", false)
        .gte("lead_score", HOT_THRESHOLD).not("status", "in", `(${HIDDEN.join(",")})`)
        .or(`last_contact_at.is.null,last_contact_at.lt.${dayAgo}`),
      // Uncontacted backlog (status new, >24h old)
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId).eq("is_demo", false)
        .eq("status", "new").lt("created_at", dayAgo),
      // Conversions yesterday (approx: converted + updated yesterday)
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId).eq("status", "converted")
        .gte("updated_at", yStart).lt("updated_at", todayStart),
      // Top interest yesterday: leads' new tags yesterday grouped by property
      supabase.from("lead_property_interests")
        .select("property_id, properties:property_id(address, city)")
        .eq("organization_id", orgId)
        .gte("created_at", yStart).lt("created_at", todayStart).limit(1000),
    ]);

    const newLeads = newLeadsY.count ?? 0;
    const shows = (showingsToday.data as any[]) || [];
    const hot = hotAwaiting.count ?? 0;
    const back = backlog.count ?? 0;
    const conv = convertedY.count ?? 0;

    // Top properties by fresh interest yesterday
    const propCount: Record<string, { label: string; n: number }> = {};
    for (const r of (byMonthTopProps.data as any[]) || []) {
      const p = r.properties;
      if (!p) continue;
      const label = `${p.address}${p.city ? `, ${p.city}` : ""}`;
      propCount[r.property_id] ??= { label, n: 0 };
      propCount[r.property_id].n++;
    }
    const topProps = Object.values(propCount).sort((a, b) => b.n - a.n).slice(0, 3);

    const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const dateLabel = now.toLocaleDateString("en-US", { timeZone: ORG_TZ, weekday: "long", month: "long", day: "numeric" });

    const showingLines = shows.slice(0, 8).map((s) => {
      const t = new Date(s.scheduled_at).toLocaleTimeString("en-US", { timeZone: ORG_TZ, hour: "numeric", minute: "2-digit" });
      const who = s.leads?.full_name || "—";
      const addr = s.properties ? `${s.properties.address}${s.properties.unit_number ? ` #${s.properties.unit_number}` : ""}` : "—";
      return `  • ${t} — ${esc(who)} @ ${esc(addr)}`;
    });

    const lines = [
      `☀️ <b>Good morning — Daily Digest</b>`,
      `<i>${dateLabel}</i>`,
      ``,
      `📥 <b>${newLeads}</b> new leads yesterday`,
      `🔥 <b>${hot}</b> hot leads awaiting contact`,
      `📋 <b>${back}</b> uncontacted in backlog (>24h)`,
      conv > 0 ? `🎉 <b>${conv}</b> converted yesterday` : ``,
      ``,
      `📅 <b>Today's showings: ${shows.length}</b>`,
      ...(showingLines.length ? showingLines : [`  • none scheduled`]),
      ...(shows.length > 8 ? [`  • …and ${shows.length - 8} more`] : []),
    ];

    if (topProps.length) {
      lines.push(``, `🏠 <b>Top interest yesterday</b>`);
      for (const p of topProps) lines.push(`  • ${esc(p.label)} — ${p.n}`);
    }

    const message = lines.filter((l) => l !== ``).join("\n").replace(/\n{3,}/g, "\n\n");

    // Send via the generalized sender → RFC Report bot.
    const resp = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ organization_id: orgId, channel: "report", message }),
    });
    const sent = resp.ok ? (await resp.json().catch(() => ({}))) : { ok: false };

    return json({ ok: true, sent, metrics: { newLeads, showings: shows.length, hot, backlog: back, converted: conv } });
  } catch (err) {
    console.error("agent-daily-digest error:", err);
    return json({ ok: false, error: (err as Error).message });
  }
});

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
