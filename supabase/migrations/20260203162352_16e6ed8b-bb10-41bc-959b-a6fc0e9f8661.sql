-- Add is_demo column to all tables that receive demo data
-- This allows permanent flagging of demo records that survives navigation

ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE public.calls 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE public.showings 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE public.lead_score_history 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE public.communications 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Create indexes for faster demo data queries
CREATE INDEX IF NOT EXISTS idx_properties_is_demo ON public.properties(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_leads_is_demo ON public.leads(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_calls_is_demo ON public.calls(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_showings_is_demo ON public.showings(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_lead_score_history_is_demo ON public.lead_score_history(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_communications_is_demo ON public.communications(is_demo) WHERE is_demo = true;