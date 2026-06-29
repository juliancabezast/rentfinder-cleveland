-- C3 / log_score_change (security): these SECURITY DEFINER functions were EXECUTE-able by anon.
--   recalculate_lead_scores(): rewrote leads across ALL orgs and was anon-executable. Revoke anon
--     now (closes the unauthenticated hole). The authenticated grant stays until the repointed
--     frontend (LeadsList -> recalculate-scores edge fn) is deployed; then also revoke authenticated.
--   log_score_change(): only invoked by edge functions (service_role) — safe to revoke anon+authenticated.
-- Applied to production 2026-06-29 via Supabase Management API.

REVOKE EXECUTE ON FUNCTION public.recalculate_lead_scores() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_score_change(uuid, integer, text, text, text, uuid, uuid, uuid, text) FROM anon, authenticated;

-- TODO (post-frontend-deploy): REVOKE EXECUTE ON FUNCTION public.recalculate_lead_scores() FROM authenticated;
