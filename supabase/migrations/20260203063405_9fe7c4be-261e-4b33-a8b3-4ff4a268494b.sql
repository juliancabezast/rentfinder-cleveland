-- Create competitor_mentions table
CREATE TABLE public.competitor_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Source
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Competitor Info (extracted by AI)
  competitor_name TEXT, -- "the place on Lorain Ave", "another apartment"
  competitor_address TEXT, -- If mentioned
  competitor_price DECIMAL(10,2), -- If mentioned
  
  -- What they offered that we didn't
  advantage_mentioned TEXT, -- "in-unit laundry", "lower price", "pets allowed"
  
  -- Outcome
  lead_chose_competitor BOOLEAN DEFAULT false,
  
  -- AI Confidence
  confidence DECIMAL(3,2) DEFAULT 0.80,
  
  -- Raw excerpt from transcript
  transcript_excerpt TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.competitor_mentions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view competitor mentions in their organization"
ON public.competitor_mentions
FOR SELECT
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin', 'editor')
);

CREATE POLICY "Users can insert competitor mentions in their organization"
ON public.competitor_mentions
FOR INSERT
WITH CHECK (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin', 'editor')
);

CREATE POLICY "Users can update competitor mentions in their organization"
ON public.competitor_mentions
FOR UPDATE
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin', 'editor')
);

CREATE POLICY "Users can delete competitor mentions in their organization"
ON public.competitor_mentions
FOR DELETE
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
);

-- Indexes
CREATE INDEX idx_competitor_mentions_org ON public.competitor_mentions(organization_id);
CREATE INDEX idx_competitor_mentions_date ON public.competitor_mentions(created_at DESC);
CREATE INDEX idx_competitor_mentions_lead ON public.competitor_mentions(lead_id);
CREATE INDEX idx_competitor_mentions_call ON public.competitor_mentions(call_id);

-- Add agent quality columns to calls table
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_quality_score INTEGER CHECK (agent_quality_score >= 0 AND agent_quality_score <= 100);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_quality_details JSONB DEFAULT '{}'::jsonb;