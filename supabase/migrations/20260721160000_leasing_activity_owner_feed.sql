-- Leasing activity — the owner-facing proof that a property is being WORKED.
--
-- The Leasing Tracker is a PUBLIC, de-identified page. Until now it only showed
-- outcomes (showing statuses, lead stages, post-tour reports), so every call,
-- follow-up, SMS and email the leasing agent made was invisible to the owner.
--
-- Why a purpose-built table instead of the existing `activity_log`:
--   1. `activity_log.user_id` is NOT NULL — there is no app user behind a
--      Telegram tap (which is also why lead_notes.created_by is null there).
--   2. `activity_log` is a STAFF audit trail; this is owner-facing output.
--   3. `lead_notes` cannot be published: 6,338 of its 6,350 rows are the
--      prospect's own inquiry text (names, phones, personal circumstances).
--
-- The critical design property: there is NO free-text column. A row is a typed
-- `action` + a property + a timestamp, and the human label is rendered from the
-- action code in the frontend. PII leakage is impossible by construction —
-- there is no field a name could be written into.

CREATE TABLE IF NOT EXISTS public.leasing_activity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which building the work counts toward. Nullable: an untagged lead still
  -- produces an honest row, it just doesn't surface on any property's tracker.
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  showing_id      uuid REFERENCES public.showings(id) ON DELETE SET NULL,
  action          text NOT NULL,
  source          text NOT NULL DEFAULT 'telegram',
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Closed vocabulary: an unknown action would render as a blank row on a page
  -- shown to property owners, so reject it at the door.
  CONSTRAINT leasing_activity_action_check CHECK (action IN (
    'contacted',
    'contact_attempt',
    'follow_up_scheduled',
    'message_sent_sms',
    'message_sent_email',
    'showing_confirmed',
    'showing_reschedule_requested',
    'showing_attended',
    'showing_no_show',
    'lead_not_interested',
    'stage_changed'
  ))
);

-- The tracker's only access pattern: this building's rows, newest first.
CREATE INDEX IF NOT EXISTS idx_leasing_activity_property_created
  ON public.leasing_activity (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leasing_activity_org_created
  ON public.leasing_activity (organization_id, created_at DESC);
-- Covering index for the FK (keeps the unindexed_foreign_keys advisor clean).
CREATE INDEX IF NOT EXISTS idx_leasing_activity_lead ON public.leasing_activity (lead_id);
CREATE INDEX IF NOT EXISTS idx_leasing_activity_showing ON public.leasing_activity (showing_id);

ALTER TABLE public.leasing_activity ENABLE ROW LEVEL SECURITY;

-- Staff read their own org. The public Leasing Tracker does NOT read through
-- RLS — leasing-tracker-lookup runs on the service role and hands back only
-- aggregates + action codes, never rows.
-- auth.uid() is wrapped in (select …) so the initplan runs once per query,
-- not once per row (matches the 20260630003913 perf pass).
CREATE POLICY "Staff org-scoped read leasing_activity"
  ON public.leasing_activity FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id((select auth.uid())));

CREATE POLICY "Staff org-scoped insert leasing_activity"
  ON public.leasing_activity FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id((select auth.uid())));

COMMENT ON TABLE public.leasing_activity IS
  'Owner-facing leasing effort feed (Leasing Tracker). Typed actions only — no free text, no PII by construction. Written by the Telegram bots via service role.';
