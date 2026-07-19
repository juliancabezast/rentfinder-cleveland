import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatTime12(isoOrSlotTime: string): string {
  // Handle HH:mm:ss slot_time format
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(isoOrSlotTime)) {
    const [h, m] = isoOrSlotTime.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${display}:${m} ${ampm}`;
  }
  // Handle ISO date string
  const d = new Date(isoOrSlotTime);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Next Cleveland day at 09:00, as UTC ISO. DST-safe: 9 AM is well past the
// 2 AM switch, so the noon-sampled offset of that date is always correct.
function nextDay9amET(): string {
  const TZ = "America/New_York";
  const todayNY = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const t = new Date(`${todayNY}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  const dateStr = t.toISOString().slice(0, 10);
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const localNoon = new Date(noon.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = noon.getTime() - localNoon.getTime();
  return new Date(new Date(`${dateStr}T09:00:00Z`).getTime() + offsetMs).toISOString();
}

// Dispatch due follow-up reminders (from the Telegram "quiere seguimiento"
// action) as Hot Leads cards via telegram-notify. Independent of the showing
// reminders — MUST run on every tick regardless of whether a showing is due.
async function dispatchLeadReminders(
  supabase: any, supabaseUrl: string, serviceRoleKey: string,
): Promise<number> {
  let sent = 0;
  try {
    const { data: dueReminders } = await supabase
      .from("lead_reminders")
      .select("id, organization_id, lead_id")
      .eq("status", "pending")
      .lte("due_at", new Date().toISOString())
      .limit(50);

    for (const r of dueReminders || []) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, full_name, first_name, last_name, phone, lead_score, source, status, has_voucher, voucher_amount, move_in_date, is_demo")
        .eq("id", r.lead_id)
        .maybeSingle();

      const phone = String(lead?.phone ?? "").trim();
      // Skip dead/converted/demo/phoneless leads — just close the reminder.
      if (!lead || !phone || ["lost", "converted"].includes(lead.status || "") || lead.is_demo) {
        await supabase.from("lead_reminders").update({ status: "skipped", sent_at: new Date().toISOString() }).eq("id", r.id);
        continue;
      }

      // Most-recent tagged property for the card (cosmetic).
      const { data: tag } = await supabase
        .from("lead_property_interests")
        .select("properties:property_id(address, unit_number, city)")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      const pr = (tag as any)?.properties;
      const property = pr ? `${pr.address}${pr.unit_number ? ` ${pr.unit_number}` : ""}${pr.city ? ` · ${pr.city}` : ""}` : null;
      const name = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead";
      const moveIn = lead.move_in_date
        ? new Date(lead.move_in_date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
        : null;

      const resp = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          organization_id: r.organization_id,
          channel: "funnel",
          event: "lead_reminder",
          payload: {
            lead_id: lead.id, name, score: lead.lead_score, phone, source: lead.source,
            property, has_voucher: !!lead.has_voucher, voucher_amount: lead.voucher_amount, move_in: moveIn,
          },
        }),
      });
      // telegram-notify ALWAYS returns HTTP 200 — real success is the body {ok}.
      const jr = await resp.json().catch(() => ({}));
      const delivered = resp.ok && jr?.ok === true;
      await supabase.from("lead_reminders")
        .update({ status: delivered ? "sent" : "failed", sent_at: new Date().toISOString() })
        .eq("id", r.id);
      if (delivered) {
        sent++;
        // AUTO-ROLLOVER: the card re-fires every morning until the user acts.
        // Registering any action in Telegram cancels the pending row; "quiere
        // seguimiento" keeps it. Idempotent — max one pending per lead.
        const { data: existingPending } = await supabase.from("lead_reminders")
          .select("id").eq("organization_id", r.organization_id).eq("lead_id", r.lead_id)
          .eq("status", "pending").limit(1).maybeSingle();
        if (!existingPending) {
          await supabase.from("lead_reminders").insert({
            organization_id: r.organization_id, lead_id: r.lead_id,
            due_at: nextDay9amET(), reason: "follow_up_auto", status: "pending",
          });
        }
      }
    }
  } catch (remErr) {
    console.error("lead_reminders dispatch error:", remErr);
  }
  return sent;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Require service-role or admin authenticated caller ─────────
  {
    const _srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const _ak = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const _tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (_tok !== _srk) {
      if (!_tok || _tok === _ak) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, _srk);
      const { data: _auth } = await _sb.auth.getUser(_tok);
      if (!_auth?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: _u } = await _sb.from("users").select("role, is_active").eq("auth_user_id", _auth.user.id).maybeSingle();
      if (!_u || _u.is_active === false || !["super_admin","admin"].includes(_u.role || "")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  }


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Due follow-up reminders run FIRST + unconditionally — they must not be
    // gated by whether any showing happens to be in the 25-35 min window below.
    const remindersSent = await dispatchLeadReminders(supabase, supabaseUrl, serviceRoleKey);

    // Get current time in Cleveland (America/New_York)
    const now = new Date();

    // Calculate the window: showings between 25 and 35 minutes from now
    const windowStart = new Date(now.getTime() + 25 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 35 * 60 * 1000);

    // Convert to Cleveland date/time for slot matching
    const toCleDateStr = (d: Date) =>
      d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const toCleTimeStr = (d: Date) =>
      d.toLocaleTimeString("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + ":00";

    // We need to find showings where scheduled_at is in the window
    const { data: showings, error: showingsErr } = await supabase
      .from("showings")
      .select(`
        id, scheduled_at, status, duration_minutes, lead_id, property_id, organization_id,
        properties(address, unit_number, city, state, zip_code, rent_price, bedrooms, bathrooms, section_8_accepted),
        leads(full_name, phone, email, has_voucher)
      `)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString());

    if (showingsErr) {
      console.error("Error fetching showings:", showingsErr);
      return new Response(JSON.stringify({ error: showingsErr.message, reminders_sent: remindersSent }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!showings || showings.length === 0) {
      console.log("Showing reminder: no showings in the 25-35 min window");
      return new Response(JSON.stringify({ sent: 0, message: "No showings in window", reminders_sent: remindersSent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Showing reminder: found ${showings.length} showing(s) in window`);

    let sent = 0;

    // Group by organization
    const orgShowings = new Map<string, typeof showings>();
    for (const s of showings) {
      const orgId = s.organization_id;
      if (!orgShowings.has(orgId)) orgShowings.set(orgId, []);
      orgShowings.get(orgId)!.push(s);
    }

    for (const [orgId, orgShows] of orgShowings) {
      // Check if already reminded (look in system_logs)
      const showingIds = orgShows.map((s: any) => s.id);
      const { data: existingLogs } = await supabase
        .from("system_logs")
        .select("details")
        .eq("organization_id", orgId)
        .eq("event_type", "showing_reminder_sent")
        .gte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());

      const alreadyReminded = new Set<string>();
      for (const log of existingLogs || []) {
        if ((log.details as any)?.showing_id) {
          alreadyReminded.add((log.details as any).showing_id);
        }
      }

      // Resolve the LeasingAgent (route) bot — showing-day cards live with the
      // showings operation (2026-07-19 restructure; the old Hot Leads bot is
      // parked). Fall back to the general bot. Values may be JSON-encoded.
      const [{ data: creds }, { data: settings }] = await Promise.all([
        supabase
          .from("organization_credentials")
          .select("telegram_bot_token, telegram_chat_id, telegram_route_bot_token, telegram_route_chat_id")
          .eq("organization_id", orgId)
          .maybeSingle(),
        // Legacy fallback only — route creds moved into organization_credentials.
        supabase
          .from("organization_settings")
          .select("key, value")
          .eq("organization_id", orgId)
          .in("key", ["telegram_route_bot_token", "telegram_route_chat_id"]),
      ]);

      const unwrapVal = (v: unknown) => {
        if (v == null) return undefined;
        const str = String(v);
        try { const p = JSON.parse(str); return typeof p === "string" ? p : str; } catch { return str; }
      };
      const settingsMap = new Map((settings || []).map((s: any) => [s.key, unwrapVal(s.value)]));
      // Pair token+chat ATOMICALLY — never mix the route token with the general chat.
      const routeTok = creds?.telegram_route_bot_token || settingsMap.get("telegram_route_bot_token");
      const routeChat = creds?.telegram_route_chat_id || settingsMap.get("telegram_route_chat_id");
      const useRoute = !!routeTok && !!routeChat;
      const botToken = (useRoute ? routeTok : creds?.telegram_bot_token) as string;
      const chatId = (useRoute ? routeChat : creds?.telegram_chat_id) as string;

      if (!botToken || !chatId) {
        console.log(`Showing reminder: org ${orgId} has no showings/route bot configured, skipping`);
        continue;
      }

      for (const showing of orgShows) {
        if (alreadyReminded.has(showing.id)) {
          console.log(`Showing reminder: ${showing.id} already reminded, skipping`);
          continue;
        }

        const prop = showing.properties as any;
        const lead = showing.leads as any;
        const d = new Date(showing.scheduled_at);
        const timeStr = formatTime12(showing.scheduled_at);
        const dateStr = formatDateShort(
          d.toLocaleDateString("en-CA", { timeZone: "America/New_York" })
        );

        const address = prop?.address || "Unknown";
        const unit = prop?.unit_number ? ` #${prop.unit_number}` : "";
        const city = prop?.city || "";
        const fullAddr = `${address}${unit}${city ? `, ${city}` : ""}`;
        const rentStr = prop?.rent_price
          ? `$${Number(prop.rent_price).toLocaleString()}/mo`
          : "";
        const beds = prop?.bedrooms ? `${prop.bedrooms}bd` : "";
        const baths = prop?.bathrooms ? `${Number(prop.bathrooms)}ba` : "";
        const specs = [beds, baths, rentStr].filter(Boolean).join(" · ");
        const s8 = prop?.section_8_accepted ? "✅ Section 8" : "";

        const leadName = lead?.full_name || "Unknown";
        const leadPhone = lead?.phone || "—";
        const leadEmail = lead?.email || "";
        const voucher = lead?.has_voucher === true ? "🎫 Voucher" : lead?.has_voucher === false ? "💵 Self-pay" : "";

        const mapsQuery = encodeURIComponent(
          `${prop?.address || ""}, ${prop?.city || ""}, ${prop?.state || ""} ${prop?.zip_code || ""}`
        );

        const msg = [
          `⏰ <b>Showing in 30 min!</b>`,
          ``,
          `📍 <b>${fullAddr}</b>`,
          specs ? `🏠 ${specs}` : "",
          s8 || "",
          `📅 ${dateStr} at ${timeStr}`,
          ``,
          `👤 <b>${leadName}</b>${voucher ? ` — ${voucher}` : ""}`,
          `📞 ${leadPhone}`,
          leadEmail ? `✉️ ${leadEmail}` : "",
          ``,
          `🗺 <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}">Navigate with Google Maps</a>`,
          `📱 <a href="tel:${leadPhone}">Call ${leadName.split(" ")[0]}</a>`,
        ]
          .filter(Boolean)
          .join("\n");

        const tgResp = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: msg,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          }
        );

        if (tgResp.ok) {
          sent++;
          console.log(`Showing reminder sent for ${showing.id}: ${leadName} at ${address}`);

          // Log to prevent duplicate reminders
          await supabase.from("system_logs").insert({
            organization_id: orgId,
            level: "info",
            category: "general",
            event_type: "showing_reminder_sent",
            message: `Route reminder sent: ${leadName} at ${address} (${timeStr})`,
            related_lead_id: showing.lead_id,
            related_showing_id: showing.id,
            details: { showing_id: showing.id },
          });
        } else {
          const errText = await tgResp.text();
          console.error(`Telegram send failed for ${showing.id}: ${errText}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ sent, total: showings.length, reminders_sent: remindersSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Showing reminder error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
