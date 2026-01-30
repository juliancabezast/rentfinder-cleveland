-- ============================================
-- COMPLETE DATABASE SCHEMA - FINAL TABLES
-- ============================================

-- 1. AGENT TASKS TABLE (Scheduled AI Actions)
-- ============================================
CREATE TABLE public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Relationship
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Task Definition
  agent_type TEXT NOT NULL CHECK (agent_type IN (
    'recapture',
    'no_show_follow_up',
    'showing_confirmation',
    'post_showing',
    'campaign'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'sms', 'email')),
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  
  -- Attempt Tracking
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 7,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'cancelled',
    'paused_human_control'
  )),
  
  -- Context
  context JSONB DEFAULT '{}',
  
  -- Result
  result_call_id UUID REFERENCES public.calls(id),
  result_communication_id UUID REFERENCES public.communications(id),
  
  -- Pause/Cancel tracking
  paused_by UUID REFERENCES public.users(id),
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Agent Tasks Indexes
CREATE INDEX idx_agent_tasks_org ON public.agent_tasks(organization_id);
CREATE INDEX idx_agent_tasks_scheduled ON public.agent_tasks(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_agent_tasks_lead ON public.agent_tasks(lead_id);
CREATE INDEX idx_agent_tasks_status ON public.agent_tasks(status);

-- Agent Tasks RLS
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_agent_tasks"
  ON public.agent_tasks
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_editor_manage_agent_tasks"
  ON public.agent_tasks
  FOR ALL
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "leasing_agent_select_agent_tasks"
  ON public.agent_tasks
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'leasing_agent')
    AND organization_id = public.get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = agent_tasks.lead_id
      AND l.assigned_leasing_agent_id = public.get_user_id(auth.uid())
    )
  );


-- 2. SYSTEM LOGS TABLE (Error & Integration Tracking)
-- ============================================
CREATE TABLE public.system_logs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = platform-level
  
  -- Log Classification
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  category TEXT NOT NULL CHECK (category IN (
    'twilio',
    'bland_ai',
    'openai',
    'persona',
    'doorloop',
    'google_sheets',
    'supabase',
    'authentication',
    'general'
  )),
  
  -- Event Details
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Context
  related_lead_id UUID REFERENCES public.leads(id),
  related_call_id UUID REFERENCES public.calls(id),
  related_showing_id UUID REFERENCES public.showings(id),
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Notification
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System Logs Indexes
CREATE INDEX idx_system_logs_org ON public.system_logs(organization_id);
CREATE INDEX idx_system_logs_level ON public.system_logs(level);
CREATE INDEX idx_system_logs_category ON public.system_logs(category);
CREATE INDEX idx_system_logs_date ON public.system_logs(created_at DESC);
CREATE INDEX idx_system_logs_unresolved ON public.system_logs(created_at DESC) WHERE is_resolved = false;
CREATE INDEX idx_system_logs_critical ON public.system_logs(created_at DESC) WHERE level = 'critical';

-- System Logs RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_system_logs"
  ON public.system_logs
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_select_org_system_logs"
  ON public.system_logs
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "admin_update_org_system_logs"
  ON public.system_logs
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  );


-- 3. COST RECORDS TABLE
-- ============================================
CREATE TABLE public.cost_records (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Time Period
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Service
  service TEXT NOT NULL CHECK (service IN ('twilio_voice', 'twilio_sms', 'bland_ai', 'openai', 'persona')),
  
  -- Usage Metrics
  usage_quantity DECIMAL(10,2) NOT NULL,
  usage_unit TEXT NOT NULL,
  
  -- Cost
  unit_cost DECIMAL(10,6) NOT NULL,
  total_cost DECIMAL(10,4) NOT NULL,
  
  -- Attribution (optional, for per-lead costing)
  lead_id UUID REFERENCES public.leads(id),
  call_id UUID REFERENCES public.calls(id),
  communication_id UUID REFERENCES public.communications(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost Records Indexes
CREATE INDEX idx_cost_records_org ON public.cost_records(organization_id);
CREATE INDEX idx_cost_records_date ON public.cost_records(recorded_at DESC);
CREATE INDEX idx_cost_records_service ON public.cost_records(service);
CREATE INDEX idx_cost_records_lead ON public.cost_records(lead_id);
CREATE INDEX idx_cost_records_period ON public.cost_records(period_start, period_end);

-- Cost Records RLS
ALTER TABLE public.cost_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_cost_records"
  ON public.cost_records
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_manage_org_cost_records"
  ON public.cost_records
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  );


-- 4. INVESTOR INSIGHTS TABLE (Storytelling)
-- ============================================
CREATE TABLE public.investor_insights (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  
  -- Insight Classification
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'lead_loss_reason',
    'pricing_feedback',
    'location_feedback',
    'feature_request',
    'competitive_insight',
    'seasonal_trend',
    'recommendation'
  )),
  
  -- The Story (Human Readable)
  headline TEXT NOT NULL,
  narrative TEXT NOT NULL,
  
  -- Supporting Data
  data_points JSONB NOT NULL,
  confidence_score DECIMAL(3,2),
  
  -- Time Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Visibility
  is_highlighted BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Investor Insights Indexes
CREATE INDEX idx_investor_insights_org ON public.investor_insights(organization_id);
CREATE INDEX idx_investor_insights_property ON public.investor_insights(property_id);
CREATE INDEX idx_investor_insights_highlighted ON public.investor_insights(is_highlighted) WHERE is_highlighted = true;
CREATE INDEX idx_investor_insights_type ON public.investor_insights(insight_type);
CREATE INDEX idx_investor_insights_period ON public.investor_insights(period_start, period_end);

-- Investor Insights RLS
ALTER TABLE public.investor_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_investor_insights"
  ON public.investor_insights
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_editor_manage_investor_insights"
  ON public.investor_insights
  FOR ALL
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "viewer_select_investor_insights"
  ON public.investor_insights
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'viewer')
    AND public.user_has_property_access(auth.uid(), property_id)
  );


-- 5. CONSENT LOG TABLE (Compliance)
-- ============================================
CREATE TABLE public.consent_log (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Consent Type
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'sms_marketing',
    'call_recording',
    'automated_calls',
    'data_processing',
    'email_marketing'
  )),
  
  -- Status
  granted BOOLEAN NOT NULL,
  
  -- How Consent Was Obtained
  method TEXT NOT NULL CHECK (method IN (
    'web_form',
    'verbal_call',
    'sms_reply',
    'email_click'
  )),
  
  -- Evidence
  evidence_text TEXT,
  evidence_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Call reference if verbal
  call_id UUID REFERENCES public.calls(id),
  
  -- Withdrawal
  withdrawn_at TIMESTAMPTZ,
  withdrawal_method TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consent Log Indexes
CREATE INDEX idx_consent_log_lead ON public.consent_log(lead_id);
CREATE INDEX idx_consent_log_type ON public.consent_log(consent_type);
CREATE INDEX idx_consent_log_org ON public.consent_log(organization_id);
CREATE INDEX idx_consent_log_date ON public.consent_log(created_at DESC);

-- Consent Log RLS
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_consent_log"
  ON public.consent_log
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_editor_manage_consent_log"
  ON public.consent_log
  FOR ALL
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  );


-- 6. FAQ DOCUMENTS TABLE
-- ============================================
-- Note: vector extension must be enabled for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.faq_documents (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'requirements',
    'process',
    'section_8',
    'lease_terms',
    'general'
  )),
  
  content TEXT NOT NULL,
  
  -- For AI retrieval
  embedding vector(1536),
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FAQ Documents Indexes
CREATE INDEX idx_faq_org ON public.faq_documents(organization_id);
CREATE INDEX idx_faq_category ON public.faq_documents(category);
CREATE INDEX idx_faq_active ON public.faq_documents(is_active) WHERE is_active = true;

-- FAQ Documents RLS
ALTER TABLE public.faq_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_faq_documents"
  ON public.faq_documents
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_editor_manage_faq_documents"
  ON public.faq_documents
  FOR ALL
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "users_select_org_faq_documents"
  ON public.faq_documents
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND is_active = true
  );


-- 7. SYSTEM SETTINGS TABLE
-- ============================================
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = platform-wide
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, key)
);

-- System Settings Indexes
CREATE INDEX idx_system_settings_org ON public.system_settings(organization_id);
CREATE INDEX idx_system_settings_key ON public.system_settings(key);

-- System Settings RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_system_settings"
  ON public.system_settings
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "admin_manage_org_system_settings"
  ON public.system_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "users_select_org_system_settings"
  ON public.system_settings
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
  );


-- 8. PAUSE LEAD AGENT TASKS FUNCTION
-- ============================================
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
BEGIN
  -- Get the organization_id from the lead
  SELECT organization_id INTO _org_id
  FROM public.leads
  WHERE id = _lead_id;
  
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', _lead_id;
  END IF;
  
  -- Update all pending agent tasks for this lead
  UPDATE public.agent_tasks
  SET 
    status = 'paused_human_control',
    paused_by = _user_id,
    paused_at = NOW(),
    pause_reason = _reason
  WHERE lead_id = _lead_id
    AND status IN ('pending', 'in_progress');
  
  GET DIAGNOSTICS _paused_count = ROW_COUNT;
  
  -- Update the lead to mark as human controlled
  UPDATE public.leads
  SET 
    is_human_controlled = true,
    human_controlled_by = _user_id,
    human_controlled_at = NOW(),
    human_control_reason = _reason,
    updated_at = NOW()
  WHERE id = _lead_id;
  
  RETURN _paused_count;
END;
$$;


-- 9. UPDATE TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE TRIGGER update_agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_faq_documents_updated_at
  BEFORE UPDATE ON public.faq_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();