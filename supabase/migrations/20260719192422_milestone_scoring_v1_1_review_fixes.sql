-- ============================================================================
-- MILESTONE SCORING v1.1 — adversarial-review fixes (2026-07-19):
--  (1) 'confirmed' showings scored as agendó (50), not intentó (10) — confirming
--      an appointment must never demote the lead (3 finders converged on this).
--  (2) NULL-safe lost check: status IS DISTINCT FROM 'lost' (NULL status would
--      have produced is_priority = NULL, invisible to .eq(is_priority, true)).
--  (3) Org-scoped recompute: recalculate_lead_scores(p_org uuid DEFAULT NULL) —
--      the edge fn validates the caller's org and now actually passes it
--      (CLAUDE.md rule: every query must filter by organization_id).
--  (4) trg_milestone_leads gated to score-relevant status transitions only.
-- NOTE: the milestone CASE ladder lives in BOTH compute_milestone_score and the
-- set-based LATERAL inside recalculate_lead_scores — change them TOGETHER.
-- ============================================================================

-- (1) compute: confirmed = agendó
CREATE OR REPLACE FUNCTION public.compute_milestone_score(p_lead_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Ladder twin: keep in sync with the LATERAL in recalculate_lead_scores().
  SELECT GREATEST(
    CASE WHEN l.status IN ('in_application','converted') THEN 100 ELSE 0 END,
    COALESCE((SELECT MAX(CASE s.status WHEN 'completed' THEN 80
                                       WHEN 'scheduled' THEN 50
                                       WHEN 'confirmed' THEN 50
                                       ELSE 10 END)
              FROM public.showings s
              WHERE s.lead_id = l.id AND NOT COALESCE(s.is_demo, false)), 0))
  FROM public.leads l WHERE l.id = p_lead_id
$$;

-- (2) apply: NULL-safe lost check
CREATE OR REPLACE FUNCTION public.apply_milestone_score(p_lead_id uuid, p_trigger text DEFAULT 'event')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_new int;
  v_pri boolean;
  v_label text;
BEGIN
  SELECT id, organization_id, lead_score, is_priority, status, COALESCE(is_demo,false) AS is_demo
    INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF v_lead IS NULL OR v_lead.is_demo THEN RETURN; END IF;

  v_new := public.compute_milestone_score(p_lead_id);
  v_pri := (v_new >= 50 AND v_lead.status IS DISTINCT FROM 'lost');
  v_label := CASE v_new WHEN 100 THEN 'aplico' WHEN 80 THEN 'asistio'
                        WHEN 50 THEN 'agendo' WHEN 10 THEN 'intento' ELSE 'normal' END;

  IF v_new IS DISTINCT FROM v_lead.lead_score OR v_pri IS DISTINCT FROM v_lead.is_priority THEN
    UPDATE public.leads SET
      lead_score = v_new,
      is_priority = v_pri,
      priority_reason = CASE WHEN v_pri THEN 'Milestone: ' || v_label ELSE NULL END,
      updated_at = NOW()
    WHERE id = p_lead_id;

    IF v_new IS DISTINCT FROM v_lead.lead_score THEN
      INSERT INTO public.lead_score_history
        (organization_id, lead_id, previous_score, new_score, change_amount, reason_code, reason_text, triggered_by)
      VALUES
        (v_lead.organization_id, p_lead_id, v_lead.lead_score, v_new,
         v_new - COALESCE(v_lead.lead_score, 0),
         'milestone_' || v_label, 'Milestone engine (' || p_trigger || ')', 'milestone_engine');
    END IF;
  END IF;
END;
$$;

-- (3) org-scoped recompute (replaces the 0-arg version)
DROP FUNCTION public.recalculate_lead_scores();
CREATE FUNCTION public.recalculate_lead_scores(p_org uuid DEFAULT NULL)
RETURNS TABLE(leads_checked integer, leads_updated integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checked int;
  v_updated int;
BEGIN
  CREATE TEMP TABLE _milestone_recompute ON COMMIT DROP AS
  SELECT l.id, l.organization_id, l.lead_score AS old_score, l.is_priority AS old_pri, l.status,
         GREATEST(
           CASE WHEN l.status IN ('in_application','converted') THEN 100 ELSE 0 END,
           COALESCE(sx.ms, 0)) AS new_score
  FROM public.leads l
  LEFT JOIN LATERAL (
    -- Ladder twin: keep in sync with compute_milestone_score().
    SELECT MAX(CASE s.status WHEN 'completed' THEN 80
                             WHEN 'scheduled' THEN 50
                             WHEN 'confirmed' THEN 50
                             ELSE 10 END) AS ms
    FROM public.showings s WHERE s.lead_id = l.id AND NOT COALESCE(s.is_demo, false)
  ) sx ON true
  WHERE NOT COALESCE(l.is_demo, false)
    AND (p_org IS NULL OR l.organization_id = p_org);

  SELECT count(*) INTO v_checked FROM _milestone_recompute;

  INSERT INTO public.lead_score_history
    (organization_id, lead_id, previous_score, new_score, change_amount, reason_code, reason_text, triggered_by)
  SELECT organization_id, id, old_score, new_score, new_score - COALESCE(old_score, 0),
         'milestone_' || CASE new_score WHEN 100 THEN 'aplico' WHEN 80 THEN 'asistio'
                                        WHEN 50 THEN 'agendo' WHEN 10 THEN 'intento' ELSE 'normal' END,
         'Milestone recompute', 'milestone_engine'
  FROM _milestone_recompute
  WHERE new_score IS DISTINCT FROM old_score;

  UPDATE public.leads l SET
    lead_score = m.new_score,
    is_priority = (m.new_score >= 50 AND l.status IS DISTINCT FROM 'lost'),
    priority_reason = CASE WHEN (m.new_score >= 50 AND l.status IS DISTINCT FROM 'lost')
                           THEN 'Milestone: ' || CASE m.new_score WHEN 100 THEN 'aplico'
                                                                 WHEN 80 THEN 'asistio' ELSE 'agendo' END
                           ELSE NULL END,
    updated_at = NOW()
  FROM _milestone_recompute m
  WHERE l.id = m.id
    AND (m.new_score IS DISTINCT FROM m.old_score
         OR (m.new_score >= 50 AND l.status IS DISTINCT FROM 'lost') IS DISTINCT FROM m.old_pri);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN QUERY SELECT v_checked, v_updated;
END;
$$;

-- (4) gate the leads-status trigger to score-relevant transitions
DROP TRIGGER trg_milestone_leads ON public.leads;
CREATE TRIGGER trg_milestone_leads
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND (NEW.status IN ('in_application','converted','lost')
         OR OLD.status IN ('in_application','converted','lost'))
  )
  EXECUTE FUNCTION public.trg_milestone_from_lead();
