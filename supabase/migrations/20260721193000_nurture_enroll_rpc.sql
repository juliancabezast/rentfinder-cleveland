-- Enrollment for Elijah's showing nurture. Deliberately a MANUAL, batched RPC
-- and not a cron: enrolling everyone is a ~125,000-email decision, so it stays
-- something a human triggers on purpose, in chunks they can watch.
--
-- Call it repeatedly to ramp:
--   select * from enroll_showing_nurture(p_limit => 200, p_max_age_days => 30);
--   select * from enroll_showing_nurture(p_limit => 2000, p_max_age_days => 90);
--   select * from enroll_showing_nurture(p_limit => 5000);            -- everyone
--
-- p_stagger_hours spreads the first send across a window so day 1 isn't a
-- single spike that fills the queue ahead of everything else.

CREATE OR REPLACE FUNCTION public.enroll_showing_nurture(
  p_limit          integer DEFAULT 100,
  p_max_age_days   integer DEFAULT NULL,   -- null = no recency limit
  p_stagger_hours  integer DEFAULT 6,
  p_dry_run        boolean DEFAULT false
)
RETURNS TABLE (enrolled bigint, oldest_lead timestamptz, newest_lead timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_count bigint := 0;
  v_oldest timestamptz;
  v_newest timestamptz;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'no organization'; END IF;

  CREATE TEMP TABLE _enroll ON COMMIT DROP AS
  SELECT l.id, l.created_at,
         row_number() OVER (ORDER BY l.created_at DESC) AS rn
  FROM public.leads l
  WHERE l.organization_id = v_org
    AND l.is_demo IS NOT TRUE
    AND l.email IS NOT NULL AND l.email <> ''
    AND l.unsubscribed_at IS NULL
    AND COALESCE(l.email_marketing_consent, true) IS TRUE
    AND l.status NOT IN ('converted','lost','in_application')
    -- Never enrolled before. Re-enrolling an exhausted lead would restart the
    -- 7 emails they already ignored.
    AND l.nurture_outcome IS NULL
    -- Already booked → nothing to nurture toward.
    AND NOT EXISTS (
      SELECT 1 FROM public.showings s
      WHERE s.lead_id = l.id AND s.status IN ('scheduled','confirmed','completed')
    )
    -- Skip addresses that already hard-bounced: the send boundary would
    -- suppress them anyway, so enrolling them just inflates the numbers.
    AND NOT EXISTS (
      SELECT 1 FROM public.email_events e
      WHERE lower(e.recipient_email) = lower(l.email)
        AND e.details->>'status' = 'bounced'
    )
    AND (p_max_age_days IS NULL OR l.created_at > now() - make_interval(days => p_max_age_days))
  ORDER BY l.created_at DESC
  LIMIT p_limit;

  SELECT count(*), min(created_at), max(created_at)
    INTO v_count, v_oldest, v_newest FROM _enroll;

  IF p_dry_run THEN
    RETURN QUERY SELECT v_count, v_oldest, v_newest;
    RETURN;
  END IF;

  INSERT INTO public.agent_tasks (
    organization_id, lead_id, agent_type, action_type, status, scheduled_for, context
  )
  SELECT v_org, e.id, 'showing_nurture', 'email', 'pending',
         now() + (random() * make_interval(hours => GREATEST(p_stagger_hours, 0))),
         '{"step":1}'::jsonb
  FROM _enroll e;

  UPDATE public.leads l
  SET nurture_outcome = 'active', nurture_started_at = now()
  FROM _enroll e WHERE l.id = e.id;

  RETURN QUERY SELECT v_count, v_oldest, v_newest;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_showing_nurture(integer,integer,integer,boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_showing_nurture(integer,integer,integer,boolean) TO service_role;

COMMENT ON FUNCTION public.enroll_showing_nurture IS
  'Manually enroll leads into Elijah''s 7-email showing nurture, in batches. Not on a cron on purpose — full enrollment is a ~125k-email decision.';
