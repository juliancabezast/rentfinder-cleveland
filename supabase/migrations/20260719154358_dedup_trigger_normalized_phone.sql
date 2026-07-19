-- Make lead dedup format-proof. The BEFORE INSERT trigger matched phones by
-- EXACT string, so "+12163528700" and "12163528700" never collapsed, breeding
-- duplicate leads. Now it canonicalizes NEW.phone and matches on the normalized
-- value (backed by a functional index). Enrichment logic is unchanged.

-- Functional index backing the normalized-phone dedup lookup.
CREATE INDEX IF NOT EXISTS idx_leads_org_norm_phone
  ON public.leads (organization_id, public.normalize_phone_e164(phone));

CREATE OR REPLACE FUNCTION public.noah_deduplicate_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_lead RECORD;
  v_match_type TEXT;
BEGIN
  -- Canonicalize the incoming phone (format-proof dedup; "N/A"/junk -> NULL).
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := public.normalize_phone_e164(NEW.phone);
  END IF;

  -- Primary match: normalized phone within the same org.
  IF NEW.phone IS NOT NULL THEN
    SELECT * INTO v_existing_lead
    FROM public.leads
    WHERE organization_id = NEW.organization_id
      AND public.normalize_phone_e164(phone) = NEW.phone
      AND id != NEW.id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_existing_lead IS NOT NULL THEN
      v_match_type := 'phone';
    END IF;
  END IF;

  -- Fallback match: exact email.
  IF v_existing_lead IS NULL AND NEW.email IS NOT NULL AND NEW.email != '' THEN
    SELECT * INTO v_existing_lead
    FROM public.leads
    WHERE organization_id = NEW.organization_id
      AND email = NEW.email
      AND id != NEW.id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_existing_lead IS NOT NULL THEN
      v_match_type := 'email';
    END IF;
  END IF;

  IF v_existing_lead IS NOT NULL THEN
    UPDATE public.leads
    SET
      first_name = COALESCE(NULLIF(v_existing_lead.first_name, ''), NEW.first_name, v_existing_lead.first_name),
      last_name = COALESCE(NULLIF(v_existing_lead.last_name, ''), NEW.last_name, v_existing_lead.last_name),
      full_name = COALESCE(NULLIF(v_existing_lead.full_name, ''), NEW.full_name, v_existing_lead.full_name),
      email = COALESCE(NULLIF(v_existing_lead.email, ''), NEW.email, v_existing_lead.email),
      phone = COALESCE(NULLIF(v_existing_lead.phone, ''), NEW.phone, v_existing_lead.phone),
      budget_min = COALESCE(NEW.budget_min, v_existing_lead.budget_min),
      budget_max = COALESCE(NEW.budget_max, v_existing_lead.budget_max),
      move_in_date = COALESCE(NEW.move_in_date, v_existing_lead.move_in_date),
      has_voucher = COALESCE(NEW.has_voucher, v_existing_lead.has_voucher),
      voucher_amount = COALESCE(NEW.voucher_amount, v_existing_lead.voucher_amount),
      housing_authority = COALESCE(NULLIF(NEW.housing_authority, ''), v_existing_lead.housing_authority),
      voucher_status = COALESCE(NEW.voucher_status, v_existing_lead.voucher_status),
      source_detail = COALESCE(v_existing_lead.source_detail, '') ||
        CASE WHEN NEW.source_detail IS NOT NULL THEN ' | Also: ' || NEW.source_detail ELSE '' END,
      last_contact_at = GREATEST(v_existing_lead.last_contact_at, NEW.created_at),
      updated_at = NOW()
    WHERE id = v_existing_lead.id;

    PERFORM public.log_agent_activity(
      NEW.organization_id,
      'lead_deduplicator',
      'duplicate_merged',
      'success',
      format('Duplicate lead merged (matched by %s): %s %s (%s) into existing lead %s',
        v_match_type,
        COALESCE(NEW.first_name, ''),
        COALESCE(NEW.last_name, ''),
        CASE WHEN v_match_type = 'phone' THEN NEW.phone ELSE NEW.email END,
        v_existing_lead.id),
      jsonb_build_object(
        'duplicate_lead_id', NEW.id,
        'existing_lead_id', v_existing_lead.id,
        'match_type', v_match_type,
        'new_source', NEW.source,
        'existing_source', v_existing_lead.source
      ),
      v_existing_lead.id
    );

    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- One-time backfill (applied 2026-07-19): canonicalize the 323 existing
-- non-E.164 phones. Idempotent — a no-op on an already-clean database.
UPDATE public.leads
SET phone = public.normalize_phone_e164(phone)
WHERE phone IS NOT NULL
  AND phone IS DISTINCT FROM public.normalize_phone_e164(phone);
