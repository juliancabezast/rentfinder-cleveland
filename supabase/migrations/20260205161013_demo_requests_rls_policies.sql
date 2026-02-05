-- ============================================
-- RLS Policies for Demo Requests
-- ============================================
-- The demo_requests table stores requests from the landing page.
-- It's a global table (no organization_id) accessible only to super_admin and admin.

-- Enable RLS (if not already enabled)
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything
CREATE POLICY "super_admin_all_demo_requests"
ON public.demo_requests
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin can SELECT and UPDATE demo requests
CREATE POLICY "admin_select_demo_requests"
ON public.demo_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_update_demo_requests"
ON public.demo_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow anonymous users to INSERT (for landing page form submissions)
CREATE POLICY "anon_insert_demo_requests"
ON public.demo_requests
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow authenticated users to INSERT as well (edge function with service role bypasses RLS anyway)
CREATE POLICY "authenticated_insert_demo_requests"
ON public.demo_requests
FOR INSERT
TO authenticated
WITH CHECK (true);
