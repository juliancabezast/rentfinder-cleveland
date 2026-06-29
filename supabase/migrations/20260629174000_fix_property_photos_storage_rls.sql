-- Phase 5 (security/functionality): broaden property-photos storage write policies so org
-- members (admins/editors), not just super_admins, can upload photos for:
--   (a) existing properties  -> properties/{property_id}/...   (already worked)
--   (b) property GROUP covers -> groups/{group_id}/...          (policy checked properties, not property_groups -> failed)
--   (c) NEW properties (temp) -> properties/temp/{org_id}/...   (companion code change in PhotoUpload.tsx adds the org_id segment)
-- One policy per action (INSERT/UPDATE/DELETE). Public read unchanged.
-- Applied to production 2026-06-29 via Supabase Management API.

DROP POLICY IF EXISTS "Org members upload property photos" ON storage.objects;
CREATE POLICY "Org members upload property photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos' AND (
      is_super_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.properties p WHERE p.id::text = (storage.foldername(name))[2] AND p.organization_id = get_user_organization_id(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.property_groups g WHERE (storage.foldername(name))[1] = 'groups' AND g.id::text = (storage.foldername(name))[2] AND g.organization_id = get_user_organization_id(auth.uid()))
      OR ((storage.foldername(name))[1] = 'properties' AND (storage.foldername(name))[2] = 'temp' AND (storage.foldername(name))[3] = (get_user_organization_id(auth.uid()))::text)
    )
  );

DROP POLICY IF EXISTS "Org members update property photos" ON storage.objects;
CREATE POLICY "Org members update property photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-photos' AND (
      is_super_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.properties p WHERE p.id::text = (storage.foldername(name))[2] AND p.organization_id = get_user_organization_id(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.property_groups g WHERE (storage.foldername(name))[1] = 'groups' AND g.id::text = (storage.foldername(name))[2] AND g.organization_id = get_user_organization_id(auth.uid()))
      OR ((storage.foldername(name))[1] = 'properties' AND (storage.foldername(name))[2] = 'temp' AND (storage.foldername(name))[3] = (get_user_organization_id(auth.uid()))::text)
    )
  );

DROP POLICY IF EXISTS "Org members delete property photos" ON storage.objects;
CREATE POLICY "Org members delete property photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos' AND (
      is_super_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.properties p WHERE p.id::text = (storage.foldername(name))[2] AND p.organization_id = get_user_organization_id(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.property_groups g WHERE (storage.foldername(name))[1] = 'groups' AND g.id::text = (storage.foldername(name))[2] AND g.organization_id = get_user_organization_id(auth.uid()))
      OR ((storage.foldername(name))[1] = 'properties' AND (storage.foldername(name))[2] = 'temp' AND (storage.foldername(name))[3] = (get_user_organization_id(auth.uid()))::text)
    )
  );
