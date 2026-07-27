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
  consent?: boolean
  consent_text: string
  user_agent: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if not 10/11 digits. */
function toE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const d = raw.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return null
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── Auth gate (service-role only) ───────────────────────────────────────
    // This endpoint hard-asserts TCPA consent for whatever phone is posted and
    // has NO live public caller (the real capture paths are submit-inquiry /
    // book-public-showing / submit-application). Left open it was pure attack
    // surface: an anonymous request could fabricate consent evidence for any
    // victim number and mass-create consent-stamped spam leads. Require the
    // service-role key so only internal automation can invoke it.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const callerToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!callerToken || callerToken === anonKey || callerToken !== supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
    const propertyId = body.interested_property_id && UUID_RE.test(body.interested_property_id)
      ? body.interested_property_id
      : null
    // Consent must be explicitly granted — never asserted just because a phone
    // was posted. Canonicalize the phone to E.164 so matching hits the stored
    // value (noah dedup normalizes NEW.phone on INSERT).
    const hasConsent = body.consent === true
    const phoneE164 = toE164(body.phone)
    const phoneForDb = phoneE164 || body.phone

    // Find-or-create by phone within the org. A blind INSERT used to be canceled
    // by the noah dedup trigger (BEFORE INSERT → RETURN NULL), which made
    // .single() see zero rows and this endpoint 500 even though the lead
    // existed — so resolve the lead explicitly instead.
    // Property interest is recorded as a lead_property_interests TAG via the
    // add_lead_property_tag RPC (tags accumulate — a repeat inquiry about a
    // second property ADDS a tag, it never replaces the first).
    let leadId: string
    let isNewLead = false

    const { data: existing } = await supabase
      .from('leads')
      .select('id, full_name')
      .eq('organization_id', body.organization_id)
      .eq('phone', phoneE164 || body.phone)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existing) {
      leadId = existing.id
      const update: Record<string, unknown> = {
        updated_at: now,
        last_contact_at: now,
        last_contact_channel: "web_form", // inbound public listing capture
      }
      // Only upgrade consent when it was explicitly granted (never revoke).
      if (hasConsent) {
        update.call_consent = true
        update.call_consent_at = now
        update.sms_consent = true
        update.sms_consent_at = now
      }
      if (!existing.full_name && body.full_name) update.full_name = body.full_name
      const { error: updateError } = await supabase.from('leads').update(update).eq('id', leadId)
      if (updateError) console.error('Lead enrichment error:', updateError)
    } else {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert({
          organization_id: body.organization_id,
          full_name: body.full_name || null,
          phone: phoneForDb,
          source: body.source || 'website',
          source_detail: body.source_detail || 'Public listing page',
          call_consent: hasConsent,
          call_consent_at: hasConsent ? now : null,
          sms_consent: hasConsent,
          sms_consent_at: hasConsent ? now : null,
          status: 'new',
        })
        .select('id')
        .single()

      if (leadError || !leadData) {
        // The dedup trigger may have canceled the insert in a race — re-resolve.
        const { data: again } = await supabase
          .from('leads')
          .select('id')
          .eq('organization_id', body.organization_id)
          .eq('phone', phoneE164 || body.phone)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (again) {
          leadId = again.id
        } else {
          console.error('Lead creation error:', leadError)
          return new Response(
            JSON.stringify({ error: 'Failed to create lead', details: leadError?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else {
        leadId = leadData.id
        isNewLead = true
      }
    }

    // Record the property-interest tag (accumulates; bumps recency on repeat)
    if (propertyId) {
      const { error: tagError } = await supabase.rpc('add_lead_property_tag', {
        p_lead_id: leadId,
        p_property_id: propertyId,
        p_source: 'website',
      })
      if (tagError) console.error('Property tag error:', tagError)
    }

    // Best-effort real-time new-lead alert (RFC Report bot) — never blocks
    if (isNewLead) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            channel: 'report', event: 'new_lead',
            payload: { name: body.full_name || 'Website lead', source: body.source || 'website', phone: body.phone },
          }),
        })
      } catch (_) { /* ignore */ }
    }

    // Log consent evidence ONLY when consent was explicitly granted (TCPA).
    if (hasConsent) {
      const { error: consentError } = await supabase
        .from('consent_log')
        .insert({
          organization_id: body.organization_id,
          lead_id: leadId,
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
          lead_id: leadId,
          consent_type: 'sms_marketing',
          granted: true,
          method: 'web_form',
          evidence_text: body.consent_text,
          ip_address: clientIP,
          user_agent: body.user_agent,
        })
    }

    // Log the successful capture
    await supabase.from('system_logs').insert({
      organization_id: body.organization_id,
      level: 'info',
      category: 'general',
      event_type: 'lead_captured',
      message: `New lead captured from website: ${body.phone}`,
      details: {
        lead_id: leadId,
        ip_address: clientIP,
        source: body.source
      },
      related_lead_id: leadId
    })

    console.log(`Lead captured successfully: ${leadId}, IP: ${clientIP}`)

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
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
