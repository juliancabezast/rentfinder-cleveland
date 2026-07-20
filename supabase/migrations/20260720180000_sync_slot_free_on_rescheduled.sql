-- A rescheduled showing must free its slot (like cancelled/no_show) so the time
-- reopens for rebooking and no stale 'Booked'/'Rescheduled' cell lingers on the
-- Showings agenda. Previously only cancelled/no_show freed the slot, so any path
-- that set status='rescheduled' (e.g. ShowingReportDialog) left the slot booked.
-- Applied via MCP on 2026-07-20; committed here for repo↔prod parity.
CREATE OR REPLACE FUNCTION public.sync_slot_booking_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
  BEGIN
    IF NEW.status IN ('cancelled', 'no_show', 'rescheduled')
       AND OLD.status NOT IN ('cancelled', 'no_show', 'rescheduled') THEN
      UPDATE public.showing_available_slots
      SET is_booked = false, booked_showing_id = NULL, booked_at = NULL, updated_at = now()
      WHERE booked_showing_id = NEW.id;
    END IF;
    RETURN NEW;
  END; $function$;
