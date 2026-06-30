-- Alto-riesgo sesión paso 1/4 (autorizado por el usuario 2026-06-30).
-- Remueve 87 políticas deny_anon_* PERMISSIVE inertes (USING/WITH_CHECK = false).
-- Una política PERMISSIVE que nunca otorga es un no-op (RLS deniega por default si
-- ninguna permissive otorga), y además es un smell de seguridad (falsa "denegación").
-- Se conservan las 4 deny_anon RESTRICTIVE reales (en `users`), que SÍ enforced deny.
-- Efecto: 0 cambio de acceso · 254 -> 167 políticas · multiple_permissive 288 -> 217.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND policyname ILIKE 'deny_anon%'
      AND permissive='PERMISSIVE'
      AND coalesce(qual,'false')='false' AND coalesce(with_check,'false')='false'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Dropped % inert deny_anon permissive policies', n;
END $$;
