-- Everything the Campaigns list needs, for every campaign, in ONE call.
-- Replaces the per-campaign loop in CampaignsPage.tsx that downloaded the raw
-- email_events rows (HTML and all) into the browser and never resolved.
--
-- Two showing attributions, deliberately kept apart and never summed:
--   * by_link   — exact: book-public-showing recorded the campaign at booking
--                 time from the ?cid= link. Zero for campaigns queued by SQL,
--                 whose links carried no cid.
--   * by_window — a recipient booked within p_window_days of their send.
--                 Works for every campaign, but it is correlation, not proof.
CREATE OR REPLACE FUNCTION public.report_campaign_stats_all(p_org uuid, p_window_days integer DEFAULT 7)
 RETURNS TABLE(campaign_id uuid, sent bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint, failed bigint, pending bigint, showings_by_link bigint, showings_by_window bigint, bookers_by_window bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ev AS (
    -- campaign_key / status_key are generated columns: reading them never
    -- detoasts the rendered HTML sitting in details (3.4s -> 56ms).
    SELECT ee.campaign_key, ee.status_key, ee.lead_id, ee.created_at
    FROM email_events ee
    WHERE ee.organization_id = p_org
      AND ee.campaign_key IS NOT NULL
  ),
  agg AS (
    SELECT
      campaign_key AS k,
      count(*) AS sent,
      count(*) FILTER (WHERE status_key IN ('delivered','opened','clicked')) AS delivered,
      count(*) FILTER (WHERE status_key IN ('opened','clicked')) AS opened,
      count(*) FILTER (WHERE status_key = 'clicked') AS clicked,
      count(*) FILTER (WHERE status_key = 'bounced') AS bounced,
      count(*) FILTER (WHERE status_key IN ('failed','complained','suppressed')) AS failed,
      count(*) FILTER (WHERE status_key IS NULL OR status_key IN ('queued','processing')) AS pending
    FROM ev GROUP BY campaign_key
  ),
  first_send AS (
    SELECT campaign_key AS k, lead_id, min(created_at) AS sent_at
    FROM ev WHERE lead_id IS NOT NULL GROUP BY campaign_key, lead_id
  ),
  win AS (
    SELECT fs.k,
           count(DISTINCT s.id) AS showings,
           count(DISTINCT s.lead_id) AS bookers
    FROM first_send fs
    JOIN showings s
      ON s.lead_id = fs.lead_id
     AND s.organization_id = p_org
     AND s.created_at >= fs.sent_at
     AND s.created_at < fs.sent_at + make_interval(days => p_window_days)
    GROUP BY fs.k
  ),
  lnk AS (
    SELECT sl.details->>'campaign_id' AS k, count(*) AS showings
    FROM system_logs sl
    WHERE sl.organization_id = p_org
      AND sl.event_type = 'public_showing_booked'
      AND sl.details->>'campaign_id' IS NOT NULL
    GROUP BY 1
  )
  SELECT
    c.id,
    COALESCE(agg.sent, 0),
    COALESCE(agg.delivered, 0),
    COALESCE(agg.opened, 0),
    COALESCE(agg.clicked, 0),
    COALESCE(agg.bounced, 0),
    COALESCE(agg.failed, 0),
    COALESCE(agg.pending, 0),
    COALESCE(lnk.showings, 0),
    COALESCE(win.showings, 0),
    COALESCE(win.bookers, 0)
  FROM campaigns c
  LEFT JOIN agg ON agg.k = c.id::text
  LEFT JOIN win ON win.k = c.id::text
  LEFT JOIN lnk ON lnk.k = c.id::text
  WHERE c.organization_id = p_org;
$function$
;

REVOKE EXECUTE ON FUNCTION public.report_campaign_stats_all(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_campaign_stats_all(uuid, int) TO authenticated, service_role;
