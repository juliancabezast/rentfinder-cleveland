-- Backfill: merge name-only "shell" leads into their full-contact twin.
--
-- Context: Hemlane paired-emails sometimes create a lead row with a full_name
-- but NO email and NO phone (a "shell"). Dedup (trg_noah_deduplicate + the
-- Esther parser) keys on email/phone, so a contactless shell never merges and
-- becomes an un-nurturable duplicate (e.g. "Euneckia Brown" appearing twice).
--
-- This one-time backfill merges each shell that has EXACTLY ONE same-name
-- (lower(trim(full_name))) contact-bearing twin in the same org. Dependents that
-- carry value are re-pointed to the twin; the shell is then deleted (cascading
-- its regenerable children: agent_tasks, score_history, predictions, ...).
-- Shells with 0 or >=2 twins are logged to system_logs (event_type
-- 'dedup_shell_review') for manual review, never guessed.
--
-- Safe to re-run: already-merged shells no longer exist; review logs are guarded
-- by NOT EXISTS; each shell is wrapped in its own exception block.

DO $$
DECLARE
  r RECORD;
  v_twin uuid;
  v_merged int := 0;
  v_skipped int := 0;
  v_failed int := 0;
BEGIN
  FOR r IN
    WITH shells AS (
      SELECT id, organization_id, lower(trim(full_name)) AS norm_name, full_name
      FROM leads
      WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')
        AND full_name IS NOT NULL AND trim(full_name) <> ''
        AND coalesce(is_demo, false) = false
    )
    SELECT s.id AS shell_id, s.organization_id AS org, s.norm_name, s.full_name,
      (SELECT array_agg(t.id) FROM leads t
        WHERE t.organization_id = s.organization_id
          AND lower(trim(t.full_name)) = s.norm_name AND t.id <> s.id
          AND ((t.email IS NOT NULL AND t.email <> '') OR (t.phone IS NOT NULL AND t.phone <> ''))
          AND coalesce(t.is_demo,false) = false) AS twin_ids
    FROM shells s
  LOOP
    BEGIN
      IF r.twin_ids IS NULL OR array_length(r.twin_ids, 1) IS DISTINCT FROM 1 THEN
        IF NOT EXISTS (
          SELECT 1 FROM system_logs
          WHERE event_type = 'dedup_shell_review' AND related_lead_id = r.shell_id
        ) THEN
          INSERT INTO system_logs(organization_id, level, category, event_type, message, details, related_lead_id)
          VALUES (r.org, 'info', 'deduplication', 'dedup_shell_review',
            'Name-only shell needs manual review: ' || coalesce(array_length(r.twin_ids, 1), 0) || ' name twins',
            jsonb_build_object('shell_id', r.shell_id, 'name', r.full_name, 'twin_ids', to_jsonb(r.twin_ids)),
            r.shell_id);
        END IF;
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_twin := r.twin_ids[1];

      -- property interests: drop dups the twin already has (UNIQUE lead_id,property_id), re-point the rest
      DELETE FROM lead_property_interests lpi
        WHERE lpi.lead_id = r.shell_id
          AND EXISTS (SELECT 1 FROM lead_property_interests t
                      WHERE t.lead_id = v_twin AND t.property_id = lpi.property_id);
      UPDATE lead_property_interests SET lead_id = v_twin WHERE lead_id = r.shell_id;

      -- preserve notes, inbound emails, comms, consent evidence; unblock the delete for system_logs (NO ACTION FK)
      UPDATE lead_notes      SET lead_id = v_twin WHERE lead_id = r.shell_id;
      UPDATE inbound_emails  SET lead_id = v_twin WHERE lead_id = r.shell_id;
      UPDATE communications  SET lead_id = v_twin WHERE lead_id = r.shell_id;
      UPDATE consent_log     SET lead_id = v_twin WHERE lead_id = r.shell_id;
      UPDATE system_logs     SET related_lead_id = v_twin WHERE related_lead_id = r.shell_id;

      -- carry request_stage / application_requested_at to the twin if it lacks them; mark fresh activity
      UPDATE leads t SET
        request_stage = COALESCE(t.request_stage, s.request_stage),
        application_requested_at = COALESCE(t.application_requested_at, s.application_requested_at),
        updated_at = now()
      FROM leads s
      WHERE t.id = v_twin AND s.id = r.shell_id;

      INSERT INTO system_logs(organization_id, level, category, event_type, message, details, related_lead_id)
      VALUES (r.org, 'info', 'deduplication', 'esther_lead_merged',
        'Name-only shell merged into contact twin (backfill)',
        jsonb_build_object('shell_id', r.shell_id, 'twin_id', v_twin, 'name', r.full_name, 'source', 'backfill_20260720'),
        v_twin);

      DELETE FROM leads WHERE id = r.shell_id;
      v_merged := v_merged + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      INSERT INTO system_logs(organization_id, level, category, event_type, message, details, related_lead_id)
      VALUES (r.org, 'error', 'deduplication', 'dedup_shell_review',
        'Shell merge failed: ' || SQLERRM,
        jsonb_build_object('shell_id', r.shell_id, 'name', r.full_name, 'error', SQLERRM),
        r.shell_id);
    END;
  END LOOP;

  RAISE NOTICE 'Shell merge complete: merged=%, skipped=%, failed=%', v_merged, v_skipped, v_failed;
END $$;
