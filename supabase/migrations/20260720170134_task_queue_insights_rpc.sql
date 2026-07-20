-- task_queue_insights(): forward-looking forecast for the Task Queue panel —
-- what's about to fire, real throughput, drain ETA, and queue composition.
-- One scan of the org's agent_tasks; org from auth.uid().
CREATE OR REPLACE FUNCTION public.task_queue_insights()
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

  _day := (date_trunc('day', now() AT TIME ZONE 'America/New_York'))::timestamp AT TIME ZONE 'America/New_York';

  SELECT json_build_object(
    'pending_total', COUNT(*) FILTER (WHERE status = 'pending' AND action_type <> 'call'),
    'due_next_hour', COUNT(*) FILTER (WHERE status = 'pending' AND action_type <> 'call'
      AND scheduled_for <= now() + interval '1 hour'),
    'due_next_15m', COUNT(*) FILTER (WHERE status = 'pending' AND action_type <> 'call'
      AND scheduled_for <= now() + interval '15 minutes'),
    'overdue', COUNT(*) FILTER (WHERE status = 'pending' AND action_type <> 'call'
      AND scheduled_for <= now()),
    'completed_1h', COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= now() - interval '1 hour'),
    'completed_today', COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= _day),
    'next_at', MIN(scheduled_for) FILTER (WHERE status = 'pending' AND action_type <> 'call'),
    'by_type', (SELECT COALESCE(json_agg(json_build_object('type', t, 'count', c) ORDER BY c DESC), '[]'::json)
      FROM (
        SELECT agent_type AS t, COUNT(*) AS c
        FROM agent_tasks
        WHERE organization_id = _org AND status = 'pending' AND action_type <> 'call'
        GROUP BY agent_type
        ORDER BY COUNT(*) DESC
        LIMIT 4
      ) x)
  ) INTO _res
  FROM agent_tasks
  WHERE organization_id = _org
    AND (status = 'pending'
         OR (status = 'completed' AND completed_at >= _day));

  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.task_queue_insights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_queue_insights() TO authenticated, service_role;
