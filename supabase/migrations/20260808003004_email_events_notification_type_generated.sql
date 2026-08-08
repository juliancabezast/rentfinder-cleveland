-- Same trick as campaign_key/status_key: the Flows view needs per-step send and
-- open counts, and grouping by details->>'notification_type' would detoast the
-- 361 MB of rendered HTML on every load. Lifted into an inline column instead.
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS notification_key text
    GENERATED ALWAYS AS ((details->>'notification_type')) STORED;

CREATE INDEX IF NOT EXISTS idx_email_events_notification_stats
  ON public.email_events (organization_id, notification_key, status_key, created_at)
  WHERE notification_key IS NOT NULL;

-- One row per automated step: how often it actually fired and how it landed.
-- Powers the numbers on the Flows map, so the diagram describes reality rather
-- than what the code claims should happen.
CREATE OR REPLACE FUNCTION public.report_flow_step_stats(
  p_org uuid,
  p_days int DEFAULT 60
)
RETURNS TABLE (
  step_key text,
  sent bigint,
  delivered bigint,
  opened bigint,
  last_sent_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ee.notification_key,
    count(*),
    count(*) FILTER (WHERE ee.status_key IN ('delivered','opened','clicked')),
    count(*) FILTER (WHERE ee.status_key IN ('opened','clicked')),
    max(ee.created_at)
  FROM email_events ee
  WHERE ee.organization_id = p_org
    AND ee.notification_key IS NOT NULL
    AND ee.campaign_key IS NULL          -- campaigns are their own tab
    AND ee.created_at >= now() - make_interval(days => p_days)
  GROUP BY ee.notification_key;
$function$;

REVOKE EXECUTE ON FUNCTION public.report_flow_step_stats(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_flow_step_stats(uuid, int) TO authenticated, service_role;
