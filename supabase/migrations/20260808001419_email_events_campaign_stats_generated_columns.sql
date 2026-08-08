-- The Campaigns page rendered 0 everywhere because it pulled the whole
-- `details` JSONB — which carries the fully rendered email HTML — for all 29
-- campaigns serially: ~300 MB into the browser every 30s, so the stats promise
-- never resolved.
--
-- Aggregating server-side is the fix, but it was still 3.4s: `details` is 361 MB
-- of HTML across 56k rows, so extracting two keys detoasts every row (815k
-- buffer hits). A plain expression index did not help — the planner still went
-- to the heap for the projection, making it 7.2s.
--
-- These generated columns lift the two keys into small inline heap values, so
-- the aggregates never detoast the HTML at all. The HTML stays exactly where it
-- is: EmailsPage.tsx:1021 renders it as the "what we sent" preview, and
-- process-email-queue reads it to send queued rows. Nothing is deleted.
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS campaign_key text
    GENERATED ALWAYS AS ((details->>'campaign_id')) STORED,
  ADD COLUMN IF NOT EXISTS status_key text
    GENERATED ALWAYS AS ((details->>'status')) STORED;

DROP INDEX IF EXISTS public.idx_email_events_campaign_stats;

CREATE INDEX IF NOT EXISTS idx_email_events_campaign_stats
  ON public.email_events (organization_id, campaign_key, status_key, lead_id, created_at)
  WHERE campaign_key IS NOT NULL;
