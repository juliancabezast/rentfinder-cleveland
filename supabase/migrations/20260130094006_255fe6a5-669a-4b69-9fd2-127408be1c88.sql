-- ============================================
-- 3.7 Calls Table
-- ============================================
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Relationship
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  
  -- Call Details
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number TEXT NOT NULL,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN (
    'completed',
    'no_answer',
    'voicemail',
    'busy',
    'failed',
    'in_progress'
  )),
  
  -- Content
  transcript TEXT,
  summary TEXT,
  recording_url TEXT,
  
  -- AI Analysis
  detected_language TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  key_questions JSONB DEFAULT '[]',
  unanswered_questions JSONB DEFAULT '[]',
  
  -- Agent Info
  agent_type TEXT NOT NULL CHECK (agent_type IN (
    'main_inbound',
    'recapture',
    'no_show_follow_up',
    'showing_confirmation',
    'post_showing',
    'campaign'
  )),
  bland_call_id TEXT,
  twilio_call_sid TEXT,
  
  -- Scoring Impact
  score_change INTEGER DEFAULT 0,
  
  -- Cost Tracking
  cost_twilio DECIMAL(10,4) DEFAULT 0,
  cost_bland DECIMAL(10,4) DEFAULT 0,
  cost_openai DECIMAL(10,4) DEFAULT 0,
  cost_total DECIMAL(10,4) DEFAULT 0,
  
  -- Compliance
  recording_disclosure_played BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calls_org ON public.calls(organization_id);
CREATE INDEX idx_calls_lead ON public.calls(lead_id);
CREATE INDEX idx_calls_date ON public.calls(started_at DESC);
CREATE INDEX idx_calls_agent_type ON public.calls(agent_type);
CREATE INDEX idx_calls_property ON public.calls(property_id);

-- ============================================
-- 3.8 Showings Table
-- ============================================
CREATE TABLE public.showings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Relationships
  lead_id UUID NOT NULL REFERENCES public.leads(id),
  property_id UUID NOT NULL REFERENCES public.properties(id),
  leasing_agent_id UUID REFERENCES public.users(id),
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'confirmed',
    'completed',
    'no_show',
    'cancelled',
    'rescheduled'
  )),
  
  -- Confirmation
  confirmation_attempts INTEGER DEFAULT 0,
  last_confirmation_attempt_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  
  -- Completion
  completed_at TIMESTAMPTZ,
  
  -- Leasing Agent Report
  agent_report TEXT,
  agent_report_photo_url TEXT,
  prospect_interest_level TEXT CHECK (prospect_interest_level IN ('high', 'medium', 'low', 'not_interested')),
  
  -- Cancellation
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  rescheduled_to_id UUID REFERENCES public.showings(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_showings_org ON public.showings(organization_id);
CREATE INDEX idx_showings_date ON public.showings(scheduled_at);
CREATE INDEX idx_showings_status ON public.showings(status);
CREATE INDEX idx_showings_agent ON public.showings(leasing_agent_id);
CREATE INDEX idx_showings_lead ON public.showings(lead_id);
CREATE INDEX idx_showings_property ON public.showings(property_id);

-- ============================================
-- 3.9 Communications Table
-- ============================================
CREATE TABLE public.communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Relationship
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Type
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Content
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed', 'opened', 'clicked')),
  
  -- External IDs
  twilio_message_sid TEXT,
  
  -- Cost Tracking
  cost_twilio DECIMAL(10,4) DEFAULT 0,
  
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
);

CREATE INDEX idx_communications_org ON public.communications(organization_id);
CREATE INDEX idx_communications_lead ON public.communications(lead_id);
CREATE INDEX idx_communications_date ON public.communications(sent_at DESC);
CREATE INDEX idx_communications_channel ON public.communications(channel);

-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Calls
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_calls"
ON public.calls
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can manage calls in their organization
CREATE POLICY "admin_editor_manage_calls"
ON public.calls
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

-- Leasing agent can SELECT calls for their assigned leads
CREATE POLICY "leasing_agent_select_calls"
ON public.calls
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_id
      AND l.assigned_leasing_agent_id = public.get_user_id(auth.uid())
  )
);

-- ============================================
-- RLS Policies for Showings
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_showings"
ON public.showings
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can manage showings in their organization
CREATE POLICY "admin_editor_manage_showings"
ON public.showings
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

-- Leasing agent can manage showings assigned to them
CREATE POLICY "leasing_agent_manage_showings"
ON public.showings
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND leasing_agent_id = public.get_user_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND leasing_agent_id = public.get_user_id(auth.uid())
);

-- ============================================
-- RLS Policies for Communications
-- ============================================

-- Super admin can do everything
CREATE POLICY "super_admin_all_communications"
ON public.communications
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Admin/Editor can manage communications in their organization
CREATE POLICY "admin_editor_manage_communications"
ON public.communications
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

-- Leasing agent can SELECT communications for their assigned leads
CREATE POLICY "leasing_agent_select_communications"
ON public.communications
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_id
      AND l.assigned_leasing_agent_id = public.get_user_id(auth.uid())
  )
);

-- ============================================
-- Updated_at trigger for showings
-- ============================================
CREATE TRIGGER update_showings_updated_at
  BEFORE UPDATE ON public.showings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Add FK constraints to lead_score_history
-- ============================================
ALTER TABLE public.lead_score_history
  ADD CONSTRAINT fk_score_history_call
  FOREIGN KEY (related_call_id) REFERENCES public.calls(id) ON DELETE SET NULL;

ALTER TABLE public.lead_score_history
  ADD CONSTRAINT fk_score_history_showing
  FOREIGN KEY (related_showing_id) REFERENCES public.showings(id) ON DELETE SET NULL;

-- ============================================
-- Function: Update lead status on showing outcome
-- ============================================
CREATE OR REPLACE FUNCTION public.update_lead_status_on_showing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_score INTEGER;
BEGIN
  -- Only process if status changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- When showing is completed
  IF NEW.status = 'completed' THEN
    -- Update lead status to 'showed'
    UPDATE public.leads
    SET 
      status = 'showed',
      updated_at = NOW()
    WHERE id = NEW.lead_id
      AND status NOT IN ('in_application', 'converted', 'lost');
    
    -- Log positive score change
    PERFORM public.log_score_change(
      NEW.lead_id,
      20,
      'completed_showing',
      'Lead completed a property showing (+20 points)',
      'showing_outcome',
      NULL,
      NEW.id,
      NULL,
      'showing_trigger'
    );
    
    -- Set completed_at if not already set
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  END IF;
  
  -- When showing is a no-show
  IF NEW.status = 'no_show' THEN
    -- Log negative score change
    PERFORM public.log_score_change(
      NEW.lead_id,
      -30,
      'no_show',
      'Lead did not show up for scheduled showing (-30 points)',
      'showing_outcome',
      NULL,
      NEW.id,
      NULL,
      'showing_trigger'
    );
  END IF;
  
  -- When showing is confirmed
  IF NEW.status = 'confirmed' AND OLD.status = 'scheduled' THEN
    -- Update lead status to showing_scheduled if not already beyond that
    UPDATE public.leads
    SET 
      status = 'showing_scheduled',
      updated_at = NOW()
    WHERE id = NEW.lead_id
      AND status IN ('new', 'contacted', 'engaged', 'nurturing', 'qualified');
    
    -- Set confirmed_at
    IF NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := NOW();
    END IF;
    
    -- Small score boost for confirmation
    PERFORM public.log_score_change(
      NEW.lead_id,
      5,
      'showing_confirmed',
      'Lead confirmed showing appointment (+5 points)',
      'showing_outcome',
      NULL,
      NEW.id,
      NULL,
      'showing_trigger'
    );
  END IF;
  
  -- When showing is cancelled
  IF NEW.status = 'cancelled' THEN
    IF NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := NOW();
    END IF;
    
    -- Small score decrease for cancellation
    PERFORM public.log_score_change(
      NEW.lead_id,
      -10,
      'showing_cancelled',
      'Showing was cancelled (-10 points)',
      'showing_outcome',
      NULL,
      NEW.id,
      NULL,
      'showing_trigger'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_lead_on_showing
  BEFORE UPDATE ON public.showings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_status_on_showing();