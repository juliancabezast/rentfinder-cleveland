-- "Requests" board: track application requests + Kanban stage on the lead itself
-- (applicants stay inside leads; the board reads these two columns). The admin
-- "Send Application" email is replaced by this in-app board (send-application-invite
-- now stamps request_stage='pending' instead of emailing). Applied via MCP 2026-07-20.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS application_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_stage text;

UPDATE public.leads
SET application_requested_at = COALESCE(application_requested_at, updated_at, created_at),
    request_stage = COALESCE(request_stage, 'sent')
WHERE status = 'in_application' AND application_requested_at IS NULL
  AND is_demo IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_leads_application_requested
  ON public.leads (organization_id, request_stage)
  WHERE application_requested_at IS NOT NULL;
