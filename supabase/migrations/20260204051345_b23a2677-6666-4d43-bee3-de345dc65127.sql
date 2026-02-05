-- =====================================================
-- VIEW: Dashboard Summary per Organization
-- Replaces 8 parallel queries in AdminDashboard.tsx
-- Frontend can do: supabase.rpc('get_dashboard_summary')
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _result JSON;
  _today_start TIMESTAMPTZ;
  _today_end TIMESTAMPTZ;
  _week_start TIMESTAMPTZ;
  _month_start TIMESTAMPTZ;
  _month_end TIMESTAMPTZ;
BEGIN
  -- Get caller's org
  SELECT organization_id INTO _org_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _today_start := date_trunc('day', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
  _today_end := _today_start + INTERVAL '1 day';
  _week_start := date_trunc('week', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
  _month_start := date_trunc('month', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
  _month_end := _month_start + INTERVAL '1 month';

  SELECT json_build_object(
    'properties', (
      SELECT json_build_object(
        'total', COUNT(*),
        'available', COUNT(*) FILTER (WHERE status = 'available'),
        'coming_soon', COUNT(*) FILTER (WHERE status = 'coming_soon'),
        'in_leasing', COUNT(*) FILTER (WHERE status = 'in_leasing_process'),
        'rented', COUNT(*) FILTER (WHERE status = 'rented')
      )
      FROM properties WHERE organization_id = _org_id
    ),
    'leads', (
      SELECT json_build_object(
        'active', COUNT(*) FILTER (WHERE status NOT IN ('lost', 'converted')),
        'new_this_week', COUNT(*) FILTER (WHERE created_at >= _week_start),
        'new_today', COUNT(*) FILTER (WHERE created_at >= _today_start AND created_at < _today_end),
        'priority', COUNT(*) FILTER (WHERE is_priority = true AND status NOT IN ('lost', 'converted')),
        'human_controlled', COUNT(*) FILTER (WHERE is_human_controlled = true),
        'converted_this_month', COUNT(*) FILTER (WHERE status = 'converted' AND updated_at >= _month_start AND updated_at < _month_end),
        'total_this_month', COUNT(*) FILTER (WHERE created_at >= _month_start AND created_at < _month_end)
      )
      FROM leads WHERE organization_id = _org_id
    ),
    'showings', (
      SELECT json_build_object(
        'today', COUNT(*) FILTER (WHERE scheduled_at >= _today_start AND scheduled_at < _today_end),
        'this_week', COUNT(*) FILTER (WHERE scheduled_at >= _week_start),
        'completed_this_month', COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= _month_start),
        'no_shows_this_month', COUNT(*) FILTER (WHERE status = 'no_show' AND scheduled_at >= _month_start)
      )
      FROM showings WHERE organization_id = _org_id
    ),
    'calls', (
      SELECT json_build_object(
        'today', COUNT(*) FILTER (WHERE started_at >= _today_start AND started_at < _today_end),
        'this_week', COUNT(*) FILTER (WHERE started_at >= _week_start),
        'avg_duration_seconds', COALESCE(AVG(duration_seconds) FILTER (WHERE status = 'completed' AND started_at >= _month_start), 0)::INTEGER
      )
      FROM calls WHERE organization_id = _org_id
    ),
    'conversion_rate', (
      SELECT CASE 
        WHEN COUNT(*) FILTER (WHERE created_at >= _month_start AND created_at < _month_end) > 0 
        THEN ROUND(
          COUNT(*) FILTER (WHERE status = 'converted' AND updated_at >= _month_start AND updated_at < _month_end)::NUMERIC / 
          NULLIF(COUNT(*) FILTER (WHERE created_at >= _month_start AND created_at < _month_end), 0) * 100, 1
        )
        ELSE 0
      END
      FROM leads WHERE organization_id = _org_id
    ),
    'generated_at', NOW()
  ) INTO _result;

  RETURN _result;
END;
$$;