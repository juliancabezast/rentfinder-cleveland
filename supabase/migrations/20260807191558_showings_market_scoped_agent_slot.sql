-- ── properties.market ────────────────────────────────────────────────
-- One leasing agent per MARKET, not per organization. A market groups the
-- cities a single person can realistically cover in a day. Cleveland and
-- East Cleveland are one market (East Cleveland is an enclave minutes away,
-- and src/pages/public/RenterHome.tsx already treats them as one market for
-- the public search). Every other city is its own market, so adding a city
-- needs no migration — only regrouping does.
-- Generated + STORED so the rule lives in exactly one place and every client
-- reads it as a plain column.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS market text
  GENERATED ALWAYS AS (
    CASE WHEN lower(btrim(city)) IN ('cleveland', 'east cleveland')
         THEN 'Cleveland'
         ELSE btrim(city)
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_properties_org_market
  ON public.properties (organization_id, market);

-- ── enforce_showing_agent_slot: exclusivity is per MARKET ────────────
-- Was: any two DIFFERENT properties at the same instant collided, org-wide.
-- That modelled a single agent covering the whole portfolio, so a Milwaukee
-- booking closed Cleveland and there was no way to reopen it.
-- Now: different people show in different cities, so the collision check is
-- scoped to the market. Two markets can hold the same instant.
--
-- The org-wide lock also silently prevented one lead from booking two cities
-- at the same instant. Nothing else covered that, so it becomes an explicit
-- guard below — a renter can't be in two places at once even if the agents can.
CREATE OR REPLACE FUNCTION public.enforce_showing_agent_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_market text;
BEGIN
  -- Only active, real (non-demo) showings occupy an agent's time.
  IF NEW.status NOT IN ('scheduled', 'confirmed') OR COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  SELECT p.market INTO new_market
  FROM public.properties p
  WHERE p.id = NEW.property_id;

  -- Serialize concurrent writers at the same (org, market, instant) so the
  -- EXISTS checks below are atomic with the write. Keyed by market so two
  -- cities that no longer compete don't serialize against each other.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.organization_id::text || ':' || COALESCE(new_market, '')),
    hashtext(NEW.scheduled_at::text)
  );

  -- (1) One agent per market: block a DIFFERENT property at this exact
  -- instant WITHIN THE SAME MARKET. Same property + same instant is still
  -- allowed → group tour. A different market is now allowed outright.
  IF EXISTS (
    SELECT 1
    FROM public.showings s
    JOIN public.properties sp ON sp.id = s.property_id
    WHERE s.organization_id = NEW.organization_id
      AND s.scheduled_at = NEW.scheduled_at
      AND s.id <> NEW.id
      AND s.status IN ('scheduled', 'confirmed')
      AND COALESCE(s.is_demo, false) = false
      AND s.property_id <> NEW.property_id
      AND sp.market IS NOT DISTINCT FROM new_market
  ) THEN
    -- Reuse unique_violation (23505) so every existing app-layer catch
    -- (book-public-showing, ScheduleShowingDialog) keeps mapping it to a 409.
    RAISE EXCEPTION 'showing_slot_conflict: a different property is already booked at this time'
      USING ERRCODE = '23505';
  END IF;

  -- (2) One renter, one place: the same lead cannot hold two active showings
  -- at the same instant, in any market. The org-wide lock used to cover this
  -- for free; scoping to market opened the hole, so it is closed explicitly.
  IF EXISTS (
    SELECT 1
    FROM public.showings s
    WHERE s.organization_id = NEW.organization_id
      AND s.lead_id = NEW.lead_id
      AND s.scheduled_at = NEW.scheduled_at
      AND s.id <> NEW.id
      AND s.status IN ('scheduled', 'confirmed')
      AND COALESCE(s.is_demo, false) = false
  ) THEN
    RAISE EXCEPTION 'showing_lead_conflict: this person already has a showing at this time'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;
