-- Feature: allow group tours (2+ people, SAME property, SAME time) while STILL
-- blocking a DIFFERENT property at the same agent-time. The old partial unique
-- index showings_one_active_per_org_time on (organization_id, scheduled_at)
-- blocked EVERY second booking at an instant regardless of property, which forbids
-- group tours. The invariant "all active showings at a given (org, instant) share
-- ONE property" cannot be expressed as a unique index, so we enforce it with a
-- BEFORE trigger + a per-(org,instant) advisory lock (which restores the
-- race-proofness the unique index provided).
--
-- Applied to prod via MCP apply_migration on 2026-07-25; recorded here for parity.

DROP INDEX IF EXISTS public.showings_one_active_per_org_time;

CREATE OR REPLACE FUNCTION public.enforce_showing_agent_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only active, real (non-demo) showings occupy the single agent's time.
  IF NEW.status NOT IN ('scheduled', 'confirmed') OR COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent writers at the same (org, instant) so the EXISTS check
  -- below is atomic with the write (replaces the dropped unique index's
  -- serialization). The lock auto-releases at end of transaction.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.organization_id::text),
    hashtext(NEW.scheduled_at::text)
  );

  -- Block ONLY a DIFFERENT property at this exact instant (one agent, one place).
  -- Same property + same instant is allowed -> group tour.
  IF EXISTS (
    SELECT 1 FROM public.showings s
    WHERE s.organization_id = NEW.organization_id
      AND s.scheduled_at = NEW.scheduled_at
      AND s.id <> NEW.id
      AND s.status IN ('scheduled', 'confirmed')
      AND COALESCE(s.is_demo, false) = false
      AND s.property_id <> NEW.property_id
  ) THEN
    -- Reuse unique_violation (23505) so every existing app-layer catch
    -- (book-public-showing, ScheduleShowingDialog) keeps mapping it to a 409.
    RAISE EXCEPTION 'showing_slot_conflict: a different property is already booked at this time'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_showing_agent_slot ON public.showings;
CREATE TRIGGER trg_enforce_showing_agent_slot
  BEFORE INSERT OR UPDATE OF scheduled_at, status, property_id, is_demo
  ON public.showings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_showing_agent_slot();
