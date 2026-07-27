-- Showings may only start on the hour or half-hour (Cleveland local :00 / :30).
-- This is the single source of truth: every write path (admin dialog, public
-- booking, Telegram bot, reschedule/edit, future flows) is validated here, so
-- an odd minute like 9:05 is impossible regardless of which UI produced it.
-- Demo/seed rows are exempt (not real bookings). Existing historical rows are
-- untouched — the trigger only validates NEW/updated scheduled_at values.
-- Applied via MCP apply_migration; recorded here for repo parity.
CREATE OR REPLACE FUNCTION public.enforce_showing_half_hour()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ny_minute int;
BEGIN
  IF NEW.scheduled_at IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  -- America/New_York is always a whole-hour offset, so the local minute is the
  -- meaningful one; extract it explicitly in Cleveland time to be tz-correct.
  ny_minute := extract(minute from (NEW.scheduled_at AT TIME ZONE 'America/New_York'))::int;
  IF ny_minute NOT IN (0, 30) THEN
    RAISE EXCEPTION 'Showings can only be booked on the hour (:00) or half-hour (:30), not :%',
      lpad(ny_minute::text, 2, '0')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_showing_half_hour ON public.showings;
CREATE TRIGGER trg_enforce_showing_half_hour
BEFORE INSERT OR UPDATE OF scheduled_at ON public.showings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_showing_half_hour();
