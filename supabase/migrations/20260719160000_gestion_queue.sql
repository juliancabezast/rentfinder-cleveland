-- Gestión queue (Funnel bot v2):
-- 1) leads.managed_at — "a human worked this lead" marker. last_contact_at is
--    polluted (automated sends, inbound events, dedup trigger) and human
--    outcome taps never wrote it; the queue needs a clean signal.
-- 2) lead_reminders.attempt — call-retry counter ("no contestó" ×3 → ask lost).

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS managed_at timestamptz;

ALTER TABLE public.lead_reminders ADD COLUMN IF NOT EXISTS attempt int NOT NULL DEFAULT 0;

-- Queue head lookup: recent unmanaged complete leads.
CREATE INDEX IF NOT EXISTS idx_leads_queue
  ON public.leads (organization_id, created_at)
  WHERE managed_at IS NULL AND status = 'new';
