-- ============================================================
-- showing_available_slots: dedup existing duplicates + UNIQUE constraint
-- ============================================================
--
-- The manual "Schedule Showing" dialog was rendering the same time
-- multiple times because the query filter missed `property_id`, so a
-- 10:30 slot on Property A would be drawn alongside Property B's 10:30
-- as identical-looking <SelectItem>s. The frontend now filters by
-- property_id (commit fix), but we also harden the DB so that:
--   1. Any historical duplicate rows are collapsed (keeping bookings).
--   2. Future INSERTs cannot create the same (org, property, date, time)
--      twice — the `.upsert({ onConflict: "..." })` calls in
--      EnableSlotsDialog and ManageSlotsTab will become truly atomic.

-- 1. Collapse duplicates: for each (org, property, date, time) group with
--    >1 rows, keep ONE row (preferring booked rows so we don't lose
--    bookings, then preferring enabled rows, then by oldest created_at).
--    Delete the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, property_id, slot_date, slot_time
      ORDER BY
        is_booked DESC,                            -- keep booked rows
        is_enabled DESC,                           -- prefer enabled
        booked_at NULLS LAST,                      -- earliest booking wins
        created_at ASC                             -- oldest created wins
    ) AS rn
  FROM public.showing_available_slots
),
victims AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.showing_available_slots
WHERE id IN (SELECT id FROM victims);

-- 2. Add the UNIQUE constraint. After step 1 this should succeed; if it
--    still fails the deletion didn't catch some path — re-run step 1.
ALTER TABLE public.showing_available_slots
  DROP CONSTRAINT IF EXISTS showing_available_slots_org_property_date_time_unique;
ALTER TABLE public.showing_available_slots
  ADD CONSTRAINT showing_available_slots_org_property_date_time_unique
  UNIQUE (organization_id, property_id, slot_date, slot_time);

-- 3. Refresh PostgREST schema cache so the constraint is visible to the
--    onConflict logic in supabase-js immediately.
NOTIFY pgrst, 'reload schema';

-- 4. Verification — should return zero rows on success.
SELECT
  property_id,
  slot_date,
  slot_time,
  COUNT(*) AS still_duplicate
FROM public.showing_available_slots
GROUP BY organization_id, property_id, slot_date, slot_time
HAVING COUNT(*) > 1;
