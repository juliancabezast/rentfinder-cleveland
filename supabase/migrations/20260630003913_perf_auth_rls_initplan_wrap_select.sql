-- Fase 7 (perf): auth_rls_initplan
-- Envuelve auth.*()/current_setting() en (select ...) en las 158 políticas RLS
-- afectadas, para que se evalúen UNA vez por query en vez de por fila.
-- Semánticamente idéntico (un subquery escalar devuelve el mismo valor que la
-- llamada directa); la lógica de acceso no cambia.
--
-- Aplicado a prod vía MCP apply_migration (autorizado por el usuario, 2026-06-30).
-- Verificación: 158 -> 0 en advisor `auth_rls_initplan`; 291 políticas intactas.
--
-- Idempotente: el DO solo reescribe políticas con auth.*/current_setting NO
-- envueltas todavía; re-ejecutar no hace nada (0 filas -> EXCEPTION de guarda,
-- por lo que se omite la guarda al re-correr sobre una DB ya migrada).

DO $$
DECLARE
  r record;
  v_new_qual text;
  v_new_check text;
  v_sql text;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'auth\.(uid|role|jwt|email)\(|current_setting\('
      AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) !~* '\(\s*select\s+auth\.|\(\s*select\s+current_setting'
  LOOP
    v_new_qual := CASE WHEN r.qual IS NOT NULL THEN
      regexp_replace(
        regexp_replace(r.qual, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g'),
        'current_setting\(([^)]*)\)', '(select current_setting(\1))', 'g')
      ELSE NULL END;
    v_new_check := CASE WHEN r.with_check IS NOT NULL THEN
      regexp_replace(
        regexp_replace(r.with_check, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g'),
        'current_setting\(([^)]*)\)', '(select current_setting(\1))', 'g')
      ELSE NULL END;

    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF v_new_qual IS NOT NULL THEN
      v_sql := v_sql || ' USING (' || v_new_qual || ')';
    END IF;
    IF v_new_check IS NOT NULL THEN
      v_sql := v_sql || ' WITH CHECK (' || v_new_check || ')';
    END IF;

    EXECUTE v_sql;
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'auth_rls_initplan: % políticas reescritas', v_count;
END $$;
