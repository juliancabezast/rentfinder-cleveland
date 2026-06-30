-- Alto-riesgo sesión paso 2/4 (autorizado por el usuario 2026-06-30).
-- Drop de 37 índices unused (idx_scan=0) que NO respaldan constraint NI soportan
-- ningún FK (legacy secundarios sobre status/type/created/etc.).
-- CONSERVA todos los índices que soportan FKs (incl. los 84 FK creados en
-- 20260629182717) + los que respaldan constraints. Recreables si una query rara
-- los necesitara. Efecto: unused_index 135 -> 98 (los 98 restantes = FK nuevos,
-- legítimos, "sin uso" sólo por ser recientes).
DO $$
DECLARE names text[]; nm text; n int := 0;
BEGIN
  WITH unused AS (
    SELECT s.indexrelid, s.relid, s.indexrelname AS idx
    FROM pg_stat_user_indexes s
    WHERE s.schemaname='public' AND s.idx_scan = 0
  ),
  noncon AS (
    SELECT u.* FROM unused u
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = u.indexrelid)
  ),
  idx_cols AS (
    SELECT n.indexrelid, n.relid, n.idx, i.indkey
    FROM noncon n JOIN pg_index i ON i.indexrelid = n.indexrelid
  )
  SELECT array_agg(ic.idx) INTO names
  FROM idx_cols ic
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint f
    WHERE f.contype='f' AND f.conrelid = ic.relid
      AND (string_to_array(ic.indkey::text,' '))[1:array_length(f.conkey,1)]
          = (SELECT array_agg(x::text) FROM unnest(f.conkey) x)
  );

  IF names IS NULL THEN RAISE NOTICE 'no candidates'; RETURN; END IF;
  FOREACH nm IN ARRAY names LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', nm);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Dropped % unused non-FK non-constraint indexes', n;
END $$;
