-- ============================================
-- 3.5 Leads Table
-- ============================================
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Contact Info
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'es')),
  
  -- Source
  source TEXT NOT NULL CHECK (source IN ('inbound_call', 'hemlane_email', 'website', 'referral', 'manual', 'sms', 'campaign')),
  source_detail TEXT,
  
  -- Interest
  interested_property_id UUID REFERENCES public.properties(id),
  interested_zip_codes TEXT[],
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  move_in_date DATE,
  
  -- Section 8
  has_voucher BOOLEAN,
  voucher_amount DECIMAL(10,2),
  housing_authority TEXT,
  voucher_status TEXT CHECK (voucher_status IN ('active', 'pending', 'expiring_soon', 'expired', 'unknown')),
  
  -- Status & Scoring
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'contacted',
    'engaged',
    'nurturing',
    'qualified',
    'showing_scheduled',
    'showed',
    'in_application',
    'lost',
    'converted'
  )),
  lost_reason TEXT,
  
  lead_score INTEGER DEFAULT 50 CHECK (lead_score >= 0 AND lead_score <= 100),
  is_priority BOOLEAN DEFAULT false,
  priority_reason TEXT,
  
  -- Human Takeover
  is_human_controlled BOOLEAN DEFAULT false,
  human_controlled_by UUID REFERENCES public.users(id),
  human_controlled_at TIMESTAMPTZ,
  human_control_reason TEXT,
  
  -- Verification
  phone_verified BOOLEAN DEFAULT false,
  identity_verified BOOLEAN DEFAULT false,
  persona_verification_id TEXT,
  
  -- Assignment
  assigned_leasing_agent_id UUID REFERENCES public.users(id),
  
  -- Communication Preferences & Compliance
  contact_preference TEXT DEFAULT 'any' CHECK (contact_preference IN ('call', 'sms', 'email', 'any')),
  do_not_contact BOOLEAN DEFAULT false,
  sms_consent BOOLEAN DEFAULT false,
  sms_consent_at TIMESTAMPTZ,
  call_consent BOOLEAN DEFAULT false,
  call_consent_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  
  -- Sync
  doorloop_prospect_id TEXT,
  hemlane_lead_id TEXT
);

CREATE INDEX idx_leads_org ON public.leads(organization_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_score ON public.leads(lead_score DESC);
CREATE INDEX idx_leads_priority ON public.leads(is_priority) WHERE is_priority = true;
CREATE INDEX idx_leads_human_controlled ON public.leads(is_human_controlled) WHERE is_human_controlled = true;
CREATE INDEX idx_leads_assigned_agent ON public.leads(assigned_leasing_agent_id);
CREATE INDEX idx_leads_next_followup ON public.leads(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

-- ============================================
-- 3.6 Lead Score History Table
-- ============================================
CREATE TABLE public.lead_score_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Score Change
  previous_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  
  -- Explanation (Human Readable)
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  
  -- Context
  triggered_by TEXT NOT NULL CHECK (triggered_by IN (
    'call_analysis',
    'showing_outcome',
    'engagement',
    'verification',
    'manual_adjustment',
    'time_decay',
    'contact_attempts'
  )),
  
  -- Related IDs (FKs will be added when calls/showings tables are created)
  related_call_id UUID,
  related_showing_id UUID,
  
  -- Who/What made the change
  changed_by_user_id UUID REFERENCES public.users(id),
  changed_by_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_score_history_lead ON public.lead_score_history(lead_id);
CREATE INDEX idx_score_history_date ON public.lead_score_history(created_at DESC);
CREATE INDEX idx_score_history_org ON public.lead_score_history(organization_id);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper function: Get user's internal ID
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_id(_auth_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = _auth_user_id AND is_active = true LIMIT 1
$$;

-- ============================================
-- RLS Policies for Leads
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_leads"
ON public.leads
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can manage leads in their organization
CREATE POLICY "admin_editor_manage_leads"
ON public.leads
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

-- Leasing agent can SELECT/UPDATE only leads assigned to them
CREATE POLICY "leasing_agent_select_assigned_leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND assigned_leasing_agent_id = public.get_user_id(auth.uid())
);

CREATE POLICY "leasing_agent_update_assigned_leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND assigned_leasing_agent_id = public.get_user_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND assigned_leasing_agent_id = public.get_user_id(auth.uid())
);

-- ============================================
-- RLS Policies for Lead Score History
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_score_history"
ON public.lead_score_history
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can view score history in their organization
CREATE POLICY "admin_editor_select_score_history"
ON public.lead_score_history
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Admin/Editor can insert score history in their organization
CREATE POLICY "admin_editor_insert_score_history"
ON public.lead_score_history
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  AND organization_id = public.get_user_organization_id(auth.uid())
);

-- Leasing agent can view score history for their assigned leads
CREATE POLICY "leasing_agent_select_score_history"
ON public.lead_score_history
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_id
      AND l.assigned_leasing_agent_id = public.get_user_id(auth.uid())
  )
);

-- ============================================
-- Updated_at trigger for leads
-- ============================================
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Function: Log score change
-- ============================================
CREATE OR REPLACE FUNCTION public.log_score_change(
  _lead_id UUID,
  _change_amount INTEGER,
  _reason_code TEXT,
  _reason_text TEXT,
  _triggered_by TEXT,
  _related_call_id UUID DEFAULT NULL,
  _related_showing_id UUID DEFAULT NULL,
  _changed_by_user_id UUID DEFAULT NULL,
  _changed_by_agent TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_score INTEGER;
  _new_score INTEGER;
  _org_id UUID;
  _was_priority BOOLEAN;
BEGIN
  -- Get current lead info
  SELECT lead_score, organization_id, is_priority 
  INTO _current_score, _org_id, _was_priority
  FROM public.leads 
  WHERE id = _lead_id;
  
  IF _current_score IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', _lead_id;
  END IF;
  
  -- Calculate new score (clamped 0-100)
  _new_score := GREATEST(0, LEAST(100, _current_score + _change_amount));
  
  -- Insert score history record
  INSERT INTO public.lead_score_history (
    organization_id,
    lead_id,
    previous_score,
    new_score,
    change_amount,
    reason_code,
    reason_text,
    triggered_by,
    related_call_id,
    related_showing_id,
    changed_by_user_id,
    changed_by_agent
  ) VALUES (
    _org_id,
    _lead_id,
    _current_score,
    _new_score,
    _change_amount,
    _reason_code,
    _reason_text,
    _triggered_by,
    _related_call_id,
    _related_showing_id,
    _changed_by_user_id,
    _changed_by_agent
  );
  
  -- Update lead score and priority status
  -- Use a flag column to bypass the trigger
  UPDATE public.leads
  SET 
    lead_score = _new_score,
    is_priority = CASE 
      WHEN _new_score >= 85 THEN true 
      ELSE is_priority 
    END,
    priority_reason = CASE 
      WHEN _new_score >= 85 AND NOT _was_priority THEN 'High lead score (' || _new_score || ')'
      ELSE priority_reason
    END,
    updated_at = NOW()
  WHERE id = _lead_id;
  
  RETURN _new_score;
END;
$$;

-- ============================================
-- Variable to track if score change is from function
-- ============================================
CREATE OR REPLACE FUNCTION public.prevent_direct_score_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if score hasn't changed
  IF OLD.lead_score = NEW.lead_score THEN
    RETURN NEW;
  END IF;
  
  -- Check if this is being called from our log_score_change function
  -- by checking the application_name or a session variable
  IF current_setting('app.score_update_allowed', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- For now, we'll allow the update but log a warning
  -- In production, you could RAISE EXCEPTION here
  RAISE WARNING 'Direct lead_score update detected. Use log_score_change() function instead.';
  RETURN NEW;
END;
$$;

-- Note: The trigger is commented out to allow flexibility during development
-- Uncomment in production to enforce score changes through log_score_change()
-- CREATE TRIGGER prevent_direct_lead_score_update
--   BEFORE UPDATE OF lead_score ON public.leads
--   FOR EACH ROW
--   EXECUTE FUNCTION public.prevent_direct_score_update();