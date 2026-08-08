-- The engine stamps this as notification_type on every send, which is also how
-- a step joins to its live numbers in report_flow_step_stats. Without it the
-- builder could not show what a step has actually produced, and an activated
-- flow's mail would land in the stats under a different name than the legacy
-- path it replaced — breaking the before/after comparison exactly when it matters.
ALTER TABLE public.flow_steps
  ADD COLUMN IF NOT EXISTS notification_key text;

UPDATE public.flow_steps s SET notification_key = m.nk
FROM (VALUES
  ('welcome',              'welcome_sequence'),
  ('showing_confirmation', 'showing_confirmation'),
  ('post_showing',         'post_showing'),
  ('no_show',              'no_show_followup')
) AS m(tk, nk)
WHERE s.template_key = m.tk AND s.notification_key IS NULL;

-- Nurture has no template key; all seven steps report under one name, the same
-- one the hardcoded chain already uses.
UPDATE public.flow_steps s SET notification_key = 'showing_nurture'
FROM public.flows f
WHERE f.id = s.flow_id AND f.trigger_type = 'manual_enroll' AND s.notification_key IS NULL;
