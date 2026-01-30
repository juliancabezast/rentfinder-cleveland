-- ============================================
-- 3.4 Properties Table
-- ============================================
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Basic Info
  address TEXT NOT NULL,
  unit_number TEXT,
  city TEXT NOT NULL DEFAULT 'Cleveland',
  state TEXT NOT NULL DEFAULT 'OH',
  zip_code TEXT NOT NULL,
  
  -- Property Details
  bedrooms INTEGER NOT NULL,
  bathrooms DECIMAL(3,1) NOT NULL,
  square_feet INTEGER,
  property_type TEXT CHECK (property_type IN ('house', 'apartment', 'duplex', 'townhouse', 'condo')),
  
  -- Pricing
  rent_price DECIMAL(10,2) NOT NULL,
  deposit_amount DECIMAL(10,2),
  application_fee DECIMAL(10,2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'coming_soon', 'in_leasing_process', 'rented')),
  coming_soon_date DATE,
  
  -- Section 8
  section_8_accepted BOOLEAN DEFAULT true,
  hud_inspection_ready BOOLEAN DEFAULT true,
  
  -- Media
  photos JSONB DEFAULT '[]',
  video_tour_url TEXT,
  virtual_tour_url TEXT,
  
  -- Description
  description TEXT,
  special_notes TEXT,
  
  -- Features
  amenities JSONB DEFAULT '[]',
  pet_policy TEXT,
  
  -- Alternative Properties
  alternative_property_ids UUID[] DEFAULT '{}',
  
  -- Ownership
  investor_id UUID REFERENCES public.users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  listed_date DATE,
  
  -- Sync
  doorloop_property_id TEXT
);

CREATE INDEX idx_properties_org ON public.properties(organization_id);
CREATE INDEX idx_properties_zip ON public.properties(zip_code);
CREATE INDEX idx_properties_status ON public.properties(status);
CREATE INDEX idx_properties_investor ON public.properties(investor_id);

-- ============================================
-- 3.11 Property Alerts Table
-- ============================================
CREATE TABLE public.property_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'coming_soon_expiring',
    'status_change',
    'no_activity',
    'high_interest'
  )),
  
  message TEXT NOT NULL,
  
  is_read BOOLEAN DEFAULT false,
  read_by UUID REFERENCES public.users(id),
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_alerts_org ON public.property_alerts(organization_id);
CREATE INDEX idx_property_alerts_unread ON public.property_alerts(created_at DESC) WHERE is_read = false;
CREATE INDEX idx_property_alerts_property ON public.property_alerts(property_id);

-- ============================================
-- 3.12 Investor Property Access Table
-- ============================================
CREATE TABLE public.investor_property_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(investor_id, property_id)
);

CREATE INDEX idx_investor_access_org ON public.investor_property_access(organization_id);
CREATE INDEX idx_investor_access_investor ON public.investor_property_access(investor_id);

-- ============================================
-- Helper function: check if user has access to property
-- ============================================
CREATE OR REPLACE FUNCTION public.user_has_property_access(_auth_user_id UUID, _property_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.investor_property_access ipa
    JOIN public.users u ON u.id = ipa.investor_id
    WHERE u.auth_user_id = _auth_user_id
      AND ipa.property_id = _property_id
  )
$$;

-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_property_access ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Properties
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_properties"
ON public.properties
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can manage properties in their organization
CREATE POLICY "admin_editor_manage_properties"
ON public.properties
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  AND organization_id = public.get_user_organization_id(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Leasing agent can view all properties in their organization
CREATE POLICY "leasing_agent_select_properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Viewer can only see properties they have access to via investor_property_access
CREATE POLICY "viewer_select_accessible_properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'viewer')
  AND public.user_has_property_access(auth.uid(), id)
);

-- ============================================
-- RLS Policies for Property Alerts
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_property_alerts"
ON public.property_alerts
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can manage alerts in their organization
CREATE POLICY "admin_editor_manage_property_alerts"
ON public.property_alerts
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  AND organization_id = public.get_user_organization_id(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Viewer can see alerts for properties they have access to
CREATE POLICY "viewer_select_property_alerts"
ON public.property_alerts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'viewer')
  AND public.user_has_property_access(auth.uid(), property_id)
);

-- ============================================
-- RLS Policies for Investor Property Access
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_investor_access"
ON public.investor_property_access
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin can manage access in their organization
CREATE POLICY "admin_manage_investor_access"
ON public.investor_property_access
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

-- Viewers can see their own access records
CREATE POLICY "viewer_select_own_access"
ON public.investor_property_access
FOR SELECT
TO authenticated
USING (
  investor_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
);

-- ============================================
-- Updated_at triggers
-- ============================================
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Function: Check coming_soon expiring properties
-- ============================================
CREATE OR REPLACE FUNCTION public.check_coming_soon_expiring()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alerts_created INTEGER := 0;
  prop RECORD;
BEGIN
  -- Find properties with status='coming_soon' that are expiring within 3 days
  FOR prop IN
    SELECT p.id, p.organization_id, p.address, p.unit_number, p.coming_soon_date
    FROM public.properties p
    WHERE p.status = 'coming_soon'
      AND p.coming_soon_date IS NOT NULL
      AND p.coming_soon_date <= (CURRENT_DATE + INTERVAL '3 days')
      AND p.coming_soon_date >= CURRENT_DATE
      -- Check if alert doesn't already exist for this property and date
      AND NOT EXISTS (
        SELECT 1 FROM public.property_alerts pa
        WHERE pa.property_id = p.id
          AND pa.alert_type = 'coming_soon_expiring'
          AND pa.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO public.property_alerts (
      organization_id,
      property_id,
      alert_type,
      message
    ) VALUES (
      prop.organization_id,
      prop.id,
      'coming_soon_expiring',
      'Property at ' || prop.address || 
        COALESCE(' Unit ' || prop.unit_number, '') || 
        ' has a coming soon date of ' || prop.coming_soon_date::text ||
        '. Please update status if it will be available.'
    );
    
    alerts_created := alerts_created + 1;
  END LOOP;
  
  RETURN alerts_created;
END;
$$;