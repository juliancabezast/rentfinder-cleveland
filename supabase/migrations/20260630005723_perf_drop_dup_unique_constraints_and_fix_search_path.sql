-- Fase 7 (perf/seguridad) — quick wins seguros. Autorizado por el usuario (2026-06-30).
-- Resultado verificado: duplicate_index 4->0; function_search_path_mutable 9->0.

-- (1) Eliminar constraints UNIQUE duplicados (cada tabla tenía 2 idénticos sobre
-- las mismas columnas). Se conserva uno por tabla. Verificado read-only antes:
-- ningún FK, ninguna función DB, ni el código (onConflict por columna) los
-- referencia por nombre -> seguro borrar el redundante.
ALTER TABLE public.campaign_leads          DROP CONSTRAINT IF EXISTS campaign_leads_campaign_id_lead_id_key;
ALTER TABLE public.campaign_recipients     DROP CONSTRAINT IF EXISTS campaign_recipients_campaign_id_lead_id_key;
ALTER TABLE public.showing_available_slots DROP CONSTRAINT IF EXISTS showing_available_slots_organization_id_property_id_slot_da_key;

-- (2) Fijar search_path=public (no mutable) en las 9 funciones flagueadas.
-- Referencian objetos de public sin calificar -> 'public' las mantiene funcionando.
ALTER FUNCTION public.auto_task_welcome() SET search_path = public;
ALTER FUNCTION public.capitalize_lead_name() SET search_path = public;
ALTER FUNCTION public.count_complete_leads_today(p_organization_id uuid) SET search_path = public;
ALTER FUNCTION public.count_leads_today(p_organization_id uuid) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.merge_leads(p_winner_id uuid, p_loser_id uuid, p_field_overrides jsonb, p_merged_by_user_id uuid) SET search_path = public;
ALTER FUNCTION public.sync_cost_data() SET search_path = public;
ALTER FUNCTION public.sync_slot_booking_status() SET search_path = public;
ALTER FUNCTION public.track_lead_field_changes() SET search_path = public;
