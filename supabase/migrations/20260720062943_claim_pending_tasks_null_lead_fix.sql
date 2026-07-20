-- Review fix: claim_pending_tasks INNER JOINed leads, so tasks with
-- lead_id IS NULL (e.g. sheets_backup) were never claimable — latent
-- pre-existing bug surfaced by the Agents v2 review. LEFT JOIN + guard.
CREATE OR REPLACE FUNCTION public.claim_pending_tasks(p_organization_id uuid, p_batch_size integer DEFAULT 20)
RETURNS SETOF agent_tasks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT at.id
    FROM public.agent_tasks at
    LEFT JOIN public.leads l ON l.id = at.lead_id
    WHERE at.organization_id = p_organization_id
      AND at.status = 'pending'
      AND at.scheduled_for <= NOW()
      AND (at.lead_id IS NULL OR l.is_human_controlled IS NULL OR l.is_human_controlled = false)
    ORDER BY CASE WHEN at.agent_type = 'notification_dispatcher' THEN 0 ELSE 1 END,
             at.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE OF at SKIP LOCKED
  )
  UPDATE public.agent_tasks
  SET status = 'in_progress', executed_at = NOW()
  WHERE id IN (SELECT id FROM claimed)
  RETURNING *;
END;
$function$;
