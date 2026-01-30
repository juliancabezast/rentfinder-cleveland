# PROJECT.md - Rent Finder Cleveland

## 1. Project Overview

### 1.1 Vision
Rent Finder Cleveland is an AI-powered lead management platform for property management. It automates the entire lead lifecycle from initial contact through showing completion, using intelligent voice agents, automated follow-ups, and real-time analytics. The platform serves as a lead funnel that integrates with Doorloop for the actual leasing process.

**SaaS Vision**: While launching as Rent Finder Cleveland, the platform is architected from day one to support multiple property management companies (tenants) as a white-label SaaS product. Each organization operates in complete data isolation with customizable branding, workflows, and pricing rules.

### 1.2 Core Problem Solved
- High volume of incoming calls with repetitive questions
- Leads going cold due to slow response times
- Language barriers with Spanish-speaking prospects
- No visibility into what questions aren't being answered
- Manual follow-up processes that don't scale
- Scattered data across email, phone, and different systems
- No cost visibility per lead or per source
- Compliance risks with automated communications

### 1.3 Target Users
1. **Super Admin** - Platform-level control across all organizations (SaaS owner)
2. **Admin** - Full system control within their organization
3. **Editor (Leasing Team)** - Property management, lead management, reports
4. **Viewer (Investors)** - Read-only access to their assigned properties' metrics
5. **Leasing Agent** - Field agent with showing management and manual outreach tools

### 1.4 Primary Language
English (primary) with Spanish language support for prospect-facing interactions.

---

## 2. Tech Stack

### 2.1 Core Platform
- **Frontend Framework**: React + TypeScript
- **UI Components**: shadcn/ui (mandatory for all components)
- **Styling**: Tailwind CSS
- **Backend/Database**: Supabase (PostgreSQL)
- **Hosting**: Lovable default hosting
- **Authentication**: Supabase Auth with role-based access

### 2.2 External Integrations
| Service | Purpose | Auth Method |
|---------|---------|-------------|
| Twilio | Inbound/outbound calls routing, SMS | API Key |
| Bland.ai | AI voice agents for calls | API Key |
| OpenAI | Lead scoring, conversation analysis, property suggestions, Insight Generator chat | API Key |
| Persona | Identity verification before showings | API Key |
| Doorloop | Sync application status from leasing platform | REST API (Premium) |
| Google Sheets | Backup display of leads | Service Account |
| Gmail | Parse Hemlane lead notifications | OAuth / App Password |

### 2.3 Design System

#### Colors
```css
:root {
  --color-primary: #370d4b;      /* Purple dark - headers, primary buttons */
  --color-accent: #ffb22c;       /* Gold - CTAs, highlights, active states */
  --color-background: #f4f1f1;   /* Light gray - page background */
  --color-surface: #ffffff;      /* White - cards, modals */
  --color-success: #22C55E;      /* Green - positive states */
  --color-error: #EF4444;        /* Red - errors, alerts */
  --color-warning: #F59E0B;      /* Amber - warnings */
  --color-text-primary: #1a1a1a; /* Near black - main text */
  --color-text-secondary: #6b7280; /* Gray - secondary text */
}
```

#### Typography
```css
font-family: 'Montserrat', sans-serif;

/* Scale */
--text-xs: 0.75rem;    /* 12px - labels */
--text-sm: 0.875rem;   /* 14px - secondary text */
--text-base: 1rem;     /* 16px - body */
--text-lg: 1.125rem;   /* 18px - subheadings */
--text-xl: 1.25rem;    /* 20px - card titles */
--text-2xl: 1.5rem;    /* 24px - section headers */
--text-3xl: 1.875rem;  /* 30px - page titles */
--text-4xl: 2.25rem;   /* 36px - dashboard hero */
```

#### Responsive Breakpoints
```css
/* Mobile first approach */
sm: 640px   /* Large phones */
md: 768px   /* Tablets */
lg: 1024px  /* Small laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large screens */
```

---

## 3. Database Schema (Supabase)

### 3.1 Organizations Table (Multi-Tenant Core)
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- URL-friendly identifier (e.g., 'rent-finder-cleveland')
  
  -- Contact
  owner_email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  
  -- Branding
  logo_url TEXT,
  primary_color TEXT DEFAULT '#370d4b',
  accent_color TEXT DEFAULT '#ffb22c',
  
  -- Subscription
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  billing_email TEXT,
  stripe_customer_id TEXT,
  
  -- Limits (based on plan)
  max_properties INTEGER DEFAULT 10,
  max_users INTEGER DEFAULT 5,
  max_calls_per_month INTEGER DEFAULT 500,
  
  -- Integration Keys (encrypted at rest)
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  bland_api_key TEXT,
  openai_api_key TEXT,
  persona_api_key TEXT,
  doorloop_api_key TEXT,
  
  -- Settings
  timezone TEXT DEFAULT 'America/New_York',
  default_language TEXT DEFAULT 'en',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
```

### 3.2 Organization Settings Table (Tenant Configuration)
```sql
CREATE TABLE organization_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Category for grouping in UI
  category TEXT NOT NULL CHECK (category IN (
    'agents',
    'lead_capture',
    'scoring',
    'communications',
    'showings',
    'compliance'
  )),
  
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, key)
);

-- Default settings to insert per organization
-- See Section 19.2 for full list of configurable settings
```

### 3.3 Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'editor', 'viewer', 'leasing_agent')),
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  commission_rate DECIMAL(5,2), -- For leasing agents, e.g., 0.50 = 50%
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- super_admin has NULL organization_id (platform level)
  UNIQUE(organization_id, email)
);
```

### 3.4 Properties Table
```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic Info
  address TEXT NOT NULL,
  unit_number TEXT,
  city TEXT NOT NULL DEFAULT 'Cleveland',
  state TEXT NOT NULL DEFAULT 'OH',
  zip_code TEXT NOT NULL,
  
  -- Property Details
  bedrooms INTEGER NOT NULL,
  bathrooms DECIMAL(3,1) NOT NULL,
  square_feet INTEGER,
  property_type TEXT CHECK (property_type IN ('house', 'apartment', 'duplex', 'townhouse', 'condo')),
  
  -- Pricing
  rent_price DECIMAL(10,2) NOT NULL,
  deposit_amount DECIMAL(10,2),
  application_fee DECIMAL(10,2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'coming_soon', 'in_leasing_process', 'rented')),
  coming_soon_date DATE, -- When status is 'coming_soon', this is the expected available date
  
  -- Section 8
  section_8_accepted BOOLEAN DEFAULT true,
  hud_inspection_ready BOOLEAN DEFAULT true,
  
  -- Media
  photos JSONB DEFAULT '[]', -- Array of photo URLs
  video_tour_url TEXT,
  virtual_tour_url TEXT,
  
  -- Description
  description TEXT,
  special_notes TEXT, -- Internal notes for team
  
  -- Features
  amenities JSONB DEFAULT '[]', -- ['washer_dryer', 'parking', 'ac', 'pets_allowed', etc.]
  pet_policy TEXT,
  
  -- Alternative Properties (manual assignment)
  alternative_property_ids UUID[] DEFAULT '{}', -- Array of property IDs to suggest if this one is unavailable
  
  -- Ownership
  investor_id UUID REFERENCES users(id), -- Links to viewer/investor
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  listed_date DATE,
  
  -- Sync
  doorloop_property_id TEXT -- For syncing with Doorloop
);

-- Index for zip code searches
CREATE INDEX idx_properties_org ON properties(organization_id);
CREATE INDEX idx_properties_zip ON properties(zip_code);
CREATE INDEX idx_properties_status ON properties(status);
```

### 3.5 Leads Table
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Contact Info
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'es')),
  
  -- Source
  source TEXT NOT NULL CHECK (source IN ('inbound_call', 'hemlane_email', 'website', 'referral', 'manual', 'sms', 'campaign')),
  source_detail TEXT, -- Additional info like which Hemlane listing
  
  -- Interest
  interested_property_id UUID REFERENCES properties(id),
  interested_zip_codes TEXT[], -- Array of zip codes they're interested in
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  move_in_date DATE,
  
  -- Section 8
  has_voucher BOOLEAN,
  voucher_amount DECIMAL(10,2),
  housing_authority TEXT,
  voucher_status TEXT CHECK (voucher_status IN ('active', 'pending', 'expiring_soon', 'expired', 'unknown')),
  
  -- Status & Scoring
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'contacted',
    'engaged',
    'nurturing',
    'qualified',
    'showing_scheduled',
    'showed',
    'in_application',
    'lost',
    'converted'
  )),
  lost_reason TEXT, -- If status is 'lost'
  
  lead_score INTEGER DEFAULT 50 CHECK (lead_score >= 0 AND lead_score <= 100),
  is_priority BOOLEAN DEFAULT false, -- Time-sensitive leads
  priority_reason TEXT,
  
  -- Human Takeover
  is_human_controlled BOOLEAN DEFAULT false,
  human_controlled_by UUID REFERENCES users(id),
  human_controlled_at TIMESTAMPTZ,
  human_control_reason TEXT, -- Required note when taking control
  
  -- Verification
  phone_verified BOOLEAN DEFAULT false,
  identity_verified BOOLEAN DEFAULT false,
  persona_verification_id TEXT,
  
  -- Assignment
  assigned_leasing_agent_id UUID REFERENCES users(id),
  
  -- Communication Preferences & Compliance
  contact_preference TEXT DEFAULT 'any' CHECK (contact_preference IN ('call', 'sms', 'email', 'any')),
  do_not_contact BOOLEAN DEFAULT false,
  sms_consent BOOLEAN DEFAULT false,
  sms_consent_at TIMESTAMPTZ,
  call_consent BOOLEAN DEFAULT false,
  call_consent_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  
  -- Sync
  doorloop_prospect_id TEXT,
  hemlane_lead_id TEXT
);

CREATE INDEX idx_leads_org ON leads(organization_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_score ON leads(lead_score DESC);
CREATE INDEX idx_leads_priority ON leads(is_priority) WHERE is_priority = true;
CREATE INDEX idx_leads_human_controlled ON leads(is_human_controlled) WHERE is_human_controlled = true;
```

### 3.6 Lead Score History Table (Explainable Scoring)
```sql
CREATE TABLE lead_score_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Score Change
  previous_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  change_amount INTEGER NOT NULL, -- Can be positive or negative
  
  -- Explanation (Human Readable)
  reason_code TEXT NOT NULL, -- e.g., 'urgency_mentioned', 'no_show', 'completed_showing'
  reason_text TEXT NOT NULL, -- e.g., "Lead mentioned needing to move urgently (+15 points)"
  
  -- Context
  triggered_by TEXT NOT NULL CHECK (triggered_by IN (
    'call_analysis',
    'showing_outcome',
    'engagement',
    'verification',
    'manual_adjustment',
    'time_decay',
    'contact_attempts'
  )),
  related_call_id UUID REFERENCES calls(id),
  related_showing_id UUID REFERENCES showings(id),
  
  -- Who/What made the change
  changed_by_user_id UUID REFERENCES users(id), -- If manual
  changed_by_agent TEXT, -- If AI agent (e.g., 'scoring_agent')
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_score_history_lead ON lead_score_history(lead_id);
CREATE INDEX idx_score_history_date ON lead_score_history(created_at DESC);
```

### 3.7 Calls Table
```sql
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Relationship
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  
  -- Call Details
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number TEXT NOT NULL,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN (
    'completed',
    'no_answer',
    'voicemail',
    'busy',
    'failed',
    'in_progress'
  )),
  
  -- Content
  transcript TEXT,
  summary TEXT, -- AI-generated summary
  recording_url TEXT,
  
  -- AI Analysis
  detected_language TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  key_questions JSONB DEFAULT '[]', -- Questions the caller asked
  unanswered_questions JSONB DEFAULT '[]', -- Questions the AI couldn't answer
  
  -- Agent Info
  agent_type TEXT NOT NULL CHECK (agent_type IN (
    'main_inbound',
    'recapture',
    'no_show_follow_up',
    'showing_confirmation',
    'post_showing',
    'campaign'
  )),
  bland_call_id TEXT,
  twilio_call_sid TEXT,
  
  -- Scoring Impact
  score_change INTEGER DEFAULT 0, -- How much this call affected lead score
  
  -- Cost Tracking
  cost_twilio DECIMAL(10,4) DEFAULT 0, -- Twilio cost for this call
  cost_bland DECIMAL(10,4) DEFAULT 0, -- Bland.ai cost for this call
  cost_openai DECIMAL(10,4) DEFAULT 0, -- OpenAI cost for analysis
  cost_total DECIMAL(10,4) DEFAULT 0, -- Sum of all costs
  
  -- Compliance
  recording_disclosure_played BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calls_org ON calls(organization_id);
CREATE INDEX idx_calls_lead ON calls(lead_id);
CREATE INDEX idx_calls_date ON calls(started_at DESC);
CREATE INDEX idx_calls_agent_type ON calls(agent_type);
```

### 3.8 Showings Table
```sql
CREATE TABLE showings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Relationships
  lead_id UUID NOT NULL REFERENCES leads(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  leasing_agent_id UUID REFERENCES users(id),
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'confirmed',
    'completed',
    'no_show',
    'cancelled',
    'rescheduled'
  )),
  
  -- Confirmation
  confirmation_attempts INTEGER DEFAULT 0,
  last_confirmation_attempt_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  
  -- Completion
  completed_at TIMESTAMPTZ,
  
  -- Leasing Agent Report
  agent_report TEXT,
  agent_report_photo_url TEXT,
  prospect_interest_level TEXT CHECK (prospect_interest_level IN ('high', 'medium', 'low', 'not_interested')),
  
  -- Cancellation
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  rescheduled_to_id UUID REFERENCES showings(id), -- Link to new showing if rescheduled
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_showings_org ON showings(organization_id);
CREATE INDEX idx_showings_date ON showings(scheduled_at);
CREATE INDEX idx_showings_status ON showings(status);
CREATE INDEX idx_showings_agent ON showings(leasing_agent_id);
```

### 3.9 Communications Table (SMS & Email Log)
```sql
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Relationship
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Type
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Content
  recipient TEXT NOT NULL, -- Phone or email
  subject TEXT, -- For emails
  body TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed', 'opened', 'clicked')),
  
  -- External IDs
  twilio_message_sid TEXT,
  
  -- Cost Tracking
  cost_twilio DECIMAL(10,4) DEFAULT 0,
  
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
);

CREATE INDEX idx_communications_org ON communications(organization_id);
CREATE INDEX idx_communications_lead ON communications(lead_id);
CREATE INDEX idx_communications_date ON communications(sent_at DESC);
```

### 3.10 Agent Tasks Table (Scheduled AI Actions)
```sql
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Relationship
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Task Definition
  agent_type TEXT NOT NULL CHECK (agent_type IN (
    'recapture',
    'no_show_follow_up',
    'showing_confirmation',
    'post_showing',
    'campaign'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'sms', 'email')),
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  
  -- Attempt Tracking
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 7,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'cancelled',
    'paused_human_control' -- New status for human takeover
  )),
  
  -- Context
  context JSONB DEFAULT '{}', -- Additional data for the agent
  
  -- Result
  result_call_id UUID REFERENCES calls(id),
  result_communication_id UUID REFERENCES communications(id),
  
  -- Pause/Cancel tracking
  paused_by UUID REFERENCES users(id),
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_tasks_org ON agent_tasks(organization_id);
CREATE INDEX idx_agent_tasks_scheduled ON agent_tasks(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_agent_tasks_lead ON agent_tasks(lead_id);
```

### 3.11 Property Alerts Table
```sql
CREATE TABLE property_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'coming_soon_expiring', -- 3 days before coming_soon_date
    'status_change',
    'no_activity',
    'high_interest'
  )),
  
  message TEXT NOT NULL,
  
  is_read BOOLEAN DEFAULT false,
  read_by UUID REFERENCES users(id),
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_alerts_org ON property_alerts(organization_id);
CREATE INDEX idx_property_alerts_unread ON property_alerts(created_at DESC) WHERE is_read = false;
```

### 3.12 Investor Property Access Table
```sql
CREATE TABLE investor_property_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(investor_id, property_id)
);
```

### 3.13 System Settings Table
```sql
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = platform-wide
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, key)
);

-- Default settings to insert (see Section 19.2)
```

### 3.14 FAQ Documents Table
```sql
CREATE TABLE faq_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'requirements',
    'process',
    'section_8',
    'lease_terms',
    'general'
  )),
  
  content TEXT NOT NULL, -- The actual FAQ content
  
  -- For AI retrieval
  embedding VECTOR(1536), -- OpenAI embeddings for semantic search
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_faq_org ON faq_documents(organization_id);
```

### 3.15 System Logs Table (Error & Integration Tracking)
```sql
CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = platform-level
  
  -- Log Classification
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  category TEXT NOT NULL CHECK (category IN (
    'twilio',
    'bland_ai',
    'openai',
    'persona',
    'doorloop',
    'google_sheets',
    'supabase',
    'authentication',
    'general'
  )),
  
  -- Event Details
  event_type TEXT NOT NULL, -- e.g., 'api_call_failed', 'rate_limit_hit', 'timeout'
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}', -- Full error details, request/response info
  
  -- Context
  related_lead_id UUID REFERENCES leads(id),
  related_call_id UUID REFERENCES calls(id),
  related_showing_id UUID REFERENCES showings(id),
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Notification
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_logs_org ON system_logs(organization_id);
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_unresolved ON system_logs(created_at DESC) WHERE is_resolved = false;
CREATE INDEX idx_system_logs_critical ON system_logs(created_at DESC) WHERE level = 'critical';
```

### 3.16 Cost Tracking Table
```sql
CREATE TABLE cost_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Time Period
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Service
  service TEXT NOT NULL CHECK (service IN ('twilio_voice', 'twilio_sms', 'bland_ai', 'openai', 'persona')),
  
  -- Usage Metrics
  usage_quantity DECIMAL(10,2) NOT NULL, -- Minutes, messages, tokens, verifications
  usage_unit TEXT NOT NULL, -- 'minutes', 'messages', 'tokens', 'verifications'
  
  -- Cost
  unit_cost DECIMAL(10,6) NOT NULL, -- Cost per unit
  total_cost DECIMAL(10,4) NOT NULL,
  
  -- Attribution (optional, for per-lead costing)
  lead_id UUID REFERENCES leads(id),
  call_id UUID REFERENCES calls(id),
  communication_id UUID REFERENCES communications(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_records_org ON cost_records(organization_id);
CREATE INDEX idx_cost_records_date ON cost_records(recorded_at DESC);
CREATE INDEX idx_cost_records_service ON cost_records(service);
CREATE INDEX idx_cost_records_lead ON cost_records(lead_id);
```

### 3.17 Investor Insights Table (Storytelling)
```sql
CREATE TABLE investor_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  -- Insight Classification
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'lead_loss_reason',
    'pricing_feedback',
    'location_feedback',
    'feature_request',
    'competitive_insight',
    'seasonal_trend',
    'recommendation'
  )),
  
  -- The Story (Human Readable)
  headline TEXT NOT NULL, -- e.g., "3 leads lost due to pricing concerns"
  narrative TEXT NOT NULL, -- Full explanation
  
  -- Supporting Data
  data_points JSONB NOT NULL, -- Raw data backing the insight
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  
  -- Time Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Visibility
  is_highlighted BOOLEAN DEFAULT false, -- Show prominently in investor dashboard
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_investor_insights_org ON investor_insights(organization_id);
CREATE INDEX idx_investor_insights_property ON investor_insights(property_id);
CREATE INDEX idx_investor_insights_highlighted ON investor_insights(is_highlighted) WHERE is_highlighted = true;
```

### 3.18 Consent Log Table (Compliance)
```sql
CREATE TABLE consent_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Consent Type
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'sms_marketing',
    'call_recording',
    'automated_calls',
    'data_processing',
    'email_marketing'
  )),
  
  -- Status
  granted BOOLEAN NOT NULL,
  
  -- How Consent Was Obtained
  method TEXT NOT NULL CHECK (method IN (
    'web_form',
    'verbal_call',
    'sms_reply',
    'email_click'
  )),
  
  -- Evidence
  evidence_text TEXT, -- Exact language shown/spoken
  evidence_url TEXT, -- Screenshot or recording URL
  ip_address TEXT,
  user_agent TEXT,
  
  -- Call reference if verbal
  call_id UUID REFERENCES calls(id),
  
  -- Withdrawal
  withdrawn_at TIMESTAMPTZ,
  withdrawal_method TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consent_log_lead ON consent_log(lead_id);
CREATE INDEX idx_consent_log_type ON consent_log(consent_type);
```

---

## 4. User Roles & Permissions

### 4.1 Permission Matrix

| Feature | Super Admin | Admin | Editor | Viewer | Leasing Agent |
|---------|-------------|-------|--------|--------|---------------|
| **Organizations** |
| View all organizations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create organization | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit organization settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Dashboard** |
| View all metrics | ✅ | ✅ | ✅ | ❌ | ❌ |
| View assigned property metrics | ✅ | ✅ | ✅ | ✅ | ✅ |
| View cost dashboard | ✅ | ✅ | ❌ | ❌ | ❌ |
| View system logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Properties** |
| Create property | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit property | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete property | ✅ | ✅ | ❌ | ❌ | ❌ |
| View all properties | ✅ | ✅ | ✅ | ❌ | ✅ |
| View assigned properties | ✅ | ✅ | ✅ | ✅ | ✅ |
| Change property status | ✅ | ✅ | ✅ | ❌ | ❌ |
| Upload photos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Set alternative properties | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Leads** |
| View all leads | ✅ | ✅ | ✅ | ❌ | ❌ |
| View assigned leads | ✅ | ✅ | ✅ | ❌ | ✅ |
| Edit lead info | ✅ | ✅ | ✅ | ❌ | ✅ |
| Manually create lead | ✅ | ✅ | ✅ | ❌ | ✅ |
| Change lead status | ✅ | ✅ | ✅ | ❌ | ✅ |
| Mark as do-not-contact | ✅ | ✅ | ✅ | ❌ | ❌ |
| Take human control | ✅ | ✅ | ✅ | ❌ | ✅ |
| Release human control | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Showings** |
| View all showings | ✅ | ✅ | ✅ | ❌ | ❌ |
| View assigned showings | ✅ | ✅ | ✅ | ❌ | ✅ |
| Schedule showing | ✅ | ✅ | ✅ | ❌ | ✅ |
| Submit showing report | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cancel/reschedule showing | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Calls & Communications** |
| View all call logs | ✅ | ✅ | ✅ | ❌ | ❌ |
| View assigned call logs | ✅ | ✅ | ✅ | ❌ | ✅ |
| Listen to recordings | ✅ | ✅ | ✅ | ❌ | ✅ |
| Initiate manual call | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Reports & Analytics** |
| View all reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| View investor reports | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export data (CSV) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Access Insight Generator | ✅ | ✅ | ✅ | ❌ | ❌ |
| **User Management** |
| Create users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign properties to investors | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign leads to agents | ✅ | ✅ | ✅ | ❌ | ❌ |
| **System Settings** |
| View settings | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modify settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Toggle features on/off | ✅ | ✅ | ❌ | ❌ | ❌ |
| **FAQ/Documents** |
| View documents | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/edit documents | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete documents | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 5. Lead Lifecycle & Status Flow

### 5.1 Status Definitions

| Status | Description | Trigger |
|--------|-------------|---------|
| `new` | Just entered the system | Inbound call, Hemlane email, website form |
| `contacted` | System made first contact | AI agent completed first call/SMS |
| `engaged` | Lead responded or had conversation | Lead answered call, replied to SMS |
| `nurturing` | Receiving active follow-up | Engaged but not ready to schedule |
| `qualified` | High score, priority lead | Lead score > 70 or priority flag |
| `showing_scheduled` | Has confirmed showing appointment | Showing created and confirmed |
| `showed` | Attended the property showing | Leasing agent submitted report |
| `in_application` | Started application in Doorloop | Doorloop API sync detected application |
| `lost` | Did not continue | Manual mark or 7+ failed contact attempts |
| `converted` | Signed lease | Doorloop API sync detected signed lease |

### 5.2 Automatic Status Transitions

```
new → contacted       : After first AI call attempt (regardless of answer)
contacted → engaged   : When lead answers or responds
engaged → nurturing   : If no showing scheduled within 48 hours
nurturing → qualified : When lead_score >= 70 OR is_priority = true
any → showing_scheduled : When showing is created and confirmed
showing_scheduled → showed : When agent submits showing report
showed → in_application : When Doorloop sync detects application
in_application → converted : When Doorloop sync detected signed lease
any → lost : After max contact attempts OR manual mark
```

### 5.3 Lost Reasons
- `no_response` - Never answered after max attempts
- `not_interested` - Explicitly said not interested
- `chose_other` - Rented elsewhere
- `does_not_qualify` - Income/credit/background issues
- `invalid_contact` - Phone/email invalid
- `duplicate` - Duplicate lead
- `other` - Manual entry required

---

## 6. Lead Scoring System

### 6.1 Score Range
- **0-100 scale**
- **Starting score: 50** (neutral)
- **Priority threshold: 85+** (triggers is_priority = true)

### 6.2 Scoring Factors

#### Positive Indicators (+points)
| Indicator | Points | Detection Method | Human Readable |
|-----------|--------|------------------|----------------|
| Mentions urgency/immediate move | +15 | AI transcript analysis | "Lead mentioned needing to move urgently" |
| Has active voucher | +15 | Direct mention or data | "Lead has an active housing voucher" |
| Voucher expiring soon | +20 | Voucher status = 'expiring_soon' | "Lead's voucher is expiring soon - high urgency" |
| Asks detailed questions | +10 | Question count > 3 | "Lead asked multiple detailed questions about the property" |
| Asks about application process | +10 | AI keyword detection | "Lead inquired about the application process" |
| Provides complete contact info | +5 | All fields filled | "Lead provided complete contact information" |
| Called multiple times (interest) | +5 per call | Call count > 1 | "Lead called back showing continued interest" |
| Completed showing | +25 | Showing status = 'completed' | "Lead attended scheduled property showing" |
| Responded to follow-up | +10 | Engaged after nurturing | "Lead responded to follow-up communication" |
| Positive sentiment | +5 | AI sentiment analysis | "Lead expressed positive sentiment during call" |

#### Negative Indicators (-points)
| Indicator | Points | Detection Method | Human Readable |
|-----------|--------|------------------|----------------|
| Only asked price, ended call | -10 | Short call + single question | "Brief call - only asked about price" |
| Rude/hostile language | -20 | AI sentiment = 'negative' | "Lead used hostile or inappropriate language" |
| No-show to scheduled showing | -30 | Showing status = 'no_show' | "Lead did not attend scheduled showing" |
| No response after 3+ attempts | -15 | Contact attempts > 3, no engagement | "No response after multiple contact attempts" |
| Invalid phone detected | -25 | Verification failed | "Phone number could not be verified" |
| Incomplete info after multiple contacts | -10 | Missing required fields after 3 calls | "Still missing key information after multiple contacts" |

### 6.3 Explainable Scoring Requirement
**Every score change MUST be logged in `lead_score_history` with:**
1. `previous_score` and `new_score`
2. `change_amount` (positive or negative)
3. `reason_code` (machine-readable)
4. `reason_text` (human-readable sentence explaining the change)
5. `triggered_by` (what caused the analysis)
6. Related entity reference (call_id, showing_id, etc.)

This allows anyone viewing a lead's profile to see exactly why their score is what it is, with a complete audit trail.

### 6.4 Priority Lead Triggers
A lead becomes `is_priority = true` when:
1. Lead score reaches 85+
2. Mentions voucher expiring within 30 days
3. Mentions needing to move within 2 weeks
4. Mentions having deposit/funds ready
5. Called 3+ times for same property

Priority leads:
- Appear highlighted in dashboard
- Generate notification for admin/editor
- Suggested for human intervention (not auto-assigned)

### 6.5 Fair Housing Compliance (CRITICAL)
**The lead scoring system MUST NEVER use the following factors:**
- Race, color, national origin, ethnicity
- Religion
- Sex, gender identity, sexual orientation
- Familial status (presence of children, pregnancy)
- Disability or handicap
- Age
- Source of income type (e.g., cannot score Section 8 negatively)
- Accent or language proficiency (language preference for communication is OK)
- Name-based assumptions
- Neighborhood/zip code as a proxy for protected classes

**Only behavioral and engagement signals are permitted for scoring.**

---

## 7. Human Takeover System

### 7.1 Purpose
Allow team members to take manual control of high-value or sensitive leads, pausing all automated agent activity.

### 7.2 "Take Control of This Lead" Button
**Location**: Lead detail page, prominently displayed in red
**Label**: "Take Control of This Lead"
**Icon**: Hand or pause icon

### 7.3 Takeover Flow
1. User clicks "Take Control of This Lead"
2. Modal appears requiring:
   - **Reason** (required text field, minimum 20 characters)
   - Checkbox: "I understand all automated follow-ups will be paused"
3. On submit:
   - Set `lead.is_human_controlled = true`
   - Set `lead.human_controlled_by = current_user.id`
   - Set `lead.human_controlled_at = NOW()`
   - Set `lead.human_control_reason = [entered reason]`
   - Update all pending `agent_tasks` for this lead to `status = 'paused_human_control'`
   - Log the action in system activity

### 7.4 Visual Indicators
- Lead card shows red badge: "Human Controlled"
- Lead detail shows who took control and when
- Agent tasks page shows paused tasks with reason

### 7.5 Release Control
**Button**: "Release Lead to Automation" (appears only when human controlled)
**On release**:
- Set `lead.is_human_controlled = false`
- Optionally resume paused tasks or create new ones based on lead status
- Log the release action

---

## 8. AI Agents Specification

### 8.1 Main Inbound Agent
**Purpose**: Answer incoming calls, provide property info, capture lead data

**Trigger**: Inbound call to Twilio number

**Compliance Requirements**:
- MUST play call recording disclosure at start (configurable per state)
- MUST obtain verbal consent for follow-up calls/SMS
- MUST NOT ask about protected class information

**Behavior**:
1. Play recording disclosure: "This call may be recorded for quality purposes."
2. Greet caller, detect language (English/Spanish)
3. Ask what property they're calling about or what they're looking for
4. Look up property in database
5. If property available: Provide details, answer questions, offer to schedule showing
6. If property unavailable: Check `alternative_property_ids`, offer alternatives
7. If no match: Ask for preferences (zip, bedrooms, budget), search database
8. Capture name, email, move-in timeline, voucher status
9. Ask: "Is it okay if we follow up with you by text or phone?"
10. Offer to schedule showing or send more info via SMS
11. End call with next steps

**Data Captured**:
- Phone (from Twilio)
- Name
- Email (if provided)
- Interested property
- Questions asked
- Voucher status
- Move-in timeline
- Language
- Consent for follow-up (verbal)

**Post-Call Actions**:
- Create/update lead record
- Create call record with transcript
- Log consent in consent_log
- Trigger OpenAI scoring analysis
- Schedule follow-up task if needed
- Calculate and record costs

### 8.2 Recapture Agent
**Purpose**: Follow up with leads who didn't complete the funnel

**Triggers**:
- Call disconnected/dropped
- Lead asked about unavailable property and hung up
- Lead didn't schedule showing
- No engagement after 24 hours

**Behavior**:
1. Wait configurable hours after trigger (default: 24)
2. Check if lead has given consent for automated calls
3. Call lead with context from previous interaction
4. If property was unavailable: Present 2-3 alternatives
5. If call dropped: Apologize, continue conversation
6. Try to advance lead toward showing

**Attempt Logic** (Configurable):
- Attempt 1: Day 1 (24h after trigger)
- Attempt 2: Day 2
- Attempt 3: Day 4
- Attempt 4: Day 7
- Attempt 5: Day 10
- Attempt 6: Day 14
- Attempt 7: Day 21
- After max attempts with no answer: Mark as `lost` (reason: `no_response`)

**Cancellation Triggers**:
- Lead schedules showing
- Lead status changes to `in_application` or higher
- Property status changes to `in_leasing_process`
- Lead marked `do_not_contact`
- Lead is under human control
- Lead withdraws consent

### 8.3 Showing Confirmation Agent
**Purpose**: Confirm showing appointments

**Trigger**: Configurable hours before scheduled showing (default: 24)

**Behavior**:
1. Call lead to confirm appointment
2. Remind them of date, time, address
3. Confirm they're still coming
4. If confirmed: Update showing status to `confirmed`
5. If needs reschedule: Offer new times, update showing
6. If no answer: Try again per attempt logic
7. If max attempts fail: Cancel showing, open time slot

**Attempt Logic** (Configurable):
- Attempt 1: 24 hours before
- Attempt 2: 6 hours before (if no confirmation)
- Attempt 3: 2 hours before (if still no confirmation)
- After failed attempts: Cancel showing, notify leasing agent

### 8.4 No-Show Follow-Up Agent
**Purpose**: Re-engage leads who missed their showing

**Trigger**: Leasing agent marks showing as `no_show`

**Behavior**:
1. Wait configurable hours after no-show (default: 2)
2. Call lead empathetically (no accusation)
3. Ask if everything is okay
4. Offer to reschedule
5. If unreachable: Try SMS
6. Continue follow-up pattern similar to recapture

**Attempt Logic**:
- Attempt 1: 2 hours after no-show
- Attempt 2: Next day
- Attempt 3: Day 3
- If still no response: Continue with recapture logic

### 8.5 Post-Showing Agent
**Purpose**: Send application link after completed showing

**Trigger**: Showing status changes to `completed`

**Behavior**:
1. Wait configurable time after showing completion (default: 1 hour)
2. Send SMS with thank you and application link
3. If no application started in 48 hours: Follow-up call
4. Gently encourage to apply while property is available

### 8.6 Scoring Agent (Background)
**Purpose**: Analyze calls and update lead scores

**Trigger**: After every call ends

**Behavior**:
1. Receive call transcript
2. Send to OpenAI for analysis
3. Identify scoring indicators (see section 6.2)
4. Calculate score adjustment
5. **Create lead_score_history record with human-readable explanation**
6. Update lead score
7. If score crosses priority threshold: Flag lead
8. Store analysis in call record

**OpenAI Prompt Context**:
```
Analyze this call transcript between an AI leasing agent and a prospective tenant.
Extract the following:
1. Urgency level (1-5)
2. Interest level (1-5)
3. Sentiment (positive/neutral/negative)
4. Key questions asked
5. Questions that couldn't be answered
6. Section 8/voucher mentions
7. Move-in timeline mentioned
8. Budget mentioned
9. Any red flags (rudeness, suspicious behavior)
10. Recommended score adjustment (-30 to +30)
11. Human-readable explanation for each score factor

IMPORTANT: Do NOT extract or use any information about:
- Race, ethnicity, national origin
- Religion
- Family status
- Disability
- Age
- Gender

Return as JSON.
```

---

## 9. Doorloop Integration

### 9.1 Sync Direction
- **Doorloop → Rent Finder Cleveland**: Application status, lease status
- **Rent Finder Cleveland → Doorloop**: Lead data when they start application

### 9.2 Endpoints to Use
- `GET /prospects` - Check if lead exists
- `POST /prospects` - Create prospect when lead applies
- `GET /applications` - Check application status
- `GET /leases` - Check if lease signed

### 9.3 Sync Logic
1. **Polling**: Every 15 minutes, check Doorloop for status updates
2. **On status change**:
   - Application created → Update lead status to `in_application`
   - Application approved → Keep as `in_application`
   - Lease signed → Update lead status to `converted`
3. **Side effects**:
   - When status becomes `in_application`: Cancel all pending agent tasks for this lead
   - When status becomes `converted`: Mark property as `rented` if it's the last unit

---

## 10. Public Property Page

### 10.1 URL Structure
- Main listing: `[org-domain]/properties`
- Single property: `[org-domain]/properties/[id]`

### 10.2 Features
- Grid view of all available properties
- Filter by bedrooms, price range, zip code
- All properties show "Section 8 Welcome" badge
- Property cards show: Photo, address, bedrooms, bathrooms, price, status
- Clicking opens detail view with full info

### 10.3 Lead Capture Pop-up
**Trigger**: Configurable seconds after page load (default: 15)

**Content**:
```
"We have an agent available right now!
Want us to call you and help you find a home today?"

[Phone number input]
[Name input (optional)]
[ ] I agree to receive calls and texts (required checkbox - TCPA compliance)
[Call me now!] button

[Link to Privacy Policy]
```

**On Submit**:
1. Create lead with source = 'website'
2. Log consent in consent_log
3. Immediately trigger outbound call via Main Inbound Agent
4. Show confirmation: "Great! You'll receive a call in about 30 seconds."

### 10.4 Real-Time Updates
- When property status changes in admin panel, public page updates immediately
- Use Supabase real-time subscriptions

---

## 11. Insight Generator

### 11.1 Overview
AI-powered analytics interface for deep conversation analysis.

### 11.2 Filter Options
- Date range
- Lead status
- Lead source
- Call duration (min/max)
- Agent type
- Property
- Zip code
- Voucher status
- Language
- Sentiment
- Score range

### 11.3 Export
- Apply filters
- Click "Export CSV"
- Includes all lead data + call summaries matching filters

### 11.4 AI Chat Interface
**Purpose**: Natural language queries against the database

**Example Queries**:
- "What zip code has the highest conversion rate?"
- "What are the most common questions we can't answer?"
- "Show me leads who mentioned urgency but didn't schedule a showing"
- "Compare call duration between English and Spanish calls"
- "What day of the week do we get the most inbound calls?"

**Implementation**:
1. User types question
2. Send to OpenAI with database schema context
3. OpenAI generates SQL query or analysis approach
4. Execute query against Supabase
5. OpenAI formats response in natural language
6. Display with optional chart if relevant

---

## 12. Google Sheets Backup

### 12.1 Purpose
Simple backup and display of incoming leads for redundancy.

### 12.2 Structure
One sheet called "Leads" with columns:
- Timestamp
- Name
- Phone
- Email
- Source
- Interested Property
- Status
- Lead Score
- Created At

### 12.3 Sync
- Every time a new lead is created: Append row to sheet
- Every time lead status changes: Update corresponding row

---

## 13. Notifications & Alerts

### 13.1 Property Alerts
| Alert | Recipient | Channel |
|-------|-----------|---------|
| Coming Soon expires in 3 days | Admin, Editor | In-app + Email |
| Property status changed | Investor (if assigned) | In-app |
| High interest property (5+ showings/week) | Admin | In-app |

### 13.2 Lead Alerts
| Alert | Recipient | Channel |
|-------|-----------|---------|
| New priority lead | Admin, Editor | In-app + Push |
| Lead score jumped 20+ points | Assigned agent | In-app |
| Showing no-show | Leasing Agent, Editor | In-app + SMS |
| 3+ failed contact attempts | Editor | In-app |
| Lead taken under human control | Admin | In-app |

### 13.3 System Alerts
| Alert | Recipient | Channel |
|-------|-----------|---------|
| Twilio balance low | Admin | Email |
| API error rate high | Admin | Email |
| Doorloop sync failed | Admin | In-app + Email |
| Critical integration failure | Admin | Email (immediate) |

---

## 14. Investor Dashboard & Storytelling

### 14.1 Purpose
Provide investors with not just metrics, but narrative insights about their properties that help them understand performance and make renewal decisions.

### 14.2 Metrics Section
Standard KPIs per property:
- Total leads received
- Showings scheduled vs. completed
- Current status
- Days on market
- Lead-to-showing conversion rate
- Showing-to-application conversion rate

### 14.3 Storytelling Section
**AI-generated narrative insights stored in `investor_insights` table.**

**Example Insights**:
- "This property lost 3 leads due to pricing concerns, not location. Consider a rent adjustment."
- "Leads are asking about pet policy 4x more than other properties. Clarifying this upfront could improve conversion."
- "Tuesday and Wednesday showings have 80% completion rate vs. 40% on weekends. Prioritize weekday scheduling."
- "Section 8 leads convert 2x faster for this property. Your HUD-ready status is paying off."
- "3 leads mentioned they chose a competitor property 2 blocks away with in-unit laundry."

### 14.4 Insight Generation
Run weekly (or on-demand) analysis per property:
1. Gather all leads, calls, showings for the property in the period
2. Analyze patterns using OpenAI
3. Generate 2-5 insights with headlines and narratives
4. Store in `investor_insights`
5. Display in investor dashboard with option to highlight/pin

### 14.5 Insight Types
- `lead_loss_reason` - Why leads didn't convert
- `pricing_feedback` - Price-related signals from conversations
- `location_feedback` - Location-related comments
- `feature_request` - Amenities/features leads asked about
- `competitive_insight` - Mentions of competing properties
- `seasonal_trend` - Time-based patterns
- `recommendation` - AI suggestion for improvement

---

## 15. Development Phases

### Phase 1: Core Foundation
1. Supabase project setup with all tables including multi-tenant structure
2. Authentication with role-based access
3. Organization management (for admin)
4. User management (CRUD)
5. Property management (CRUD) with status, photos, alternatives
6. Basic lead management (CRUD)
7. Lead score history tracking
8. Human takeover functionality
9. Basic dashboard per role
10. Public property listing page with pop-up (with consent checkbox)
11. Responsive design implementation
12. System logs viewer

### Phase 2: AI & Automation
1. Twilio integration (inbound/outbound calls)
2. Bland.ai integration (Main Inbound Agent)
3. Recapture Agent with scheduling
4. Showing Confirmation Agent
5. No-Show Follow-Up Agent
6. Post-Showing Agent
7. Lead Scoring Agent (OpenAI) with explainable scoring
8. SMS automation
9. Persona verification integration
10. Showing management with agent reports
11. Consent logging
12. Cost tracking per interaction

### Phase 3: Analytics & Integration
1. Insight Generator with filters and export
2. Insight Generator AI chat
3. Investor storytelling/insights
4. Doorloop API integration
5. Google Sheets backup sync
6. Advanced reporting dashboards
7. Cost dashboard
8. Notification system
9. Tenant configuration panel
10. Campaign system for manual outreach

---

## 16. API Keys Required (Environment Variables)

```env
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio (can be per-org in organizations table)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Bland.ai (can be per-org)
BLAND_API_KEY=

# OpenAI (can be per-org)
OPENAI_API_KEY=

# Persona (can be per-org)
PERSONA_API_KEY=
PERSONA_TEMPLATE_ID=

# Doorloop (can be per-org)
DOORLOOP_API_KEY=

# Google (for Sheets backup)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEETS_ID=

# Notifications
ADMIN_NOTIFICATION_EMAIL=admin@rentfindercleveland.com
```

---

## 17. File Structure (Expected)

```
src/
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── layout/          # Header, Sidebar, Footer
│   ├── dashboard/       # Dashboard widgets
│   ├── properties/      # Property-related components
│   ├── leads/           # Lead-related components
│   ├── showings/        # Showing-related components
│   ├── calls/           # Call log components
│   ├── reports/         # Report components
│   ├── insights/        # Investor insights components
│   ├── settings/        # Settings components
│   ├── logs/            # System logs components
│   └── public/          # Public page components
├── pages/
│   ├── auth/            # Login, Register
│   ├── dashboard/       # Role-specific dashboards
│   ├── properties/      # Property management
│   ├── leads/           # Lead management
│   ├── showings/        # Showing management
│   ├── calls/           # Call logs
│   ├── reports/         # Reports & Insights
│   ├── settings/        # System settings
│   ├── users/           # User management
│   ├── logs/            # System logs
│   ├── costs/           # Cost dashboard
│   └── public/          # Public property listing
├── hooks/               # Custom React hooks
├── lib/
│   ├── supabase.ts      # Supabase client
│   ├── twilio.ts        # Twilio helpers
│   ├── bland.ts         # Bland.ai helpers
│   ├── openai.ts        # OpenAI helpers
│   ├── persona.ts       # Persona helpers
│   ├── doorloop.ts      # Doorloop API helpers
│   ├── costs.ts         # Cost calculation helpers
│   └── utils.ts         # General utilities
├── types/               # TypeScript interfaces
├── contexts/            # React contexts (Auth, Org, etc.)
└── styles/
    └── globals.css      # Tailwind + custom styles
```

---

## 18. Security and Compliance

### 18.1 Privacy Policy
Rent Finder Cleveland handles sensitive personal data, including contact information, voucher details, and communication logs. All data processing must comply with applicable laws such as CCPA, GDPR (if international users), and FCRA for any background-related integrations.

**Key Principles**:
- **Consent**: Obtain explicit consent for recording calls, sending SMS/emails, and storing lead data. Include opt-in checkboxes in lead capture forms (e.g., website pop-up) and verbal consent scripts in AI agents.
- **Data Minimization**: Collect only necessary data; automatically purge inactive leads after 6 months unless converted.
- **Access and Deletion**: Users (leads and internal users) can request data access or deletion via a dedicated support email (support@rentfindercleveland.com).
- **Third-Party Sharing**: Data shared with integrations (e.g., Twilio, Doorloop) must be anonymized where possible and covered by data processing agreements.

A full privacy policy document should be hosted at rentfindercleveland.com/privacy and linked in all user-facing interfaces.

### 18.2 Permissions and Role-Based Access
Building on the permission matrix in Section 4, ensure all features enforce least-privilege principles. Use Supabase Row Level Security (RLS) to restrict database queries at the row level.

**RLS Implementation**:
- Enable RLS on all tables (e.g., properties, leads) to filter data based on user role, organization, and assignments.
- Examples:
  - **Viewers**: SELECT policy limits to rows where investor_id matches user.id via investor_property_access AND organization matches.
  - **Leasing Agents**: UPDATE policy only on assigned showings and leads within their organization.
  - **Admins**: Full access within their organization only.
  - **Super Admins**: Bypass restrictions with full access policies across organizations.
- Test RLS for edge cases, such as role changes, shared properties, or organization switches.

### 18.3 Secrets Management
Secure handling of API keys and sensitive configurations is critical to prevent breaches.

**Supabase Secrets**: Use Supabase's built-in secrets manager for storing environment variables like API keys (e.g., OPENAI_API_KEY, TWILIO_AUTH_TOKEN). Avoid hardcoding; reference via process.env in code.

**Best Practices**:
- Rotate keys every 90 days.
- Use encrypted storage for production.
- Audit logs: Enable Supabase logging for secret access.
- Development vs. Production: Separate environments to avoid exposing prod secrets in dev.
- Per-organization keys stored encrypted in organizations table.

---

## 19. Multi-Tenancy Architecture

### 19.1 Why Multi-Tenancy from Day One
**This must be designed from the start because:**
- Adding `organization_id` to every table later requires massive data migration
- RLS policies are fundamentally different for single-tenant vs multi-tenant
- URL routing, authentication flows, and API scoping all depend on tenant isolation
- Retrofitting multi-tenancy typically requires a full rewrite
- Early architectural decisions (like hardcoded settings) become technical debt

### 19.2 Data Isolation Model
Every table that stores tenant-specific data includes `organization_id` as a required foreign key. RLS policies ensure queries only return rows matching the authenticated user's organization.

**Shared vs. Isolated Resources**:
- **Isolated per organization**: Properties, leads, calls, showings, users, settings, documents
- **Shared across platform**: System-wide settings, super admin users, platform metrics

### 19.3 Organization Data Structure
Each organization requires:
- **Identity**: Name, slug (URL-friendly), logo
- **Contact**: Owner email, phone, address
- **Branding**: Primary/accent colors (CSS variables)
- **Subscription**: Plan type, status, billing info, usage limits
- **Integration Keys**: Each org can have their own Twilio, Bland, OpenAI keys or use platform defaults
- **Settings**: Configurable behaviors (see 19.4)

### 19.4 Tenant Configuration

**Why configurability is critical**: Different property managers have different processes, markets, and preferences. A one-size-fits-all approach makes the product unsellable to anyone with unique needs.

**Configurable Settings per Organization**:

| Category | Setting | Default | Purpose |
|----------|---------|---------|---------|
| **Agents** | recapture_first_delay_hours | 24 | Hours before first recapture attempt |
| **Agents** | recapture_max_attempts | 7 | Maximum recapture call attempts |
| **Agents** | recapture_schedule | [1,2,4,7,10,14,21] | Days for each attempt |
| **Agents** | confirmation_hours_before | 24 | Hours before showing to start confirmation |
| **Agents** | confirmation_max_attempts | 3 | Max confirmation attempts |
| **Agents** | no_show_delay_hours | 2 | Hours after no-show before follow-up |
| **Agents** | post_showing_delay_hours | 1 | Hours after showing to send application link |
| **Lead Capture** | popup_delay_seconds | 15 | Seconds before showing capture popup |
| **Lead Capture** | popup_enabled | true | Whether popup is active |
| **Lead Capture** | popup_message | "We have an agent..." | Custom popup text |
| **Scoring** | starting_score | 50 | Initial lead score |
| **Scoring** | priority_threshold | 85 | Score that triggers priority flag |
| **Scoring** | custom_scoring_rules | {} | Org-specific scoring adjustments |
| **Communications** | sms_templates | {} | Custom SMS message templates |
| **Communications** | email_templates | {} | Custom email templates |
| **Communications** | working_hours_start | "09:00" | Start of calling hours |
| **Communications** | working_hours_end | "20:00" | End of calling hours |
| **Communications** | working_days | [1,2,3,4,5,6] | Days to make calls (1=Mon) |
| **Showings** | default_duration_minutes | 30 | Default showing length |
| **Showings** | buffer_minutes | 15 | Buffer between showings |
| **Compliance** | recording_disclosure_text | "This call may be recorded..." | State-specific disclosure |
| **Compliance** | auto_purge_leads_days | 180 | Days before inactive leads purged |
| **Voice** | bland_voice_id | "default" | Bland.ai voice selection |
| **Voice** | voice_language_primary | "en" | Primary agent language |

### 19.5 Custom Lead Statuses
Organizations can define additional custom statuses beyond the core ones, stored in organization_settings. The system handles them as valid status values while maintaining compatibility with automation logic that depends on core statuses.

---

## 20. Compliance Deep Dive

### 20.1 Fair Housing Act Compliance
**Legal Risk**: Violations can result in lawsuits, HUD complaints, fines up to $150,000+, and reputation damage.

**What the Lead Scoring System CANNOT Use**:
- Race, color, national origin
- Religion
- Sex (including gender identity, sexual orientation)
- Familial status (children, pregnancy)
- Disability
- Any proxy for these (zip code demographics, name analysis, accent)

**What IS Permitted**:
- Engagement signals (call duration, response rate)
- Stated urgency and timeline
- Budget alignment with property pricing
- Communication preferences
- Verification status
- Behavioral patterns (multiple calls, questions asked)

**Implementation**:
- OpenAI prompts explicitly exclude protected characteristics
- Scoring rules audited for proxy discrimination
- All scoring decisions logged with explanations
- Regular bias audits on scoring outcomes

### 20.2 TCPA Compliance (Telephone Consumer Protection Act)
**Legal Risk**: $500-$1,500 per unsolicited call/text. Class actions can reach millions.

**Requirements**:
1. **Prior Express Written Consent** for marketing calls/texts
   - Checkbox with clear language, not pre-checked
   - Record of consent with timestamp, IP, exact language shown
2. **Opt-Out Mechanism**
   - "Reply STOP to unsubscribe" on every SMS
   - Immediate honoring of opt-out requests
   - Maintain do-not-contact list
3. **Calling Hours**
   - No calls before 8am or after 9pm in recipient's timezone
   - Configurable per organization
4. **Caller ID**
   - Must display valid callback number
   - No spoofing

**Implementation**:
- `consent_log` table tracks all consent events
- `leads.sms_consent` and `leads.call_consent` fields
- `leads.do_not_contact` flag
- Working hours enforcement in agent scheduling
- Opt-out keyword handling in SMS

### 20.3 Call Recording Compliance
**Legal Risk**: Wiretapping laws vary by state. Two-party consent states require disclosure.

**Two-Party Consent States** (as of 2024):
California, Connecticut, Delaware, Florida, Illinois, Maryland, Massachusetts, Michigan, Montana, Nevada, New Hampshire, Oregon, Pennsylvania, Vermont, Washington

**Requirements**:
1. Play recording disclosure at start of every call
2. Disclosure must be clear and audible
3. Continued participation = consent
4. Store evidence that disclosure was played

**Implementation**:
- `calls.recording_disclosure_played` boolean
- Configurable disclosure text per organization (for state variations)
- Disclosure text stored in organization_settings
- Bland.ai configured to play disclosure before conversation starts

---

## 21. Fallbacks and Reliability

### 21.1 Why Fallbacks Are Essential
External service failures will happen. Without fallbacks:
- Leads go unanswered
- Scheduled tasks fail silently
- Customer trust erodes
- Revenue is lost

Visibility into failures is equally important - you can't fix what you can't see.

### 21.2 Service-Specific Fallback Plans

| Service | Failure Type | Fallback Action | User Notification |
|---------|--------------|-----------------|-------------------|
| **Bland.ai** | API timeout/error | Queue call for retry in 5 minutes. After 3 failures, send SMS instead. Log error. | None initially, alert admin after 3 failures |
| **Bland.ai** | Rate limit | Exponential backoff (1min, 5min, 15min). Queue overflows to SMS. | Admin alert if queue > 50 |
| **Twilio** | Call failure | Retry once after 30 seconds. If second failure, log and mark task for manual review. | Admin alert |
| **Twilio** | SMS failure | Retry once. If failure persists, try email if available. Log error. | None |
| **OpenAI** | API timeout | Use cached/default scoring (+5 for any completed call). Mark for re-analysis when available. | None |
| **OpenAI** | Rate limit | Queue analysis requests. Process in batches when available. | None |
| **OpenAI** | API error | Log error. Use default values. Retry analysis in background. | Admin alert if > 10 failures/hour |
| **Persona** | Verification timeout | Allow showing scheduling with "Pending Verification" status. Retry verification. | Lead sees "Verification in progress" |
| **Persona** | API error | Mark lead as "Manual Verification Required". Create task for team. | Admin alert |
| **Doorloop** | Sync failure | Log error. Retry in 15 minutes. After 3 failures, alert admin. | Admin alert |
| **Doorloop** | API unavailable | Continue operating without sync. Queue status updates for when API returns. | Admin notification |

### 21.3 System Logs Panel

**Location**: Admin dashboard → "System Logs" tab

**Features**:
- Real-time log stream of all integration events
- Filter by: Level (info/warning/error/critical), Service, Date range, Resolution status
- Each log entry shows:
  - Timestamp
  - Service (Twilio, Bland, OpenAI, etc.)
  - Level (color-coded)
  - Event type
  - Message
  - Related lead/call/showing (clickable links)
  - Resolution status
- Mark as resolved with notes
- Export logs as CSV

**Critical Error Handling**:
- Critical errors automatically send email to `admin@rentfindercleveland.com`
- Email includes: Error details, affected leads/calls, suggested action
- Dashboard shows critical error banner until resolved

### 21.4 Health Check Dashboard
Admin dashboard widget showing:
- Status of each integration (green/yellow/red)
- Last successful API call time
- Error rate in last hour
- Current queue sizes

---

## 22. Real-Time Cost Dashboard

### 22.1 Why Cost Tracking Matters
**Without granular cost tracking, you cannot:**
- Know if a lead source is profitable
- Price your SaaS correctly
- Identify cost anomalies
- Make data-driven decisions about automation intensity

The most important metric is **cost per lead at each funnel stage** - this reveals which sources and which leads are worth pursuing.

### 22.2 Cost Tracking Architecture

**Per-Interaction Recording**:
- Every call logs: `cost_twilio`, `cost_bland`, `cost_openai`
- Every SMS logs: `cost_twilio`
- Every verification logs: `cost_persona`
- Costs recorded in `cost_records` table with service attribution

**Cost Calculation Methods**:

| Service | Method | Rate (approximate) |
|---------|--------|-------------------|
| Twilio Voice | API usage endpoint OR minutes × rate | ~$0.014/min inbound, ~$0.014/min outbound |
| Twilio SMS | API usage endpoint OR message count × rate | ~$0.0079/message |
| Bland.ai | API provides usage data | ~$0.09/min |
| OpenAI | Token count × model rate | ~$0.01-0.03/1K tokens (GPT-4) |
| Persona | Verification count × rate | ~$1-2/verification |

### 22.3 Cost Dashboard Features

**Location**: Admin dashboard → "Costs" tab

**Summary View**:
- Total spend this month by service (pie chart)
- Daily spend trend (line chart)
- Month-over-month comparison

**Per-Lead Cost View** (The key feature):
- Table showing each lead with:
  - Lead name/phone
  - Source
  - Current status
  - Total cost incurred (sum of all calls, SMS, verifications)
  - Cost breakdown by service
  - Cost per funnel stage reached
- Sortable by total cost
- Filterable by source, status, date range

**Per-Source Analysis**:
- Average cost to acquire a lead by source
- Average cost to get a showing by source
- Average cost to convert by source
- ROI calculation: (Converted leads × avg commission) - Total cost

**Alerts**:
- Daily spend exceeds threshold → Admin email
- Single lead cost exceeds threshold → Admin notification
- Unusual spike detection

### 22.4 Cost Attribution to Leads
Every cost record can optionally link to:
- `lead_id` - The lead this cost was incurred for
- `call_id` - The specific call
- `communication_id` - The specific SMS/email

This allows rolling up total cost per lead regardless of how many interactions occurred.

---

## 23. Audit Checklist (Per Phase)

### Phase 1 Audit
- [ ] All database tables created with correct relationships
- [ ] Multi-tenant structure with organization_id on all tables
- [ ] RLS policies correctly restrict data per role AND organization
- [ ] Authentication flow works (login, logout, password reset)
- [ ] Admin can create/edit/delete all users in their org
- [ ] Admin can create/edit/delete all properties in their org
- [ ] Editor can create/edit properties but not delete
- [ ] Viewer can only see assigned properties
- [ ] Leasing Agent can see properties and their assigned leads
- [ ] Property status changes work and cascade correctly
- [ ] Coming Soon alert fires 3 days before date
- [ ] Alternative properties can be assigned
- [ ] Lead score history records created on every score change
- [ ] Human takeover button works - pauses all agent tasks
- [ ] Human takeover requires mandatory note
- [ ] Human control release works
- [ ] Public page displays all available properties for the org
- [ ] Pop-up appears after configured seconds
- [ ] Pop-up includes consent checkbox
- [ ] Lead created when pop-up submitted with consent logged
- [ ] System logs page displays integration events
- [ ] All pages responsive on mobile
- [ ] Montserrat font applied everywhere
- [ ] Color scheme matches specification (per-org if configured)
- [ ] shadcn/ui components used throughout
- [ ] Privacy policy implemented and linked
- [ ] RLS policies created and tested for all tables
- [ ] Secrets stored securely in Supabase

### Phase 2 Audit
- [ ] Twilio integration receives and routes calls
- [ ] Bland.ai handles conversations correctly
- [ ] Recording disclosure plays at call start
- [ ] Verbal consent captured and logged
- [ ] All agents trigger on correct events
- [ ] Recapture agent follows configured schedule
- [ ] Agent tasks pause when lead is human-controlled
- [ ] Lead scoring with explainable history
- [ ] Score history shows human-readable reasons
- [ ] No protected class information in scoring
- [ ] SMS opt-out (STOP) handling works
- [ ] Cost tracking records per interaction
- [ ] Persona verification before showings
- [ ] Fallback behaviors work when services fail
- [ ] System logs capture all errors
- [ ] Critical errors trigger email notifications

### Phase 3 Audit
- [ ] Insight Generator filters work correctly
- [ ] CSV export includes all filtered data
- [ ] AI chat answers questions about data
- [ ] Investor storytelling generates insights
- [ ] Investor dashboard shows narrative insights
- [ ] Doorloop sync updates lead status
- [ ] Cost dashboard shows per-lead costs
- [ ] Cost dashboard shows per-source ROI
- [ ] Google Sheets backup syncs new leads
- [ ] Notification system delivers alerts
- [ ] Tenant configuration panel allows all settings changes
- [ ] Settings changes take effect immediately
- [ ] Campaign system can trigger bulk outreach

---

*Document Version: 2.0*
*Last Updated: January 2025*
*Project: Rent Finder Cleveland*
*Architecture: Multi-Tenant SaaS*
