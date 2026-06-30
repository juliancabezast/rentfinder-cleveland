-- POST-rebuild de Lovable (frontend nuevo ya vivo). Autorizado por el usuario (2026-06-30).
-- Cierra los 3 pendientes que dependían de que el frontend repunteado estuviera desplegado.
-- Verificado: el frontend vivo solo llama 6 RPCs (RLS helpers + dashboard); NO llama
-- recalculate_lead_scores (usa edge fn recalculate-scores) ni los demás backend fns.

-- (1) Completar el lockdown SECURITY DEFINER: revocar EXECUTE de authenticated en los
-- backend fns (incl. recalculate_lead_scores — pendiente #4), conservando los 12 helpers
-- de RLS (los usan las políticas) y las 6 RPCs que el frontend llama. service_role se
-- conserva (edge fns/cron). Resultado: authenticated_security_definer 44 -> 18.
DO $$
DECLARE
  r record;
  v_allpol text;
  v_sig text;
  v_frontend text[] := ARRAY['count_complete_leads_today','count_leads_today','execute_agent_task_now',
                             'get_dashboard_summary','get_lead_funnel','pause_lead_agent_tasks'];
  n int := 0;
BEGIN
  SELECT string_agg(coalesce(qual,'')||' '||coalesce(with_check,''),' ')
  INTO v_allpol FROM pg_policies WHERE schemaname='public';

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.prosecdef = true
      AND pg_get_function_result(p.oid) <> 'trigger'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    IF (v_allpol LIKE '%'||r.proname||'(%') OR (r.proname = ANY(v_frontend)) THEN
      CONTINUE;  -- keep RLS helpers + frontend RPCs
    END IF;
    v_sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Revoked authenticated EXECUTE on % backend SECURITY DEFINER fns', n;
END $$;

-- (2) #6 final: borrar el token de Telegram (showings) de organization_settings.
-- El frontend nuevo (CommunicationsTab) ya escribe a organization_credentials, y las
-- edge fns leen credentials-first, así que ya no se necesita en settings (org-readable).
DELETE FROM public.organization_settings
WHERE key IN ('telegram_showings_bot_token','telegram_showings_chat_id');
