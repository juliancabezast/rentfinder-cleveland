-- Create referrals table for lead referral program
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Referrer (the converted lead who referred someone)
  referrer_lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  referrer_name TEXT,
  referrer_phone TEXT,
  
  -- Referred (the new prospect)
  referred_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  referred_name TEXT,
  referred_phone TEXT NOT NULL,
  referred_email TEXT,
  
  -- Tracking
  referral_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'contacted',
    'converted',
    'rewarded',
    'expired'
  )),
  
  -- Reward
  reward_type TEXT DEFAULT 'cash' CHECK (reward_type IN ('cash', 'rent_credit', 'gift_card')),
  reward_amount DECIMAL(10,2) DEFAULT 100.00,
  reward_paid_at TIMESTAMPTZ,
  
  -- Messaging
  referral_message_sent_at TIMESTAMPTZ,
  referral_channel TEXT CHECK (referral_channel IN ('sms', 'whatsapp', 'email')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  
  UNIQUE(referrer_lead_id, referred_phone)
);

-- Create indexes
CREATE INDEX idx_referrals_org ON public.referrals(organization_id);
CREATE INDEX idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_lead_id);
CREATE INDEX idx_referrals_status ON public.referrals(status);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything
CREATE POLICY "super_admin_all_referrals"
ON public.referrals FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Admin and editor can manage referrals in their organization
CREATE POLICY "admin_editor_manage_referrals"
ON public.referrals FOR ALL
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'))
  AND organization_id = get_user_organization_id(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'))
  AND organization_id = get_user_organization_id(auth.uid())
);

-- Deny anonymous access
CREATE POLICY "deny_anon_referrals_select"
ON public.referrals FOR SELECT
USING (false);

CREATE POLICY "deny_anon_referrals_insert"
ON public.referrals FOR INSERT
WITH CHECK (false);

CREATE POLICY "deny_anon_referrals_update"
ON public.referrals FOR UPDATE
USING (false);

CREATE POLICY "deny_anon_referrals_delete"
ON public.referrals FOR DELETE
USING (false);

-- Allow public access to referrals by code (for the public referral page)
-- This is handled via edge function with service role key