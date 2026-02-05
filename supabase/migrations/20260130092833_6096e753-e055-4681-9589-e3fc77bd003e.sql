-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 3.1 Organizations Table (Multi-Tenant Core)
-- ============================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Contact
  owner_email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  
  -- Branding
  logo_url TEXT,
  primary_color TEXT DEFAULT '#370d4b',
  accent_color TEXT DEFAULT '#ffb22c',
  
  -- Subscription
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  billing_email TEXT,
  stripe_customer_id TEXT,
  
  -- Limits (based on plan)
  max_properties INTEGER DEFAULT 10,
  max_users INTEGER DEFAULT 5,
  max_calls_per_month INTEGER DEFAULT 500,
  
  -- Integration Keys (encrypted at rest)
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  bland_api_key TEXT,
  openai_api_key TEXT,
  persona_api_key TEXT,
  doorloop_api_key TEXT,
  
  -- Settings
  timezone TEXT DEFAULT 'America/New_York',
  default_language TEXT DEFAULT 'en',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON public.organizations(slug);

-- ============================================
-- 3.2 Organization Settings Table
-- ============================================
CREATE TABLE public.organization_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  category TEXT NOT NULL CHECK (category IN (
    'agents',
    'lead_capture',
    'scoring',
    'communications',
    'showings',
    'compliance'
  )),
  
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, key)
);

-- ============================================
-- 3.3 Create app_role ENUM for user roles
-- ============================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'editor', 'viewer', 'leasing_agent');

-- ============================================
-- 3.3 Users Table
-- ============================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  commission_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_users_org ON public.users(organization_id);
CREATE INDEX idx_users_auth ON public.users(auth_user_id);

-- ============================================
-- Security Definer Function for Role Checks
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role(_auth_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE auth_user_id = _auth_user_id AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id(_auth_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE auth_user_id = _auth_user_id AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role(_auth_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = _auth_user_id
      AND role = _role
      AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_auth_user_id, 'super_admin')
$$;

-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Organizations
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_organizations"
ON public.organizations
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin can SELECT and UPDATE their own organization
CREATE POLICY "admin_select_own_organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  AND id = public.get_user_organization_id(auth.uid())
);

CREATE POLICY "admin_update_own_organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  AND id = public.get_user_organization_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') 
  AND id = public.get_user_organization_id(auth.uid())
);

-- Other roles can only SELECT their own organization
CREATE POLICY "users_select_own_organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = public.get_user_organization_id(auth.uid()));

-- ============================================
-- RLS Policies for Organization Settings
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_org_settings"
ON public.organization_settings
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin can manage settings for their organization
CREATE POLICY "admin_manage_own_org_settings"
ON public.organization_settings
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND organization_id = public.get_user_organization_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Other users can view their org's settings
CREATE POLICY "users_select_own_org_settings"
ON public.organization_settings
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

-- ============================================
-- RLS Policies for Users
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_users"
ON public.users
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin can manage users in their organization
CREATE POLICY "admin_manage_org_users"
ON public.users
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND organization_id = public.get_user_organization_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Users can view other users in their organization
CREATE POLICY "users_select_org_users"
ON public.users
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Users can update their own profile
CREATE POLICY "users_update_own_profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_settings_updated_at
  BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Insert default organization
-- ============================================
INSERT INTO public.organizations (
  name,
  slug,
  owner_email,
  primary_color,
  accent_color,
  plan,
  subscription_status,
  max_properties,
  max_users,
  max_calls_per_month
) VALUES (
  'Rent Finder Cleveland',
  'rent-finder-cleveland',
  'admin@rentfindercleveland.com',
  '#370d4b',
  '#ffb22c',
  'enterprise',
  'active',
  100,
  25,
  5000
);