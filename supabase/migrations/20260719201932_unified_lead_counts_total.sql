-- ============================================================================
-- UNIFIED LEAD COUNTS (2026-07-19, owner decision): the headline "leads"
-- number is ALWAYS the org TOTAL. The old completeness/junk filter (name+
-- phone+email + 9 junk patterns) hid 665 real leads on some surfaces and made
-- counts disagree across the system (17,446 vs 18,111 vs 18,077...).
-- Incomplete-lead triage stays in the Nurturing tabs.
-- Applied to prod as version 20260719201932 (name unified_lead_counts_total).
-- ============================================================================

-- 1) get_lead_funnel: drop the completeness filter (funnel over ALL leads in range)
CREATE OR REPLACE FUNCTION public.get_lead_funnel(_date_from timestamp with time zone DEFAULT (now() - '30 days'::interval), _date_to timestamp with time zone DEFAULT now())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND is_demo IS NOT TRUE
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
$function$;

-- 2) Canonical single-source-of-truth counts. Every future consumer should use
--    this (or replicate these predicates EXACTLY).
CREATE OR REPLACE FUNCTION public.lead_counts(p_org uuid)
RETURNS TABLE(
  total integer,
  active integer,
  applicants integer,
  hot integer,
  incomplete integer,
  lost integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE status NOT IN ('lost','converted'))::int AS active,
    COUNT(*) FILTER (WHERE status IN ('in_application'))::int AS applicants,
    COUNT(*) FILTER (WHERE is_priority)::int AS hot,
    COUNT(*) FILTER (WHERE full_name IS NULL OR phone IS NULL OR email IS NULL)::int AS incomplete,
    COUNT(*) FILTER (WHERE status = 'lost')::int AS lost
  FROM public.leads
  WHERE organization_id = p_org
    AND is_demo IS NOT TRUE
$$;
REVOKE EXECUTE ON FUNCTION public.lead_counts(uuid) FROM anon;
