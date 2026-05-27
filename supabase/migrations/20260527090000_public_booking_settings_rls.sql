-- Allow anon (public /p/book-showing page) to read the small set of
-- non-sensitive landing-page settings used by the booking flow. Previously
-- only `call_now_button` was readable to anon, which silently dropped the
-- featured property + per-city cover images on the public page.

DROP POLICY IF EXISTS "public_read_booking_page_settings" ON public.organization_settings;

CREATE POLICY "public_read_booking_page_settings"
ON public.organization_settings
FOR SELECT
TO anon
USING (
  key IN (
    'call_now_button',
    'featured_property_id',
    'city_cover_images',
    'showing_lead_time_minutes'
  )
);
