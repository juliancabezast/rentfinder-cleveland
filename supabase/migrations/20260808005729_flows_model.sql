-- ── Flow builder: the structure of the automation, as data ───────────
-- Until now "what happens to a lead" lived in DB triggers plus a switch in the
-- dispatcher, so nobody could see it or change it without a deploy.
--
-- This model runs ALONGSIDE that machinery, never instead of it. Every existing
-- flow is imported as a definition but seeded is_active = false, and the old
-- hardcoded path keeps sending. Flipping a flow active is what hands it over.
-- welcome_sequence alone moves 15,755 emails and 196 leads sit inside the
-- nurture chain — this is not something to switch over implicitly.

CREATE TABLE IF NOT EXISTS public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Only triggers that really exist today. Adding one means wiring a producer.
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'lead_created', 'showing_booked', 'showing_completed',
    'showing_no_show', 'manual_enroll'
  )),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- false = the legacy hardcoded path still owns this flow.
  is_active boolean NOT NULL DEFAULT false,
  -- true for the five imported from code; blocks deleting them by accident.
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most ONE active flow per trigger per org: two flows racing on the same
-- event would double-mail every lead.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_flows_active_per_trigger
  ON public.flows (organization_id, trigger_type)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  position integer NOT NULL,
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  -- Same shape as EmailTemplateConfig in src/lib/emailTemplateDefaults.ts, so
  -- the step editor is the editor that already exists and the runtime uses
  -- buildEmailFromConfig, which the dispatcher already has.
  email_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Checked BEFORE every send, never only at enrollment.
  exit_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, position)
);

CREATE TABLE IF NOT EXISTS public.flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','stopped')),
  -- Mirrors leads.nurture_outcome so the two vocabularies agree.
  outcome text CHECK (outcome IN ('booked','replied','unsubscribed','exhausted','stopped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_step_at timestamptz,
  ended_at timestamptz
);

-- One live run per lead per flow — re-entering must not fork a second chain.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_flow_runs_active
  ON public.flow_runs (flow_id, lead_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_flow_runs_org_flow ON public.flow_runs (organization_id, flow_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON public.flow_steps (flow_id, position);

CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_flow_steps_updated_at BEFORE UPDATE ON public.flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: org-scoped read, admin/editor write ─────────────────────────
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read flows" ON public.flows FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "admins manage flows" ON public.flows FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor')))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
         AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor')));

CREATE POLICY "org members read flow steps" ON public.flow_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.flows f WHERE f.id = flow_id
                 AND f.organization_id = public.get_user_organization_id(auth.uid())));
CREATE POLICY "admins manage flow steps" ON public.flow_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.flows f WHERE f.id = flow_id
                 AND f.organization_id = public.get_user_organization_id(auth.uid())
                 AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.flows f WHERE f.id = flow_id
                 AND f.organization_id = public.get_user_organization_id(auth.uid())
                 AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))));

CREATE POLICY "org members read flow runs" ON public.flow_runs FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- Runs are written by the engine (service_role), never by a browser.
GRANT SELECT ON public.flow_runs TO authenticated;
