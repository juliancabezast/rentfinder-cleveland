-- Phase 7 (performance): add a btree index on every single-column foreign key that lacked one
-- (Supabase advisor: unindexed_foreign_keys, ~84 FKs). Idempotent; index name idx_<table>_<column>.
-- Safe: indexes only improve read/cascade performance; no semantic change.
-- Applied to production 2026-06-29 via Supabase Management API.
DO $$
DECLARE r RECORD; idxname text;
BEGIN
  FOR r IN
    SELECT cl.relname AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
      )
  LOOP
    idxname := left('idx_' || r.tbl || '_' || r.col, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', idxname, r.tbl, r.col);
  END LOOP;
END $$;
