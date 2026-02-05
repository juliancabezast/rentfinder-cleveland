-- Deny anonymous access to leads table
CREATE POLICY "deny_anon_leads"
ON public.leads
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_leads_insert"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_leads_update"
ON public.leads
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_leads_delete"
ON public.leads
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to users table
CREATE POLICY "deny_anon_users"
ON public.users
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_users_insert"
ON public.users
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_users_update"
ON public.users
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_users_delete"
ON public.users
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to organization_credentials table
CREATE POLICY "deny_anon_organization_credentials"
ON public.organization_credentials
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_organization_credentials_insert"
ON public.organization_credentials
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_organization_credentials_update"
ON public.organization_credentials
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_organization_credentials_delete"
ON public.organization_credentials
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to organization_settings table
CREATE POLICY "deny_anon_organization_settings"
ON public.organization_settings
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_organization_settings_insert"
ON public.organization_settings
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_organization_settings_update"
ON public.organization_settings
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_organization_settings_delete"
ON public.organization_settings
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to calls table
CREATE POLICY "deny_anon_calls"
ON public.calls
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_calls_insert"
ON public.calls
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_calls_update"
ON public.calls
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_calls_delete"
ON public.calls
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to communications table
CREATE POLICY "deny_anon_communications"
ON public.communications
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_communications_insert"
ON public.communications
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_communications_update"
ON public.communications
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_communications_delete"
ON public.communications
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to showings table
CREATE POLICY "deny_anon_showings"
ON public.showings
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_showings_insert"
ON public.showings
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_showings_update"
ON public.showings
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_showings_delete"
ON public.showings
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to consent_log table
CREATE POLICY "deny_anon_consent_log"
ON public.consent_log
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_consent_log_insert"
ON public.consent_log
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_consent_log_update"
ON public.consent_log
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_consent_log_delete"
ON public.consent_log
FOR DELETE
TO anon
USING (false);

-- Deny anonymous access to agent_tasks table
CREATE POLICY "deny_anon_agent_tasks"
ON public.agent_tasks
FOR SELECT
TO anon
USING (false);

CREATE POLICY "deny_anon_agent_tasks_insert"
ON public.agent_tasks
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "deny_anon_agent_tasks_update"
ON public.agent_tasks
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "deny_anon_agent_tasks_delete"
ON public.agent_tasks
FOR DELETE
TO anon
USING (false);