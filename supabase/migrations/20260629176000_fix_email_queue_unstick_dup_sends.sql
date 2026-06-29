-- Phase 5 (correctness): prevent duplicate email sends from the queue.
-- unstick_processing_emails() reverted 'processing' emails to 'queued' based on created_at, so an
-- email QUEUED >5 min ago but currently being processed by a long run would be re-queued and
-- re-sent. Fix: claim_queued_emails() now stamps details->>'processing_at' at claim time, and
-- unstick reverts based on that (falling back to created_at for pre-existing rows). No schema
-- change (uses the details jsonb). search_path pinned. Applied 2026-06-29 via Management API.

CREATE OR REPLACE FUNCTION public.claim_queued_emails(p_organization_id uuid, p_batch_size integer DEFAULT 10)
 RETURNS SETOF email_events
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM email_events
    WHERE organization_id = p_organization_id
      AND event_type = 'delivery_delayed'
      AND details->>'status' = 'queued'
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE email_events e
  SET details = jsonb_set(jsonb_set(e.details, '{status}', '"processing"'), '{processing_at}', to_jsonb(now()))
  FROM claimed c
  WHERE e.id = c.id
  RETURNING e.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unstick_processing_emails()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE email_events
  SET details = jsonb_set(details, '{status}', '"queued"')
  WHERE event_type = 'delivery_delayed'
    AND details->>'status' = 'processing'
    AND COALESCE((details->>'processing_at')::timestamptz, created_at) < now() - interval '5 minutes';
END;
$function$;
