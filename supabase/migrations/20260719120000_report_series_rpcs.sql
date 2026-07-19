-- Reporting RPCs for the RFC bot daily report + interactive menu.
-- All grouped in the DB (PostgREST caps raw selects at 1000 rows — a JS fold
-- would silently corrupt counts, same bug report_top_properties fixed).
-- Cleveland-local day boundaries, DST-aware (AT TIME ZONE, never a fixed offset).

-- Leads created + showings held per Cleveland day, last p_days days (today inclusive).
CREATE OR REPLACE FUNCTION public.report_time_series(p_org uuid, p_days int)
RETURNS TABLE(day date, leads bigint, showings bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT ((now() AT TIME ZONE 'America/New_York')::date - (GREATEST(p_days, 1) - 1)) AS d0
  ),
  days AS (
    SELECT generate_series(
      (SELECT d0 FROM bounds)::timestamp,
      ((now() AT TIME ZONE 'America/New_York')::date)::timestamp,
      interval '1 day'
    )::date AS d
  ),
  l AS (
    SELECT (created_at AT TIME ZONE 'America/New_York')::date AS d, count(*) AS cnt
    FROM leads, bounds
    WHERE organization_id = p_org
      AND COALESCE(is_demo, false) = false
      AND created_at >= ((bounds.d0)::timestamp AT TIME ZONE 'America/New_York')
    GROUP BY 1
  ),
  s AS (
    SELECT (scheduled_at AT TIME ZONE 'America/New_York')::date AS d, count(*) AS cnt
    FROM showings, bounds
    WHERE organization_id = p_org
      AND status NOT IN ('cancelled', 'rescheduled')
      AND scheduled_at >= ((bounds.d0)::timestamp AT TIME ZONE 'America/New_York')
    GROUP BY 1
  )
  SELECT days.d, COALESCE(l.cnt, 0), COALESCE(s.cnt, 0)
  FROM days
  LEFT JOIN l ON l.d = days.d
  LEFT JOIN s ON s.d = days.d
  ORDER BY days.d
$$;

-- Leads + showings per Cleveland month, last p_months months (current inclusive).
CREATE OR REPLACE FUNCTION public.report_monthly_series(p_org uuid, p_months int)
RETURNS TABLE(month text, leads bigint, showings bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT (date_trunc('month', (now() AT TIME ZONE 'America/New_York'))
            - make_interval(months => GREATEST(p_months, 1) - 1))::date AS m0
  ),
  months AS (
    SELECT to_char(generate_series(
      (SELECT m0 FROM bounds)::timestamp,
      date_trunc('month', (now() AT TIME ZONE 'America/New_York'))::timestamp,
      interval '1 month'
    ), 'YYYY-MM') AS m
  ),
  l AS (
    SELECT to_char(created_at AT TIME ZONE 'America/New_York', 'YYYY-MM') AS m, count(*) AS cnt
    FROM leads, bounds
    WHERE organization_id = p_org
      AND COALESCE(is_demo, false) = false
      AND created_at >= ((bounds.m0)::timestamp AT TIME ZONE 'America/New_York')
    GROUP BY 1
  ),
  s AS (
    SELECT to_char(scheduled_at AT TIME ZONE 'America/New_York', 'YYYY-MM') AS m, count(*) AS cnt
    FROM showings, bounds
    WHERE organization_id = p_org
      AND status NOT IN ('cancelled', 'rescheduled')
      AND scheduled_at >= ((bounds.m0)::timestamp AT TIME ZONE 'America/New_York')
    GROUP BY 1
  )
  SELECT months.m, COALESCE(l.cnt, 0), COALESCE(s.cnt, 0)
  FROM months
  LEFT JOIN l ON l.m = months.m
  LEFT JOIN s ON s.m = months.m
  ORDER BY months.m
$$;

-- Cost totals by service inside [p_since, p_until) — sums in the DB.
CREATE OR REPLACE FUNCTION public.report_costs_summary(p_org uuid, p_since timestamptz, p_until timestamptz)
RETURNS TABLE(service text, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT service, COALESCE(sum(total_cost), 0) AS total
  FROM cost_records
  WHERE organization_id = p_org
    AND recorded_at >= p_since
    AND recorded_at < p_until
  GROUP BY service
  ORDER BY total DESC
$$;

-- Live pipeline: lead counts per status (excludes demo leads).
CREATE OR REPLACE FUNCTION public.report_status_funnel(p_org uuid)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status, count(*) AS cnt
  FROM leads
  WHERE organization_id = p_org
    AND COALESCE(is_demo, false) = false
  GROUP BY status
$$;

-- Service-role only: these power internal Telegram reports, not the frontend.
REVOKE ALL ON FUNCTION public.report_time_series(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_monthly_series(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_costs_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_status_funnel(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_time_series(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_monthly_series(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_costs_summary(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_status_funnel(uuid) TO service_role;
