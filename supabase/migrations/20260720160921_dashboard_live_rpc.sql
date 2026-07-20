-- dashboard_live(): single round-trip for the redesigned live dashboard.
-- Merged KPIs (leads / showings / portfolio / comms) + next showings, org from
-- auth.uid(). Polled ~10s; realtime layer drives the +N animations on top.
CREATE OR REPLACE FUNCTION public.dashboard_live()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _day timestamptz;
  _week timestamptz;
  _prev_week timestamptz;
  _res json;
BEGIN
  SELECT organization_id INTO _org
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  _day := (date_trunc('day', now() AT TIME ZONE 'America/New_York'))::timestamp AT TIME ZONE 'America/New_York';
  _week := (date_trunc('week', now() AT TIME ZONE 'America/New_York'))::timestamp AT TIME ZONE 'America/New_York';
  _prev_week := _week - interval '7 days';

  SELECT json_build_object(
    'generated_at', now(),
    'leads', (SELECT json_build_object(
        'total', COUNT(*),
        'hot', COUNT(*) FILTER (WHERE is_priority),
        'applicants', COUNT(*) FILTER (WHERE status = 'in_application'),
        'this_week', COUNT(*) FILTER (WHERE created_at >= _week),
        'prev_week', COUNT(*) FILTER (WHERE created_at >= _prev_week AND created_at < _week),
        'created_today', COUNT(*) FILTER (WHERE created_at >= _day),
        'created_24h', COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')
      ) FROM leads WHERE organization_id = _org AND is_demo IS NOT TRUE),
    'showings', (SELECT json_build_object(
        'total', COUNT(*) FILTER (WHERE status NOT IN ('cancelled','no_show','rescheduled')),
        'today', COUNT(*) FILTER (WHERE status NOT IN ('cancelled','no_show','rescheduled')
                   AND scheduled_at >= _day AND scheduled_at < _day + interval '1 day'),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'no_show', COUNT(*) FILTER (WHERE status = 'no_show'),
        'upcoming', COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed') AND scheduled_at >= now()),
        'applicants', 0,  -- set below from leads (kept in showings card per owner)
        'show_up_rate', CASE WHEN COUNT(*) FILTER (WHERE status IN ('completed','no_show')) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric
               / COUNT(*) FILTER (WHERE status IN ('completed','no_show')) * 100, 1)
          ELSE NULL END
      ) FROM showings WHERE organization_id = _org AND is_demo IS NOT TRUE),
    'portfolio', (SELECT json_build_object(
        'total_doors', COUNT(*),
        'properties', COUNT(DISTINCT (address, city, zip_code)),
        'available', COUNT(*) FILTER (WHERE status = 'available'),
        'coming_soon', COUNT(*) FILTER (WHERE status = 'coming_soon'),
        'in_leasing', COUNT(*) FILTER (WHERE status = 'in_leasing_process'),
        'rented', COUNT(*) FILTER (WHERE status = 'rented'),
        'active', COUNT(*) FILTER (WHERE status <> 'inactive'),
        'occupancy_pct', CASE WHEN COUNT(*) FILTER (WHERE status <> 'inactive') > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'rented')::numeric
               / COUNT(*) FILTER (WHERE status <> 'inactive') * 100)
          ELSE 0 END
      ) FROM properties WHERE organization_id = _org),
    'comms', json_build_object(
        'emails_sent_24h', (SELECT COUNT(*) FROM email_events
          WHERE organization_id = _org AND details->>'status' IN ('sent','delivered','opened','clicked')
            AND created_at >= now() - interval '24 hours'),
        'emails_sent_total', (SELECT COUNT(*) FROM email_events
          WHERE organization_id = _org AND details->>'status' IN ('sent','delivered','opened','clicked')),
        'inbound_24h', (SELECT COUNT(*) FROM inbound_emails
          WHERE organization_id = _org AND received_at >= now() - interval '24 hours'),
        'queue_pending', (SELECT COUNT(*) FROM agent_tasks
          WHERE organization_id = _org AND status = 'pending'),
        'queue_overdue', (SELECT COUNT(*) FROM agent_tasks
          WHERE organization_id = _org AND status = 'pending' AND scheduled_for < now() - interval '12 hours')
      ),
    'next_showings', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.scheduled_at), '[]'::json) FROM (
        SELECT s.id, s.scheduled_at, s.status, s.duration_minutes,
          p.address AS property_address, p.city AS property_city, p.unit_number,
          l.full_name AS lead_name, l.phone AS lead_phone
        FROM showings s
        LEFT JOIN properties p ON p.id = s.property_id
        LEFT JOIN leads l ON l.id = s.lead_id
        WHERE s.organization_id = _org AND s.is_demo IS NOT TRUE
          AND s.status IN ('scheduled','confirmed')
          AND s.scheduled_at >= now() - interval '1 hour'
        ORDER BY s.scheduled_at ASC
        LIMIT 6
      ) t)
  ) INTO _res;

  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_live() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_live() TO authenticated, service_role;

-- Showings realtime — low-volume table (~136 rows); lets the Next Showings
-- widget update promptly between polls.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.showings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
