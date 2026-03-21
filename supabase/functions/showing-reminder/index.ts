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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
      return new Response(JSON.stringify({ error: showingsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!showings || showings.length === 0) {
      console.log("Showing reminder: no showings in the 25-35 min window");
      return new Response(JSON.stringify({ sent: 0, message: "No showings in window" }), {
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

      // Get route bot config
      const { data: settings } = await supabase
        .from("organization_settings")
        .select("key, value")
        .eq("organization_id", orgId)
        .in("key", ["telegram_route_bot_token", "telegram_route_chat_id"]);

      const settingsMap = new Map((settings || []).map((s: any) => [s.key, s.value]));
      const botToken = settingsMap.get("telegram_route_bot_token") as string;
      const chatId = settingsMap.get("telegram_route_chat_id") as string;

      if (!botToken || !chatId) {
        console.log(`Showing reminder: org ${orgId} has no route bot configured, skipping`);
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
      JSON.stringify({ sent, total: showings.length }),
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
