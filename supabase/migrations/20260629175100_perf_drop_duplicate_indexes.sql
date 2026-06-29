-- Phase 7 (performance): drop plain indexes that exactly duplicate a UNIQUE-constraint index on
-- the same column(s) (Supabase advisor: duplicate_index). The unique constraint's index serves
-- those lookups. Constraint-vs-constraint duplicate pairs (campaign_leads, campaign_recipients,
-- showing_available_slots) are intentionally NOT touched to avoid dropping a needed UNIQUE.
-- Applied to production 2026-06-29 via Supabase Management API.
DROP INDEX IF EXISTS public.idx_predictions_lead;
DROP INDEX IF EXISTS public.idx_org_credentials_org;
DROP INDEX IF EXISTS public.idx_organizations_slug;
DROP INDEX IF EXISTS public.idx_referrals_code;
DROP INDEX IF EXISTS public.idx_team_permissions_user;
DROP INDEX IF EXISTS public.idx_users_auth_id;
DROP INDEX IF EXISTS public.idx_transcript_property;
