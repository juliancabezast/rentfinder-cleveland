import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface LeadCaptureRequest {
  organization_id: string
  full_name?: string
  phone: string
  source: string
  source_detail?: string
  interested_property_id?: string
  consent_text: string
  user_agent: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get client IP from headers (works with various proxies/CDNs)
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('x-real-ip')
      || req.headers.get('cf-connecting-ip') // Cloudflare
      || 'unknown'
    
    const body: LeadCaptureRequest = await req.json()
    
    // Validate required fields
    if (!body.organization_id || !body.phone) {
      return new Response(
        JSON.stringify({ error: 'organization_id and phone are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const now = new Date().toISOString()
    
    // Create the lead
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .insert({
        organization_id: body.organization_id,
        full_name: body.full_name || null,
        phone: body.phone,
        source: body.source || 'website',
        source_detail: body.source_detail || 'Public listing page',
        interested_property_id: body.interested_property_id || null,
        call_consent: true,
        call_consent_at: now,
        sms_consent: true,
        sms_consent_at: now,
        status: 'new',
        lead_score: 50,
      })
      .select('id')
      .single()

    if (leadError) {
      console.error('Lead creation error:', leadError)
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: leadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log consent for automated calls with IP address (TCPA compliance)
    const { error: consentError } = await supabase
      .from('consent_log')
      .insert({
        organization_id: body.organization_id,
        lead_id: leadData.id,
        consent_type: 'automated_calls',
        granted: true,
        method: 'web_form',
        evidence_text: body.consent_text,
        ip_address: clientIP,
        user_agent: body.user_agent,
      })

    if (consentError) {
      console.error('Consent log error:', consentError)
      // Don't fail the request, lead was created successfully
    }

    // Also log SMS consent separately for completeness
    await supabase
      .from('consent_log')
      .insert({
        organization_id: body.organization_id,
        lead_id: leadData.id,
        consent_type: 'sms_marketing',
        granted: true,
        method: 'web_form',
        evidence_text: body.consent_text,
        ip_address: clientIP,
        user_agent: body.user_agent,
      })

    // Log the successful capture
    await supabase.from('system_logs').insert({
      organization_id: body.organization_id,
      level: 'info',
      category: 'general',
      event_type: 'lead_captured',
      message: `New lead captured from website: ${body.phone}`,
      details: { 
        lead_id: leadData.id,
        ip_address: clientIP,
        source: body.source
      },
      related_lead_id: leadData.id
    })

    console.log(`Lead captured successfully: ${leadData.id}, IP: ${clientIP}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        lead_id: leadData.id,
        message: 'Lead created successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
