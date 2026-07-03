import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // ── Require service-role or admin authenticated caller ─────────
  {
    const _srk = supabaseServiceKey;
    const _ak = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const _tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (_tok !== _srk) {
      if (!_tok || _tok === _ak) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const _sb = createClient(supabaseUrl, _srk);
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the database function to check for expiring coming soon properties
    const { data, error } = await supabase.rpc('check_coming_soon_expiring')

    if (error) {
      throw error
    }

    const alertsCreated = data ?? 0

    // Log the result to system_logs
    await supabase.from('system_logs').insert({
      organization_id: null, // Platform level check
      level: alertsCreated > 0 ? 'warn' : 'info',
      category: 'automation',
      event_type: 'coming_soon_check',
      message: alertsCreated > 0
        ? `Coming soon check: ${alertsCreated} properties expiring soon`
        : 'Coming soon check completed. No expiring properties found.',
      details: {
        alerts_created: alertsCreated,
        checked_at: new Date().toISOString()
      }
    })

    console.log(`Check completed. Alerts created: ${alertsCreated}`)

    return new Response(
      JSON.stringify({
        success: true,
        alerts_created: alertsCreated,
        message: `${alertsCreated} alert(s) created for expiring coming soon properties`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (err) {
    const error = err as Error
    console.error('Error in check-coming-soon:', error)

    // Try to log the error
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      await supabase.from('system_logs').insert({
        organization_id: null,
        level: 'error',
        category: 'automation',
        event_type: 'coming_soon_check_failed',
        message: `Coming soon check failed: ${error.message}`,
        details: {
          error: error.message,
          stack: error.stack
        }
      })
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
