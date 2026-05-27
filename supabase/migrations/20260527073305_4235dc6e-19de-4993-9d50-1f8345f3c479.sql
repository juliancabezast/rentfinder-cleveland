-- 1. Email retry columns
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts   INTEGER NOT NULL DEFAULT 3;

-- 2. UNIQUE constraints
ALTER TABLE public.campaign_leads DROP CONSTRAINT IF EXISTS campaign_leads_campaign_lead_unique;
ALTER TABLE public.campaign_leads ADD CONSTRAINT campaign_leads_campaign_lead_unique UNIQUE (campaign_id, lead_id);

ALTER TABLE public.campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_campaign_lead_unique;
ALTER TABLE public.campaign_recipients ADD CONSTRAINT campaign_recipients_campaign_lead_unique UNIQUE (campaign_id, lead_id);

-- 3. RLS policies for authenticated users
DROP POLICY IF EXISTS "Users read own org campaigns" ON public.campaigns;
CREATE POLICY "Users read own org campaigns" ON public.campaigns
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Editors manage own org campaigns" ON public.campaigns;
CREATE POLICY "Editors manage own org campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  );

DROP POLICY IF EXISTS "Users read own org campaign leads" ON public.campaign_leads;
CREATE POLICY "Users read own org campaign leads" ON public.campaign_leads
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Editors manage own org campaign leads" ON public.campaign_leads;
CREATE POLICY "Editors manage own org campaign leads" ON public.campaign_leads
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  );

DROP POLICY IF EXISTS "Users read own org campaign recipients" ON public.campaign_recipients;
CREATE POLICY "Users read own org campaign recipients" ON public.campaign_recipients
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

DROP POLICY IF EXISTS "Editors manage own org campaign recipients" ON public.campaign_recipients;
CREATE POLICY "Editors manage own org campaign recipients" ON public.campaign_recipients
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  );

-- 5. Index for campaign email lookups
CREATE INDEX IF NOT EXISTS idx_email_events_details_campaign_status
  ON public.email_events USING gin (details jsonb_path_ops)
  WHERE details ? 'campaign_id';

-- 6. Email consent columns on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_marketing_consent    BOOLEAN,
  ADD COLUMN IF NOT EXISTS email_marketing_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at            TIMESTAMPTZ;

-- 7. Per-campaign send pacing
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS send_delay_seconds INTEGER NOT NULL DEFAULT 5;