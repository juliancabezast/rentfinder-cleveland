-- Fair Housing (Phase 6): remove source-of-income (housing voucher / Section 8) as a
-- lead-scoring / conversion-ranking signal. Source of income is a protected class under many
-- state/local fair-housing ordinances; using it to score or rank leads creates differential-
-- treatment liability. Voucher status remains usable for PROPERTY MATCHING only
-- (pairing voucher holders with voucher-accepting units), which is permissible.
--
-- Companion edge-function edits (deployed separately):
--   - supabase/functions/predict-conversion/index.ts   (removed +0.10 "Has housing voucher" factor)
--   - supabase/functions/agent-hemlane-parser/index.ts  (removed +15 Section 8 intake boost)
--
-- This migration recreates recalculate_lead_scores() without the "+10 if has_voucher" block and
-- pins search_path='public'. Applied to production 2026-06-29 via Supabase Management API.
-- (CREATE OR REPLACE preserves the prior REVOKE of anon EXECUTE.)

CREATE OR REPLACE FUNCTION public.recalculate_lead_scores()
 RETURNS TABLE(leads_checked integer, leads_updated integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _lead RECORD; _new_score int; _checked int := 0; _updated int := 0; _has_showing boolean; _note_text text; _call_count int; _note_count int; _showing_interest boolean; _reason text;
BEGIN
  FOR _lead IN SELECT l.id, l.lead_score, l.phone, l.email, l.status, l.interested_property_id, l.organization_id, l.is_priority, l.priority_reason FROM leads l WHERE l.status NOT IN ('lost', 'converted') LOOP
    _checked := _checked + 1;
    _new_score := 30;
    _showing_interest := false;
    IF _lead.phone IS NOT NULL AND _lead.phone != '' THEN _new_score := _new_score + 5; END IF;
    IF _lead.email IS NOT NULL AND _lead.email != '' THEN _new_score := _new_score + 5; END IF;
    IF (_lead.phone IS NOT NULL AND _lead.phone != '') AND (_lead.email IS NOT NULL AND _lead.email != '') THEN _new_score := _new_score + 3; END IF;
    IF _lead.interested_property_id IS NOT NULL THEN _new_score := _new_score + 5; END IF;
    -- (Fair Housing) voucher/Section 8 source-of-income scoring removed.
    IF _lead.status IN ('engaged', 'nurturing') THEN _new_score := _new_score + 5; END IF;
    IF _lead.status IN ('qualified', 'showing_scheduled') THEN _new_score := _new_score + 15; END IF;
    IF _lead.status IN ('showed', 'in_application') THEN _new_score := _new_score + 20; END IF;
    SELECT EXISTS(SELECT 1 FROM showings s WHERE s.lead_id = _lead.id) INTO _has_showing;
    IF _has_showing THEN _new_score := _new_score + 15; END IF;
    SELECT COUNT(*) INTO _call_count FROM calls c WHERE c.lead_id = _lead.id;
    IF _call_count > 0 THEN _new_score := _new_score + 5; END IF;
    IF _call_count >= 3 THEN _new_score := _new_score + 5; END IF;
    SELECT string_agg(n.content, ' ') INTO _note_text FROM lead_notes n WHERE n.lead_id = _lead.id;
    IF _note_text IS NOT NULL THEN
      SELECT COUNT(*) INTO _note_count FROM lead_notes n WHERE n.lead_id = _lead.id;
      IF _note_count > 0 THEN _new_score := _new_score + 3; END IF;
      IF lower(_note_text) ~ '(showing|viewing|schedule a view|tour|visit|come see|see the property|see the unit|interested.*rental|like to schedule)' THEN _new_score := _new_score + 40; _showing_interest := true; END IF;
    END IF;
    _new_score := LEAST(_new_score, 100);
    IF _new_score != COALESCE(_lead.lead_score, 0) THEN
      _reason := 'Score recalculation';
      IF _showing_interest THEN _reason := 'Recalc: showing/tour interest detected in notes'; END IF;
      UPDATE leads SET lead_score = _new_score, is_priority = CASE WHEN _showing_interest THEN true WHEN _new_score >= 85 THEN true ELSE is_priority END, priority_reason = CASE WHEN _showing_interest THEN 'Showing/tour interest detected in notes' WHEN _new_score >= 85 THEN 'High lead score (' || _new_score || ')' ELSE priority_reason END, updated_at = now() WHERE id = _lead.id;
      INSERT INTO lead_score_history (lead_id, organization_id, previous_score, new_score, change_amount, reason_code, reason_text, triggered_by, changed_by_agent) VALUES (_lead.id, _lead.organization_id, COALESCE(_lead.lead_score, 0), _new_score, _new_score - COALESCE(_lead.lead_score, 0), 'recalculation', _reason, 'manual_adjustment', 'recalculate_lead_scores');
      _updated := _updated + 1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT _checked, _updated;
END;
$function$;