-- ============================================================================
-- MILESTONE SCORING v1 (2026-07-19) — replaces the legacy fake scoring engine.
-- Score = pure function of verifiable facts (MAX of milestones):
--   0 normal · 10 intento (had showing, nothing live) · 50 agendó (scheduled)
--   80 asistió (completed) · 100 aplicó (in_application/converted)
-- is_priority = score >= 50 AND status <> 'lost'. No cron, no decay, no regex.
-- Hot-lead notifications DISABLED by owner decision ("de momento nada de hot").
--
-- Post-migration operational step (run once, 2026-07-19 "Great Demotion"):
--   ALTER TABLE public.leads DISABLE TRIGGER lead_field_change_tracker;
--   UPDATE leads … rollback 22 orphaned 'showing_scheduled' statuses;
--   SELECT * FROM public.recalculate_lead_scores();  -- 18,111 checked / 18,077 updated
--   ALTER TABLE public.leads ENABLE TRIGGER lead_field_change_tracker;
-- Result: {0: 17,969 · 10: 29 · 50: 7 · 80: 45 · 100: 61} — 109 hot.
-- ============================================================================

-- 1) Audit-trail constraint: allow the honest new actor label
ALTER TABLE public.lead_score_history DROP CONSTRAINT lead_score_history_triggered_by_check;
ALTER TABLE public.lead_score_history ADD CONSTRAINT lead_score_history_triggered_by_check
  CHECK (triggered_by = ANY (ARRAY['call_analysis','showing_outcome','engagement','verification',
    'manual_adjustment','time_decay','contact_attempts','auto_recalculation','milestone_engine']));

-- 2) New leads start as NORMAL (default was 40)
ALTER TABLE public.leads ALTER COLUMN lead_score SET DEFAULT 0;

-- 3) Compute: the whole model in one expression
CREATE OR REPLACE FUNCTION public.compute_milestone_score(p_lead_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    CASE WHEN l.status IN ('in_application','converted') THEN 100 ELSE 0 END,
    COALESCE((SELECT MAX(CASE s.status WHEN 'completed' THEN 80
                                       WHEN 'scheduled' THEN 50
                                       ELSE 10 END)
              FROM public.showings s
              WHERE s.lead_id = l.id AND NOT COALESCE(s.is_demo, false)), 0))
  FROM public.leads l WHERE l.id = p_lead_id
$$;
REVOKE EXECUTE ON FUNCTION public.compute_milestone_score(uuid) FROM anon, authenticated;

-- 4) Apply: recompute one lead, persist only real changes, honest history
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
  v_pri := (v_new >= 50 AND v_lead.status <> 'lost');
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
REVOKE EXECUTE ON FUNCTION public.apply_milestone_score(uuid, text) FROM anon, authenticated;

-- 5) Event triggers (AFTER — the engine reads committed facts)
CREATE OR REPLACE FUNCTION public.trg_milestone_from_showing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.apply_milestone_score(NEW.lead_id, 'showing_' || COALESCE(NEW.status, 'unknown'));
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_milestone_showings
  AFTER INSERT OR UPDATE OF status ON public.showings
  FOR EACH ROW EXECUTE FUNCTION public.trg_milestone_from_showing();

CREATE OR REPLACE FUNCTION public.trg_milestone_from_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.apply_milestone_score(NEW.id, 'lead_status_' || COALESCE(NEW.status, 'unknown'));
  RETURN NULL;
END; $$;
-- No recursion: apply_milestone_score never touches leads.status.
CREATE TRIGGER trg_milestone_leads
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_milestone_from_lead();
-- Direct INSERT into an advanced status (e.g. marketplace application flow)
CREATE TRIGGER trg_milestone_leads_ins
  AFTER INSERT ON public.leads
  FOR EACH ROW WHEN (NEW.status IN ('in_application','converted'))
  EXECUTE FUNCTION public.trg_milestone_from_lead();

-- 6) Rewrite update_lead_status_on_showing: KEEP status-advance + timestamps,
--    REMOVE its 4 scoring calls (the milestone engine owns points now)
CREATE OR REPLACE FUNCTION public.update_lead_status_on_showing()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' THEN
    UPDATE public.leads SET status = 'showed', updated_at = NOW()
    WHERE id = NEW.lead_id AND status NOT IN ('in_application','converted','lost');
    IF NEW.completed_at IS NULL THEN NEW.completed_at := NOW(); END IF;
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status = 'scheduled' THEN
    UPDATE public.leads SET status = 'showing_scheduled', updated_at = NOW()
    WHERE id = NEW.lead_id AND status IN ('new','contacted','engaged','nurturing','qualified');
    IF NEW.confirmed_at IS NULL THEN NEW.confirmed_at := NOW(); END IF;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF NEW.cancelled_at IS NULL THEN NEW.cancelled_at := NOW(); END IF;
  END IF;

  -- Scoring removed 2026-07-19: milestone engine (trg_milestone_showings) owns points.
  RETURN NEW;
END;
$$;

-- 7) Neutralize log_score_change: arbitrary deltas retired; recompute facts instead.
--    Signature + defaults preserved (residual callers keep working).
CREATE OR REPLACE FUNCTION public.log_score_change(
  _lead_id uuid, _change_amount integer, _reason_code text, _reason_text text,
  _triggered_by text,
  _related_call_id uuid DEFAULT NULL::uuid,
  _related_showing_id uuid DEFAULT NULL::uuid,
  _changed_by_user_id uuid DEFAULT NULL::uuid,
  _changed_by_agent text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Milestone model (2026-07-19): the delta is ignored by design.
  PERFORM public.apply_milestone_score(_lead_id, 'legacy_' || COALESCE(_reason_code, 'log_score_change'));
  RETURN (SELECT lead_score FROM public.leads WHERE id = _lead_id);
END;
$$;

-- 8) Repurpose recalculate_lead_scores: set-based milestone recompute-all.
--    Signature preserved: () RETURNS TABLE(leads_checked int, leads_updated int).
CREATE OR REPLACE FUNCTION public.recalculate_lead_scores()
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
    SELECT MAX(CASE s.status WHEN 'completed' THEN 80 WHEN 'scheduled' THEN 50 ELSE 10 END) AS ms
    FROM public.showings s WHERE s.lead_id = l.id AND NOT COALESCE(s.is_demo, false)
  ) sx ON true
  WHERE NOT COALESCE(l.is_demo, false);

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
    is_priority = (m.new_score >= 50 AND l.status <> 'lost'),
    priority_reason = CASE WHEN (m.new_score >= 50 AND l.status <> 'lost')
                           THEN 'Milestone: ' || CASE m.new_score WHEN 100 THEN 'aplico'
                                                                 WHEN 80 THEN 'asistio' ELSE 'agendo' END
                           ELSE NULL END,
    updated_at = NOW()
  FROM _milestone_recompute m
  WHERE l.id = m.id
    AND (m.new_score IS DISTINCT FROM m.old_score
         OR (m.new_score >= 50 AND l.status <> 'lost') IS DISTINCT FROM m.old_pri);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN QUERY SELECT v_checked, v_updated;
END;
$$;

-- 9) Kill the 3x/day legacy scoring crons
SELECT cron.unschedule(17);
SELECT cron.unschedule(18);
SELECT cron.unschedule(19);

-- 10) Hot-lead notifications OFF (owner decision 2026-07-19; re-enable with
--     ALTER TABLE public.leads ENABLE TRIGGER <name> if ever wanted back)
ALTER TABLE public.leads DISABLE TRIGGER trg_notify_lead_hot;
ALTER TABLE public.leads DISABLE TRIGGER trg_sprint2_priority_notify;
