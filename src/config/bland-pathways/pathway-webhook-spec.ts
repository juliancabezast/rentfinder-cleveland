/**
 * pathway-webhook — Edge Function Specification
 *
 * This edge function handles all mid-call webhook actions from the Bland.ai pathway.
 * It's called by Webhook nodes during live calls to interact with the database.
 *
 * Deploy: npx supabase functions deploy pathway-webhook
 * Config: [functions.pathway-webhook] verify_jwt = false
 *
 * Agents involved:
 * - Samuel (showing lifecycle): reserve_showing creates a showing + schedules confirmation tasks
 * - Ezra/Caleb (DoorLoop): send_application pushes lead to DoorLoop
 * - Nehemiah (dispatcher): create_callback creates an agent_task for future call
 * - send-notification-email: sends email confirmations
 */

// ─── REQUEST FORMAT ───────────────────────────────────────────────────

export interface PathwayWebhookRequest {
  action:
    | "fetch_available_slots"
    | "reserve_showing"
    | "send_application"
    | "create_callback";
  organization_id: string;
  lead_id: string;
  property_id?: string;
  property_address?: string;
  lead_email?: string;
  lead_name?: string;
  selected_slot?: string;
  callback_time?: string;
  callback_window?: string;
  call_id?: string;
}

// ─── ACTION: fetch_available_slots ────────────────────────────────────
// Called by: "Showing: Offer Available Slots" webhook node
// Returns: available time slots for the given property

export interface FetchSlotsResponse {
  has_slots: boolean;
  slots: string[]; // e.g. ["Tomorrow Fri 2/14 at 10:00 AM", "Tomorrow Fri 2/14 at 2:00 PM"]
}

/**
 * Implementation:
 * 1. Query `showings` table for property_id on next 7 days (status != 'cancelled')
 * 2. Generate 30-min slots from 9 AM to 7 PM (TIME_SLOTS)
 * 3. Exclude already-booked slots
 * 4. Format as human-readable strings in America/New_York timezone
 * 5. Return top 6 available slots
 *
 * SQL sketch:
 *   SELECT scheduled_at, duration_minutes FROM showings
 *   WHERE property_id = $1
 *     AND organization_id = $2
 *     AND status NOT IN ('cancelled')
 *     AND scheduled_at >= now()
 *     AND scheduled_at <= now() + interval '7 days'
 */

// ─── ACTION: reserve_showing ──────────────────────────────────────────
// Called by: "Showing: Confirm & Reserve + Email Confirmation" webhook node
// Creates a showing record and sends confirmation email

export interface ReserveShowingResponse {
  success: boolean;
  message: string;
  showing_id?: string;
  confirmed_time?: string; // human-readable: "Friday Feb 14 at 10:00 AM"
}

/**
 * Implementation:
 * 1. Parse selected_slot into a proper ISO datetime
 * 2. Verify slot is still available (no double booking)
 * 3. INSERT into `showings` table:
 *    {
 *      organization_id,
 *      lead_id,
 *      property_id,
 *      scheduled_at: parsed_datetime,
 *      duration_minutes: 30,
 *      status: 'scheduled'
 *    }
 * 4. UPDATE lead status to 'showing_scheduled'
 * 5. Create agent_task for Samuel (showing confirmation):
 *    {
 *      agent_type: 'showing_confirmation',
 *      action_type: 'call',
 *      lead_id,
 *      organization_id,
 *      scheduled_for: showing_time - 24h,
 *      context: { showing_id, property_address, scheduled_at }
 *    }
 * 6. Send confirmation email via send-notification-email:
 *    {
 *      to: lead_email,
 *      subject: "Showing Confirmed — {property_address}",
 *      html: showing confirmation template,
 *      from: "support@rentfindercleveland.com"
 *    }
 * 7. Log cost via zacchaeus_record_cost()
 * 8. Return success with confirmed_time
 */

// ─── ACTION: send_application ─────────────────────────────────────────
// Called by: "Start Application (DoorLoop Email)" webhook node
// Pushes lead to DoorLoop to trigger application email

export interface SendApplicationResponse {
  success: boolean;
  message: string;
}

/**
 * Implementation:
 * 1. Call the agent-doorloop-push edge function (Caleb):
 *    POST /functions/v1/agent-doorloop-push
 *    { organization_id, lead_id, lead_email, lead_name, property_id }
 * 2. Update lead status to 'in_application'
 * 3. Create system_log entry for the application send
 * 4. Return success/failure
 *
 * If DoorLoop push fails:
 * - Create agent_task to retry later (via Nehemiah dispatcher)
 * - Return { success: false, message: "Application system temporarily unavailable" }
 */

// ─── ACTION: create_callback ──────────────────────────────────────────
// Called by: "Callback: Confirm & Create" webhook node
// Schedules a callback agent_task for Elijah to execute

export interface CreateCallbackResponse {
  success: boolean;
  confirmed_time?: string; // "Tomorrow Saturday 2/15 at 3:00 PM"
  message?: string;
}

/**
 * Implementation:
 * 1. Parse callback_time/callback_window into a proper ISO datetime
 *    Use callback_window for general times:
 *    - "today_afternoon" -> today 4:00 PM ET
 *    - "today_evening" -> today 7:00 PM ET
 *    - "tomorrow_morning" -> tomorrow 10:00 AM ET
 *    - "tomorrow_afternoon" -> tomorrow 3:00 PM ET
 *    If callback_time has a specific time, parse it directly
 * 2. INSERT into `agent_tasks`:
 *    {
 *      organization_id,
 *      lead_id,
 *      agent_type: 'recapture',  (Elijah handles callbacks)
 *      action_type: 'call',
 *      scheduled_for: parsed_callback_time,
 *      max_attempts: 2,
 *      status: 'pending',
 *      context: {
 *        callback_reason: 'lead_requested_callback',
 *        property_id,
 *        property_address,
 *        original_call_id: call_id
 *      }
 *    }
 * 3. Update lead.next_follow_up_at = parsed_callback_time
 * 4. Return { success: true, confirmed_time: formatted_time }
 */

// ─── SECURITY ─────────────────────────────────────────────────────────

/**
 * The webhook_secret header (x-webhook-secret) should be validated:
 * 1. Store the secret in Supabase Vault or as a DB setting
 * 2. Edge function checks: req.headers['x-webhook-secret'] === stored_secret
 * 3. If mismatch, return 401
 *
 * Additionally:
 * - Validate organization_id exists
 * - Validate lead_id belongs to the organization
 * - Rate limit: max 10 requests per call_id
 */

// ─── RELATED: book-public-showing ─────────────────────────────────────

/**
 * Standalone edge function: book-public-showing
 * Handles public self-scheduling from /p/schedule-showing/:propertyId
 *
 * Flow:
 * 1. Verify slot is still available (not booked, is enabled)
 * 2. Find or create lead by phone number
 * 3. Log TCPA consent to consent_log
 * 4. Create showing record (status: scheduled)
 * 5. Mark slot as booked + next 30-min slot as buffer (20-min buffer logic)
 * 6. Update lead status to 'showing_scheduled'
 * 7. Schedule Samuel confirmation task (24h before showing)
 *
 * Config: [functions.book-public-showing] verify_jwt = false
 */

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────

/**
 * Add to supabase/config.toml:
 *
 * [functions.pathway-webhook]
 * verify_jwt = false
 *
 * [functions.book-public-showing]
 * verify_jwt = false
 */
