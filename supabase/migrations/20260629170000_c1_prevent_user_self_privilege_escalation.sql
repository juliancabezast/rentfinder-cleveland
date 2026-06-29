-- C1 (security/critical): block authenticated end-users from escalating their own role,
-- switching organization, or re-activating themselves via the "Users can update own profile"
-- RLS UPDATE policy (which had no WITH CHECK). Trusted backend contexts (service_role edge
-- functions, migrations, admin SQL) bypass via auth.uid() IS NULL. Admins/super_admins keep
-- managing org users via is_admin().
-- Applied to production 2026-06-29 via Supabase Management API (migration history is managed
-- out-of-band by Lovable; this file records the applied change).

CREATE OR REPLACE FUNCTION public.prevent_user_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- No authenticated end-user in context => trusted backend (service_role / migration / admin SQL).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to change role, organization, or active status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_self_privilege_escalation ON public.users;
CREATE TRIGGER trg_prevent_user_self_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_self_privilege_escalation();
