REVOKE EXECUTE ON FUNCTION public.property_in_user_org(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_in_user_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_role() TO authenticated;