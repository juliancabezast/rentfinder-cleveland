-- Review follow-ups for the RFC bot reform:
-- 1) report_emails_sent — the queue path (default for ALL frontend emails) never
--    writes an event_type='sent' row; it flips details.status on the original
--    'delivery_delayed' row. Counting only event_type='sent' undercounts ~99%.
-- 2) report_source_breakdown — source rollup in the DB (PostgREST caps raw
--    selects at 1000 rows; a JS fold silently truncates on blast days).
-- 3) leads.converted_at — real conversion timestamp. status='converted' +
--    updated_at-window counting re-counts old conversions on any later touch.

CREATE OR REPLACE FUNCTION public.report_emails_sent(p_org uuid, p_since timestamptz, p_until timestamptz)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)
  FROM email_events
  WHERE organization_id = p_org
    AND (
      (event_type = 'sent' AND created_at >= p_since AND created_at < p_until)
      OR (
        event_type = 'delivery_delayed'
        AND details->>'status' = 'sent'
        -- Date by the actual send moment when recorded; guard the cast so one
        -- malformed row can't break every report.
        AND (CASE WHEN details->>'sent_at' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (details->>'sent_at')::timestamptz ELSE created_at END) >= p_since
        AND (CASE WHEN details->>'sent_at' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (details->>'sent_at')::timestamptz ELSE created_at END) < p_until
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.report_source_breakdown(p_org uuid, p_since timestamptz, p_until timestamptz, p_limit int DEFAULT 6)
RETURNS TABLE(source text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(source, 'otro') AS source, count(*) AS cnt
  FROM leads
  WHERE organization_id = p_org
    AND COALESCE(is_demo, false) = false
    AND created_at >= p_since AND created_at < p_until
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT GREATEST(p_limit, 1)
$$;

REVOKE ALL ON FUNCTION public.report_emails_sent(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_source_breakdown(uuid, timestamptz, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_emails_sent(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_source_breakdown(uuid, timestamptz, timestamptz, int) TO service_role;

-- Real conversion timestamp.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_lead_converted_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'converted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'converted') THEN
    NEW.converted_at := COALESCE(NEW.converted_at, now());
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_set_lead_converted_at ON public.leads;
CREATE TRIGGER trg_set_lead_converted_at
  BEFORE INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_converted_at();

-- Backfill existing converted leads (best available approximation).
UPDATE public.leads SET converted_at = updated_at
WHERE status = 'converted' AND converted_at IS NULL;
