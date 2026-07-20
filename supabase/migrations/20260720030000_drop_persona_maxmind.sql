-- Persona + MaxMind fully retired (owner decision 2026-07-20): the services are
-- not used anywhere anymore. verify-identity + persona-webhook edge functions
-- deleted; all UI/health-check/test references purged.

ALTER TABLE public.organization_credentials
  DROP COLUMN IF EXISTS persona_api_key,
  DROP COLUMN IF EXISTS maxmind_account_id,
  DROP COLUMN IF EXISTS maxmind_license_key;

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS persona_verification_id;
