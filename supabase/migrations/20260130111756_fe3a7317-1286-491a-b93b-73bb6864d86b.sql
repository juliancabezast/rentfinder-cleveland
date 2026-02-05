-- Allow leasing agents to create leads in their organization
CREATE POLICY "leasing_agent_insert_leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'leasing_agent')
  AND organization_id = public.get_user_organization_id(auth.uid())
);