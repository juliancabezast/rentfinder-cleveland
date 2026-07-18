-- =====================================================================
-- Add lead_id to the hot_lead Telegram payload (2026-07-18)
-- Applied to remote via MCP apply_migration (name hot_lead_payload_add_lead_id).
-- Kept here for repo <-> DB parity.
--
-- The Hot Leads bot card gains per-lead action buttons ("Registrar acción"),
-- which need the lead UUID in the callback_data. The DB trigger already has
-- NEW.id — thread it into the payload. Only change vs 20260714210000 is the
-- added 'lead_id' key.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_lead_hot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold int := 85;
  v_now_ok boolean;
  v_was_ok boolean;
  v_property text;
  v_total int := 0;
  v_more int := 0;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsenp6dGhnb3Rmd29pYXJhbm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjM5NTksImV4cCI6MjA4NTMzOTk1OX0.zis7q1VXP1IKbL8Zc9B5oe9MPcSyVJbXVCNDYE7d690';
BEGIN
  v_now_ok := COALESCE(NEW.lead_score, 0) >= v_threshold
              AND NEW.phone IS NOT NULL AND btrim(NEW.phone) <> ''
              AND NOT COALESCE(NEW.is_demo, false);
  v_was_ok := COALESCE(OLD.lead_score, 0) >= v_threshold
              AND OLD.phone IS NOT NULL AND btrim(OLD.phone) <> ''
              AND NOT COALESCE(OLD.is_demo, false);

  IF v_now_ok AND NOT v_was_ok THEN
    SELECT p.address
             || COALESCE(' ' || NULLIF(btrim(p.unit_number), ''), '')
             || COALESCE(' · ' || NULLIF(btrim(p.city), ''), '')
      INTO v_property
      FROM lead_property_interests i
      JOIN properties p ON p.id = i.property_id
     WHERE i.lead_id = NEW.id
     ORDER BY COALESCE(i.last_interest_at, i.created_at) DESC
     LIMIT 1;

    SELECT count(*) INTO v_total
      FROM lead_property_interests i WHERE i.lead_id = NEW.id;
    v_more := GREATEST(v_total - 1, 0);

    PERFORM net.http_post(
      url := 'https://glzzzthgotfwoiaranmp.supabase.co/functions/v1/telegram-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon,
        'Authorization', 'Bearer ' || v_anon
      ),
      body := jsonb_build_object(
        'channel', 'showings',
        'event', 'hot_lead',
        'payload', jsonb_build_object(
          'lead_id', NEW.id,
          'name', COALESCE(NULLIF(TRIM(NEW.full_name), ''),
                           NULLIF(TRIM(COALESCE(NEW.first_name,'') || ' ' || COALESCE(NEW.last_name,'')), ''),
                           'Lead'),
          'score', NEW.lead_score,
          'phone', NEW.phone,
          'source', NEW.source,
          'property', v_property,
          'more_count', v_more,
          'has_voucher', COALESCE(NEW.has_voucher, false),
          'voucher_amount', NEW.voucher_amount,
          'move_in', CASE WHEN NEW.move_in_date IS NOT NULL
                          THEN to_char(NEW.move_in_date, 'Mon FMDD') ELSE NULL END
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;
