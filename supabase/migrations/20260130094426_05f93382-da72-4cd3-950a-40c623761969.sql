-- Insert default system_settings for Rent Finder Cleveland organization
-- Based on PROJECT.md Section 19.4

INSERT INTO public.system_settings (organization_id, key, value, description)
SELECT 
  '522f7afe-c254-42d4-86f0-8592539ea4aa'::uuid,
  s.key,
  s.value,
  s.description
FROM (VALUES
  -- Agents Settings
  ('recapture_first_delay_hours', '24'::jsonb, 'Hours before first recapture attempt'),
  ('recapture_max_attempts', '7'::jsonb, 'Maximum recapture call attempts'),
  ('recapture_schedule', '[1,2,4,7,10,14,21]'::jsonb, 'Days for each recapture attempt'),
  ('confirmation_hours_before', '24'::jsonb, 'Hours before showing to start confirmation'),
  ('confirmation_max_attempts', '3'::jsonb, 'Max confirmation attempts'),
  ('no_show_delay_hours', '2'::jsonb, 'Hours after no-show before follow-up'),
  ('post_showing_delay_hours', '1'::jsonb, 'Hours after showing to send application link'),
  
  -- Lead Capture Settings
  ('popup_delay_seconds', '15'::jsonb, 'Seconds before showing capture popup'),
  ('popup_enabled', 'true'::jsonb, 'Whether popup is active'),
  ('popup_message', '"We have an agent ready to help you find your perfect home!"'::jsonb, 'Custom popup text'),
  
  -- Scoring Settings
  ('starting_score', '50'::jsonb, 'Initial lead score'),
  ('priority_threshold', '85'::jsonb, 'Score that triggers priority flag'),
  ('custom_scoring_rules', '{}'::jsonb, 'Org-specific scoring adjustments'),
  
  -- Communications Settings
  ('sms_templates', '{}'::jsonb, 'Custom SMS message templates'),
  ('email_templates', '{}'::jsonb, 'Custom email templates'),
  ('working_hours_start', '"09:00"'::jsonb, 'Start of calling hours'),
  ('working_hours_end', '"20:00"'::jsonb, 'End of calling hours'),
  ('working_days', '[1,2,3,4,5,6]'::jsonb, 'Days to make calls (1=Mon, 7=Sun)'),
  
  -- Showings Settings
  ('default_duration_minutes', '30'::jsonb, 'Default showing length'),
  ('buffer_minutes', '15'::jsonb, 'Buffer between showings'),
  
  -- Compliance Settings
  ('recording_disclosure_text', '"This call may be recorded for quality assurance purposes."'::jsonb, 'State-specific recording disclosure'),
  ('auto_purge_leads_days', '180'::jsonb, 'Days before inactive leads purged'),
  
  -- Voice Settings
  ('bland_voice_id', '"default"'::jsonb, 'Bland.ai voice selection'),
  ('voice_language_primary', '"en"'::jsonb, 'Primary agent language')
) AS s(key, value, description)
ON CONFLICT (organization_id, key) DO NOTHING;