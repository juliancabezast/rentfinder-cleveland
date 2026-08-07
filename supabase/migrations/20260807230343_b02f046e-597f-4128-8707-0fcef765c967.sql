-- 1) is_active checks on org-scoped read policies
DROP POLICY IF EXISTS "Users can view org email events" ON public.email_events;
CREATE POLICY "Users can view org email events"
ON public.email_events FOR SELECT TO authenticated
USING (organization_id IN (
  SELECT u.organization_id FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND u.is_active = true
));

DROP POLICY IF EXISTS "Users can view org hemlane sync runs" ON public.hemlane_sync_runs;
CREATE POLICY "Users can view org hemlane sync runs"
ON public.hemlane_sync_runs FOR SELECT TO authenticated
USING (organization_id IN (
  SELECT u.organization_id FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND u.is_active = true
));

DROP POLICY IF EXISTS "org members read inbound emails" ON public.inbound_emails;
CREATE POLICY "org members read inbound emails"
ON public.inbound_emails FOR SELECT TO authenticated
USING (organization_id IN (
  SELECT u.organization_id FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND u.is_active = true
));

-- 2) Storage: verify real ownership via joins, not just folder-name matching
CREATE OR REPLACE FUNCTION public.tenant_doc_path_allowed(_bucket text, _name text, _user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  parts text[] := storage.foldername(_name);
  org_id uuid := public.get_user_organization_id(_user);
  ref uuid;
BEGIN
  IF org_id IS NULL OR array_length(parts, 1) IS NULL OR array_length(parts, 1) < 2 THEN
    RETURN false;
  END IF;
  IF parts[1] <> org_id::text THEN
    RETURN false;
  END IF;
  BEGIN
    ref := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF _bucket IN ('statements', 'documents') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = ref AND p.organization_id = org_id
    );
  ELSIF _bucket = 'work-order-files' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.work_orders w
      JOIN public.properties p ON p.id = w.property_id
      WHERE w.id = ref AND p.organization_id = org_id
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_doc_path_allowed(text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_doc_path_allowed(text, text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins/editors read tenant docs (org-scoped)" ON storage.objects;
DROP POLICY IF EXISTS "Admins/editors write tenant docs (org-scoped)" ON storage.objects;
DROP POLICY IF EXISTS "Admins/editors update tenant docs (org-scoped)" ON storage.objects;
DROP POLICY IF EXISTS "Admins/editors delete tenant docs (org-scoped)" ON storage.objects;

CREATE POLICY "Tenant docs read (ownership-verified)"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))
  AND public.tenant_doc_path_allowed(bucket_id, name, auth.uid())
);

CREATE POLICY "Tenant docs write (ownership-verified)"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))
  AND public.tenant_doc_path_allowed(bucket_id, name, auth.uid())
);

CREATE POLICY "Tenant docs update (ownership-verified)"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))
  AND public.tenant_doc_path_allowed(bucket_id, name, auth.uid())
)
WITH CHECK (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))
  AND public.tenant_doc_path_allowed(bucket_id, name, auth.uid())
);

CREATE POLICY "Tenant docs delete (ownership-verified)"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))
  AND public.tenant_doc_path_allowed(bucket_id, name, auth.uid())
);