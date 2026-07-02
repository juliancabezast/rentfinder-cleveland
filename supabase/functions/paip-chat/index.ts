import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const messages = body.messages;
    let organizationId = body.organizationId;

    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client to fetch context data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Authenticate caller ───────────────────────────────────────
    // pAIp is an in-app assistant: require a logged-in user (or internal service role).
    // Org is forced from the caller's record so it can't be spoofed via the body.
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isServiceRole = callerToken.length > 0 && callerToken === supabaseServiceKey;

    if (!isServiceRole) {
      if (!callerToken || callerToken === anonKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: authData, error: authErr } = await supabase.auth.getUser(callerToken);
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: callerRec } = await supabase
        .from("users")
        .select("organization_id, is_active")
        .eq("auth_user_id", authData.user.id)
        .single();
      if (!callerRec || callerRec.is_active === false || !callerRec.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      organizationId = callerRec.organization_id;
    }

    // Fetch relevant stats to provide context
    let contextInfo = "";
    if (organizationId) {
      try {
        // Fetch property stats
        const { count: propertyCount } = await supabase
          .from("properties")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId);

        const { count: activePropertyCount } = await supabase
          .from("properties")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status", "available");

        // Fetch lead stats
        const { count: leadCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId);

        const { count: activeLeadCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("status", ["new", "contacted", "engaged", "qualified"]);

        // Fetch showing stats
        const { count: showingCount } = await supabase
          .from("showings")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId);

        // Compute "today" in Cleveland time (America/New_York), DST-aware.
        const orgTz = "America/New_York";
        const now = new Date();
        const today = now.toLocaleDateString("en-CA", { timeZone: orgTz });
        const clevelandOffsetMs =
          now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: orgTz })).getTime();
        const todayStart = new Date(new Date(`${today}T00:00:00`).getTime() + clevelandOffsetMs).toISOString();
        const todayEnd = new Date(new Date(`${today}T23:59:59.999`).getTime() + clevelandOffsetMs).toISOString();
        const { count: todayShowingCount } = await supabase
          .from("showings")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .gte("scheduled_at", todayStart)
          .lte("scheduled_at", todayEnd);

        // Fetch call stats
        const { count: callCount } = await supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId);

        // Fetch user stats
        const { count: userCount } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("is_active", true);

        contextInfo = `
DATOS ACTUALES DEL SISTEMA:
- Propiedades totales: ${propertyCount || 0}
- Propiedades disponibles: ${activePropertyCount || 0}
- Leads totales: ${leadCount || 0}
- Leads activos: ${activeLeadCount || 0}
- Showings totales: ${showingCount || 0}
- Showings de hoy: ${todayShowingCount || 0}
- Llamadas registradas: ${callCount || 0}
- Usuarios activos: ${userCount || 0}
`;
      } catch (e) {
        console.error("Error fetching context:", e);
      }
    }

    const systemPrompt = `Eres pAIp, el asistente de administración inteligente de Rent Finder Cleveland. Tu rol es ayudar a los administradores a gestionar propiedades, leads, showings y el sistema en general.

REGLAS IMPORTANTES:
1. Responde siempre en español
2. Sé conciso pero útil
3. Cuando sea posible, proporciona instrucciones paso a paso numeradas
4. Incluye enlaces internos relevantes en formato markdown: [Texto](ruta)
5. Si no tienes información sobre algo, dilo honestamente

RUTAS DISPONIBLES EN LA APLICACIÓN:
- Dashboard: /dashboard
- Propiedades: /properties
- Nueva propiedad: /properties/new
- Leads: /leads
- Nuevo lead: /leads/new
- Showings: /showings
- Nuevo showing: desde la página de un lead
- Llamadas: /calls
- Usuarios: /users
- Configuración: /settings
- Reportes: /reports
- Mapa de calor: /analytics/heat-map
- Inteligencia de vouchers: /analytics/voucher-intel
- Radar de competencia: /analytics/competitor-radar
- Documentos FAQ: /documents
- Costos: /costs
- Logs del sistema: /logs
- Referidos: /referrals

${contextInfo}

FORMATO DE RESPUESTA:
- Usa bullet points para listas
- Usa números para pasos
- Incluye emojis ocasionalmente para ser amigable
- Mantén las respuestas bajo 200 palabras a menos que se pida más detalle`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Por favor espera un momento." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA agotados. Contacta al administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Error en el servicio de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("paip-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
