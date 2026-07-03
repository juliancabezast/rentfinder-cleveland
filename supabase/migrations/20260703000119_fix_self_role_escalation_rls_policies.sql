-- Close self privilege-escalation at the RLS POLICY level (users + profiles).
-- Runtime triggers already enforced this; this adds the policy-level guard so
-- static scanners (Lovable publish gate) pass. Applied to prod 2026-07-02 via
-- Management API; recorded here for repo parity. User-authorized.

CREATE OR REPLACE FUNCTION public.get_current_profile_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
REVOKE EXECUTE ON FUNCTION public.get_current_profile_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_current_profile_role() TO authenticated;

DROP POLICY IF EXISTS "merged_update_public" ON public.users;
CREATE POLICY "merged_update_public" ON public.users
  FOR UPDATE TO public
  USING (((select auth.uid()) = auth_user_id)
         OR ((organization_id = get_user_org_id()) AND is_admin()))
  WITH CHECK (
    (((select auth.uid()) = auth_user_id)
       AND role IS NOT DISTINCT FROM get_user_role()
       AND organization_id IS NOT DISTINCT FROM get_user_org_id())
    OR ((organization_id = get_user_org_id()) AND is_admin())
  );

DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO public
  USING (has_role((select auth.uid()), 'admin'::app_role) OR is_super_admin((select auth.uid())))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role) OR is_super_admin((select auth.uid())));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO public
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid())
              AND role IS NOT DISTINCT FROM public.get_current_profile_role());
