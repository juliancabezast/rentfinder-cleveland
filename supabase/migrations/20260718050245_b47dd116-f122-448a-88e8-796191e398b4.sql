
-- 1. profiles: org-scope admin management
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles same org"
ON public.profiles
FOR ALL
TO authenticated
USING (
  is_super_admin((SELECT auth.uid()))
  OR (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    AND get_user_organization_id(profiles.id) = get_user_organization_id((SELECT auth.uid()))
    AND get_user_organization_id((SELECT auth.uid())) IS NOT NULL
  )
)
WITH CHECK (
  is_super_admin((SELECT auth.uid()))
  OR (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    AND get_user_organization_id(profiles.id) = get_user_organization_id((SELECT auth.uid()))
    AND get_user_organization_id((SELECT auth.uid())) IS NOT NULL
  )
);

-- 2. properties: drop legacy dual-role, unscoped policy (covered by merged_all_authenticated)
DROP POLICY IF EXISTS "Admins full access properties" ON public.properties;

-- 3. utilities: drop legacy unscoped staff policy (covered by "Staff org-scoped access utilities")
DROP POLICY IF EXISTS staff_all_utilities ON public.utilities;
