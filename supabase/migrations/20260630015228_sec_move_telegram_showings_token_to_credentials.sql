-- #6 (autorizado por el usuario 2026-06-30): mover el token de Telegram (showings)
-- de organization_settings (legible por cualquier miembro de la org vía RLS) a
-- organization_credentials (admin-only RLS).
--
-- Paso infra: añade columnas y copia el valor EXISTENTE (no requiere re-entrada del
-- usuario — el token ya estaba presente en settings). Las edge fns
-- send-telegram-notification y book-public-showing fueron actualizadas para leer
-- credentials-first con fallback a settings (cero riesgo durante la transición).
-- El frontend (CommunicationsTab) ahora lee/escribe credentials (live tras rebuild
-- de Lovable). El borrado de las keys de organization_settings queda para
-- POST-rebuild (cuando el frontend viejo ya no las re-escriba).

ALTER TABLE public.organization_credentials
  ADD COLUMN IF NOT EXISTS telegram_showings_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_showings_chat_id text;

UPDATE public.organization_credentials oc
SET
  telegram_showings_bot_token = COALESCE(oc.telegram_showings_bot_token, bt.value #>> '{}'),
  telegram_showings_chat_id   = COALESCE(oc.telegram_showings_chat_id, ct.value #>> '{}')
FROM public.organizations o
LEFT JOIN public.organization_settings bt
  ON bt.organization_id = o.id AND bt.key = 'telegram_showings_bot_token'
LEFT JOIN public.organization_settings ct
  ON ct.organization_id = o.id AND ct.key = 'telegram_showings_chat_id'
WHERE oc.organization_id = o.id
  AND (bt.value IS NOT NULL OR ct.value IS NOT NULL);

-- PENDIENTE post-rebuild Lovable (no incluido aquí para no romper el frontend vivo):
--   DELETE FROM public.organization_settings
--   WHERE key IN ('telegram_showings_bot_token','telegram_showings_chat_id');
