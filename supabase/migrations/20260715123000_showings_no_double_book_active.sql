-- =====================================================================
-- Double-booking DB safety net (2026-07-15)
-- Applied to remote via MCP apply_migration
-- (showings_no_double_book_active_2026_07_15). Repo <-> DB parity.
--
-- Single-leasing-agent model: at most one ACTIVE (scheduled/confirmed) real
-- showing per org per instant. The app-level "block all properties at this
-- time" logic in book-public-showing can race when two bookings for DIFFERENT
-- properties at the same time interleave (public page + the new Telegram bot):
-- each atomically claims its own per-property slot row, so neither claim sees
-- the other. This partial unique index makes the showing INSERT the
-- serialization point; book-public-showing maps the unique violation to 409.
-- (Verified 0 existing collisions among active non-demo showings before adding.)
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS showings_one_active_per_org_time
  ON public.showings (organization_id, scheduled_at)
  WHERE status IN ('scheduled', 'confirmed') AND COALESCE(is_demo, false) = false;
