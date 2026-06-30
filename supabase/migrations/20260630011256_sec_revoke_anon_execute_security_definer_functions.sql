-- Fase 7 (seguridad): lockdown de EXECUTE en SECURITY DEFINER functions.
-- Autorizado por el usuario (2026-06-30): plan seguro + revoke auth en cron-only.
-- Resultado verificado: security advisor 147 -> 61
--   anon_security_definer_executable    71 -> 12 (solo helpers RLS)
--   authenticated_security_definer_exec 71 -> 44
--
-- Clasificación (verificada read-only contra pg_policies + greps de frontend/edge):
--   1) trigger fns (22): revoke PUBLIC/anon/authenticated — los triggers disparan
--      igual, no requieren EXECUTE del caller.
--   2) RLS helpers (12, p.ej. has_role/get_user_organization_id/is_admin): INTOCABLES,
--      las políticas RLS las invocan; revocar rompería el RLS de authenticated.
--   3) frontend-auth (6: count_leads_today, count_complete_leads_today,
--      get_dashboard_summary, get_lead_funnel, execute_agent_task_now,
--      pause_lead_agent_tasks): revoke anon, conservar authenticated (+ service_role).
--   4a) cron-only (5: reset_agent_daily_counters, schedule_conversion_predictions,
--       schedule_showing_confirmations, schedule_stale_leads_for_recapture,
--       check_coming_soon_expiring): revoke anon+authenticated, conservar service_role.
--   4b) backend (26): revoke anon, conservar authenticated (sitio vivo PRE-rebuild de
--       Lovable podría llamar alguna como authenticated, p.ej. recalculate_lead_scores)
--       + service_role. El revoke de authenticated-backend queda para POST-rebuild (#4).
-- Edge fns llaman estas RPCs vía client de service_role (verificado en send-message
-- y agent-task-dispatcher) -> cubierto por el GRANT service_role.

DO $$
DECLARE
  r record;
  v_allpol text;
  v_sig text;
  v_frontend text[] := ARRAY['count_complete_leads_today','count_leads_today','execute_agent_task_now',
                             'get_dashboard_summary','get_lead_funnel','pause_lead_agent_tasks'];
  v_cron_only text[] := ARRAY['reset_agent_daily_counters','schedule_conversion_predictions',
                             'schedule_showing_confirmations','schedule_stale_leads_for_recapture',
                             'check_coming_soon_expiring'];
  n_trig int:=0; n_rls int:=0; n_front int:=0; n_cron int:=0; n_back int:=0;
BEGIN
  SELECT string_agg(coalesce(qual,'')||' '||coalesce(with_check,''),' ')
  INTO v_allpol FROM pg_policies WHERE schemaname='public';

  FOR r IN
    SELECT p.oid, p.proname,
      (pg_get_function_result(p.oid)='trigger') AS is_trigger,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.prosecdef=true
  LOOP
    v_sig := format('public.%I(%s)', r.proname, r.args);

    IF r.is_trigger THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
      n_trig := n_trig+1;
    ELSIF v_allpol LIKE '%'||r.proname||'(%' THEN
      n_rls := n_rls+1;  -- intocable
    ELSIF r.proname = ANY(v_frontend) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
      n_front := n_front+1;
    ELSIF r.proname = ANY(v_cron_only) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
      n_cron := n_cron+1;
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
      n_back := n_back+1;
    END IF;
  END LOOP;

  RAISE NOTICE 'triggers=% rls_kept=% frontend=% cron_only=% backend=%', n_trig, n_rls, n_front, n_cron, n_back;
END $$;
