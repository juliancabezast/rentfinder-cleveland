-- First, update the check constraint to include 'security' category
ALTER TABLE public.organization_settings 
DROP CONSTRAINT organization_settings_category_check;

ALTER TABLE public.organization_settings 
ADD CONSTRAINT organization_settings_category_check 
CHECK (category = ANY (ARRAY['agents'::text, 'lead_capture'::text, 'scoring'::text, 'communications'::text, 'showings'::text, 'compliance'::text, 'security'::text]));

-- Add setting for photo upload permissions to all organizations
INSERT INTO public.organization_settings (organization_id, key, value, category, description)
SELECT 
  id,
  'photo_upload_restricted',
  'false'::jsonb,
  'security',
  'When true, only admins can upload property photos. When false, editors can also upload.'
FROM public.organizations
ON CONFLICT (organization_id, key) DO NOTHING;

-- Create function to check if user can manage photos
CREATE OR REPLACE FUNCTION public.can_manage_property_photos(_auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_role app_role;
  _org_id UUID;
  _is_restricted BOOLEAN;
BEGIN
  -- Get user info
  SELECT role, organization_id INTO _user_role, _org_id
  FROM public.users
  WHERE auth_user_id = _auth_user_id AND is_active = true
  LIMIT 1;
  
  -- Super admin can always manage
  IF _user_role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  -- Admin can always manage
  IF _user_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Check if photo uploads are restricted to admins only
  SELECT COALESCE((value)::boolean, false) INTO _is_restricted
  FROM public.organization_settings
  WHERE organization_id = _org_id AND key = 'photo_upload_restricted';
  
  -- If restricted, only admins (already returned true above)
  IF _is_restricted THEN
    RETURN false;
  END IF;
  
  -- If not restricted, editors can manage
  IF _user_role = 'editor' THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload property photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update property photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete property photos" ON storage.objects;

-- New restrictive policies
CREATE POLICY "Authorized users can upload property photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-photos'
  AND public.can_manage_property_photos(auth.uid())
);

CREATE POLICY "Authorized users can update property photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.can_manage_property_photos(auth.uid())
);

CREATE POLICY "Authorized users can delete property photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.can_manage_property_photos(auth.uid())
);