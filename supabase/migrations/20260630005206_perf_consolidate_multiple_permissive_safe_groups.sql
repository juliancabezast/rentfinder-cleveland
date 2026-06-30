-- Fase 7 (perf): consolidar multiple_permissive_policies — SUBSET SEGURO.
-- Fusiona solo grupos con MISMO (tabla, comando, roles, permissive) y >1 política,
-- EXCLUYENDO grupos que contengan políticas deny_* (smell aparte, a revisar).
-- La política fusionada = OR de los USING / OR de los WITH CHECK efectivos
-- (coalesce(with_check,qual)) -> acceso IDÉNTICO (semántica permissive = OR).
--
-- Aplicado a prod vía MCP apply_migration (autorizado por el usuario, 2026-06-30).
-- Resultado verificado: 291 -> 254 políticas; 33 fusionadas; 0 grupos seguros restantes;
-- advisor multiple_permissive_policies 571 -> 288; total perf lints 710 -> 427.
--
-- NOTA: el restante (288) es estructural — políticas FOR ALL (admin/service) que
-- solapan con políticas por-comando del mismo rol. Arreglarlo requiere reestructurar
-- el modelo (partir FOR ALL o segmentar por rol) y NO es mecánico — sesión dedicada.
--
-- NO fusionados (excluidos por contener deny_*, requieren revisión aparte):
--   organization_settings SELECT anon (deny_anon_organization_settings_select)
--   properties           SELECT anon (deny_anon_properties_select)

DO $$
DECLARE
  g record;
  v_using text;
  v_check text;
  v_names text[];
  v_pname text;
  v_newname text;
  v_create text;
  v_groups int := 0;
  v_dropped int := 0;
BEGIN
  CREATE TEMP TABLE _merge_groups ON COMMIT DROP AS
    WITH grp AS (
      SELECT tablename, cmd, array_to_string(roles,',') AS roles_str
      FROM pg_policies
      WHERE schemaname='public' AND permissive='PERMISSIVE'
      GROUP BY tablename, cmd, array_to_string(roles,',')
      HAVING count(*) > 1
    )
    SELECT g2.tablename, g2.cmd, g2.roles_str
    FROM grp g2
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=g2.tablename AND p.cmd=g2.cmd
        AND array_to_string(p.roles,',')=g2.roles_str AND p.permissive='PERMISSIVE'
        AND p.policyname ILIKE 'deny%'
    );

  FOR g IN SELECT * FROM _merge_groups LOOP
    SELECT string_agg(DISTINCT '(' || qual || ')', ' OR ') FILTER (WHERE qual IS NOT NULL)
    INTO v_using
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=g.tablename AND p.cmd=g.cmd
      AND array_to_string(p.roles,',')=g.roles_str AND p.permissive='PERMISSIVE';

    IF g.cmd IN ('INSERT','UPDATE','ALL') THEN
      SELECT string_agg(DISTINCT '(' || coalesce(with_check,qual) || ')', ' OR ')
               FILTER (WHERE coalesce(with_check,qual) IS NOT NULL)
      INTO v_check
      FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=g.tablename AND p.cmd=g.cmd
        AND array_to_string(p.roles,',')=g.roles_str AND p.permissive='PERMISSIVE';
    ELSE
      v_check := NULL;
    END IF;

    SELECT array_agg(policyname)
    INTO v_names
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=g.tablename AND p.cmd=g.cmd
      AND array_to_string(p.roles,',')=g.roles_str AND p.permissive='PERMISSIVE';

    FOREACH v_pname IN ARRAY v_names LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_pname, g.tablename);
      v_dropped := v_dropped + 1;
    END LOOP;

    v_newname := 'merged_' || lower(g.cmd) || '_' || replace(g.roles_str, ',', '_');
    v_create := format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO %s',
                       v_newname, g.tablename, g.cmd, g.roles_str);
    IF v_using IS NOT NULL THEN
      v_create := v_create || ' USING (' || v_using || ')';
    END IF;
    IF v_check IS NOT NULL THEN
      v_create := v_create || ' WITH CHECK (' || v_check || ')';
    END IF;
    EXECUTE v_create;

    v_groups := v_groups + 1;
  END LOOP;

  RAISE NOTICE 'Fusionados % grupos, dropeadas % políticas originales', v_groups, v_dropped;
END $$;
