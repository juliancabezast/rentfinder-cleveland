-- Funnel restructure follow-ups (review findings):
-- 1) FK on lead_reminders.lead_id — without it PostgREST rejects the
--    leads:lead_id(...) embed (PGRST200) and the Funnel bot's "Seguimientos de
--    hoy" list is dead.
-- 2) Move the LeasingAgent (route) bot token/chat out of organization_settings
--    (readable by every authenticated org user) into organization_credentials
--    (deny_all_client_access RLS) — matching the other three bots.

ALTER TABLE public.lead_reminders
  ADD CONSTRAINT lead_reminders_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

ALTER TABLE public.organization_credentials
  ADD COLUMN IF NOT EXISTS telegram_route_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_route_chat_id text;

-- Copy from settings (values may be JSON-encoded strings — strip quotes).
UPDATE public.organization_credentials oc
SET telegram_route_bot_token = COALESCE(oc.telegram_route_bot_token, (
      SELECT trim(both '"' from s.value::text) FROM public.organization_settings s
      WHERE s.organization_id = oc.organization_id AND s.key = 'telegram_route_bot_token' LIMIT 1)),
    telegram_route_chat_id = COALESCE(oc.telegram_route_chat_id, (
      SELECT trim(both '"' from s.value::text) FROM public.organization_settings s
      WHERE s.organization_id = oc.organization_id AND s.key = 'telegram_route_chat_id' LIMIT 1));

-- Remove the client-readable copies (all server readers now prefer credentials).
DELETE FROM public.organization_settings
WHERE key IN ('telegram_route_bot_token', 'telegram_route_chat_id');
