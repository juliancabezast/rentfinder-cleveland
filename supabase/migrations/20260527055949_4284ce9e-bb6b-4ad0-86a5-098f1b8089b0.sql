
-- 1. Service-role-only policies
DROP POLICY IF EXISTS "Service role full access campaign recipients" ON public.campaign_recipients;
CREATE POLICY "Service role full access campaign recipients" ON public.campaign_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access campaigns" ON public.campaigns;
CREATE POLICY "Service role full access campaigns" ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access predictions" ON public.conversion_predictions;
CREATE POLICY "Service role full access predictions" ON public.conversion_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access sync logs" ON public.doorloop_sync_log;
CREATE POLICY "Service role full access sync logs" ON public.doorloop_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access email events" ON public.email_events;
CREATE POLICY "Service role full access email events" ON public.email_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access reports" ON public.investor_reports;
CREATE POLICY "Service role full access reports" ON public.investor_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access transcript analyses" ON public.transcript_analyses;
CREATE POLICY "Service role full access transcript analyses" ON public.transcript_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access benchmarks" ON public.rent_benchmarks;
CREATE POLICY "Service role full access benchmarks" ON public.rent_benchmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Notifications: only service_role can insert
DROP POLICY IF EXISTS "Service role inserts notifications" ON public.notifications;
CREATE POLICY "Service role inserts notifications" ON public.notifications FOR INSERT TO service_role WITH CHECK (true);

-- 3. Job applicants: admins only for SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Applicants read own by email" ON public.job_applicants;
DROP POLICY IF EXISTS "Applicants update own" ON public.job_applicants;

CREATE POLICY "Admins can read job applicants" ON public.job_applicants
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

CREATE POLICY "Admins can update job applicants" ON public.job_applicants
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

CREATE POLICY "Admins can delete job applicants" ON public.job_applicants
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- 4. owner_leads: admins only (no org column on table)
DROP POLICY IF EXISTS "auth_all_leads" ON public.owner_leads;

CREATE POLICY "Admins can view owner leads" ON public.owner_leads
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

CREATE POLICY "Admins can update owner leads" ON public.owner_leads
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

CREATE POLICY "Admins can delete owner leads" ON public.owner_leads
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- 5. section8_requests: admins only
DROP POLICY IF EXISTS "auth_all_section8" ON public.section8_requests;

CREATE POLICY "Admins can view section8" ON public.section8_requests
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

CREATE POLICY "Admins can update section8" ON public.section8_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

CREATE POLICY "Admins can delete section8" ON public.section8_requests
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- 6. lead_notes / lead_field_changes: scope INSERT to org
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON public.lead_notes;
CREATE POLICY "Authenticated users can insert notes" ON public.lead_notes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert field changes" ON public.lead_field_changes;
CREATE POLICY "Authenticated users can insert field changes" ON public.lead_field_changes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- 7. Storage: restrict sensitive buckets to authenticated
DROP POLICY IF EXISTS "Allow uploads" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload documents" ON storage.objects;
CREATE POLICY "Authenticated can read documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Authenticated can upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Authenticated can read statements" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload statements" ON storage.objects;
CREATE POLICY "Authenticated can read statements" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'statements');
CREATE POLICY "Authenticated can upload statements" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'statements');

DROP POLICY IF EXISTS "Authenticated can read work order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload work order files" ON storage.objects;
CREATE POLICY "Authenticated can read work order files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'work-order-files');
CREATE POLICY "Authenticated can upload work order files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'work-order-files');

DROP POLICY IF EXISTS "Authenticated can read applicant files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload applicant files" ON storage.objects;
CREATE POLICY "Authenticated can read applicant files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'applicant-files');
CREATE POLICY "Authenticated can upload applicant files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'applicant-files');
