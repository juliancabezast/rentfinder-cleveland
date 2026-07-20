-- Analytics page RPCs (merged Reports+Costs page, 2026-07-19)
-- Server-side aggregates: kills client full-table fetches and the 1000-row
-- PostgREST cap ($0.09-vs-$0.40 AI spend, 1000-of-27900 agent tasks).
-- Org is ALWAYS resolved from auth.uid() — p_org params are not trusted here.
-- All bucketing/hours in America/New_York. All lead queries exclude demo rows.

-- ── 1) analytics_overview ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_source text DEFAULT NULL,
  p_property uuid[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _len interval;
  _result json;
BEGIN
  SELECT organization_id INTO _org
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  _len := p_to - p_from;

  WITH cohort AS (
    SELECT l.id, l.lead_score, l.status, l.created_at,
      CASE WHEN l.source IN ('hemlane','hemlane_email') THEN 'hemlane'
           ELSE COALESCE(l.source,'unknown') END AS source_canon
    FROM leads l
    WHERE l.organization_id = _org
      AND l.is_demo IS NOT TRUE
      AND l.created_at >= p_from AND l.created_at < p_to
      AND (p_source IS NULL OR CASE WHEN p_source = 'hemlane'
            THEN l.source IN ('hemlane','hemlane_email')
            ELSE l.source = p_source END)
      AND (p_property IS NULL OR EXISTS (
            SELECT 1 FROM lead_property_interests i
            WHERE i.lead_id = l.id AND i.property_id = ANY(p_property)))
  ),
  prev AS (
    SELECT COUNT(*) AS cnt
    FROM leads l
    WHERE l.organization_id = _org
      AND l.is_demo IS NOT TRUE
      AND l.created_at >= p_from - _len AND l.created_at < p_from
      AND (p_source IS NULL OR CASE WHEN p_source = 'hemlane'
            THEN l.source IN ('hemlane','hemlane_email')
            ELSE l.source = p_source END)
      AND (p_property IS NULL OR EXISTS (
            SELECT 1 FROM lead_property_interests i
            WHERE i.lead_id = l.id AND i.property_id = ANY(p_property)))
  ),
  showings_r AS (
    SELECT s.status
    FROM showings s
    WHERE s.organization_id = _org
      AND s.is_demo IS NOT TRUE
      AND s.scheduled_at >= p_from AND s.scheduled_at < p_to
      AND (p_property IS NULL OR s.property_id = ANY(p_property))
      AND (p_source IS NULL OR EXISTS (
            SELECT 1 FROM leads l WHERE l.id = s.lead_id
              AND CASE WHEN p_source = 'hemlane'
                    THEN l.source IN ('hemlane','hemlane_email')
                    ELSE l.source = p_source END))
  ),
  resp AS (
    SELECT EXTRACT(EPOCH FROM (fe.first_event - c.created_at)) / 60.0 AS mins
    FROM cohort c
    JOIN LATERAL (
      SELECT MIN(e.created_at) AS first_event
      FROM email_events e
      WHERE e.lead_id = c.id AND e.created_at > c.created_at
    ) fe ON fe.first_event IS NOT NULL
  )
  SELECT json_build_object(
    'leads_in_range', (SELECT COUNT(*) FROM cohort),
    'prev_period_leads', (SELECT cnt FROM prev),
    'milestones', (SELECT json_build_object(
        'm0',   COUNT(*) FILTER (WHERE COALESCE(lead_score,0) = 0),
        'm10',  COUNT(*) FILTER (WHERE lead_score = 10),
        'm50',  COUNT(*) FILTER (WHERE lead_score = 50),
        'm80',  COUNT(*) FILTER (WHERE lead_score = 80),
        'm100', COUNT(*) FILTER (WHERE lead_score = 100)
      ) FROM cohort),
    'funnel', (SELECT json_build_object(
        'total', COUNT(*),
        'ge10',  COUNT(*) FILTER (WHERE lead_score >= 10),
        'ge50',  COUNT(*) FILTER (WHERE lead_score >= 50),
        'ge80',  COUNT(*) FILTER (WHERE lead_score >= 80),
        'eq100', COUNT(*) FILTER (WHERE lead_score = 100)
      ) FROM cohort),
    'avg_milestone', (SELECT ROUND(AVG(lead_score) FILTER (WHERE lead_score > 0)) FROM cohort),
    'showings', (SELECT json_build_object(
        'scheduled',   COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed')),
        'completed',   COUNT(*) FILTER (WHERE status = 'completed'),
        'no_show',     COUNT(*) FILTER (WHERE status = 'no_show'),
        'cancelled',   COUNT(*) FILTER (WHERE status = 'cancelled'),
        'rescheduled', COUNT(*) FILTER (WHERE status = 'rescheduled'),
        'total',       COUNT(*),
        'show_rate',   CASE WHEN COUNT(*) FILTER (WHERE status IN ('completed','no_show')) > 0
                         THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric
                              / COUNT(*) FILTER (WHERE status IN ('completed','no_show')) * 100, 1)
                         ELSE NULL END
      ) FROM showings_r),
    'first_response', (SELECT json_build_object(
        'measured', COUNT(*),
        'median_mins', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY mins))::numeric, 1),
        'p90_mins',    ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY mins))::numeric, 1),
        'pct_within_1h', CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE mins <= 60)::numeric / COUNT(*) * 100, 1)
          ELSE NULL END
      ) FROM resp),
    'sources', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.leads DESC), '[]'::json) FROM (
        SELECT c.source_canon AS source, COUNT(*) AS leads,
          ROUND(AVG(c.lead_score)) AS avg_score,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM showings s
            WHERE s.lead_id = c.id AND s.is_demo IS NOT TRUE)) AS with_showing
        FROM cohort c GROUP BY c.source_canon
      ) t),
    'top_properties', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT p.id, p.address, p.unit_number, p.bedrooms, p.rent_price, p.status,
          COUNT(DISTINCT c.id) AS leads,
          ROUND(AVG(c.lead_score)) AS avg_score,
          (SELECT COUNT(*) FROM showings s
            WHERE s.property_id = p.id AND s.is_demo IS NOT TRUE
              AND s.scheduled_at >= p_from AND s.scheduled_at < p_to) AS showings
        FROM cohort c
        JOIN lead_property_interests i ON i.lead_id = c.id
        JOIN properties p ON p.id = i.property_id
        WHERE (p_property IS NULL OR p.id = ANY(p_property))
        GROUP BY p.id, p.address, p.unit_number, p.bedrooms, p.rent_price, p.status
        ORDER BY COUNT(DISTINCT c.id) DESC
        LIMIT 10
      ) t),
    'peak_hours', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.hour), '[]'::json) FROM (
        SELECT h.hour,
          COALESCE(lh.cnt, 0) AS leads,
          COALESCE(ih.cnt, 0) AS inbound
        FROM generate_series(0, 23) AS h(hour)
        LEFT JOIN (
          SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/New_York'))::int AS hr, COUNT(*) AS cnt
          FROM cohort GROUP BY 1
        ) lh ON lh.hr = h.hour
        LEFT JOIN (
          SELECT hr, SUM(cnt) AS cnt FROM (
            SELECT EXTRACT(HOUR FROM (cm.sent_at AT TIME ZONE 'America/New_York'))::int AS hr, COUNT(*) AS cnt
            FROM communications cm
            WHERE cm.organization_id = _org AND cm.direction = 'inbound'
              AND cm.is_demo IS NOT TRUE
              AND cm.sent_at >= p_from AND cm.sent_at < p_to
            GROUP BY 1
            UNION ALL
            SELECT EXTRACT(HOUR FROM (ie.received_at AT TIME ZONE 'America/New_York'))::int AS hr, COUNT(*) AS cnt
            FROM inbound_emails ie
            WHERE ie.organization_id = _org
              AND ie.received_at >= p_from AND ie.received_at < p_to
            GROUP BY 1
          ) u GROUP BY hr
        ) ih ON ih.hr = h.hour
      ) t),
    'portfolio', (SELECT json_build_object(
        'total', COUNT(*),
        'active', COUNT(*) FILTER (WHERE status <> 'inactive'),
        'available', COUNT(*) FILTER (WHERE status = 'available'),
        'coming_soon', COUNT(*) FILTER (WHERE status = 'coming_soon'),
        'in_leasing', COUNT(*) FILTER (WHERE status = 'in_leasing_process'),
        'rented', COUNT(*) FILTER (WHERE status = 'rented'),
        'rent_active_total', COALESCE(SUM(rent_price) FILTER (WHERE status <> 'inactive'), 0),
        'rent_rented', COALESCE(SUM(rent_price) FILTER (WHERE status = 'rented'), 0),
        'rent_available', COALESCE(SUM(rent_price) FILTER (WHERE status = 'available'), 0),
        'rent_coming_soon', COALESCE(SUM(rent_price) FILTER (WHERE status = 'coming_soon'), 0),
        'rent_in_leasing', COALESCE(SUM(rent_price) FILTER (WHERE status = 'in_leasing_process'), 0),
        'occupancy_pct', CASE WHEN COUNT(*) FILTER (WHERE status <> 'inactive') > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'rented')::numeric
               / COUNT(*) FILTER (WHERE status <> 'inactive') * 100)
          ELSE NULL END
      ) FROM properties WHERE organization_id = _org),
    'agent_tasks', (SELECT json_build_object(
        'by_status', (SELECT COALESCE(json_object_agg(st, cnt), '{}'::json) FROM (
          SELECT CASE WHEN status IN ('pending','in_progress') THEN 'pending' ELSE status END AS st, COUNT(*) AS cnt
          FROM agent_tasks
          WHERE organization_id = _org AND created_at >= p_from AND created_at < p_to
          GROUP BY 1) x),
        'weekly', (SELECT COALESCE(json_agg(row_to_json(w) ORDER BY w.week), '[]'::json) FROM (
          SELECT (date_trunc('week', created_at AT TIME ZONE 'America/New_York'))::date AS week,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status IN ('pending','in_progress')) AS pending,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
          FROM agent_tasks
          WHERE organization_id = _org AND created_at >= p_from AND created_at < p_to
          GROUP BY 1) w)
      )),
    'costs', (SELECT json_build_object(
        'total', (SELECT COALESCE(SUM(total_cost), 0) FROM cost_records
          WHERE organization_id = _org AND created_at >= p_from AND created_at < p_to),
        'by_service', (SELECT COALESCE(json_object_agg(service, s), '{}'::json) FROM (
          SELECT COALESCE(service,'other') AS service, ROUND(SUM(total_cost)::numeric, 4) AS s
          FROM cost_records
          WHERE organization_id = _org AND created_at >= p_from AND created_at < p_to
          GROUP BY 1) x),
        'emails_sent', (SELECT COUNT(*) FROM email_events
          WHERE organization_id = _org AND created_at >= p_from AND created_at < p_to
            AND details->>'status' IN ('sent','delivered','opened','clicked','bounced')),
        'sms_sent', (SELECT COUNT(*) FROM agent_tasks
          WHERE organization_id = _org AND action_type = 'sms' AND status = 'completed'
            AND created_at >= p_from AND created_at < p_to)
      )),
    'team_activity', (SELECT json_build_object(
        'notes', COUNT(*), 'leads_touched', COUNT(DISTINCT lead_id))
      FROM lead_notes
      WHERE organization_id = _org AND created_at >= p_from AND created_at < p_to),
    'inbound', (SELECT json_build_object(
        'messages', (SELECT COUNT(*) FROM communications
          WHERE organization_id = _org AND direction = 'inbound' AND is_demo IS NOT TRUE
            AND sent_at >= p_from AND sent_at < p_to),
        'outcomes', (SELECT COALESCE(json_object_agg(COALESCE(outcome,'unknown'), cnt), '{}'::json) FROM (
          SELECT outcome, COUNT(*) AS cnt FROM inbound_emails
          WHERE organization_id = _org AND received_at >= p_from AND received_at < p_to
          GROUP BY 1) x)
      )),
    'snapshot', (SELECT json_build_object(
        'total_leads', COUNT(*),
        'hot', COUNT(*) FILTER (WHERE is_priority),
        'aplico_total', COUNT(*) FILTER (WHERE lead_score = 100),
        'statuses', (SELECT json_object_agg(status, cnt) FROM (
          SELECT status, COUNT(*) AS cnt FROM leads
          WHERE organization_id = _org AND is_demo IS NOT TRUE GROUP BY status) s)
      ) FROM leads WHERE organization_id = _org AND is_demo IS NOT TRUE)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_overview(timestamptz, timestamptz, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_overview(timestamptz, timestamptz, text, uuid[]) TO authenticated, service_role;

-- ── 2) analytics_time_series ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_time_series(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text DEFAULT 'day',
  p_source text DEFAULT NULL,
  p_property uuid[] DEFAULT NULL
) RETURNS TABLE(
  bucket date,
  leads bigint,
  showings_scheduled bigint,
  showings_completed bigint,
  showings_no_show bigint,
  showings_cancelled bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _bucket text;
  _step interval;
BEGIN
  SELECT organization_id INTO _org
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  _bucket := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  _step := CASE _bucket WHEN 'day' THEN interval '1 day'
                        WHEN 'week' THEN interval '1 week'
                        ELSE interval '1 month' END;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(_bucket, p_from AT TIME ZONE 'America/New_York'),
      date_trunc(_bucket, (p_to - interval '1 second') AT TIME ZONE 'America/New_York'),
      _step
    )::date AS b
  ),
  l AS (
    SELECT date_trunc(_bucket, created_at AT TIME ZONE 'America/New_York')::date AS b, COUNT(*) AS cnt
    FROM leads lx
    WHERE lx.organization_id = _org AND lx.is_demo IS NOT TRUE
      AND lx.created_at >= p_from AND lx.created_at < p_to
      AND (p_source IS NULL OR CASE WHEN p_source = 'hemlane'
            THEN lx.source IN ('hemlane','hemlane_email')
            ELSE lx.source = p_source END)
      AND (p_property IS NULL OR EXISTS (
            SELECT 1 FROM lead_property_interests i
            WHERE i.lead_id = lx.id AND i.property_id = ANY(p_property)))
    GROUP BY 1
  ),
  s AS (
    SELECT date_trunc(_bucket, scheduled_at AT TIME ZONE 'America/New_York')::date AS b,
      COUNT(*) FILTER (WHERE sx.status IN ('scheduled','confirmed')) AS scheduled,
      COUNT(*) FILTER (WHERE sx.status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE sx.status = 'no_show') AS no_show,
      COUNT(*) FILTER (WHERE sx.status = 'cancelled') AS cancelled
    FROM showings sx
    WHERE sx.organization_id = _org AND sx.is_demo IS NOT TRUE
      AND sx.scheduled_at >= p_from AND sx.scheduled_at < p_to
      AND (p_property IS NULL OR sx.property_id = ANY(p_property))
      AND (p_source IS NULL OR EXISTS (
            SELECT 1 FROM leads l2 WHERE l2.id = sx.lead_id
              AND CASE WHEN p_source = 'hemlane'
                    THEN l2.source IN ('hemlane','hemlane_email')
                    ELSE l2.source = p_source END))
    GROUP BY 1
  )
  SELECT buckets.b,
    COALESCE(l.cnt, 0),
    COALESCE(s.scheduled, 0),
    COALESCE(s.completed, 0),
    COALESCE(s.no_show, 0),
    COALESCE(s.cancelled, 0)
  FROM buckets
  LEFT JOIN l ON l.b = buckets.b
  LEFT JOIN s ON s.b = buckets.b
  ORDER BY buckets.b;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_time_series(timestamptz, timestamptz, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_time_series(timestamptz, timestamptz, text, text, uuid[]) TO authenticated, service_role;

-- ── 3) analytics_email_campaigns ─────────────────────────────────────
-- email_events semantics: one row per queued email; details->>'status' is the
-- LATEST state (queued→sent→delivered→opened→clicked | bounced/failed/suppressed).
-- event_type is junk (97% 'delivery_delayed') — never aggregate on it.
CREATE OR REPLACE FUNCTION public.analytics_email_campaigns(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text DEFAULT 'week'
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _bucket text;
  _result json;
BEGIN
  SELECT organization_id INTO _org
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  _bucket := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'week' END;

  WITH ev AS (
    SELECT COALESCE(details->>'status','unknown') AS st,
      details->>'campaign_id' AS campaign_id,
      created_at
    FROM email_events
    WHERE organization_id = _org
      AND created_at >= p_from AND created_at < p_to
  )
  SELECT json_build_object(
    'summary', (SELECT json_build_object(
        'total', COUNT(*),
        'delivered', COUNT(*) FILTER (WHERE st IN ('delivered','opened','clicked')),
        'opened', COUNT(*) FILTER (WHERE st IN ('opened','clicked')),
        'clicked', COUNT(*) FILTER (WHERE st = 'clicked'),
        'bounced', COUNT(*) FILTER (WHERE st = 'bounced'),
        'pending', COUNT(*) FILTER (WHERE st IN ('queued','sent')),
        'suppressed', COUNT(*) FILTER (WHERE st = 'suppressed'),
        'failed', COUNT(*) FILTER (WHERE st IN ('failed','complained'))
      ) FROM ev),
    'series', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.bucket), '[]'::json) FROM (
        SELECT date_trunc(_bucket, created_at AT TIME ZONE 'America/New_York')::date AS bucket,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE st IN ('delivered','opened','clicked')) AS delivered,
          COUNT(*) FILTER (WHERE st IN ('opened','clicked')) AS opened,
          COUNT(*) FILTER (WHERE st = 'bounced') AS bounced
        FROM ev GROUP BY 1
      ) t),
    'campaigns', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::json) FROM (
        SELECT c.id, c.name, c.started_at,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE ev.st IN ('delivered','opened','clicked')) AS delivered,
          COUNT(*) FILTER (WHERE ev.st IN ('opened','clicked')) AS opened,
          COUNT(*) FILTER (WHERE ev.st = 'clicked') AS clicked,
          COUNT(*) FILTER (WHERE ev.st = 'bounced') AS bounced
        FROM ev
        JOIN campaigns c ON c.id::text = ev.campaign_id
        WHERE c.organization_id = _org
        GROUP BY c.id, c.name, c.started_at
      ) t),
    'inbound', (SELECT json_build_object(
        'messages', (SELECT COUNT(*) FROM communications
          WHERE organization_id = _org AND direction = 'inbound' AND is_demo IS NOT TRUE
            AND sent_at >= p_from AND sent_at < p_to),
        'outcomes', (SELECT COALESCE(json_object_agg(COALESCE(outcome,'unknown'), cnt), '{}'::json) FROM (
          SELECT outcome, COUNT(*) AS cnt FROM inbound_emails
          WHERE organization_id = _org AND received_at >= p_from AND received_at < p_to
          GROUP BY 1) x)
      ))
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_email_campaigns(timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_email_campaigns(timestamptz, timestamptz, text) TO authenticated, service_role;

-- ── Support indexes for the details-JSONB aggregations ───────────────
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id
  ON public.email_events ((details->>'campaign_id'));
CREATE INDEX IF NOT EXISTS idx_email_events_status
  ON public.email_events ((details->>'status'));

-- ── Unit costs for the estimated-cost model (owner-editable, never hardcoded) ──
-- category CHECK only allows agents/lead_capture/scoring/communications/showings/
-- compliance/security → these are communication-channel costs.
INSERT INTO public.organization_settings (organization_id, category, key, value, description)
SELECT o.id, 'communications', 'resend_unit_cost', to_jsonb(0.0004::numeric),
  'Estimated cost per email sent via Resend (USD)'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_settings s
  WHERE s.organization_id = o.id AND s.key = 'resend_unit_cost');

INSERT INTO public.organization_settings (organization_id, category, key, value, description)
SELECT o.id, 'communications', 'twilio_sms_unit_cost', to_jsonb(0.0079::numeric),
  'Estimated cost per SMS segment via Twilio (USD)'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_settings s
  WHERE s.organization_id = o.id AND s.key = 'twilio_sms_unit_cost');
