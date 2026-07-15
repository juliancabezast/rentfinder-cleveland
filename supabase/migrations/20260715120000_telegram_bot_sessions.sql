-- =====================================================================
-- Telegram scheduling bot — conversation state (2026-07-15)
-- Applied to remote via MCP apply_migration (telegram_bot_sessions_2026_07_15).
-- Kept here for repo <-> DB parity.
--
-- Backs the interactive "agendar showing" flow in telegram-webhook: one
-- in-flight multi-step flow per chat (property -> slot -> lead -> confirm,
-- plus create-lead). Only the edge function (service role) reads/writes it;
-- RLS is enabled with NO policies so no anon/authenticated client can touch it.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.telegram_bot_sessions (
  chat_id text PRIMARY KEY,
  bot text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  step text NOT NULL DEFAULT 'idle',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.telegram_bot_sessions IS
  'Ephemeral multi-step state for the Telegram scheduling bot (telegram-webhook). Service-role only.';
