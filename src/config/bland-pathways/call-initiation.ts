/**
 * Bland.ai Outbound Callback — Call Initiation Config
 *
 * This file defines the request_data schema and the API call format
 * for dispatching outbound callback calls via Bland.ai.
 *
 * Usage: When Elijah (agent-recapture) or the task dispatcher triggers
 * an outbound callback, it should use this format to call Bland's API.
 */

/** Variables passed to Bland.ai via request_data — available as {{variable}} in the pathway */
export interface BlandCallbackRequestData {
  // Lead info
  lead_id: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_name: string; // full name
  lead_email: string;
  lead_phone: string;

  // Property info
  property_id: string;
  property_address: string;
  property_rent: string; // e.g. "$1,200"
  property_bedrooms: string; // e.g. "3"
  property_bathrooms: string; // e.g. "1.5"

  // System context
  organization_id: string;

  // Webhook auth (stored as Bland Secret for security)
  webhook_secret: string;
}

/**
 * Bland.ai Send Call API payload for outbound callback
 *
 * POST https://api.bland.ai/v1/calls
 * Headers: { Authorization: "Bearer <BLAND_API_KEY>" }
 */
export interface BlandSendCallPayload {
  phone_number: string; // E.164 format: +12165551234
  from: string; // Twilio number: +12162383390
  pathway_id: string; // ID from Bland.ai dashboard after importing pathway
  voice: string; // e.g. "maya" for bilingual
  language: string; // "en" or "es" or "mul" for multilingual
  timezone: string; // "America/New_York"
  max_duration: number; // max call length in minutes (e.g. 10)
  record: boolean; // true for compliance
  wait_for_greeting: boolean; // true — wait for "hello" before speaking
  request_data: BlandCallbackRequestData;
  webhook: string; // post-call webhook: bland-call-webhook (Deborah)
  metadata: {
    agent_key: string; // "elijah" or "callback_outbound"
    call_type: string; // "outbound_callback"
    lead_id: string;
    property_id: string;
    organization_id: string;
  };
}

/**
 * Example call initiation payload:
 *
 * ```json
 * {
 *   "phone_number": "+12165551234",
 *   "from": "+12162383390",
 *   "pathway_id": "PASTE_PATHWAY_ID_FROM_BLAND_DASHBOARD",
 *   "voice": "maya",
 *   "language": "en",
 *   "timezone": "America/New_York",
 *   "max_duration": 10,
 *   "record": true,
 *   "wait_for_greeting": true,
 *   "request_data": {
 *     "lead_id": "abc-123",
 *     "lead_first_name": "Maria",
 *     "lead_last_name": "Garcia",
 *     "lead_name": "Maria Garcia",
 *     "lead_email": "maria@example.com",
 *     "lead_phone": "+12165551234",
 *     "property_id": "prop-456",
 *     "property_address": "1234 Elm St, Cleveland, OH 44101",
 *     "property_rent": "$1,200",
 *     "property_bedrooms": "3",
 *     "property_bathrooms": "1.5",
 *     "organization_id": "org-789",
 *     "webhook_secret": "YOUR_WEBHOOK_SECRET"
 *   },
 *   "webhook": "https://glzzzthgotfwoiaranmp.supabase.co/functions/v1/bland-call-webhook",
 *   "metadata": {
 *     "agent_key": "elijah",
 *     "call_type": "outbound_callback",
 *     "lead_id": "abc-123",
 *     "property_id": "prop-456",
 *     "organization_id": "org-789"
 *   }
 * }
 * ```
 */

// Pathway ID placeholder — replace after importing the pathway JSON into Bland.ai
export const OUTBOUND_CALLBACK_PATHWAY_ID = "PASTE_PATHWAY_ID_HERE";

// Supabase edge function URLs
export const SUPABASE_FUNCTIONS_BASE = "https://glzzzthgotfwoiaranmp.supabase.co/functions/v1";
export const PATHWAY_WEBHOOK_URL = `${SUPABASE_FUNCTIONS_BASE}/pathway-webhook`;
export const BLAND_CALL_WEBHOOK_URL = `${SUPABASE_FUNCTIONS_BASE}/bland-call-webhook`;
