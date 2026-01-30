-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule daily check at 9 AM EST (14:00 UTC)
SELECT cron.schedule(
  'check-coming-soon-daily',
  '0 14 * * *',
  $$SELECT public.check_coming_soon_expiring()$$
);