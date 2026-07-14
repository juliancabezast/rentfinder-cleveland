
-- ===========================================================================
-- 1) organization_credentials: revoke all client access
-- ===========================================================================

-- Drop client-facing RLS policies (service_role bypasses RLS regardless)
DROP POLICY IF EXISTS "Admins can view org credentials" ON public.organization_credentials;
DROP POLICY IF EXISTS "Admins can update org credentials" ON public.organization_credentials;
DROP POLICY IF EXISTS "only_admins_access_credentials" ON public.organization_credentials;

-- Explicit deny policy for authenticated + anon (defense in depth on top of REVOKE)
CREATE POLICY "deny_all_client_access"
  ON public.organization_credentials
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Revoke Data-API access
REVOKE ALL ON public.organization_credentials FROM anon;
REVOKE ALL ON public.organization_credentials FROM authenticated;
GRANT  ALL ON public.organization_credentials TO service_role;

-- ===========================================================================
-- 2) Drop dual-role (profiles.role) policies. Users-role policies remain in place.
-- ===========================================================================

-- academy_courses — keep "Anyone reads published courses" (SELECT public)
DROP POLICY IF EXISTS "Admins full access academy_courses" ON public.academy_courses;
CREATE POLICY "Admins manage academy_courses"
  ON public.academy_courses
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- academy_lessons
DROP POLICY IF EXISTS "Admins full access academy_lessons" ON public.academy_lessons;
CREATE POLICY "Admins manage academy_lessons"
  ON public.academy_lessons
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- applicant_notes
DROP POLICY IF EXISTS "Admins full access applicant_notes" ON public.applicant_notes;
CREATE POLICY "Admins manage applicant_notes"
  ON public.applicant_notes
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- job_positions — keep "Anyone reads active positions"
DROP POLICY IF EXISTS "Admins full access job_positions" ON public.job_positions;
CREATE POLICY "Admins manage job_positions"
  ON public.job_positions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- job_applicants — drop the profiles-based duplicate; users-based policies already exist
DROP POLICY IF EXISTS "Admins full access job_applicants" ON public.job_applicants;

-- owner_leads — drop the profiles-based duplicate if present
DROP POLICY IF EXISTS "Admins full access owner_leads" ON public.owner_leads;
