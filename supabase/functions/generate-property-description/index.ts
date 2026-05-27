import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  description: `You are writing a concise rental property description optimized for AI agents that handle inbound calls and lead management. The description must:
1. Lead with the most important details: rent, beds/baths, key features
2. Be concise (3-4 sentences max)
3. Include Section 8/voucher status clearly
4. Mention pet policy if available
5. Highlight move-in readiness and standout amenities
6. Use a professional, informative tone (not marketing fluff)
7. Write in English only
Return ONLY the description text, no quotes or labels.`,
  notes: `You generate internal notes for a property management team. These notes are NOT visible to tenants. Include:
1. Key selling points for agents to mention on calls
2. Potential objections and how to handle them
3. Comparative market positioning (is the rent competitive for the area?)
4. Any red flags or things to watch for
5. Tips for showing the property
Be direct and concise (4-6 bullet points). Write in English only.
Return ONLY the notes text, no quotes or labels.`,
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller's organization
    const { data: callerRecord } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_user_id", user.id)
      .single();
    if (!callerRecord?.organization_id) {
      return new Response(JSON.stringify({ error: "User has no organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "description");
    const context = body.context;
    if (!SYSTEM_PROMPTS[kind]) {
      return new Response(JSON.stringify({ error: "Invalid kind" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!context || typeof context !== "object") {
      return new Response(JSON.stringify({ error: "Missing context" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch OpenAI key server-side (scoped to caller's org)
    const { data: creds } = await supabase
      .from("organization_credentials")
      .select("openai_api_key")
      .eq("organization_id", callerRecord.organization_id)
      .single();

    const apiKey = creds?.openai_api_key || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: kind === "notes" ? 400 : 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[kind] },
          { role: "user", content: `Generate output for this property:\n${JSON.stringify(context)}` },
        ],
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${resp.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-property-description error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
