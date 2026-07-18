-- =====================================================================
-- lead_reminders (2026-07-18)
-- Applied to remote via MCP apply_migration (name lead_reminders_table).
-- Kept here for repo <-> DB parity.
--
-- Next-day (or any-time) follow-up reminders that re-surface a lead as a Hot
-- Leads card. Written by the Telegram "quiere seguimiento" action; dispatched by
-- the showing-reminder cron (job 38, every 5 min). Service-role only.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lead_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE public.lead_reminders ENABLE ROW LEVEL SECURITY;  -- no policies → service-role only
CREATE INDEX IF NOT EXISTS lead_reminders_due_idx  ON public.lead_reminders (status, due_at);
CREATE INDEX IF NOT EXISTS lead_reminders_lead_idx ON public.lead_reminders (lead_id);
