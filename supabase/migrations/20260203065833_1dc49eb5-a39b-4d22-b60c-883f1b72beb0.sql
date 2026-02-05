-- Create investor_reports table
CREATE TABLE public.investor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Period
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_year INTEGER NOT NULL CHECK (period_year >= 2020),
  
  -- Report Content
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  narrative_summary TEXT,
  
  -- Properties covered
  property_ids UUID[] NOT NULL,
  
  -- Metrics Snapshot
  metrics JSONB NOT NULL DEFAULT '{}',
  
  -- AI Insights included
  insights JSONB DEFAULT '[]',
  
  -- Delivery
  sent_at TIMESTAMPTZ,
  delivered BOOLEAN DEFAULT false,
  opened BOOLEAN DEFAULT false,
  resend_email_id TEXT,
  
  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'failed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(investor_id, period_month, period_year)
);

-- Indexes
CREATE INDEX idx_investor_reports_org ON public.investor_reports(organization_id);
CREATE INDEX idx_investor_reports_investor ON public.investor_reports(investor_id);
CREATE INDEX idx_investor_reports_period ON public.investor_reports(period_year, period_month);

-- Enable RLS
ALTER TABLE public.investor_reports ENABLE ROW LEVEL SECURITY;

-- Investors can view their own reports
CREATE POLICY "Investors can view own reports"
ON public.investor_reports
FOR SELECT
USING (
  investor_id = public.get_user_id(auth.uid())
);

-- Admins can view all reports in their organization
CREATE POLICY "Admins can view org reports"
ON public.investor_reports
FOR SELECT
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
);

-- Admins can insert reports
CREATE POLICY "Admins can insert reports"
ON public.investor_reports
FOR INSERT
WITH CHECK (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
);

-- Service role can insert/update (for edge functions)
CREATE POLICY "Service can manage reports"
ON public.investor_reports
FOR ALL
USING (true)
WITH CHECK (true);

-- Admins can update reports
CREATE POLICY "Admins can update reports"
ON public.investor_reports
FOR UPDATE
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
);