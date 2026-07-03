-- Median first-response time to leads (email), for the public Leasing Tracker.
-- Called ONLY by the leasing-tracker-lookup edge fn via service_role.
-- SECURITY INVOKER: service_role bypasses RLS by role attribute; no definer surface.

CREATE OR REPLACE FUNCTION public.leasing_tracker_response_stats(p_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH fr AS (
    SELECT EXTRACT(EPOCH FROM (MIN(e.created_at) - l.created_at)) / 60.0 AS minutes
    FROM leads l
    JOIN email_events e
      ON lower(e.recipient_email) = lower(l.email)
     AND e.organization_id = l.organization_id
     AND e.created_at >= l.created_at
    WHERE l.organization_id = p_organization_id
      AND COALESCE(l.is_demo, false) = false
      AND l.email IS NOT NULL
      AND l.created_at > now() - interval '120 days'
    GROUP BY l.id, l.created_at
  )
  SELECT jsonb_build_object(
    'responded_count', count(*),
    'median_minutes', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes))::numeric, 1),
    'pct_under_1h', round(100.0 * count(*) FILTER (WHERE minutes <= 60) / GREATEST(count(*), 1), 0)
  )
  FROM fr;
$$;

REVOKE EXECUTE ON FUNCTION public.leasing_tracker_response_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leasing_tracker_response_stats(uuid) TO service_role;

-- Supporting index for the recipient-email match (functional, used by the RPC join).
CREATE INDEX IF NOT EXISTS idx_email_events_recipient_lower
  ON public.email_events (lower(recipient_email), created_at);
