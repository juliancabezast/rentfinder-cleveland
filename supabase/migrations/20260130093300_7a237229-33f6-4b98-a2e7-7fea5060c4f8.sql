-- ============================================
-- 1. Create organization_credentials table
-- ============================================
CREATE TABLE public.organization_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Integration Keys (encrypted at rest)
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  bland_api_key TEXT,
  openai_api_key TEXT,
  persona_api_key TEXT,
  doorloop_api_key TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id)
);

CREATE INDEX idx_org_credentials_org ON public.organization_credentials(organization_id);

-- ============================================
-- 2. Migrate existing data from organizations
-- ============================================
INSERT INTO public.organization_credentials (
  organization_id,
  twilio_account_sid,
  twilio_auth_token,
  twilio_phone_number,
  bland_api_key,
  openai_api_key,
  persona_api_key,
  doorloop_api_key
)
SELECT 
  id,
  twilio_account_sid,
  twilio_auth_token,
  twilio_phone_number,
  bland_api_key,
  openai_api_key,
  persona_api_key,
  doorloop_api_key
FROM public.organizations;

-- ============================================
-- 3. Remove sensitive columns from organizations
-- ============================================
ALTER TABLE public.organizations 
  DROP COLUMN twilio_account_sid,
  DROP COLUMN twilio_auth_token,
  DROP COLUMN twilio_phone_number,
  DROP COLUMN bland_api_key,
  DROP COLUMN openai_api_key,
  DROP COLUMN persona_api_key,
  DROP COLUMN doorloop_api_key;

-- ============================================
-- 4. Enable RLS with admin-only access
-- ============================================
ALTER TABLE public.organization_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_admins_access_credentials"
ON public.organization_credentials
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid()) 
  OR (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid()) 
  OR (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
);

-- ============================================
-- 5. Add updated_at trigger
-- ============================================
CREATE TRIGGER update_organization_credentials_updated_at
  BEFORE UPDATE ON public.organization_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();