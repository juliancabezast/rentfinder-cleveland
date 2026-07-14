-- =====================================================================
-- Fix the 3 Lovable publish-gate security findings (2026-07-14)
-- Applied to remote via MCP apply_migration (version 20260714205525).
-- Kept here for repo <-> DB parity.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FINDING 1 (CRITICAL / ERROR: security_definer_view)
-- public.property_performance lost its security_invoker flag when a later
-- CREATE OR REPLACE VIEW reset its reloptions (live reloptions = null).
-- Restore security_invoker so the view enforces the *querying user's* RLS
-- on the base tables (properties/leads/showings/lead_property_interests)
-- instead of the view owner's. Both consumers are authenticated admin
-- pages, so org-scoped RLS returns the correct rows.
-- ---------------------------------------------------------------------
ALTER VIEW public.property_performance SET (security_invoker = on);

-- ---------------------------------------------------------------------
-- FINDING 2 (WARN: inconsistent user-identifier joins in RLS)
-- These policies compare users.id (internal PK) to auth.uid() (auth uid).
-- In this schema users.id NEVER equals auth_user_id (verified: 0/2 users),
-- so every one of them grants nothing today. Standardize onto the
-- auth_user_id-based helper get_user_organization_id(auth.uid()).
-- ---------------------------------------------------------------------

-- campaign_leads: two broken public-role duplicates. Correct authenticated
-- helper-based policies already exist ("Users read own org campaign leads"
-- for SELECT and "Editors manage own org campaign leads" ALL for INSERT).
-- Drop the dead duplicates.
DROP POLICY IF EXISTS campaign_leads_insert ON public.campaign_leads;
DROP POLICY IF EXISTS campaign_leads_select ON public.campaign_leads;

-- showing_available_slots: broken ALL policy. The working, role-gated
-- granular policies (merged_select_authenticated, admin_editor_insert_slots,
-- admin_editor_update_slots, plus anon public-booking read) already cover
-- access; no client-side DELETE path exists. Drop the dead ALL policy.
DROP POLICY IF EXISTS org_members_full_access ON public.showing_available_slots;

-- rent_benchmarks: the only authenticated read policy, but broken (so no
-- signed-in user can currently read benchmarks). Rewrite onto the helper
-- and scope to the authenticated role. Service-role policy is untouched.
DROP POLICY IF EXISTS "Users can view own org benchmarks" ON public.rent_benchmarks;
CREATE POLICY "Users can view own org benchmarks"
  ON public.rent_benchmarks
  FOR SELECT
  TO authenticated
  USING (organization_id = get_user_organization_id((SELECT auth.uid())));

-- ---------------------------------------------------------------------
-- FINDING 3 (WARN: unpublished training content readable by any auth user)
-- "Authenticated read academy" allowed ANY authenticated user to read ALL
-- files in the academy bucket regardless of the lesson's course status.
-- Restrict SELECT to files whose associated lesson belongs to a PUBLISHED
-- course. Super admins keep full read/write via "Super admin manages
-- academy" (OR-combined), so they can still preview drafts.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read academy" ON storage.objects;
CREATE POLICY "Authenticated read academy"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'academy'
    AND EXISTS (
      SELECT 1
      FROM public.academy_lessons l
      JOIN public.academy_courses c ON c.id = l.course_id
      WHERE c.status = 'published'
        AND l.content_url LIKE ('%' || storage.objects.name || '%')
    )
  );
