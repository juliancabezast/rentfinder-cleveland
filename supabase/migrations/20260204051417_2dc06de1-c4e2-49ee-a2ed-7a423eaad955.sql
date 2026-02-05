-- =====================================================
-- FUNCTION: Lead Funnel Metrics
-- Returns conversion rates between each funnel stage
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_lead_funnel(
  _date_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  _date_to TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _result JSON;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH funnel AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status IN ('contacted','engaged','nurturing','qualified','showing_scheduled','showed','in_application','converted')) AS contacted,
      COUNT(*) FILTER (WHERE status IN ('engaged','nurturing','qualified','showing_scheduled','showed','in_application','converted')) AS engaged,
      COUNT(*) FILTER (WHERE status IN ('qualified','showing_scheduled','showed','in_application','converted')) AS qualified,
      COUNT(*) FILTER (WHERE status IN ('showing_scheduled','showed','in_application','converted')) AS showing_scheduled,
      COUNT(*) FILTER (WHERE status IN ('showed','in_application','converted')) AS showed,
      COUNT(*) FILTER (WHERE status IN ('in_application','converted')) AS in_application,
      COUNT(*) FILTER (WHERE status = 'converted') AS converted,
      COUNT(*) FILTER (WHERE status = 'lost') AS lost
    FROM leads
    WHERE organization_id = _org_id
      AND created_at >= _date_from
      AND created_at <= _date_to
  )
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object('stage', 'new', 'count', total, 'rate', 100),
      json_build_object('stage', 'contacted', 'count', contacted, 'rate', CASE WHEN total > 0 THEN ROUND(contacted::NUMERIC/total*100,1) ELSE 0 END),
      json_build_object('stage', 'engaged', 'count', engaged, 'rate', CASE WHEN total > 0 THEN ROUND(engaged::NUMERIC/total*100,1) ELSE 0 END),
      json_build_object('stage', 'qualified', 'count', qualified, 'rate', CASE WHEN total > 0 THEN ROUND(qualified::NUMERIC/total*100,1) ELSE 0 END),
      json_build_object('stage', 'showing_scheduled', 'count', showing_scheduled, 'rate', CASE WHEN total > 0 THEN ROUND(showing_scheduled::NUMERIC/total*100,1) ELSE 0 END),
      json_build_object('stage', 'showed', 'count', showed, 'rate', CASE WHEN total > 0 THEN ROUND(showed::NUMERIC/total*100,1) ELSE 0 END),
      json_build_object('stage', 'in_application', 'count', in_application, 'rate', CASE WHEN total > 0 THEN ROUND(in_application::NUMERIC/total*100,1) ELSE 0 END),
      json_build_object('stage', 'converted', 'count', converted, 'rate', CASE WHEN total > 0 THEN ROUND(converted::NUMERIC/total*100,1) ELSE 0 END)
    ),
    'lost', lost,
    'total', total,
    'overall_conversion', CASE WHEN total > 0 THEN ROUND(converted::NUMERIC/total*100,1) ELSE 0 END,
    'period', json_build_object('from', _date_from, 'to', _date_to)
  ) INTO _result
  FROM funnel;

  RETURN _result;
END;
$$;