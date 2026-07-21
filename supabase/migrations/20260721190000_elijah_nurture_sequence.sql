-- Elijah's showing-nurture sequence: replace the 9 AM Telegram pile-up with an
-- automated email cadence that drives leads to self-book on the public site.
--
-- Owner decision 2026-07-21: "ya no quiero que me estés recordando a las 9am".
-- One email every 3 days, 7 max, then it goes quiet forever. Booking a showing
-- pauses it (the confirmation flow takes over). The lead always stays alive.

-- ── 1. Nurture state on the lead ────────────────────────────────────────────
-- The "tag" the owner asked for: after 7 emails with no reaction the lead is
-- not deleted or lost, it is LABELLED — so it can be filtered, revisited and
-- counted without pretending it never happened.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS nurture_emails_sent  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nurture_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS nurture_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS nurture_completed_at timestamptz,
  -- null = never enrolled · 'active' · 'booked' (won) · 'replied' · 'exhausted'
  -- (7 sent, no reaction) · 'stopped' (unsubscribed/bounced/lost)
  ADD COLUMN IF NOT EXISTS nurture_outcome      text;

COMMENT ON COLUMN public.leads.nurture_outcome IS
  'Elijah nurture state: active | booked | replied | exhausted | stopped. "exhausted" = the 7 emails went out and nothing happened.';

-- Enrollment sweep + the "who is exhausted" filter both hit this.
CREATE INDEX IF NOT EXISTS idx_leads_nurture_outcome
  ON public.leads (organization_id, nurture_outcome)
  WHERE nurture_outcome IS NOT NULL;

-- ── 2. Automated nurture in the owner-facing feed ───────────────────────────
-- The owner asked for these emails to show in the Leasing Tracker. Kept as its
-- OWN action code rather than reusing message_sent_email: at ~6k sends/day org
-- wide, folding them into the human-effort counter would drown the fact that a
-- person actually worked the lead.
ALTER TABLE public.leasing_activity
  DROP CONSTRAINT IF EXISTS leasing_activity_action_check;
ALTER TABLE public.leasing_activity
  ADD CONSTRAINT leasing_activity_action_check CHECK (action IN (
    'contacted',
    'contact_attempt',
    'follow_up_scheduled',
    'message_sent_sms',
    'message_sent_email',
    'showing_confirmed',
    'showing_reschedule_requested',
    'showing_attended',
    'showing_no_show',
    'lead_not_interested',
    'stage_changed',
    'nurture_email_sent'
  ));

-- ── 3. Priority lane in the email queue ─────────────────────────────────────
-- claim_queued_emails was strict FIFO by created_at. With a nurture campaign in
-- flight that would park every showing confirmation and application invite
-- behind thousands of marketing sends — the same failure as the 7-day
-- send-notification-email outage, but by design.
--
-- Transactional now claims first. Nurture is explicitly deprioritised by its
-- notification_type; everything else keeps today's behaviour (priority 0), so
-- no existing caller changes meaning.
CREATE OR REPLACE FUNCTION public.claim_queued_emails(
  p_organization_id uuid,
  p_batch_size integer DEFAULT 10
)
RETURNS SETOF public.email_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.email_events
    WHERE organization_id = p_organization_id
      AND event_type = 'delivery_delayed'
      AND details->>'status' = 'queued'
    ORDER BY
      -- Lower sorts first: transactional (0) always beats nurture (1).
      CASE WHEN details->>'notification_type' = 'showing_nurture' THEN 1 ELSE 0 END,
      created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_events e
  SET details = jsonb_set(jsonb_set(e.details, '{status}', '"processing"'), '{processing_at}', to_jsonb(now()))
  FROM claimed c
  WHERE e.id = c.id
  RETURNING e.*;
END;
$$;

COMMENT ON FUNCTION public.claim_queued_emails IS
  'Drains the email queue. Transactional mail is claimed before showing_nurture so a running campaign can never delay a showing confirmation.';

-- ── 4. Deliverability circuit breaker ───────────────────────────────────────
-- Bounces are already suppressed at the send boundary, but COMPLAINTS are what
-- get a domain blacklisted, and 90% of this list inquired 90+ days ago. This
-- reads the recent complaint rate so the dispatcher can stand the whole
-- sequence down before the domain is damaged, instead of after.
CREATE OR REPLACE FUNCTION public.nurture_health_check(p_organization_id uuid)
RETURNS TABLE (recent_sends bigint, complaints bigint, bounces bigint, complaint_rate numeric, is_healthy boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT details->>'status' AS st
    FROM public.email_events
    WHERE organization_id = p_organization_id
      AND created_at > now() - interval '3 days'
      AND details->>'notification_type' = 'showing_nurture'
  ), agg AS (
    SELECT
      count(*) FILTER (WHERE st IN ('sent','delivered','opened','clicked','complained','bounced')) AS sends,
      count(*) FILTER (WHERE st = 'complained') AS complaints,
      count(*) FILTER (WHERE st = 'bounced')    AS bounces
    FROM recent
  )
  SELECT sends, complaints, bounces,
         CASE WHEN sends > 0 THEN round((complaints::numeric / sends) * 100, 3) ELSE 0 END,
         -- Healthy until there is enough signal to judge: under 500 sends the
         -- rate is too noisy to act on. 0.3% is well under the 0.5% at which
         -- Gmail and Outlook start throttling a domain.
         (sends < 500 OR (complaints::numeric / GREATEST(sends,1)) < 0.003)
  FROM agg;
$$;

REVOKE EXECUTE ON FUNCTION public.nurture_health_check(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.nurture_health_check(uuid) TO service_role;

-- ── 5. Let the new agent_type through ───────────────────────────────────────
-- agent_tasks.agent_type is a closed vocabulary; without this the dispatcher
-- would never see a single nurture task (caught by the smoke test before any
-- enrollment ran). Adds only — every existing type is preserved.
ALTER TABLE public.agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_agent_type_check;
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_agent_type_check CHECK (
  agent_type = ANY (ARRAY[
    'main_inbound','recapture','showing_confirmation','no_show_followup','post_showing',
    'campaign_voice','scoring','transcript_analyst','property_matcher','conversion_predictor',
    'paip_assistant','insight_generator','report_generator','welcome_sequence',
    'notification_dispatcher','sms_inbound','campaign_orchestrator','hemlane_parser',
    'resend_event_processor','persona_verification','alert_monitor','esther','lead_scoring',
    'doorloop_pull','campaign','sheets_backup',
    'showing_nurture'
  ])
);
