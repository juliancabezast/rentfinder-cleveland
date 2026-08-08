-- Superseded by 20260808001419 (generated columns). Kept for history: a plain
-- expression index on (details->>'campaign_id', details->>'status') did NOT
-- fix the 3.4s aggregate — the planner still hit the heap for the projection
-- and detoasted the 361 MB of email HTML, taking it to 7.2s.
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_stats
  ON public.email_events (
    organization_id,
    ((details->>'campaign_id')),
    ((details->>'status')),
    lead_id,
    created_at
  )
  WHERE details->>'campaign_id' IS NOT NULL;
