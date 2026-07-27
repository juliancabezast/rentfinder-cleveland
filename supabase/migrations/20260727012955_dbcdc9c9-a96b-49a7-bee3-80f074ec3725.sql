-- Replace cross-tenant storage policies on tenant docs with org-scoped ones.
-- New path convention: <organization_id>/<...>
DROP POLICY IF EXISTS "Admins/editors read tenant docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins/editors write tenant docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins/editors update tenant docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins/editors delete tenant docs" ON storage.objects;

CREATE POLICY "Admins/editors read tenant docs (org-scoped)"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (is_super_admin(auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text
);

CREATE POLICY "Admins/editors write tenant docs (org-scoped)"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (is_super_admin(auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text
);

CREATE POLICY "Admins/editors update tenant docs (org-scoped)"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (is_super_admin(auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text
)
WITH CHECK (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (is_super_admin(auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text
);

CREATE POLICY "Admins/editors delete tenant docs (org-scoped)"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['statements','documents','work-order-files'])
  AND (is_super_admin(auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'editor'))
  AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text
);

-- Also drop the legacy over-permissive work-order-files bucket policies
DROP POLICY IF EXISTS "Authenticated can read work order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload work order files" ON storage.objects;