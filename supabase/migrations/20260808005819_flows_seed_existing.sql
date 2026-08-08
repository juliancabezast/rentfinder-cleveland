-- Two columns the real flows forced out of the model:
--
-- template_key: an imported step must resolve its copy the SAME way the legacy
-- handler does (org settings → hardcoded fallback). Otherwise activating a flow
-- would silently change what goes out. Editing a step materialises email_config
-- and takes over from then on; until then the step is a faithful mirror.
--
-- delay_anchor: "24h BEFORE the showing" is not expressible as minutes after the
-- trigger. Without this the confirmation reminder could not be imported at all.
ALTER TABLE public.flow_steps
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS delay_anchor text NOT NULL DEFAULT 'after_trigger'
    CHECK (delay_anchor IN ('after_trigger', 'before_event')),
  ADD COLUMN IF NOT EXISTS label text;

-- ── Import the five flows that exist in code, all inactive ───────────
DO $$
DECLARE
  v_org uuid;
  v_flow uuid;
  i int;
  nurture_subjects text[] := ARRAY[
    'Ready to see a home?',
    'Tours are booking up this week',
    'A few things worth knowing before you tour',
    'New homes just came available',
    'Do you accept Section 8? (and other common questions)',
    'Still interested in renting with us?',
    'Last note from us'
  ];
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- 1. Welcome — the only one whose template is actually saved today.
  INSERT INTO public.flows (organization_id, name, description, trigger_type, is_system)
  VALUES (v_org, 'Bienvenida',
          'Primer correo a cualquier lead nuevo con teléfono o correo. Hoy lo dispara el trigger trg_sprint2_welcome_task 30 segundos después de crearse el lead.',
          'lead_created', true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_flow;
  IF v_flow IS NOT NULL THEN
    INSERT INTO public.flow_steps (flow_id, position, label, delay_minutes, template_key, exit_conditions)
    VALUES (v_flow, 1, 'Bienvenida', 0, 'welcome',
            '["unsubscribed","lost","converted"]'::jsonb);
  END IF;

  -- 2. Showing confirmation — anchored to the showing, not to the booking.
  v_flow := NULL;
  INSERT INTO public.flows (organization_id, name, description, trigger_type, is_system)
  VALUES (v_org, 'Confirmación de showing',
          'Recordatorio antes de la visita. Hoy lo produce el cron schedule_showing_confirmations cada 30 minutos.',
          'showing_booked', true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_flow;
  IF v_flow IS NOT NULL THEN
    INSERT INTO public.flow_steps (flow_id, position, label, delay_minutes, delay_anchor, template_key, exit_conditions)
    VALUES (v_flow, 1, 'Recordatorio 24 h antes', 1440, 'before_event', 'showing_confirmation',
            '["cancelled","rescheduled"]'::jsonb);
  END IF;

  -- 3. Post-showing.
  v_flow := NULL;
  INSERT INTO public.flows (organization_id, name, description, trigger_type, is_system)
  VALUES (v_org, 'Después de la visita',
          'Siguientes pasos tras una visita completada. Hoy lo dispara el trigger auto_task_post_showing; no corre para visitas de hace más de 48 h.',
          'showing_completed', true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_flow;
  IF v_flow IS NOT NULL THEN
    INSERT INTO public.flow_steps (flow_id, position, label, delay_minutes, template_key, exit_conditions)
    VALUES (v_flow, 1, 'Siguientes pasos', 60, 'post_showing',
            '["unsubscribed","lost","converted"]'::jsonb);
  END IF;

  -- 4. No-show.
  v_flow := NULL;
  INSERT INTO public.flows (organization_id, name, description, trigger_type, is_system)
  VALUES (v_org, 'No asistió',
          'Seguimiento cuando la visita se marca como no-show. Hoy lo dispara el trigger auto_task_noshow; no corre para visitas de hace más de 48 h.',
          'showing_no_show', true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_flow;
  IF v_flow IS NOT NULL THEN
    INSERT INTO public.flow_steps (flow_id, position, label, delay_minutes, template_key, exit_conditions)
    VALUES (v_flow, 1, 'Seguimiento de ausencia', 120, 'no_show',
            '["unsubscribed","lost","converted","booked"]'::jsonb);
  END IF;

  -- 5. Nurture — 7 steps, 3 days apart. No template key exists: the copy is
  -- hardcoded in the dispatcher, so the engine resolves it by position and the
  -- subjects below are labels for the builder, not the source of truth.
  v_flow := NULL;
  INSERT INTO public.flows (organization_id, name, description, trigger_type, is_system)
  VALUES (v_org, 'Nurture de 7 correos',
          'Secuencia para leads que nunca agendaron. Inscripción manual: no hay cron ni botón todavía. Sale sola si el lead agenda, responde o se da de baja.',
          'manual_enroll', true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_flow;
  IF v_flow IS NOT NULL THEN
    FOR i IN 1..7 LOOP
      INSERT INTO public.flow_steps (flow_id, position, label, delay_minutes, exit_conditions)
      VALUES (v_flow, i, nurture_subjects[i], CASE WHEN i = 1 THEN 0 ELSE 4320 END,
              '["booked","replied","unsubscribed","lost","converted","in_application"]'::jsonb);
    END LOOP;
  END IF;
END $$;
