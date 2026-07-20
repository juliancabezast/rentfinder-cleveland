-- agents_live_status(): single round-trip JSON for the real-time Agents funnel
-- page. Polled every 15s by the UI; realtime postgres_changes layer on top for
-- instant visuals. House pattern: org from auth.uid(), never a trusted param.

-- Support indexes (small, partial where possible)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_closed_at
  ON public.agent_tasks (completed_at DESC) WHERE status IN ('completed','failed');
CREATE INDEX IF NOT EXISTS idx_agent_tasks_pending_type
  ON public.agent_tasks (agent_type) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_leads_org_created
  ON public.leads (organization_id, created_at DESC) WHERE is_demo IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_org_status_live
  ON public.leads (organization_id, status) WHERE is_demo IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_lead_notes_org_created
  ON public.lead_notes (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.agents_live_status()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _day timestamptz;
  _res json;
BEGIN
  SELECT organization_id INTO _org
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  _day := ((NOW() AT TIME ZONE 'America/New_York')::date)::timestamp AT TIME ZONE 'America/New_York';

  WITH
  -- Canonical agent_key mapping (mirrors dispatcher LEGACY_TO_CANONICAL and
  -- src/components/agents/constants.ts — keep the three in sync)
  log_agg AS (
    SELECT CASE agent_key
             WHEN 'cost_tracker' THEN 'zacchaeus'
             WHEN 'health_monitor' THEN 'zacchaeus'
             WHEN 'alert_monitor' THEN 'zacchaeus'
             WHEN 'system_logger' THEN 'nehemiah'
             WHEN 'hemlane_parser' THEN 'esther'
             WHEN 'campaign_orchestrator' THEN 'elijah'
             ELSE agent_key END AS k,
           MAX(created_at) AS last_at,
           COUNT(*) FILTER (WHERE created_at > NOW() - interval '1 hour') AS a1h,
           COUNT(*) AS a24h,
           (ARRAY_AGG(status ORDER BY created_at DESC))[1] AS last_status
    FROM agent_activity_log
    WHERE organization_id = _org AND created_at > NOW() - interval '24 hours'
    GROUP BY 1),
  task_agg AS (
    SELECT CASE
             WHEN agent_type IN ('welcome_sequence','recapture','campaign','campaign_voice') THEN 'elijah'
             WHEN agent_type IN ('showing_confirmation','no_show_followup','no_show_follow_up','post_showing','doorloop_pull') THEN 'samuel'
             WHEN agent_type IN ('esther','hemlane_parser') THEN 'esther'
             WHEN agent_type IN ('cost_tracker','health_monitor') THEN 'zacchaeus'
             ELSE 'nehemiah' END AS k,
           COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= _day) AS done,
           COUNT(*) FILTER (WHERE status = 'pending') AS pend,
           COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= _day) AS fail
    FROM agent_tasks
    WHERE organization_id = _org
      AND (status = 'pending' OR completed_at >= _day)
    GROUP BY 1)
  SELECT json_build_object(
    'generated_at', NOW(),
    'agents', (SELECT COALESCE(json_agg(json_build_object(
        'key', r.agent_key,
        'name', r.biblical_name,
        'role', r.display_role,
        'enabled', r.is_enabled,
        'last_activity_at', GREATEST(l.last_at, r.last_execution_at),
        'activity_1h', COALESCE(l.a1h, 0),
        'activity_24h', COALESCE(l.a24h, 0),
        'tasks_today', json_build_object(
          'completed', COALESCE(t.done, 0),
          'pending', COALESCE(t.pend, 0),
          'failed', COALESCE(t.fail, 0)),
        'health', CASE
          WHEN NOT r.is_enabled THEN 'disabled'
          WHEN l.last_status = 'failure' THEN 'error'
          WHEN COALESCE(l.a1h, 0) > 0 THEN 'active'
          ELSE 'idle' END
      ) ORDER BY r.agent_key), '[]'::json)
      FROM agents_registry r
      LEFT JOIN log_agg l ON l.k = r.agent_key
      LEFT JOIN task_agg t ON t.k = r.agent_key
      WHERE r.organization_id = _org),
    'funnel', json_build_object(
      'statuses', (SELECT COALESCE(json_object_agg(status, c), '{}'::json) FROM (
        SELECT status, COUNT(*) AS c FROM leads
        WHERE organization_id = _org AND is_demo IS NOT TRUE GROUP BY status) s),
      'milestones', (SELECT json_build_object(
          'ge50',  COUNT(*) FILTER (WHERE lead_score >= 50 AND lead_score < 80),
          'ge80',  COUNT(*) FILTER (WHERE lead_score >= 80 AND lead_score < 100),
          'eq100', COUNT(*) FILTER (WHERE lead_score >= 100))
        FROM leads WHERE organization_id = _org AND is_demo IS NOT TRUE AND lead_score >= 50),
      'hot', (SELECT COUNT(*) FROM leads
        WHERE organization_id = _org AND is_priority AND is_demo IS NOT TRUE)),
    'flows', json_build_object(
      'leads_created_1h', (SELECT COUNT(*) FROM leads
        WHERE organization_id = _org AND is_demo IS NOT TRUE AND created_at > NOW() - interval '1 hour'),
      'leads_created_24h', (SELECT COUNT(*) FROM leads
        WHERE organization_id = _org AND is_demo IS NOT TRUE AND created_at > NOW() - interval '24 hours'),
      'emails_sent_24h', (SELECT COUNT(*) FROM email_events
        WHERE organization_id = _org AND details->>'status' IN ('sent','delivered','opened','clicked')
          AND created_at > NOW() - interval '24 hours'),
      'emails_bounced_24h', (SELECT COUNT(*) FROM email_events
        WHERE organization_id = _org AND details->>'status' = 'bounced'
          AND created_at > NOW() - interval '24 hours'),
      'inbound_emails_24h', (SELECT COUNT(*) FROM inbound_emails
        WHERE organization_id = _org AND received_at > NOW() - interval '24 hours'),
      'showings_today', (SELECT COUNT(*) FROM showings
        WHERE organization_id = _org AND is_demo IS NOT TRUE
          AND scheduled_at >= _day AND scheduled_at < _day + interval '1 day'),
      'notes_24h', (SELECT COUNT(*) FROM lead_notes
        WHERE organization_id = _org AND created_at > NOW() - interval '24 hours')),
    'queues', json_build_object(
      'email_queued', (SELECT COUNT(*) FROM email_events
        WHERE organization_id = _org AND details->>'status' = 'queued'),
      'tasks_pending', (SELECT COUNT(*) FROM agent_tasks
        WHERE organization_id = _org AND status = 'pending'),
      'tasks_overdue', (SELECT COUNT(*) FROM agent_tasks
        WHERE organization_id = _org AND status = 'pending' AND scheduled_for < NOW())),
    'integrations', (SELECT COALESCE(json_agg(json_build_object(
        'service', service,
        'status', status,
        'response_ms', response_ms,
        'last_checked_at', last_checked_at,
        'consecutive_failures', consecutive_failures)
        ORDER BY service), '[]'::json)
      FROM integration_health WHERE organization_id = _org)
  ) INTO _res;

  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.agents_live_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agents_live_status() TO authenticated, service_role;
