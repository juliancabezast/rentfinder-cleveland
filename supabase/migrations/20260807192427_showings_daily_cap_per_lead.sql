-- ── Cap self-service bookings per person, per day ────────────────────
-- Nothing anywhere limited how many showings one person could book. The only
-- limit was MAX_TOUR_STOPS in the public page, cosmetic and client-side (a
-- reload got around it). One renter could take half an afternoon and, if they
-- no-showed, that time was simply lost to everyone else.
--
-- This lives in a trigger because there are FOUR insert paths into showings
-- (book-public-showing, two in ScheduleShowingDialog, the demo seeder); a cap
-- written in the edge function alone would leave the admin panel uncapped.
--
-- Scope: SELF-SERVICE ONLY (booking_source = 'public_link'). Staff tools —
-- the admin dialog ('admin') and the Telegram bot ('telegram_bot') — pass
-- through, so a human can still grant a third showing deliberately. The count
-- itself includes every active showing that day regardless of source, so two
-- admin-booked showings do block a third self-booked one.
-- book-public-showing only honours a caller-supplied booking_source when the
-- request carries the service-role key, so an anonymous visitor is always
-- 'public_link' and cannot opt out of this cap.
CREATE OR REPLACE FUNCTION public.enforce_showing_daily_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cap int;
  taken int;
  the_day date;
BEGIN
  IF COALESCE(NEW.is_demo, false) OR NEW.booking_source IS DISTINCT FROM 'public_link' THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('scheduled', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- Per-org override, default 2.
  SELECT COALESCE((value #>> '{}')::int, 2) INTO cap
  FROM public.organization_settings
  WHERE organization_id = NEW.organization_id
    AND key = 'max_showings_per_day_per_lead';
  cap := COALESCE(cap, 2);
  IF cap <= 0 THEN
    RETURN NEW; -- 0 or negative disables the cap
  END IF;

  -- Cleveland local day — the same convention as enforce_showing_half_hour
  -- and count_leads_today, so "a day" means one thing across the system.
  the_day := (NEW.scheduled_at AT TIME ZONE 'America/New_York')::date;

  SELECT count(*) INTO taken
  FROM public.showings s
  WHERE s.organization_id = NEW.organization_id
    AND s.lead_id = NEW.lead_id
    AND s.id <> NEW.id
    AND s.status IN ('scheduled', 'confirmed')
    AND COALESCE(s.is_demo, false) = false
    AND (s.scheduled_at AT TIME ZONE 'America/New_York')::date = the_day;

  IF taken >= cap THEN
    RAISE EXCEPTION 'showing_daily_cap: this person already has % showing(s) that day', taken
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_showing_daily_cap ON public.showings;
CREATE TRIGGER trg_enforce_showing_daily_cap
  BEFORE INSERT ON public.showings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_showing_daily_cap();
