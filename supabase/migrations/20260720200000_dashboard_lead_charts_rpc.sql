-- Lead-focused chart data for the dashboard's animated realtime "Pulso de Leads"
-- strip: daily new leads over a chip-selectable window, top sources (30d), plus
-- headline numbers AND daily-average benchmarks (last week / last month /
-- all-time) so the UI can show "hoy vs. histórico". Org from auth.uid(),
-- Cleveland TZ, demo excluded. Applied via MCP on 2026-07-20; committed here for
-- repo↔prod parity.
CREATE OR REPLACE FUNCTION public.dashboard_lead_charts(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_today date;
  v_days integer := GREATEST(7, LEAST(365, COALESCE(p_days, 7)));
  result jsonb;
BEGIN
  v_org := get_user_organization_id(auth.uid());
  IF v_org IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_today := (now() AT TIME ZONE 'America/New_York')::date;

  WITH days AS (
    SELECT generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date AS d
  ),
  scoped AS (
    SELECT (created_at AT TIME ZONE 'America/New_York')::date AS d, source, is_priority, created_at
    FROM leads
    WHERE organization_id = v_org AND is_demo IS NOT TRUE
  ),
  daily AS (
    SELECT d.d, COUNT(s.d) AS count
    FROM days d LEFT JOIN scoped s ON s.d = d.d
    GROUP BY d.d ORDER BY d.d
  ),
  by_source AS (
    SELECT COALESCE(NULLIF(TRIM(source), ''), 'unknown') AS source, COUNT(*) AS count
    FROM scoped
    WHERE created_at >= now() - interval '30 days'
    GROUP BY 1 ORDER BY count DESC LIMIT 6
  )
  SELECT jsonb_build_object(
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('d', to_char(d, 'Mon DD'), 'iso', to_char(d, 'YYYY-MM-DD'), 'count', count) ORDER BY d) FROM daily), '[]'::jsonb),
    'by_source', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', source, 'count', count)) FROM by_source), '[]'::jsonb),
    'today', COALESCE((SELECT COUNT(*) FROM scoped WHERE d = v_today), 0),
    'week_total', (SELECT COUNT(*) FROM scoped WHERE d BETWEEN v_today - 6 AND v_today),
    'hot', (SELECT COUNT(*) FROM scoped WHERE is_priority IS TRUE),
    -- daily-average benchmarks (trailing windows, excluding today so "hoy" is a fair "vs")
    'avg_prev_week', ROUND((SELECT COUNT(*) FROM scoped WHERE d BETWEEN v_today - 7 AND v_today - 1)::numeric / 7, 1),
    'avg_prev_month', ROUND((SELECT COUNT(*) FROM scoped WHERE d BETWEEN v_today - 30 AND v_today - 1)::numeric / 30, 1),
    'avg_all', ROUND(
      (SELECT COUNT(*) FROM scoped)::numeric
      / GREATEST(1, COALESCE(v_today - (SELECT MIN(d) FROM scoped), 0) + 1), 1)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_lead_charts(integer) TO authenticated;
