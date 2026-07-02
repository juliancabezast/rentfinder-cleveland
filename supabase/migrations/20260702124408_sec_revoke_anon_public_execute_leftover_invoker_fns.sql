-- Saneamiento cierre (2026-07-02): revoke leftover anon/PUBLIC EXECUTE on 7 SECURITY INVOKER functions
-- so that "only RLS-helper functions remain anon-executable" becomes literally true.
--
-- Context: the 2026-06-30 SECURITY DEFINER anon-lockdown (20260630011256) reduced anon-executable
-- SECURITY DEFINER functions to the 12 required RLS helpers. But 7 SECURITY INVOKER functions were
-- still anon-executable via a leftover default PUBLIC grant (=X/postgres) plus an explicit anon grant.
-- Each fn had BOTH grants, so `REVOKE ... FROM anon` alone would leave anon able to execute via PUBLIC;
-- we revoke FROM PUBLIC, anon on all 7.
--
-- Safe: the 5 trigger functions are only ever invoked by triggers (Postgres does NOT check EXECUTE
-- privilege on trigger firing); the 2 email-queue RPCs are called exclusively by the process-email-queue
-- edge function via the service_role key (which keeps its own explicit grant). authenticated grants are
-- left intact. Verified post-apply: anon-executable public functions = exactly the 12 SECURITY DEFINER
-- RLS helpers; service_role/authenticated retain EXECUTE on all 7.

-- Email-queue RPCs (called only by process-email-queue via service_role)
REVOKE EXECUTE ON FUNCTION public.claim_queued_emails(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unstick_processing_emails()        FROM PUBLIC, anon;

-- Trigger functions (never called directly; triggers ignore EXECUTE privilege)
REVOKE EXECUTE ON FUNCTION public.auto_task_welcome()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.capitalize_lead_name()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_slot_booking_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.track_lead_field_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
