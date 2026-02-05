-- Fix: Set view to SECURITY INVOKER so RLS is enforced for the querying user
ALTER VIEW public.property_performance SET (security_invoker = true);