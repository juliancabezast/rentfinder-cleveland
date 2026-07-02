-- Fresh-sweep fix (2026-07-02): close the profiles privilege-escalation pair.
--
-- sec-5 (critical): handle_new_user() copied role from client-controlled signup metadata
--   (raw_user_meta_data->>'role'), so a signup with data:{role:'admin'} self-granted admin.
-- sec-4 (high): the profiles ALL policy has USING=(... OR id=auth.uid()) with WITH CHECK=NULL,
--   which Postgres reuses as the write check, letting any authenticated user write their own
--   profiles row with an arbitrary role. profiles.role gates cmd=ALL on ~20 tables
--   (properties, tenants, leases, transactions, statements, documents, work_orders, ...).
--
-- NOTE: handle_new_user() and the profiles policies are Lovable-managed. If a Lovable rebuild
-- reverts handle_new_user() to read role from metadata, re-apply this migration. The guard
-- trigger below is additive and defends the authenticated self-grant vector regardless.
-- Verified in prod post-apply: a simulated authenticated non-admin INSERT of role='admin' is
-- blocked (insufficient_privilege); handle_new_user hardcodes 'investor'; trigger enabled.

-- Fix 1: never derive role from client metadata; new users are always 'investor'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
      'investor'  -- SECURITY: never trust client-controlled signup metadata for role
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $function$;

-- Fix 2: guard trigger — a non-admin end user cannot set/keep a privileged profiles.role.
-- Allows: service_role / SECURITY DEFINER / dashboard-postgres context (auth.uid() IS NULL),
-- and existing admins/superadmins (users-table authority via has_role/is_super_admin, or an
-- existing privileged profiles row). Blocks everyone else from assigning superadmin/admin/team.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_priv  text[] := ARRAY['superadmin','admin','team'];
  v_actor uuid   := auth.uid();
BEGIN
  IF NEW.role = ANY(v_priv)
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role) THEN
    IF v_actor IS NULL THEN
      RETURN NEW;  -- service_role / definer / cron / dashboard-postgres
    END IF;
    IF has_role(v_actor, 'admin'::app_role)
       OR is_super_admin(v_actor)
       OR EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = v_actor AND p.role = ANY(ARRAY['superadmin','admin'])) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Not authorized to assign privileged role %', NEW.role
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_escalation() FROM PUBLIC, anon;
