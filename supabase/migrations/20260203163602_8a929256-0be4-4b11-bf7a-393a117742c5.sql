-- =====================================================
-- FIX 1: Secure pause_lead_agent_tasks function
-- Add comprehensive authorization checks
-- =====================================================

CREATE OR REPLACE FUNCTION public.pause_lead_agent_tasks(
  _lead_id UUID,
  _user_id UUID,
  _reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _paused_count INTEGER := 0;
  _org_id UUID;
  _caller_org_id UUID;
  _caller_role app_role;
  _caller_user_id UUID;
BEGIN
  -- Get caller info from auth context
  SELECT id, organization_id, role 
  INTO _caller_user_id, _caller_org_id, _caller_role
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
  
  -- Verify caller is authenticated
  IF _caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User not found or not active';
  END IF;
  
  -- Verify _user_id matches caller (prevent impersonation)
  IF _user_id != _caller_user_id THEN
    RAISE EXCEPTION 'Permission denied: Cannot act as another user';
  END IF;
  
  -- Validate caller role - only certain roles can pause tasks
  IF _caller_role NOT IN ('admin', 'editor', 'leasing_agent', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied: Insufficient privileges to pause lead tasks';
  END IF;
  
  -- Get lead's organization
  SELECT organization_id INTO _org_id
  FROM public.leads
  WHERE id = _lead_id;
  
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', _lead_id;
  END IF;
  
  -- Verify same organization (unless super_admin)
  IF _caller_role != 'super_admin' AND _caller_org_id != _org_id THEN
    RAISE EXCEPTION 'Permission denied: Cross-organization access not allowed';
  END IF;
  
  -- For leasing agents, verify lead is assigned to them
  IF _caller_role = 'leasing_agent' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = _lead_id
      AND assigned_leasing_agent_id = _caller_user_id
    ) THEN
      RAISE EXCEPTION 'Permission denied: Lead not assigned to you';
    END IF;
  END IF;
  
  -- Pause all pending/in-progress tasks for this lead
  UPDATE public.agent_tasks
  SET 
    status = 'paused_human_control',
    paused_by = _user_id,
    paused_at = NOW(),
    pause_reason = _reason
  WHERE lead_id = _lead_id
    AND status IN ('pending', 'in_progress')
    AND organization_id = _org_id;
  
  GET DIAGNOSTICS _paused_count = ROW_COUNT;
  
  -- Update lead to mark as human controlled
  UPDATE public.leads
  SET 
    is_human_controlled = true,
    human_controlled_by = _user_id,
    human_controlled_at = NOW(),
    human_control_reason = _reason,
    updated_at = NOW()
  WHERE id = _lead_id
    AND organization_id = _org_id;
  
  RETURN _paused_count;
END;
$$;

-- =====================================================
-- FIX 2: Secure property-photos storage bucket
-- Make bucket private and add organization-scoped policies
-- =====================================================

-- Step 1: Make the bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'property-photos';

-- Step 2: Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Public read access for property photos" ON storage.objects;

-- Step 3: Create organization-scoped read policy for authenticated users
CREATE POLICY "Authenticated users view own org photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (
    -- Check if it's an org logo: {orgId}/logo.*
    (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    OR
    -- Check if it's a property photo: properties/{propertyId}/*
    (
      name LIKE 'properties/%'
      AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
      )
    )
    OR
    -- Super admins can view all
    public.is_super_admin(auth.uid())
  )
);

-- Step 4: Create public read policy for anonymous users (only active listings)
CREATE POLICY "Public view active property photos"
ON storage.objects FOR SELECT TO anon
USING (
  bucket_id = 'property-photos'
  AND name LIKE 'properties/%'
  AND EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id::text = (storage.foldername(name))[2]
    AND p.status IN ('available', 'coming_soon')
  )
);

-- Step 5: Drop and recreate write policies with organization validation
DROP POLICY IF EXISTS "Authorized users can upload property photos" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can update property photos" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can delete property photos" ON storage.objects;

-- INSERT policy with organization validation
CREATE POLICY "Authorized users upload org photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-photos'
  AND public.can_manage_property_photos(auth.uid())
  AND (
    -- Org logo: {orgId}/logo.*
    (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    OR
    -- Property in same org: properties/{propertyId}/*
    (
      name LIKE 'properties/%'
      AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
      )
    )
    OR public.is_super_admin(auth.uid())
  )
);

-- UPDATE policy with organization validation
CREATE POLICY "Authorized users manage org photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.can_manage_property_photos(auth.uid())
  AND (
    (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    OR (
      name LIKE 'properties/%'
      AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
      )
    )
    OR public.is_super_admin(auth.uid())
  )
);

-- DELETE policy with organization validation
CREATE POLICY "Authorized users delete org photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.can_manage_property_photos(auth.uid())
  AND (
    (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
    OR (
      name LIKE 'properties/%'
      AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[2]
        AND p.organization_id = public.get_user_organization_id(auth.uid())
      )
    )
    OR public.is_super_admin(auth.uid())
  )
);