-- Trigger functions never need an EXECUTE grant: the trigger fires as the
-- table owner regardless. Leaving them callable over /rest/v1/rpc just hands
-- anon and authenticated a SECURITY DEFINER entry point for free — the exact
-- class the Lovable security scan blocks a publish on.
--
-- These three were created after the 2026-06-30 revoke pass, so they were
-- never covered by it. update_lead_status_on_showing (same table, same shape)
-- is already anon=false / authenticated=false — this brings them into line.
ALTER FUNCTION public.enforce_showing_half_hour() SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.enforce_showing_agent_slot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_showing_daily_cap()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_showing_half_hour()  FROM PUBLIC, anon, authenticated;
