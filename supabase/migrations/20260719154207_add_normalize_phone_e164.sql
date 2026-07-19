-- Canonical US-default E.164 phone normalizer. Empty/garbage (no digits) -> NULL.
-- IMMUTABLE so it can back a functional index (used by the dedup trigger).
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) = 0 THEN NULL
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) = 10
      THEN '+1' || regexp_replace(p_phone, '\D', '', 'g')
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) = 11
         AND left(regexp_replace(p_phone, '\D', '', 'g'), 1) = '1'
      THEN '+' || regexp_replace(p_phone, '\D', '', 'g')
    ELSE '+' || regexp_replace(p_phone, '\D', '', 'g')
  END
$$;

REVOKE ALL ON FUNCTION public.normalize_phone_e164(text) FROM anon, authenticated;
