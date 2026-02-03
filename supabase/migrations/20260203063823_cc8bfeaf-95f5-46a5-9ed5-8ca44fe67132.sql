-- Add whatsapp consent fields to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- Update communications channel constraint to include whatsapp
ALTER TABLE communications DROP CONSTRAINT IF EXISTS communications_channel_check;

-- Update consent_log consent_type constraint to include whatsapp_marketing
ALTER TABLE consent_log DROP CONSTRAINT IF EXISTS consent_log_consent_type_check;

-- Update leads contact_preference constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_contact_preference_check;

-- Update agent_tasks action_type constraint
ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_action_type_check;

-- Add twilio_whatsapp_number to organization_credentials
ALTER TABLE organization_credentials ADD COLUMN IF NOT EXISTS twilio_whatsapp_number TEXT;