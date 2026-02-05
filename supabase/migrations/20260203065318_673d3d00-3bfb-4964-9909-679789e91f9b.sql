-- Create lead_predictions table for predictive scoring
CREATE TABLE public.lead_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Prediction
  conversion_probability DECIMAL(5,4), -- 0.0000 to 1.0000
  predicted_days_to_convert INTEGER, -- Estimated days from now, -1 if unlikely
  predicted_outcome TEXT CHECK (predicted_outcome IN ('likely_convert', 'needs_nurturing', 'likely_lost', 'insufficient_data')),
  
  -- Contributing Factors (explainable AI)
  factors JSONB NOT NULL DEFAULT '[]',
  
  -- Model Info
  model_version TEXT DEFAULT 'v1',
  based_on_leads_count INTEGER,
  
  -- Timestamps
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(lead_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_predictions_org ON public.lead_predictions(organization_id);
CREATE INDEX idx_predictions_lead ON public.lead_predictions(lead_id);
CREATE INDEX idx_predictions_probability ON public.lead_predictions(conversion_probability DESC);
CREATE INDEX idx_predictions_outcome ON public.lead_predictions(predicted_outcome);

-- Enable RLS
ALTER TABLE public.lead_predictions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Super admin can access all predictions
CREATE POLICY "Super admin full access to predictions"
  ON public.lead_predictions
  FOR ALL
  USING (public.is_super_admin(auth.uid()));

-- Admin and editor can access their org's predictions
CREATE POLICY "Admin and editor can view org predictions"
  ON public.lead_predictions
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.get_user_role(auth.uid()) IN ('admin', 'editor')
  );

-- Leasing agents can view predictions for their assigned leads
CREATE POLICY "Leasing agent view assigned lead predictions"
  ON public.lead_predictions
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.get_user_role(auth.uid()) = 'leasing_agent'
    AND lead_id IN (
      SELECT id FROM public.leads 
      WHERE assigned_leasing_agent_id = public.get_user_id(auth.uid())
    )
  );

-- Service role can manage all predictions (for edge functions)
CREATE POLICY "Service role full access to predictions"
  ON public.lead_predictions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Deny anonymous access
CREATE POLICY "Deny anonymous access to predictions"
  ON public.lead_predictions
  FOR ALL
  TO anon
  USING (false);