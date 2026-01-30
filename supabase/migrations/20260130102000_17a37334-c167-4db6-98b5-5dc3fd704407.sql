-- =============================================
-- BLOCK ALL ANONYMOUS ACCESS TO SENSITIVE TABLES
-- (standardize deny_anon policy names)
-- =============================================

DO $$
DECLARE
  tables_to_protect TEXT[] := ARRAY[
    'users',
    'leads',
    'organizations',
    'organization_settings',
    'organization_credentials',
    'properties',
    'property_alerts',
    'investor_property_access',
    'calls',
    'communications',
    'showings',
    'agent_tasks',
    'lead_score_history',
    'consent_log',
    'system_logs',
    'cost_records',
    'investor_insights',
    'faq_documents',
    'system_settings'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_protect
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = t
    ) THEN
      -- Drop both legacy and standardized deny policies if they exist
      EXECUTE format('DROP POLICY IF EXISTS "deny_anon_%s" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "deny_anon_%s_select" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "deny_anon_%s_insert" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "deny_anon_%s_update" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "deny_anon_%s_delete" ON public.%I', t, t);

      -- Create standardized deny policies for anon role
      EXECUTE format('CREATE POLICY "deny_anon_%s_select" ON public.%I FOR SELECT TO anon USING (false)', t, t);
      EXECUTE format('CREATE POLICY "deny_anon_%s_insert" ON public.%I FOR INSERT TO anon WITH CHECK (false)', t, t);
      EXECUTE format('CREATE POLICY "deny_anon_%s_update" ON public.%I FOR UPDATE TO anon USING (false)', t, t);
      EXECUTE format('CREATE POLICY "deny_anon_%s_delete" ON public.%I FOR DELETE TO anon USING (false)', t, t);

      RAISE NOTICE 'Protected table: %', t;
    END IF;
  END LOOP;
END $$;

-- Ensure RLS is enabled on all listed tables
DO $$
DECLARE
  t TEXT;
  tables_to_check TEXT[] := ARRAY[
    'users', 'leads', 'organizations', 'organization_settings',
    'organization_credentials', 'properties', 'property_alerts',
    'investor_property_access', 'calls', 'communications',
    'showings', 'agent_tasks', 'lead_score_history',
    'consent_log', 'system_logs', 'cost_records',
    'investor_insights', 'faq_documents', 'system_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_check
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;