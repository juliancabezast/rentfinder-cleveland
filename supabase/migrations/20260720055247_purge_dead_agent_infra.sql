-- Agents v2 purge (2026-07-20): remove dead/fake agent infrastructure.
-- Owner decisions: zero SMS, welcome backlog drains (accelerated in dispatcher),
-- notification backlog cancelled (hot alerts are OFF by prior owner decision).

-- ── 1) Unschedule dead crons ─────────────────────────────────────────
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'process-sms-queue-every-minute',   -- SMS removed by owner decree
    'zacchaeus-system-analysis-hourly', -- fed the LLM boilerplate card (deleted)
    'isaiah-weekly-insights',           -- wrote investor_insights: 0 rows ever
    'luke-monthly-reports',             -- same
    'boaz-stale-lead-check-6h',         -- already inactive; recapture dead
    'sync-costs-morning',               -- sync_cost_data() is a no-op (calls=0 rows)
    'sync-costs-afternoon',
    'sync-costs-evening'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- ── 2) Drop dead SQL functions ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.schedule_stale_leads_for_recapture();
DROP FUNCTION IF EXISTS public.sync_cost_data();

-- ── 3) habakkuk_check_alerts rewrite ─────────────────────────────────
-- Alerts 1-2 previously enqueued notification_dispatcher tasks with types the
-- dispatcher can't handle (dormant failure factory) AND alert 2's once-per-day
-- dedup checked an activity row that was never written. Now: alerts 1-2 insert
-- directly into notifications (per active admin) and arm their own dedup.
-- Alerts 3-4 (agents in error / no-show spike) unchanged.
CREATE OR REPLACE FUNCTION public.habakkuk_check_alerts()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org RECORD;
  v_alerts JSONB := '[]'::JSONB;
  v_count INTEGER;
  v_threshold INTEGER;
  v_day_start TIMESTAMPTZ;
BEGIN
  v_day_start := (NOW() AT TIME ZONE 'America/New_York')::date::timestamp AT TIME ZONE 'America/New_York';

  FOR v_org IN SELECT id, name FROM public.organizations WHERE is_active = true
  LOOP

    -- ALERT 1: leads with 3+ failed contact attempts and no human attention
    SELECT COUNT(*) INTO v_count
    FROM public.leads l
    WHERE l.organization_id = v_org.id
      AND l.status IN ('contacted', 'new')
      AND l.is_human_controlled = false
      AND (SELECT COUNT(*) FROM public.agent_tasks at
           WHERE at.lead_id = l.id AND at.status = 'failed') >= 3
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.related_lead_id = l.id
          AND n.category = 'lead'
          AND n.title LIKE '%failed contact%'
          AND n.created_at > NOW() - interval '24 hours');

    IF v_count > 0 THEN
      INSERT INTO public.notifications (organization_id, user_id, title, message, type, category, related_lead_id)
      SELECT v_org.id, u.id,
        'Lead with failed contact attempts',
        format('%s has %s failed contact attempts and no human attention',
          NULLIF(TRIM(COALESCE(l.first_name,'') || ' ' || COALESCE(l.last_name,'')), ''), l.fail_count),
        'warning', 'lead', l.id
      FROM (
        SELECT lx.id, lx.first_name, lx.last_name,
          (SELECT COUNT(*) FROM public.agent_tasks at
           WHERE at.lead_id = lx.id AND at.status = 'failed') AS fail_count
        FROM public.leads lx
        WHERE lx.organization_id = v_org.id
          AND lx.status IN ('contacted', 'new')
          AND lx.is_human_controlled = false
          AND (SELECT COUNT(*) FROM public.agent_tasks at
               WHERE at.lead_id = lx.id AND at.status = 'failed') >= 3
          AND NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.related_lead_id = lx.id AND n.category = 'lead'
              AND n.title LIKE '%failed contact%'
              AND n.created_at > NOW() - interval '24 hours')
        LIMIT 10
      ) l
      CROSS JOIN (
        SELECT id FROM public.users
        WHERE organization_id = v_org.id AND is_active = true
          AND role IN ('super_admin','admin')
      ) u;

      v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
        'org', v_org.name, 'type', 'failed_contacts', 'count', v_count));
    END IF;

    -- ALERT 2: high daily spend (Cleveland day), once per day
    v_threshold := COALESCE(
      (public.get_org_setting(v_org.id, 'daily_spend_alert_threshold', '50'::JSONB))::TEXT::INTEGER, 50);

    SELECT COALESCE(SUM(total_cost), 0)::INTEGER INTO v_count
    FROM public.cost_records
    WHERE organization_id = v_org.id AND recorded_at >= v_day_start;

    IF v_count > v_threshold THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.agent_activity_log
        WHERE organization_id = v_org.id
          AND agent_key = 'alert_monitor'
          AND action = 'daily_spend_alert'
          AND created_at >= v_day_start
      ) THEN
        INSERT INTO public.notifications (organization_id, user_id, title, message, type, category)
        SELECT v_org.id, u.id,
          'Daily spend alert',
          format('Daily AI/API spend $%s exceeds the $%s threshold', v_count, v_threshold),
          'warning', 'cost'
        FROM public.users u
        WHERE u.organization_id = v_org.id AND u.is_active = true
          AND u.role IN ('super_admin','admin');

        -- arm the once-per-day dedup (previously never written — broken guard)
        PERFORM public.log_agent_activity(
          v_org.id, 'alert_monitor', 'daily_spend_alert', 'success',
          format('Daily spend $%s > $%s threshold', v_count, v_threshold),
          jsonb_build_object('daily_spend', v_count, 'threshold', v_threshold));

        v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
          'org', v_org.name, 'type', 'high_spend', 'amount', v_count));
      END IF;
    END IF;

    -- ALERT 3: agents in error state (unchanged)
    SELECT COUNT(*) INTO v_count
    FROM public.agents_registry
    WHERE organization_id = v_org.id AND status = 'error' AND is_enabled = true;

    IF v_count > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.agent_activity_log
        WHERE organization_id = v_org.id
          AND agent_key = 'alert_monitor'
          AND action = 'agents_in_error'
          AND created_at > NOW() - interval '1 hour'
      ) THEN
        PERFORM public.log_agent_activity(
          v_org.id, 'alert_monitor', 'agents_in_error', 'failure',
          format('%s agent(s) in error state for %s', v_count, v_org.name),
          jsonb_build_object('agents', (
            SELECT jsonb_agg(jsonb_build_object('name', biblical_name, 'key', agent_key))
            FROM public.agents_registry
            WHERE organization_id = v_org.id AND status = 'error' AND is_enabled = true)));

        v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
          'org', v_org.name, 'type', 'agents_error', 'count', v_count));
      END IF;
    END IF;

    -- ALERT 4: no-show rate spike (unchanged)
    DECLARE
      v_total_showings INTEGER;
      v_noshows INTEGER;
    BEGIN
      SELECT COUNT(*) INTO v_total_showings
      FROM public.showings
      WHERE organization_id = v_org.id
        AND scheduled_at > NOW() - interval '7 days'
        AND status IN ('completed', 'no_show');

      SELECT COUNT(*) INTO v_noshows
      FROM public.showings
      WHERE organization_id = v_org.id
        AND scheduled_at > NOW() - interval '7 days'
        AND status = 'no_show';

      IF v_total_showings >= 3 AND v_noshows::DECIMAL / v_total_showings > 0.5 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.agent_activity_log
          WHERE organization_id = v_org.id
            AND agent_key = 'alert_monitor'
            AND action = 'high_noshow_rate'
            AND created_at > NOW() - interval '24 hours'
        ) THEN
          PERFORM public.log_agent_activity(
            v_org.id, 'alert_monitor', 'high_noshow_rate', 'failure',
            format('High no-show rate: %s/%s (%s%%) in last 7 days',
              v_noshows, v_total_showings,
              ROUND(v_noshows::DECIMAL / v_total_showings * 100)),
            jsonb_build_object(
              'total_showings', v_total_showings,
              'no_shows', v_noshows,
              'rate', ROUND(v_noshows::DECIMAL / v_total_showings * 100, 1)));

          v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
            'org', v_org.name, 'type', 'high_noshow_rate',
            'noshows', v_noshows, 'total', v_total_showings));
        END IF;
      END IF;
    END;

  END LOOP;

  RETURN jsonb_build_object('alerts', v_alerts, 'checked_at', NOW());
END;
$function$;

-- ── 4) FIX P1: Samuel confirmations were 100% dead ───────────────────
-- schedule_showing_confirmations() created action_type='call' tasks and the
-- dispatcher auto-cancels every call (voice removed): 291/291 cancelled in 30d.
-- The dispatcher's email path works — switch to email.
CREATE OR REPLACE FUNCTION public.schedule_showing_confirmations()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_showing RECORD;
  v_count INTEGER := 0;
  v_confirm_hours INTEGER;
BEGIN
  FOR v_showing IN
    SELECT s.id, s.organization_id, s.lead_id, s.property_id,
           s.scheduled_at, s.leasing_agent_id
    FROM public.showings s
    WHERE s.status = 'scheduled'
      AND s.scheduled_at > NOW()
      AND s.scheduled_at < NOW() + interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_tasks at
        WHERE at.lead_id = s.lead_id
          AND at.agent_type = 'showing_confirmation'
          AND at.status IN ('pending', 'in_progress')
          AND (at.context->>'showing_id')::UUID = s.id
      )
    LIMIT 30
  LOOP
    v_confirm_hours := COALESCE(
      (public.get_org_setting(v_showing.organization_id, 'confirmation_hours_before', '24'::JSONB))::TEXT::INTEGER,
      24);

    INSERT INTO public.agent_tasks (
      organization_id, lead_id, agent_type, action_type,
      scheduled_for, attempt_number, max_attempts, status, context
    ) VALUES (
      v_showing.organization_id, v_showing.lead_id, 'showing_confirmation', 'email',
      v_showing.scheduled_at - (v_confirm_hours || ' hours')::INTERVAL,
      1,
      COALESCE(
        (public.get_org_setting(v_showing.organization_id, 'confirmation_max_attempts', '3'::JSONB))::TEXT::INTEGER,
        3),
      'pending',
      jsonb_build_object(
        'showing_id', v_showing.id,
        'property_id', v_showing.property_id,
        'scheduled_at', v_showing.scheduled_at,
        'leasing_agent_id', v_showing.leasing_agent_id,
        'trigger', 'confirmation_scheduler'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ── 5) Anti-wave guard on the priority-notification trigger ──────────
-- (Trigger is currently DISABLED; guard protects a future re-enable from
-- score-recalc waves like the 566-task flood of 2026-07-19.)
CREATE OR REPLACE FUNCTION public.auto_task_priority_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_priority = true AND (OLD.is_priority IS DISTINCT FROM true)
     AND NOT EXISTS (
       SELECT 1 FROM public.agent_tasks t
       WHERE t.lead_id = NEW.id
         AND t.agent_type = 'notification_dispatcher'
         AND t.created_at > NOW() - interval '24 hours'
         AND t.status IN ('pending', 'in_progress', 'completed')
     ) THEN
    INSERT INTO public.agent_tasks (
      organization_id, lead_id, agent_type, action_type,
      scheduled_for, attempt_number, max_attempts, status,
      context
    ) VALUES (
      NEW.organization_id, NEW.id, 'notification_dispatcher', 'notify',
      NOW(), 1, 1, 'pending',
      jsonb_build_object(
        'notification_type', 'priority_lead',
        'lead_name', COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''),
        'lead_score', NEW.lead_score,
        'priority_reason', NEW.priority_reason,
        'trigger', 'lead_became_priority'
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 6) Notifications never starve behind bulk backlogs ───────────────
CREATE OR REPLACE FUNCTION public.claim_pending_tasks(p_organization_id uuid, p_batch_size integer DEFAULT 20)
RETURNS SETOF agent_tasks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT at.id
    FROM public.agent_tasks at
    JOIN public.leads l ON l.id = at.lead_id
    WHERE at.organization_id = p_organization_id
      AND at.status = 'pending'
      AND at.scheduled_for <= NOW()
      AND (l.is_human_controlled IS NULL OR l.is_human_controlled = false)
    ORDER BY CASE WHEN at.agent_type = 'notification_dispatcher' THEN 0 ELSE 1 END,
             at.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE OF at SKIP LOCKED
  )
  UPDATE public.agent_tasks
  SET status = 'in_progress', executed_at = NOW()
  WHERE id IN (SELECT id FROM claimed)
  RETURNING *;
END;
$function$;

-- ── 7) Bulk-cancel dead tasks ────────────────────────────────────────
-- Stale priority_lead alert wave (hot notifications are OFF by owner decision)
UPDATE public.agent_tasks
SET status = 'cancelled', completed_at = NOW(),
    context = COALESCE(context, '{}'::jsonb)
      || jsonb_build_object('cancel_reason', '2026-07-20 purge: stale priority_lead alert backlog (wave from milestone recalc; hot alerts OFF)')
WHERE agent_type = 'notification_dispatcher' AND status IN ('pending', 'failed');

-- Anything pending the dispatcher can only cancel or fake-complete
UPDATE public.agent_tasks
SET status = 'cancelled', completed_at = NOW(),
    context = COALESCE(context, '{}'::jsonb)
      || jsonb_build_object('cancel_reason', '2026-07-20 purge: dead branch (voice/campaign/no-op agent types)')
WHERE status = 'pending'
  AND (action_type = 'call'
       OR agent_type IN ('campaign','campaign_voice','conversion_predictor','lead_scoring','doorloop_pull','sms_inbound'));

-- ── 8) Registry: remove dead agents ──────────────────────────────────
DELETE FROM public.agents_registry WHERE agent_key IN ('aaron', 'ruth');

-- ── 9) integration_health: remove dead vendors ───────────────────────
-- (health-checker redeploy in the same window removes them from API_SERVICES)
DELETE FROM public.integration_health WHERE service IN ('bland', 'twilio');

-- ── 10) Realtime publication: the funnel tables ──────────────────────
-- Publication only had campaign_leads/campaigns/integration_health/properties —
-- every existing "live" subscription on these tables was silently dead.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
