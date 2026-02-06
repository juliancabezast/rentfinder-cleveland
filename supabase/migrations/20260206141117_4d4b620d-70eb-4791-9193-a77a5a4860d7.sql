
-- ============================================================
-- 1. USERS TABLE: Add restrictive deny_anon policies
-- ============================================================

-- Deny anonymous SELECT
CREATE POLICY "deny_anon_users_select"
ON public.users
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- Deny anonymous INSERT
CREATE POLICY "deny_anon_users_insert"
ON public.users
AS RESTRICTIVE
FOR INSERT
TO anon
WITH CHECK (false);

-- Deny anonymous UPDATE
CREATE POLICY "deny_anon_users_update"
ON public.users
AS RESTRICTIVE
FOR UPDATE
TO anon
USING (false);

-- Deny anonymous DELETE
CREATE POLICY "deny_anon_users_delete"
ON public.users
AS RESTRICTIVE
FOR DELETE
TO anon
USING (false);

-- ============================================================
-- 2. PROPERTY_PERFORMANCE VIEW: Enable security_invoker
--    so it inherits RLS from properties, leads, showings
-- ============================================================

ALTER VIEW public.property_performance SET (security_invoker = true);
