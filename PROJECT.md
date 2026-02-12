# PROJECT COMPLETE — Rent Finder Cleveland
## Version 10 | February 11, 2026

---

# Table of Contents

1. [Project Overview](#1-project-overview)
2. [Current State](#2-current-state)
3. [Tech Stack](#3-tech-stack)
4. [Design System](#4-design-system)
5. [Database Schema](#5-database-schema)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [Lead Lifecycle](#7-lead-lifecycle)
8. [Lead Scoring System](#8-lead-scoring-system)
9. [Human Takeover System](#9-human-takeover-system)
10. [AI Agents Architecture](#10-ai-agents-architecture)
11. [Compliance](#11-compliance)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Multi-Tenancy](#13-multi-tenancy)
14. [Cost Dashboard](#14-cost-dashboard)
15. [Integrations](#15-integrations)
16. [Public Pages](#16-public-pages)
17. [Notifications & Alerts](#17-notifications--alerts)
18. [Investor Dashboard](#18-investor-dashboard)
19. [Fallbacks & Reliability](#19-fallbacks--reliability)
20. [Production Deployment Checklist](#20-production-deployment-checklist)
21. [What Remains](#21-what-remains)
22. [Latest Session Update](#22-latest-session-update)

---

# 1. Project Overview

## 1.1 Vision

Rent Finder Cleveland is an AI-powered lead management SaaS platform for property management. It automates the entire rental lead lifecycle: inbound calls → AI voice agents → lead scoring → follow-ups → showings → applications. The platform serves as a lead funnel that integrates with Doorloop for the actual leasing process.

**SaaS Vision**: While launching as Rent Finder Cleveland, the platform is architected from day one to support multiple property management companies (tenants) as a white-label SaaS product. Each organization operates in complete data isolation with customizable branding, workflows, and pricing rules.

## 1.2 Multi-App Architecture

Three domains sharing one Supabase database:
- **rentfindercleveland.com** — Primary instance
- **homeguardmanagement.com** — Second tenant
- **portafoliodiversificado.com** — Third tenant (Spanish-focused)

Each domain operates as a separate organization with independent branding, API keys, and settings, all on a shared infrastructure.

## 1.3 Core Problems Solved

1. High volume of incoming calls with repetitive questions
2. Leads going cold due to slow response times
3. Language barriers with Spanish-speaking prospects
4. No visibility into what questions aren't being answered
5. Manual follow-up processes that don't scale
6. Scattered data across email, phone, and different systems
7. No cost visibility per lead or per source
8. Compliance risks with automated communications (TCPA, Fair Housing)

## 1.4 Target Users (5 Roles)

| Role | Description | Scope |
|------|-------------|-------|
| **Super Admin** | Platform-level control across all organizations (SaaS owner) | All orgs |
| **Admin** | Full system control within their organization | Own org |
| **Editor** | Property management, lead management, reports | Own org |
| **Viewer (Investor)** | Read-only access to assigned properties' metrics | Assigned properties |
| **Leasing Agent** | Field agent with showing management and manual outreach tools | Assigned leads/showings |

## 1.5 Primary Language

English (primary) with Spanish language support for prospect-facing interactions.

---

# 2. Current State

## 2.1 Completion Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Core Foundation | Complete | Auth, multi-tenancy, CRUD, dashboards, public pages, responsive design |
| Phase 2: AI & Automation | Code Complete | All 30 agents written as edge functions, Twilio/Bland integration, scoring, consent logging |
| Phase 3: Analytics & Integration | Code Complete | Insight Generator, investor storytelling, Doorloop sync, cost dashboard, campaigns |
| Pre-Production Audit | Complete | 15-layer system hardening (Operation Clean Slate), 0 critical issues |
| Documentation System | Complete | PROJECT.md (source of truth) + incremental snapshots (MD5–MD10) |

**Status**: Code complete. Ready for production configuration and testing.

## 2.2 Codebase Statistics

| Metric | Count |
|--------|-------|
| **Total Lines of Code (src/)** | 45,732 |
| **Total Lines of Code (supabase/migrations)** | 3,592 |
| **Combined Total** | 49,324 |
| **TSX files** | 39,107 lines |
| **TS files** | 6,213 lines |
| **CSS files** | 412 lines |
| **Page Files** | 31 (13,103 lines) |
| **Custom Components** | 83 |
| **shadcn/ui Components** | 52 |
| **Total Component Files** | 135 (25,371 lines) |
| **Custom Hooks** | 7 (1,573 lines) |
| **Library Files** | 7 (1,052 lines) |
| **Context Files** | 1 (261 lines) |
| **Integration Files** | 2 (3,538 lines) |
| **Database Tables** | 39 |
| **Database Views** | 1 |
| **RLS Policies (estimated active)** | ~209 (133 static + ~76 dynamic anon-deny) |
| **Database Functions (RPCs)** | 36 |
| **Database Triggers** | 11 |
| **Database Enums** | 1 (app_role) |
| **SQL Migrations** | 28 (3,592 lines) |
| **Edge Functions (deployed in Supabase)** | 39 |
| **Cron Jobs** | 1 (daily property alert check) |
| **npm Dependencies** | 55 |
| **npm devDependencies** | 21 |
| **Total npm Packages** | 76 |

## 2.3 Build Output

```
✓ built in 3.57s — 0 errors, 0 warnings

Top bundles:
  index-qcPpEWF2.js          475.48 kB (142.73 kB gzip)
  LeadsList-EZFQuGEz.js      471.83 kB (156.40 kB gzip)
  generateCategoricalChart    373.33 kB (102.41 kB gzip)
  vendor-supabase             165.32 kB ( 43.53 kB gzip)
  vendor-react                164.17 kB ( 53.52 kB gzip)
  Settings-DOAG9JSi.js        102.97 kB ( 25.34 kB gzip)
  LeadDetail-tk7BQFvK.js       87.48 kB ( 21.98 kB gzip)
  PropertyForm-Dhrqq2q3.js     84.67 kB ( 23.45 kB gzip)
  vendor-forms                  79.83 kB ( 21.85 kB gzip)
```

---

# 3. Tech Stack

## 3.1 Core Platform

| Technology | Purpose |
|-----------|---------|
| **React + TypeScript** | Frontend framework |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Component library (mandatory for all UI components) |
| **Supabase (PostgreSQL)** | Backend, database, auth, real-time, storage |
| **Vite** | Build tool with SWC plugin |
| **React Router** | Client-side routing |
| **TanStack Query** | Server state management |
| **React Hook Form + Zod** | Form handling and validation |
| **Recharts** | Chart/visualization library |
| **Lucide React** | Icon library |
| **date-fns** | Date formatting/manipulation |
| **Sonner** | Toast notifications (primary) |
| **Lovable** | Hosting platform |

## 3.2 External Integrations

| Service | Purpose | Edge Functions Using It |
|---------|---------|----------------------|
| **Twilio** | Inbound/outbound calls, SMS | Aaron (inbound webhook), Ruth (SMS inbound), Elijah (recapture), Samuel (confirmation), Jonah (no-show), Joshua (campaign voice) |
| **Bland.ai** | AI voice agent conversations | Deborah (call webhook), all voice agents route through Bland |
| **OpenAI** | Scoring, transcript analysis, insights, PAIp chat | Daniel (scoring), Isaiah (transcript), Solomon (prediction), Moses (insights), David (reports), PAIp assistant |
| **Persona** | Identity verification before showings | Joseph (compliance check / verification) |
| **Doorloop** | Application/lease status sync | Ezra (pull), Caleb (push) |
| **Google Sheets** | Lead backup and redundancy | Matthew (sheets backup) |
| **Resend** | Transactional email | Luke (email processor) |
| **Gmail** | Parse Hemlane lead notification emails | Esther (Hemlane parser) |

---

# 4. Design System

## 4.1 Color Palette

| Color | Hex | CSS Variable | Usage |
|-------|-----|-------------|-------|
| Primary | `#370d4b` | `--color-primary` | Headers, primary buttons, theme-color meta |
| Accent | `#ffb22c` | `--color-accent` | CTAs, highlights, active states, gold accents |
| Background | `#f4f1f1` | `--color-background` | Page background |
| Surface | `#ffffff` | `--color-surface` | Cards, modals, form backgrounds |
| Success | `#22C55E` | `--color-success` | Positive states, converted badges |
| Error | `#EF4444` | `--color-error` | Errors, alerts, lost badges, destructive actions |
| Warning | `#F59E0B` | `--color-warning` | Warnings, attention items |
| Text Primary | `#1a1a1a` | `--color-text-primary` | Main text |
| Text Secondary | `#6b7280` | `--color-text-secondary` | Secondary text, labels |

## 4.2 Typography

```css
font-family: 'Montserrat', sans-serif;

/* Scale */
--text-xs:  0.75rem;   /* 12px - labels, badges */
--text-sm:  0.875rem;  /* 14px - secondary text, table cells */
--text-base: 1rem;     /* 16px - body text */
--text-lg:  1.125rem;  /* 18px - subheadings */
--text-xl:  1.25rem;   /* 20px - card titles */
--text-2xl: 1.5rem;    /* 24px - section headers */
--text-3xl: 1.875rem;  /* 30px - page titles */
--text-4xl: 2.25rem;   /* 36px - dashboard hero numbers */
```

Montserrat is loaded via Google Fonts with `font-display: swap` and preconnect for performance. Weights used: 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 800 (extra-bold).

## 4.3 Responsive Breakpoints

```css
/* Mobile-first approach — Tailwind defaults */
sm:  640px   /* Large phones */
md:  768px   /* Tablets */
lg:  1024px  /* Small laptops */
xl:  1280px  /* Desktops */
2xl: 1536px  /* Large screens */
```

**Coverage**: 82 out of 170 TSX files use responsive prefixes. All grid layouts use progressive column patterns (grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-3 → xl:grid-cols-4). Viewport meta tag includes `viewport-fit=cover` for notched devices.

## 4.4 Lead Status Colors

| Status | Color | Badge Class |
|--------|-------|-------------|
| new | Blue | `bg-blue-500` |
| contacted | Purple | `bg-purple-500` |
| engaged | Amber | `bg-amber-500` |
| nurturing | Indigo | `bg-indigo-500` |
| qualified | Emerald | `bg-emerald-500` |
| showing_scheduled | Cyan | `bg-cyan-500` |
| showed | Teal | `bg-teal-500` |
| in_application | Orange | `bg-orange-500` |
| converted | Green | `bg-green-500` |
| lost | Red | `bg-red-500` |

---

# 5. Database Schema

## 5.1 All 39 Tables

| # | Table | Purpose | RLS |
|---|-------|---------|-----|
| 1 | `organizations` | Multi-tenant core with branding, subscription, API keys | Yes |
| 2 | `organization_settings` | Per-org configurable settings (agents, scoring, compliance, etc.) | Yes |
| 3 | `organization_credentials` | Encrypted API keys per org (Twilio, Bland, OpenAI, etc.) | Yes |
| 4 | `users` | User accounts with roles, org assignment, commission rates | Yes |
| 5 | `user_activity_log` | User action audit trail | Yes |
| 6 | `user_feature_toggles` | Per-user feature flag overrides | Yes |
| 7 | `user_notifications_custom` | Custom notification preferences per user | Yes |
| 8 | `properties` | Rental listings with details, photos, Section 8, alternatives | Yes |
| 9 | `property_alerts` | Notifications for property events (coming_soon, high interest) | Yes |
| 10 | `investor_property_access` | Maps investors (viewers) to properties they can see | Yes |
| 11 | `leads` | Core lead records with scoring, status, human control flags | Yes |
| 12 | `lead_score_history` | Explainable scoring audit trail (every change logged) | Yes |
| 13 | `lead_predictions` | ML-based conversion probability predictions | Yes |
| 14 | `lead_field_changes` | Lead field change audit log | Yes |
| 15 | `lead_notes` | User notes on leads with pinning support | Yes |
| 16 | `calls` | Voice calls with transcripts, AI analysis, per-service costs | Yes |
| 17 | `transcript_analyses` | Deep transcript analysis results | Yes |
| 18 | `communications` | SMS & email logs with delivery status and costs | Yes |
| 19 | `email_events` | Email delivery event tracking | Yes |
| 20 | `showings` | Appointments with confirmation tracking, agent reports | Yes |
| 21 | `agent_tasks` | Scheduled AI actions (pausable for human takeover) | Yes |
| 22 | `agents_registry` | Registry of all AI agents with status and config | Yes |
| 23 | `agent_activity_log` | Agent execution audit trail | Yes |
| 24 | `campaigns` | Outreach campaign definitions | Yes |
| 25 | `campaign_recipients` | Campaign recipient lists and status | Yes |
| 26 | `system_settings` | Key-value settings, per-org or platform-wide | Yes |
| 27 | `system_logs` | Error & integration tracking with resolution workflow | Yes |
| 28 | `integration_health` | Real-time integration status monitoring | Yes |
| 29 | `cost_records` | Per-interaction cost attribution across services | Yes |
| 30 | `faq_documents` | FAQ content with OpenAI vector embeddings (1536 dimensions) | Yes |
| 31 | `consent_log` | TCPA compliance evidence with consent type, method, evidence | Yes |
| 32 | `conversion_predictions` | Lead conversion probability predictions | Yes |
| 33 | `investor_insights` | AI-generated storytelling insights with confidence scores | Yes |
| 34 | `investor_reports` | Generated investor report documents | Yes |
| 35 | `competitor_mentions` | Competitor data extracted from call transcripts | Yes |
| 36 | `doorloop_sync_log` | Doorloop sync operation audit trail | Yes |
| 37 | `referrals` | Referral tracking between leads/sources | Yes |
| 38 | `demo_requests` | Landing page demo request submissions | Yes (anon INSERT allowed) |
| 39 | `notifications` | In-app notification records | Yes |

**View**: `property_performance` — Aggregated property metrics view

## 5.2 Key Table SQL Definitions

### Organizations (Multi-Tenant Core)
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#370d4b',
  accent_color TEXT DEFAULT '#ffb22c',
  plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'professional', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  billing_email TEXT,
  stripe_customer_id TEXT,
  max_properties INTEGER DEFAULT 10,
  max_users INTEGER DEFAULT 5,
  max_calls_per_month INTEGER DEFAULT 500,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  bland_api_key TEXT,
  openai_api_key TEXT,
  persona_api_key TEXT,
  doorloop_api_key TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  default_language TEXT DEFAULT 'en',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Users
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
  commission_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);
```

### Properties
```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  unit_number TEXT,
  city TEXT NOT NULL DEFAULT 'Cleveland',
  state TEXT NOT NULL DEFAULT 'OH',
  zip_code TEXT NOT NULL,
  bedrooms INTEGER NOT NULL,
  bathrooms DECIMAL(3,1) NOT NULL,
  square_feet INTEGER,
  property_type TEXT CHECK (property_type IN ('house', 'apartment', 'duplex', 'townhouse', 'condo')),
  rent_price DECIMAL(10,2) NOT NULL,
  deposit_amount DECIMAL(10,2),
  application_fee DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'coming_soon', 'in_leasing_process', 'rented')),
  coming_soon_date DATE,
  section_8_accepted BOOLEAN DEFAULT true,
  hud_inspection_ready BOOLEAN DEFAULT true,
  photos JSONB DEFAULT '[]',
  video_tour_url TEXT,
  virtual_tour_url TEXT,
  description TEXT,
  special_notes TEXT,
  amenities JSONB DEFAULT '[]',
  pet_policy TEXT,
  alternative_property_ids UUID[] DEFAULT '{}',
  investor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  listed_date DATE,
  doorloop_property_id TEXT
);
```

### Leads
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'es')),
  source TEXT NOT NULL CHECK (source IN ('inbound_call', 'hemlane_email', 'website', 'referral', 'manual', 'sms', 'campaign')),
  source_detail TEXT,
  interested_property_id UUID REFERENCES properties(id),
  interested_zip_codes TEXT[],
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  move_in_date DATE,
  has_voucher BOOLEAN,
  voucher_amount DECIMAL(10,2),
  housing_authority TEXT,
  voucher_status TEXT CHECK (voucher_status IN ('active', 'pending', 'expiring_soon', 'expired', 'unknown')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'contacted', 'engaged', 'nurturing', 'qualified',
    'showing_scheduled', 'showed', 'in_application', 'lost', 'converted'
  )),
  lost_reason TEXT,
  lead_score INTEGER DEFAULT 50 CHECK (lead_score >= 0 AND lead_score <= 100),
  is_priority BOOLEAN DEFAULT false,
  priority_reason TEXT,
  is_human_controlled BOOLEAN DEFAULT false,
  human_controlled_by UUID REFERENCES users(id),
  human_controlled_at TIMESTAMPTZ,
  human_control_reason TEXT,
  phone_verified BOOLEAN DEFAULT false,
  identity_verified BOOLEAN DEFAULT false,
  persona_verification_id TEXT,
  assigned_leasing_agent_id UUID REFERENCES users(id),
  contact_preference TEXT DEFAULT 'any' CHECK (contact_preference IN ('call', 'sms', 'email', 'any')),
  do_not_contact BOOLEAN DEFAULT false,
  sms_consent BOOLEAN DEFAULT false,
  sms_consent_at TIMESTAMPTZ,
  call_consent BOOLEAN DEFAULT false,
  call_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  doorloop_prospect_id TEXT,
  hemlane_lead_id TEXT
);
```

## 5.3 All 36 Database Functions (RPCs)

| # | Function | Purpose | Type |
|---|----------|---------|------|
| 1 | `get_user_role(auth_user_id)` | Returns user role from auth UUID | Helper |
| 2 | `get_user_organization_id(auth_user_id)` | Returns org_id for RLS policies | Helper |
| 3 | `has_role(auth_user_id, role)` | Boolean role check | Helper |
| 4 | `is_super_admin(auth_user_id)` | Check if super admin | Helper |
| 5 | `get_user_id(auth_user_id)` | Returns internal user.id from auth UUID | Helper |
| 6 | `user_has_property_access(auth_user_id, property_id)` | Check investor property access | Helper |
| 7 | `can_manage_property_photos(auth_user_id)` | Check photo upload permission | Helper |
| 8 | `get_org_setting(key)` | Retrieve organization setting value | Helper |
| 9 | `log_score_change(lead_id, change, reason, context)` | Core scoring: inserts history, updates score, auto-priority | Business |
| 10 | `log_agent_activity(agent, action, details)` | Record agent activity | Business |
| 11 | `log_user_activity(user_id, action, details)` | Record user activity | Business |
| 12 | `pause_lead_agent_tasks(lead_id, user_id, reason)` | Human takeover: pause all tasks for a lead | Business |
| 13 | `execute_agent_task_now(task_id)` | Immediately execute a scheduled agent task | Business |
| 14 | `handle_sms_opt_out(phone, org_id)` | Process SMS STOP keyword | Business |
| 15 | `schedule_next_recapture(lead_id)` | Schedule next recapture attempt | Business |
| 16 | `schedule_showing_confirmations()` | Schedule confirmation calls for upcoming showings | Business |
| 17 | `schedule_stale_leads_for_recapture()` | Find stale leads and schedule recapture | Business |
| 18 | `schedule_conversion_predictions()` | Schedule prediction generation | Business |
| 19 | `reset_agent_daily_counters()` | Reset daily agent execution counters | Business |
| 20 | `seed_agents_for_organization(org_id)` | Initialize agent registry for new org | Business |
| 21 | `check_coming_soon_expiring()` | Cron: create alerts for expiring properties | Cron |
| 22 | `habakkuk_check_alerts()` | Check and generate system alerts | Cron |
| 23 | `get_dashboard_summary()` | Returns full dashboard metrics JSON | Analytics |
| 24 | `get_lead_funnel(date_from, date_to)` | Returns funnel conversion metrics | Analytics |
| 25 | `get_source_performance(days)` | Performance metrics per lead source | Analytics |
| 26 | `get_zip_code_analytics(days)` | Analytics per zip code | Analytics |
| 27 | `get_property_performance()` | Property-level performance metrics | Analytics |
| 28 | `get_lead_full_context(lead_id)` | Full lead context for AI analysis | Analytics |
| 29 | `build_campaign_audience(criteria)` | Build campaign recipient list from criteria | Campaign |
| 30 | `format_lead_for_sheets(lead_id)` | Format lead data for Google Sheets export | Sync |
| 31 | `map_doorloop_status(status)` | Map Doorloop status to internal status | Sync |
| 32 | `joseph_compliance_check(lead_id, action)` | TCPA compliance verification | Compliance |
| 33 | `zacchaeus_record_cost(service, amount, context)` | Record interaction cost | Cost |
| 34 | `rebekah_find_alternatives(property_id)` | Find alternative properties | Matching |
| 35 | `rebekah_match_properties(lead_id)` | Match properties to lead preferences | Matching |
| 36 | `create_default_feature_toggles(user_id)` | Initialize feature toggles for new user | System |

## 5.4 All 11 Database Triggers

### Updated_at Triggers (10)
| # | Trigger | Table |
|---|---------|-------|
| 1 | `update_organizations_updated_at` | organizations |
| 2 | `update_organization_settings_updated_at` | organization_settings |
| 3 | `update_organization_credentials_updated_at` | organization_credentials |
| 4 | `update_users_updated_at` | users |
| 5 | `update_properties_updated_at` | properties |
| 6 | `update_leads_updated_at` | leads |
| 7 | `update_showings_updated_at` | showings |
| 8 | `update_agent_tasks_updated_at` | agent_tasks |
| 9 | `update_faq_documents_updated_at` | faq_documents |
| 10 | `update_system_settings_updated_at` | system_settings |

### Business Logic Trigger (1)
| # | Trigger | Table | Event | Action |
|---|---------|-------|-------|--------|
| 11 | `trigger_update_lead_on_showing` | showings | BEFORE UPDATE | Updates lead status/score on showing completion, no-show, confirmation, cancellation |

**Note**: `prevent_direct_lead_score_update` trigger exists but is **DISABLED** — would enforce scoring via `log_score_change()` only. Should be enabled in production.

## 5.5 Database Extensions

- `uuid-ossp` — UUID generation
- `pg_cron` — Scheduled jobs
- `pg_net` — HTTP requests from database
- `vector` — OpenAI embeddings (1536 dimensions) for FAQ semantic search

---

# 6. User Roles & Permissions

## 6.1 Complete Permission Matrix

| Feature | Super Admin | Admin | Editor | Viewer | Leasing Agent |
|---------|:-----------:|:-----:|:------:|:------:|:-------------:|
| **Organizations** |
| View all organizations | Yes | - | - | - | - |
| Create organization | Yes | - | - | - | - |
| Edit organization settings | Yes | Yes | - | - | - |
| **Dashboard** |
| View all metrics | Yes | Yes | Yes | - | - |
| View assigned property metrics | Yes | Yes | Yes | Yes | Yes |
| View cost dashboard | Yes | Yes | - | - | - |
| View system logs | Yes | Yes | - | - | - |
| **Properties** |
| Create property | Yes | Yes | Yes | - | - |
| Edit property | Yes | Yes | Yes | - | - |
| Delete property | Yes | Yes | - | - | - |
| View all properties | Yes | Yes | Yes | - | Yes |
| View assigned properties | Yes | Yes | Yes | Yes | Yes |
| Change property status | Yes | Yes | Yes | - | - |
| Upload photos | Yes | Yes | Yes | - | - |
| Set alternative properties | Yes | Yes | Yes | - | - |
| **Leads** |
| View all leads | Yes | Yes | Yes | - | - |
| View assigned leads | Yes | Yes | Yes | - | Yes |
| Edit lead info | Yes | Yes | Yes | - | Yes |
| Manually create lead | Yes | Yes | Yes | - | Yes |
| Change lead status | Yes | Yes | Yes | - | Yes |
| Mark as do-not-contact | Yes | Yes | Yes | - | - |
| Take human control | Yes | Yes | Yes | - | Yes |
| Release human control | Yes | Yes | Yes | - | Yes |
| **Showings** |
| View all showings | Yes | Yes | Yes | - | - |
| View assigned showings | Yes | Yes | Yes | - | Yes |
| Schedule showing | Yes | Yes | Yes | - | Yes |
| Submit showing report | Yes | Yes | Yes | - | Yes |
| Cancel/reschedule | Yes | Yes | Yes | - | Yes |
| **Calls & Communications** |
| View all call logs | Yes | Yes | Yes | - | - |
| View assigned call logs | Yes | Yes | Yes | - | Yes |
| Listen to recordings | Yes | Yes | Yes | - | Yes |
| Initiate manual call | Yes | Yes | Yes | - | Yes |
| **Reports & Analytics** |
| View all reports | Yes | Yes | Yes | - | - |
| View investor reports | Yes | Yes | Yes | Yes | - |
| Export data (CSV) | Yes | Yes | Yes | - | - |
| Access Insight Generator | Yes | Yes | Yes | - | - |
| **User Management** |
| Create users | Yes | Yes | - | - | - |
| Edit users | Yes | Yes | - | - | - |
| Delete users | Yes | Yes | - | - | - |
| Assign properties to investors | Yes | Yes | Yes | - | - |
| Assign leads to agents | Yes | Yes | Yes | - | - |
| **System Settings** |
| View settings | Yes | Yes | Yes | - | - |
| Modify settings | Yes | Yes | - | - | - |
| Toggle features on/off | Yes | Yes | - | - | - |
| **FAQ/Documents** |
| View documents | Yes | Yes | Yes | - | Yes |
| Create/edit documents | Yes | Yes | Yes | - | - |
| Delete documents | Yes | Yes | - | - | - |

## 6.2 RLS Policy Architecture

- **~209 Row Level Security policies** across all tables
- **133 unique named static policies** for role-based access
- **~76 programmatic deny_anon policies** — 19 sensitive tables x 4 operations (SELECT, INSERT, UPDATE, DELETE) all set to `USING (false)` for anonymous role
- **Security Definer functions** (`get_user_role`, `get_user_organization_id`, `has_role`, `is_super_admin`) called from within RLS policies
- **Multi-tenant scoping**: Every policy checks `organization_id = get_user_organization_id(auth.uid())`
- **Exception**: `demo_requests` allows anonymous INSERT for landing page form submissions

---

# 7. Lead Lifecycle

## 7.1 Status Flow

```
new → contacted → engaged → nurturing → qualified → showing_scheduled → showed → in_application → converted
                                                                                                       ↑
(any status can → lost)                                                                    (Doorloop sync)
```

## 7.2 Status Definitions

| Status | Description | Trigger |
|--------|-------------|---------|
| `new` | Just entered the system | Inbound call, Hemlane email, website form, manual entry |
| `contacted` | System made first contact | AI agent completed first call/SMS attempt |
| `engaged` | Lead responded or had conversation | Lead answered call, replied to SMS |
| `nurturing` | Receiving active follow-up | Engaged but not ready to schedule showing |
| `qualified` | High score, priority lead | Lead score >= 70 or is_priority = true |
| `showing_scheduled` | Has confirmed showing appointment | Showing created and confirmed |
| `showed` | Attended the property showing | Leasing agent submitted showing report |
| `in_application` | Started application in Doorloop | Doorloop API sync detected application |
| `lost` | Did not continue | Manual mark or 7+ failed contact attempts |
| `converted` | Signed lease | Doorloop API sync detected signed lease |

## 7.3 Automatic Status Transitions

```
new → contacted         After first AI call attempt (regardless of answer)
contacted → engaged     When lead answers or responds
engaged → nurturing     If no showing scheduled within 48 hours
nurturing → qualified   When lead_score >= 70 OR is_priority = true
any → showing_scheduled When showing is created and confirmed
showing_scheduled → showed When agent submits showing report
showed → in_application When Doorloop sync detects application
in_application → converted When Doorloop sync detects signed lease
any → lost              After max contact attempts OR manual mark
```

## 7.4 Lost Reasons

| Reason | Description |
|--------|-------------|
| `no_response` | Never answered after max attempts (7+) |
| `not_interested` | Explicitly said not interested |
| `chose_other` | Rented elsewhere |
| `does_not_qualify` | Income/credit/background issues |
| `invalid_contact` | Phone/email invalid |
| `duplicate` | Duplicate lead |
| `other` | Manual entry with note required |

---

# 8. Lead Scoring System

## 8.1 Score Range

- **Scale**: 0–100
- **Starting score**: 50 (neutral)
- **Priority threshold**: 85+ (triggers `is_priority = true`)

## 8.2 Positive Indicators

| Indicator | Points | Detection Method | Human-Readable Reason |
|-----------|:------:|------------------|----------------------|
| Mentions urgency/immediate move | +15 | AI transcript analysis | "Lead mentioned needing to move urgently" |
| Has active voucher | +15 | Direct mention or data | "Lead has an active housing voucher" |
| Voucher expiring soon | +20 | voucher_status = 'expiring_soon' | "Lead's voucher is expiring soon - high urgency" |
| Asks detailed questions | +10 | Question count > 3 | "Lead asked multiple detailed questions" |
| Asks about application process | +10 | AI keyword detection | "Lead inquired about the application process" |
| Provides complete contact info | +5 | All fields filled | "Lead provided complete contact information" |
| Called multiple times | +5/call | Call count > 1 | "Lead called back showing continued interest" |
| Completed showing | +25 | Showing status = completed | "Lead attended scheduled property showing" |
| Responded to follow-up | +10 | Engaged after nurturing | "Lead responded to follow-up communication" |
| Positive sentiment | +5 | AI sentiment analysis | "Lead expressed positive sentiment during call" |

## 8.3 Negative Indicators

| Indicator | Points | Detection Method | Human-Readable Reason |
|-----------|:------:|------------------|----------------------|
| Only asked price, ended call | -10 | Short call + single question | "Brief call - only asked about price" |
| Rude/hostile language | -20 | AI sentiment = negative | "Lead used hostile or inappropriate language" |
| No-show to scheduled showing | -30 | Showing status = no_show | "Lead did not attend scheduled showing" |
| No response after 3+ attempts | -15 | Contact attempts > 3 | "No response after multiple contact attempts" |
| Invalid phone detected | -25 | Verification failed | "Phone number could not be verified" |
| Incomplete info after 3 calls | -10 | Missing required fields | "Still missing key information after multiple contacts" |

## 8.4 Explainable Scoring

Every score change MUST be logged in `lead_score_history` with:
1. `previous_score` and `new_score`
2. `change_amount` (positive or negative)
3. `reason_code` (machine-readable, e.g., `urgency_mentioned`)
4. `reason_text` (human-readable sentence)
5. `triggered_by` (call_analysis, showing_outcome, engagement, verification, manual_adjustment, time_decay, contact_attempts)
6. Related entity reference (call_id, showing_id, user_id)

The `log_score_change()` database function handles all of this atomically, clamping scores to 0-100 and auto-setting `is_priority = true` when score >= 85.

## 8.5 Priority Lead Triggers

A lead becomes `is_priority = true` when:
1. Lead score reaches 85+
2. Mentions voucher expiring within 30 days
3. Mentions needing to move within 2 weeks
4. Mentions having deposit/funds ready
5. Called 3+ times for same property

Priority leads appear highlighted in dashboard, generate admin notifications, and are suggested for human intervention.

## 8.6 Fair Housing Compliance (CRITICAL)

**The scoring system MUST NEVER use:**
- Race, color, national origin, ethnicity
- Religion
- Sex, gender identity, sexual orientation
- Familial status (children, pregnancy)
- Disability or handicap
- Age
- Source of income type (cannot score Section 8 negatively)
- Accent or language proficiency
- Name-based assumptions
- Neighborhood/zip code as proxy for protected classes

**Only behavioral and engagement signals are permitted.**

---

# 9. Human Takeover System

## 9.1 Purpose

Allow team members to take manual control of high-value or sensitive leads, pausing all automated AI agent activity.

## 9.2 Take Control Flow

1. User clicks **"Take Control of This Lead"** button (red, prominent) on lead detail page
2. Modal appears (`HumanTakeoverModal.tsx`, 166 lines) requiring:
   - **Reason text** (minimum 20 characters, enforced)
   - **Confirmation checkbox**: "I understand all automated follow-ups will be paused"
3. On submit:
   - `lead.is_human_controlled = true`
   - `lead.human_controlled_by = current_user.id`
   - `lead.human_controlled_at = NOW()`
   - `lead.human_control_reason = [entered reason]`
   - Calls `pause_lead_agent_tasks()` RPC — updates all pending/in_progress agent_tasks to `paused_human_control`
   - Logs the action in system activity

## 9.3 Visual Indicators

- Lead card shows red **"Human Controlled"** badge
- Lead detail header shows who took control and when
- Agent tasks page shows paused tasks with reason
- Dashboard shows total human-controlled leads count

## 9.4 Release Control

- **"Release Lead to Automation"** button (`ReleaseControlModal.tsx`, 158 lines)
- Sets `is_human_controlled = false`
- Optionally resumes paused tasks or creates new ones based on lead status
- Logs the release action

---

# 10. AI Agents Architecture

## 10.1 Overview

30 AI agents with biblical names, implemented as Supabase Edge Functions (Deno). All edge functions are hosted in Supabase (not in the local repository). Total edge function code: ~12,353 lines across 39 functions.

## 10.2 Agent Categories

### Inbound & Routing (4 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Aaron** | `twilio-inbound-webhook` | 320 | Receives inbound calls from Twilio, routes to Bland.ai |
| **Deborah** | `bland-call-webhook` | 387 | Processes Bland.ai call completions, extracts data, triggers scoring |
| **Ruth** | `agent-sms-inbound` | 370 | Handles inbound SMS messages, creates/updates leads |
| **Esther** | `agent-hemlane-parser` | 345 | Parses Hemlane lead notification emails into lead records |

### Outbound Voice & Communication (6 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Elijah** | `agent-recapture` | 441 | Follow-up with dropped/disengaged leads (7 attempts over 21 days) |
| **Samuel** | `agent-showing-confirmation` | 390 | Confirm showing appointments (3 attempts: 24h, 6h, 2h before) |
| **Jonah** | `agent-noshow-followup` | 344 | Re-engage leads who missed showings (empathetic, reschedule) |
| **Naomi** | `agent-post-showing` | 424 | Send application link after completed showing, follow-up in 48h |
| **Joshua** | `agent-campaign-voice` | 273 | Outbound voice calls for campaigns |
| **Miriam** | `agent-welcome-sequence` | 400 | Welcome new leads with introductory communication |

### Analysis & Scoring (5 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Daniel** | `agent-scoring` | 416 | AI lead scoring with OpenAI, Fair Housing compliance enforced |
| **Isaiah** | `agent-transcript-analyst` | 345 | Deep analysis of call transcripts for insights and patterns |
| **Solomon** | `agent-conversion-predictor` | 345 | ML-based prediction of lead conversion probability |
| **Moses** | `agent-insight-generator` | 286 | Generate narrative insights from lead/property data |
| **David** | `agent-report-generator` | 515 | Generate comprehensive reports (investor, performance) |

### Orchestration & Dispatch (3 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Nehemiah** | `agent-task-dispatcher` | 337 | Orchestrates pending tasks from agent_tasks table (designed for 5-min cron) |
| **Joel** | `agent-campaign-orchestrator` | 413 | Orchestrates bulk outreach campaigns |
| **Gabriel** | `agent-notification-dispatcher` | 465 | Routes notifications to correct channels (in-app, email, SMS) |

### Compliance & Monitoring (2 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Joseph** | `agent-persona-verification` | 297 | TCPA compliance gate — called by 9 outbound agents before any contact. Also handles Persona identity verification. |
| **Zacchaeus** | `agent-health-checker` | 605 | System health monitoring, integration status checks. Cost tracking called by 16 edge functions. **LARGEST** |

### External Sync (3 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Ezra** | `agent-doorloop-pull` | 339 | Pull application/lease status from Doorloop |
| **Caleb** | `agent-doorloop-push` | 246 | Push lead data to Doorloop when they apply |
| **Matthew** | `agent-sheets-backup` | 455 | Backup lead data to Google Sheets |

### Email & Specialized (7 agents)

| Biblical Name | Edge Function | Lines | Purpose |
|--------------|---------------|:-----:|---------|
| **Luke** | `agent-resend-processor` | 255 | Process and send transactional emails via Resend |
| **Raphael** | `agent-health-checker` | — | Health checker (variant) |
| **Uriel** | `agent-notification-dispatcher` | — | Notification dispatcher (variant) |
| **Lydia** | `agent-welcome-sequence` | — | Welcome sequence (variant) |
| **Rebekah** | `agent-rebekah-smart-matcher` | — | Smart property matcher |
| **Habakkuk** | Alert checker | — | System alert generation |
| **PAIp** | `agent-paip-assistant` | 356 | AI assistant chat endpoint (internal) |

## 10.3 Auxiliary Edge Functions (15 non-agent functions)

| Function | Lines | Purpose |
|----------|:-----:|---------|
| `generate-investor-report` | 447 | Generate investor report document |
| `generate-all-investor-reports` | 146 | Batch generate all investor reports |
| `predict-conversion` | 287 | Single lead conversion prediction |
| `batch-predictions` | 142 | Batch conversion predictions |
| `trigger-referral-campaign` | 249 | Trigger referral outreach campaign |
| `test-integration` | 227 | Test external service connections |
| `invite-user` | 224 | Send user invitation email |
| `send-message` | 206 | Send SMS/email message |
| `match-properties` | 197 | Match lead preferences to properties |
| `paip-chat` | 194 | PAIp AI assistant public chat endpoint |
| `send-notification-email` | 174 | Send notification email via Resend |
| `persona-webhook` | 167 | Handle Persona verification webhooks |
| `capture-lead` | 143 | Website lead capture endpoint |
| `check-coming-soon` | 90 | Check expiring coming_soon properties |
| `submit-demo-request` | 91 | Handle demo request form submissions |

## 10.4 Compliance Gates

**Joseph Compliance Check** — 9 outbound agents require TCPA compliance verification before execution:
1. Elijah (recapture)
2. Samuel (showing confirmation)
3. Jonah (no-show follow-up)
4. Naomi (post-showing)
5. Joshua (campaign voice)
6. Miriam (welcome sequence)
7. Ruth (SMS outbound)
8. Luke (email outbound)
9. Joel (campaign orchestrator)

**Zacchaeus Cost Tracking** — 16 functions call cost recording after execution.

## 10.5 Cron Schedule

| Job | Schedule | Function |
|-----|----------|----------|
| Property alert check | Daily 9:00 AM EST | `check_coming_soon_expiring()` |
| Task dispatcher | Every 5 min (planned, not yet configured) | Nehemiah `agent-task-dispatcher` |
| Doorloop sync | Every 15 min (planned) | Ezra `agent-doorloop-pull` |

---

# 11. Compliance

## 11.1 Fair Housing Act

**Legal Risk**: Violations can result in lawsuits, HUD complaints, fines up to $150,000+

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| No protected class in scoring | OpenAI prompts explicitly exclude; only behavioral signals used | PASS |
| No proxy discrimination | Zip code not used as scoring factor; language preference OK for routing only | PASS |
| Audit trail | All scoring decisions logged in lead_score_history with explanations | PASS |
| Regular bias audits | Scoring outcomes analyzable via Insight Generator | Available |

## 11.2 TCPA (Telephone Consumer Protection Act)

**Legal Risk**: $500–$1,500 per unsolicited call/text. Class actions can reach millions.

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Prior express written consent | Consent checkboxes default to `false`, opt-in required | PASS |
| Consent record with timestamp | `consent_log` table with method, evidence, IP, user_agent | PASS |
| Opt-out mechanism | "Reply STOP" on SMS, `do_not_contact` flag enforced | PASS |
| Calling hours | Configurable `working_hours_start`/`working_hours_end` per org | PASS |
| Caller ID | Valid callback number via Twilio | PASS |
| Joseph compliance gate | 9 outbound agents check consent before execution | PASS |

## 11.3 Call Recording

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Recording disclosure | Played at start of every call, configurable text per org | PASS |
| Disclosure evidence | `calls.recording_disclosure_played` boolean | PASS |
| State-specific text | Stored in `organization_settings` compliance category | PASS |
| Bland.ai configuration | Disclosure played before conversation starts | PASS |

## 11.4 Privacy & Data

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Privacy Policy | `/p/privacy-policy` — 556 lines, A2P-compliant | PASS |
| Terms of Service | `/p/terms-of-service` — 613 lines, A2P-compliant | PASS |
| Data minimization | Auto-purge configurable (`auto_purge_leads_days`, default 180) | Available |
| Access/deletion requests | Supported via admin panel | Available |

---

# 12. Frontend Architecture

## 12.1 All 31 Pages

| Page | File | Lines | Description |
|------|------|:-----:|-------------|
| Landing Page | `LandingPage.tsx` | 435 | Public marketing page with demo request |
| Login | `auth/Login.tsx` | 171 | Email/password authentication |
| Forgot Password | `auth/ForgotPassword.tsx` | 157 | Password reset request |
| Reset Password | `auth/ResetPassword.tsx` | 258 | Set new password |
| Dashboard (Router) | `dashboard/index.tsx` | 46 | Routes to role-specific dashboard |
| Admin Dashboard | `dashboard/AdminDashboard.tsx` | 591 | Full metrics, widgets, activity feed |
| Agent Dashboard | `dashboard/AgentDashboard.tsx` | 429 | Leasing agent's assigned work view |
| Investor Dashboard | `dashboard/InvestorDashboard.tsx` | 228 | Read-only metrics for investors |
| Properties List | `properties/PropertiesList.tsx` | 287 | Property grid with filters |
| Property Detail | `properties/PropertyDetail.tsx` | 830 | Full property view with edit form |
| Leads List | `leads/LeadsList.tsx` | 708 | Lead table with filters, CSV import |
| Lead Detail | `leads/LeadDetail.tsx` | 679 | Full lead profile, scoring, timeline |
| Showings List | `showings/ShowingsList.tsx` | 397 | Calendar and list view of showings |
| Calls List | `calls/CallsList.tsx` | 312 | Call log with filters |
| Call Detail | `calls/CallDetail.tsx` | 535 | Transcript, analysis, quality score |
| Reports | `reports/Reports.tsx` | 355 | Analytics reports with charts |
| Knowledge Hub | `insights/KnowledgeHub.tsx` | 416 | AI-powered insight generator with chat |
| Cost Dashboard | `costs/CostDashboard.tsx` | 627 | Per-service and per-lead cost analysis |
| Settings | `settings/Settings.tsx` | 148 | Tab-based settings container |
| Users List | `users/UsersList.tsx` | 223 | User management table |
| User Detail | `users/UserDetail.tsx` | 540 | User profile with role management |
| System Logs | `SystemLogs.tsx` | 658 | Integration error tracking |
| Agents Page | `agents/AgentsPage.tsx` | 827 | AI agent status and management |
| Demo Requests | `DemoRequests.tsx` | 419 | Manage incoming demo requests |
| Lead Heat Map | `analytics/LeadHeatMap.tsx` | 327 | Geographic demand visualization |
| Voucher Intelligence | `analytics/VoucherIntelligence.tsx` | 572 | Section 8 voucher analytics |
| Competitor Radar | `analytics/CompetitorRadar.tsx` | 448 | Competitor mention tracking |
| Privacy Policy | `public/PrivacyPolicy.tsx` | 556 | Legal privacy policy (A2P-compliant) |
| Terms of Service | `public/TermsOfService.tsx` | 613 | Legal terms of service (A2P-compliant) |
| Referral Page | `public/ReferralPage.tsx` | 287 | Public referral program page |
| Not Found | `NotFound.tsx` | 24 | 404 catch-all page |

**Total**: 31 pages, 13,103 lines

## 12.2 All 83 Custom Components (by category)

### Layout (5 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `Header.tsx` | 150 | Top navigation bar with breadcrumbs |
| `MainLayout.tsx` | 164 | App shell with sidebar + header |
| `MobileNav.tsx` | 184 | Mobile bottom navigation |
| `NotificationsDropdown.tsx` | 197 | Notification bell dropdown |
| `Sidebar.tsx` | 205 | Left navigation sidebar |

### Dashboard Widgets (15 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `ActivityFeed.tsx` | 155 | Recent activity stream |
| `DashboardCustomizer.tsx` | 244 | Widget visibility toggle |
| `DashboardGreeting.tsx` | 76 | Personalized greeting with date |
| `InsightCard.tsx` | 118 | AI insight display card |
| `IntegrationHealth.tsx` | 284 | Integration status overview |
| `IntegrationStatusMini.tsx` | 397 | Compact integration status |
| `InvestorReportsSection.tsx` | 253 | Investor report list |
| `PriorityLeadCard.tsx` | 125 | Priority lead highlight |
| `ProgressTimeline.tsx` | 87 | Lead funnel progress |
| `PropertyMetricCard.tsx` | 156 | Property KPI card |
| `ReferralWidget.tsx` | 141 | Referral program widget |
| `ScoreGauge.tsx` | 147 | Circular score visualization |
| `ShowingCard.tsx` | 167 | Upcoming showing card |
| `StatCard.tsx` | 189 | Metric stat card with trend |
| `VoiceQualityWidget.tsx` | 263 | Call quality metrics |

### Lead Components (21 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AIBriefSection.tsx` | 106 | AI-generated lead brief |
| `CsvImportDialog.tsx` | 814 | Bulk CSV lead import |
| `DoorloopStatusBadge.tsx` | 91 | Doorloop sync status badge |
| `HumanTakeoverModal.tsx` | 166 | Take control modal |
| `InteractionHistoryCard.tsx` | 347 | Call/SMS/showing history timeline |
| `LeadActivityTimeline.tsx` | 534 | Full activity timeline |
| `LeadDetailHeader.tsx` | 398 | Lead detail page header |
| `LeadFilterPills.tsx` | 87 | Quick filter badges |
| `LeadForm.tsx` | 515 | Create/edit lead form |
| `LeadProfileCard.tsx` | 123 | Lead info summary card |
| `LeadStatusBadge.tsx` | 88 | Status badge with colors |
| `MessagingCenter.tsx` | 431 | SMS/email compose and history |
| `NotesTab.tsx` | 399 | Lead notes with pinning |
| `PinnedNotesPreview.tsx` | 102 | Pinned notes summary |
| `PredictionCard.tsx` | 299 | Conversion prediction display |
| `ReleaseControlModal.tsx` | 158 | Release human control modal |
| `ScoreDisplay.tsx` | 79 | Score with gauge display |
| `ScoreHistoryPreview.tsx` | 82 | Recent score changes |
| `SmartMatches.tsx` | 306 | AI property matches for lead |
| `UpcomingActionsPreview.tsx` | 133 | Upcoming agent actions preview |
| `UpcomingAgentActions.tsx` | 310 | Full agent action schedule |

### Property Components (4 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AlternativePropertiesSelector.tsx` | 166 | Select alternative properties |
| `PhotoUpload.tsx` | 290 | Property photo upload with drag-drop |
| `PropertyCard.tsx` | 129 | Property list card |
| `PropertyForm.tsx` | 768 | Full property create/edit form |

### Showing Components (4 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `DailyRouteCard.tsx` | 393 | Daily showing route planner |
| `MyRouteTab.tsx` | 539 | Agent's showing route view |
| `ScheduleShowingDialog.tsx` | 483 | Schedule showing dialog |
| `ShowingReportDialog.tsx` | 394 | Submit showing report dialog |

### Settings Components (13 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AgentsTab.tsx` | 357 | AI agent configuration |
| `CommunicationsTab.tsx` | 532 | SMS/email templates and settings |
| `ComplianceTab.tsx` | 202 | Recording disclosure and compliance |
| `DemoDataTab.tsx` | 1,008 | Demo data seeding tool |
| `IntegrationKeysTab.tsx` | 431 | API key management |
| `InvestorReportsTab.tsx` | 549 | Investor report generation |
| `LeadCaptureTab.tsx` | 119 | Lead capture popup settings |
| `OrganizationTab.tsx` | 324 | Organization profile settings |
| `ScoringTab.tsx` | 165 | Lead scoring configuration |
| `ShowingsTab.tsx` | 109 | Showing defaults |
| `agents/ActivityFeedItem.tsx` | 110 | Agent activity feed item |
| `agents/AgentCard.tsx` | 395 | Individual agent status card |
| `agents/AgentCategoryCard.tsx` | 66 | Agent category grouping card |

### Insight & Analytics Components (4 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AIChat.tsx` | 194 | AI chat interface for natural language queries |
| `DocumentsTab.tsx` | 478 | FAQ document management |
| `InsightFilters.tsx` | 341 | Multi-filter panel for insights |
| `LeadsResultsTable.tsx` | 249 | Filtered leads result table |

### Landing Page Components (7 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AnimatedStats.tsx` | 181 | Animated counter statistics |
| `AustinChatWidget.tsx` | 416 | Landing page chat demo widget |
| `DemoRequestDialog.tsx` | 222 | Demo request form dialog |
| `FloatingBackground.tsx` | 90 | Animated background decoration |
| `HowItWorksSection.tsx` | 310 | Step-by-step feature explanation |
| `RotatingHeroText.tsx` | 52 | Rotating hero headline text |
| `SocialProofToast.tsx` | 155 | Social proof notification toasts |

### Other Components (10 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `ErrorBoundary.tsx` | 87 | React error boundary (app root) |
| `NavLink.tsx` | 30 | Navigation link helper |
| `ProtectedRoute.tsx` | 85 | Auth-gated route wrapper |
| `ProfileSetupScreen.tsx` | 21 | Profile setup placeholder |
| `ClevelandHeatGrid.tsx` | 220 | Geographic heat map grid |
| `CallQualityScore.tsx` | 206 | Call quality scoring display |
| `PAIpAssistant.tsx` | 394 | PAIp AI assistant floating widget |
| `LeadFunnelCard.tsx` | 246 | Lead funnel visualization |
| `InviteUserModal.tsx` | 265 | User invitation modal |
| `RoleBadge.tsx` | 42 | User role badge |

## 12.3 52 shadcn/ui Components

accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, date-range-picker, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip, EmptyState, LoadingSpinner, StatusBadge

## 12.4 All 7 Custom Hooks

| Hook | Lines | Purpose |
|------|:-----:|---------|
| `use-mobile.tsx` | 19 | Detect mobile viewport |
| `use-toast.ts` | 221 | Legacy toast notifications (8 files still use) |
| `useAgentsData.ts` | 215 | Fetch agent registry and task data |
| `useCostData.ts` | 358 | Fetch and process cost analytics |
| `useOrganizationSettings.ts` | 307 | Read/write organization settings |
| `usePermissions.ts` | 185 | Role-based permission checks |
| `useReportsData.ts` | 268 | Fetch report analytics data |

## 12.5 Library Files

| File | Lines | Purpose |
|------|:-----:|---------|
| `utils.ts` | 6 | Tailwind class merge utility |
| `validation.ts` | 175 | Phone formatting, input validation |
| `emailTemplates.ts` | 274 | Email template definitions |
| `notificationService.ts` | 204 | Notification dispatch service |
| `systemLogger.ts` | 135 | System log writer |
| `errorLogger.ts` | 113 | Error logging utility |
| `supabaseErrors.ts` | 145 | Supabase error message helpers |

## 12.6 Context

| File | Lines | Purpose |
|------|:-----:|---------|
| `AuthContext.tsx` | 261 | Authentication state, user role, organization context |

## 12.7 Navigation Structure

**Sidebar Navigation** (role-dependent visibility):
- Dashboard → `/`
- Properties → `/properties`
- Leads → `/leads`
- Showings → `/showings`
- Calls → `/calls`
- Reports → `/reports`
- Knowledge Hub → `/knowledge`
- Costs → `/costs`
- Analytics → `/analytics/heatmap`, `/analytics/voucher`, `/analytics/competitor`
- Agents → `/agents`
- Users → `/users`
- System Logs → `/system-logs`
- Settings → `/settings`

---

# 13. Multi-Tenancy

## 13.1 Data Isolation Model

Every table with tenant-specific data includes `organization_id` as a required foreign key. RLS policies ensure queries only return rows matching the authenticated user's organization.

**Isolated per organization**: Properties, leads, calls, showings, users, settings, documents, cost records, agent tasks, consent log, investor insights, competitor mentions, referrals, notifications, campaigns

**Shared across platform**: System-wide settings (NULL org_id), super admin users, platform metrics

## 13.2 Organization Data Structure

Each organization has:
- **Identity**: Name, slug (URL-friendly), logo
- **Contact**: Owner email, phone, address
- **Branding**: Primary/accent colors (CSS variables)
- **Subscription**: Plan type (starter/professional/enterprise), status, billing, limits
- **Integration Keys**: Each org can have their own Twilio, Bland, OpenAI keys or use platform defaults
- **Settings**: Fully configurable behaviors (see below)

## 13.3 Configurable Settings per Organization

| Category | Setting | Default | Purpose |
|----------|---------|---------|---------|
| **Agents** | `recapture_first_delay_hours` | 24 | Hours before first recapture attempt |
| **Agents** | `recapture_max_attempts` | 7 | Maximum recapture call attempts |
| **Agents** | `recapture_schedule` | [1,2,4,7,10,14,21] | Days for each attempt |
| **Agents** | `confirmation_hours_before` | 24 | Hours before showing to start confirmation |
| **Agents** | `confirmation_max_attempts` | 3 | Max confirmation attempts |
| **Agents** | `no_show_delay_hours` | 2 | Hours after no-show before follow-up |
| **Agents** | `post_showing_delay_hours` | 1 | Hours after showing to send application link |
| **Lead Capture** | `popup_delay_seconds` | 15 | Seconds before showing capture popup |
| **Lead Capture** | `popup_enabled` | true | Whether popup is active |
| **Lead Capture** | `popup_message` | "We have an agent..." | Custom popup text |
| **Scoring** | `starting_score` | 50 | Initial lead score |
| **Scoring** | `priority_threshold` | 85 | Score that triggers priority flag |
| **Scoring** | `custom_scoring_rules` | {} | Org-specific scoring adjustments |
| **Communications** | `sms_templates` | {} | Custom SMS message templates |
| **Communications** | `email_templates` | {} | Custom email templates |
| **Communications** | `working_hours_start` | "09:00" | Start of calling hours (TCPA) |
| **Communications** | `working_hours_end` | "20:00" | End of calling hours (TCPA) |
| **Communications** | `working_days` | [1,2,3,4,5,6] | Days to make calls (1=Mon) |
| **Showings** | `default_duration_minutes` | 30 | Default showing length |
| **Showings** | `buffer_minutes` | 15 | Buffer between showings |
| **Compliance** | `recording_disclosure_text` | "This call may be recorded..." | State-specific disclosure |
| **Compliance** | `auto_purge_leads_days` | 180 | Days before inactive leads purged |
| **Voice** | `bland_voice_id` | "default" | Bland.ai voice selection |
| **Voice** | `voice_language_primary` | "en" | Primary agent language |

## 13.4 Subscription Plans

| Feature | Starter | Professional | Enterprise |
|---------|:-------:|:------------:|:----------:|
| Max Properties | 10 | 50 | Unlimited |
| Max Users | 5 | 20 | Unlimited |
| Max Calls/Month | 500 | 2,000 | Unlimited |
| Custom Branding | - | Yes | Yes |
| Custom Integrations | - | - | Yes |

---

# 14. Cost Dashboard

## 14.1 Per-Interaction Recording

Every interaction logs costs in the `cost_records` table and/or directly in the `calls` table:
- Every call: `cost_twilio`, `cost_bland`, `cost_openai`
- Every SMS: `cost_twilio`
- Every verification: `cost_persona`

## 14.2 Cost Calculation Methods

| Service | Method | Rate (approximate) |
|---------|--------|-------------------|
| Twilio Voice | Minutes x rate | ~$0.014/min |
| Twilio SMS | Message count x rate | ~$0.0079/message |
| Bland.ai | Minutes x rate | ~$0.09/min |
| OpenAI | Token count x model rate | ~$0.01-0.03/1K tokens (GPT-4) |
| Persona | Verification count x rate | ~$1-2/verification |

## 14.3 Dashboard Features (`CostDashboard.tsx`, 627 lines)

- **Summary View**: Total spend by service (pie chart), daily spend trend (line chart), month-over-month comparison
- **Per-Lead Cost**: Table with lead name, source, status, total cost, breakdown by service, cost per funnel stage
- **Per-Source Analysis**: Average cost to acquire, show, and convert by source. ROI calculation.
- **Alerts**: Daily spend threshold, single lead cost threshold, unusual spike detection

---

# 15. Integrations

## 15.1 Doorloop Sync

- **Direction**: Bidirectional
  - Doorloop → RFC: Application status, lease status
  - RFC → Doorloop: Lead data when they start application
- **Agents**: Ezra (pull), Caleb (push)
- **Polling**: Every 15 minutes for status updates
- **Status mapping**: Application created → `in_application`, Lease signed → `converted`
- **Side effects**: `in_application` cancels all pending agent tasks; `converted` marks property as `rented`
- **Audit**: `doorloop_sync_log` table tracks all sync operations

## 15.2 Google Sheets Backup

- **Agent**: Matthew (`agent-sheets-backup`)
- **Structure**: One "Leads" sheet with columns: Timestamp, Name, Phone, Email, Source, Interested Property, Status, Lead Score, Created At
- **Sync**: Append row on new lead, update row on status change

## 15.3 Persona Identity Verification

- **Agent**: Joseph (`agent-persona-verification`)
- **Flow**: Before showings, verify lead identity via Persona
- **Fallback**: If verification times out, allow showing with "Pending Verification" status
- **Webhook**: `persona-webhook` edge function handles completion callbacks

## 15.4 Resend Email

- **Agent**: Luke (`agent-resend-processor`)
- **Auxiliary**: `send-notification-email` edge function
- **Templates**: Defined in `src/lib/emailTemplates.ts` (274 lines)
- **Event tracking**: `email_events` table records delivery events

## 15.5 Hemlane Email Parsing

- **Agent**: Esther (`agent-hemlane-parser`)
- **Purpose**: Parse Hemlane lead notification emails into structured lead records

---

# 16. Public Pages

## 16.1 URL Structure

| Route | Page | Auth |
|-------|------|------|
| `/` (when unauthenticated) | Landing Page | Public |
| `/p/privacy-policy` | Privacy Policy | Public |
| `/p/terms-of-service` | Terms of Service | Public |
| `/p/referral` | Referral Program | Public |

## 16.2 Landing Page Features

- Animated statistics (AnimatedStats)
- Rotating hero text (RotatingHeroText)
- How It Works step-by-step section
- Austin Chat Widget (live demo)
- Social Proof Toast notifications
- Demo Request Dialog (captures name, email, company, phone)
- Floating animated background

## 16.3 Lead Capture Popup (Planned)

Referenced in PROJECT.md but **not yet implemented** as a frontend component.

**Intended behavior**:
- Trigger: Configurable seconds after page load (default: 15)
- Content: Phone input, name input, TCPA consent checkbox, "Call me now!" button
- On submit: Create lead (source=website), log consent, trigger outbound call

## 16.4 Privacy & Terms Pages

- **Privacy Policy** (`PrivacyPolicy.tsx`, 556 lines) — A2P-compliant, covers data collection, TCPA, call recording, SMS consent
- **Terms of Service** (`TermsOfService.tsx`, 613 lines) — A2P-compliant, covers user responsibilities, service terms, Twilio campaign requirements

---

# 17. Notifications & Alerts

## 17.1 Property Alerts

| Alert | Recipient | Channel |
|-------|-----------|---------|
| Coming Soon expires in 3 days | Admin, Editor | In-app + Email |
| Property status changed | Investor (if assigned) | In-app |
| High interest property (5+ showings/week) | Admin | In-app |

## 17.2 Lead Alerts

| Alert | Recipient | Channel |
|-------|-----------|---------|
| New priority lead | Admin, Editor | In-app + Push |
| Lead score jumped 20+ points | Assigned agent | In-app |
| Showing no-show | Leasing Agent, Editor | In-app + SMS |
| 3+ failed contact attempts | Editor | In-app |
| Lead taken under human control | Admin | In-app |

## 17.3 System Alerts

| Alert | Recipient | Channel |
|-------|-----------|---------|
| Twilio balance low | Admin | Email |
| API error rate high | Admin | Email |
| Doorloop sync failed | Admin | In-app + Email |
| Critical integration failure | Admin | Email (immediate) |

---

# 18. Investor Dashboard

## 18.1 Purpose

Provide investors with not just metrics, but narrative insights about their properties that help them understand performance and make renewal decisions.

## 18.2 Metrics

Standard KPIs per property:
- Total leads received
- Showings scheduled vs. completed
- Current status
- Days on market
- Lead-to-showing conversion rate
- Showing-to-application conversion rate

## 18.3 Storytelling (AI-Generated)

Insights stored in `investor_insights` table with types:
- `lead_loss_reason` — Why leads didn't convert
- `pricing_feedback` — Price-related signals from conversations
- `location_feedback` — Location-related comments
- `feature_request` — Amenities/features leads asked about
- `competitive_insight` — Mentions of competing properties
- `seasonal_trend` — Time-based patterns
- `recommendation` — AI suggestion for improvement

**Example Insights**:
- "This property lost 3 leads due to pricing concerns, not location. Consider a rent adjustment."
- "Leads are asking about pet policy 4x more than other properties."
- "Tuesday and Wednesday showings have 80% completion rate vs. 40% on weekends."
- "Section 8 leads convert 2x faster for this property."

## 18.4 Report Generation

- **Manual**: Admin can generate investor reports via Settings → Investor Reports tab
- **Edge Functions**: `generate-investor-report` (single) and `generate-all-investor-reports` (batch)
- **Storage**: Reports stored in `investor_reports` table with generated content

---

# 19. Fallbacks & Reliability

## 19.1 Service-Specific Fallback Plans

| Service | Failure Type | Fallback Action | Notification |
|---------|-------------|-----------------|--------------|
| **Bland.ai** | API timeout/error | Queue retry in 5 min. After 3 failures: SMS instead | Admin after 3 failures |
| **Bland.ai** | Rate limit | Exponential backoff (1/5/15 min). Overflow → SMS | Admin if queue > 50 |
| **Twilio** | Call failure | Retry once after 30s. Second failure: log + manual review | Admin alert |
| **Twilio** | SMS failure | Retry once. If persists: try email if available | None |
| **OpenAI** | API timeout | Use cached/default scoring (+5). Mark for re-analysis | None |
| **OpenAI** | Rate limit | Queue requests. Process in batches when available | None |
| **OpenAI** | API error | Log error. Use defaults. Background retry | Admin if >10/hour |
| **Persona** | Timeout | Allow showing with "Pending Verification" | Lead sees "in progress" |
| **Persona** | API error | Mark "Manual Verification Required" | Admin alert |
| **Doorloop** | Sync failure | Log, retry in 15 min. After 3 failures: alert | Admin alert |
| **Doorloop** | API unavailable | Continue without sync. Queue updates | Admin notification |

## 19.2 System Logs Panel

- **Location**: Admin dashboard → System Logs page (`SystemLogs.tsx`, 658 lines)
- **Features**: Real-time log stream, filter by level/service/date/resolution, mark as resolved with notes, export CSV
- **Critical errors**: Automatically email admin with details, affected entities, and suggested action
- **Health Check Widget**: `IntegrationHealth.tsx` (284 lines) shows green/yellow/red status per service
- **Integration Health Table**: `integration_health` table tracks real-time status per service

---

# 20. Production Deployment Checklist

## 20.1 Pre-Launch

- [ ] Set Supabase `app.settings.supabase_url` and `app.settings.service_role_key` in DB
- [ ] Configure Nehemiah cron job (every 5 min task dispatch)
- [ ] Configure Doorloop sync cron (every 15 min)
- [ ] Set up Twilio webhook URLs (Aaron inbound, Ruth SMS)
- [ ] Set up Bland.ai webhook URL (Deborah callback)
- [ ] Set up Persona webhook URL
- [ ] Configure organization API keys (Twilio, Bland, OpenAI, Persona, Doorloop)
- [ ] Set up Resend domain verification
- [ ] Configure DNS for all 3 domains
- [ ] Set up SSL certificates
- [ ] Enable `prevent_direct_score_update` trigger in database
- [ ] Verify RLS policies with test data across all 5 roles

## 20.2 Testing

- [ ] End-to-end: Inbound call → lead creation → scoring → follow-up → showing → application
- [ ] Human takeover: take control → verify paused tasks → release → verify resumed
- [ ] Multi-tenant: verify data isolation between organizations
- [ ] All 5 user roles: verify permission boundaries
- [ ] TCPA: verify consent required before outbound contact
- [ ] Fair Housing: verify no protected class data in scoring
- [ ] Fallback: simulate each service failure, verify graceful degradation
- [ ] Cost tracking: verify per-interaction costs recorded correctly
- [ ] CSV import: test bulk lead import
- [ ] Mobile: test all pages on phone/tablet viewports

## 20.3 Post-Launch

- [ ] Monitor system logs for first 48 hours
- [ ] Verify cron jobs executing on schedule
- [ ] Check cost dashboard accuracy against service billing
- [ ] Verify Doorloop sync producing correct status updates
- [ ] Run first investor report generation
- [ ] Address consent_log frontend gap (advisory item)
- [ ] Enable prevent_direct_score_update trigger

## 20.4 SQL Migrations (28 Files)

| # | Migration File | Lines | Description |
|---|---------------|:-----:|-------------|
| 1 | `20260130092833_*.sql` | 335 | Core schema: organizations, users, properties, RLS helpers |
| 2 | `20260130092917_*.sql` | 8 | Enable pg_cron extension |
| 3 | `20260130093300_*.sql` | 90 | Organization settings table and policies |
| 4 | `20260130093719_*.sql` | 310 | Property alerts, investor access, coming_soon cron |
| 5 | `20260130093839_*.sql` | 381 | Leads, lead_score_history, scoring functions |
| 6 | `20260130094006_*.sql` | 438 | Calls, showings, showing status trigger |
| 7 | `20260130094254_*.sql` | 561 | Communications, agent_tasks, human takeover RPC |
| 8 | `20260130094426_*.sql` | 48 | System settings table |
| 9 | `20260130100509_*.sql` | 223 | FAQ documents with vector embeddings, system logs, cost records |
| 10 | `20260130101223_*.sql` | 31 | Investor insights and consent log tables |
| 11 | `20260130102000_*.sql` | 80 | Programmatic anonymous deny policies (19 tables x 4 ops) |
| 12 | `20260130111756_*.sql` | 8 | Leasing agent INSERT policy for leads |
| 13 | `20260130112032_*.sql` | 12 | Cron schedule for coming_soon check |
| 14 | `20260130112300_*.sql` | 98 | Storage bucket policies, photo upload permissions |
| 15 | `20260203063405_*.sql` | 73 | Organization credentials table |
| 16 | `20260203063823_*.sql` | 18 | Credential access policies |
| 17 | `20260203064740_*.sql` | 87 | Competitor mentions table and policies |
| 18 | `20260203065318_*.sql` | 75 | Referrals table and policies |
| 19 | `20260203065833_*.sql` | 86 | Lead predictions table and policies |
| 20 | `20260203162352_*.sql` | 27 | Investor reports table |
| 21 | `20260203163602_*.sql` | 213 | Enhanced pause_lead_agent_tasks with auth checks |
| 22 | `20260204051345_*.sql` | 93 | get_dashboard_summary() RPC function |
| 23 | `20260204051417_*.sql` | 63 | get_lead_funnel() RPC function |
| 24 | `20260204051444_*.sql` | 61 | Additional analytics functions |
| 25 | `20260204051454_*.sql` | 1 | Minor patch |
| 26 | `20260204051521_*.sql` | 85 | get_source_performance() and get_zip_code_analytics() |
| 27 | `20260205161013_demo_requests_rls.sql` | 44 | Demo requests table with anonymous INSERT |
| 28 | `20260206141117_*.sql` | 43 | Additional user deny policies |

**Total**: 28 migrations, 3,592 lines of SQL

## 20.5 Route Map (All 24 Authenticated Routes + 4 Public)

| Route | Component | Auth Required | Roles |
|-------|-----------|:------------:|-------|
| `/` | Dashboard (role router) | Yes | All |
| `/properties` | PropertiesList | Yes | Admin, Editor, Leasing Agent |
| `/properties/new` | PropertyDetail (create) | Yes | Admin, Editor |
| `/properties/:id` | PropertyDetail | Yes | All with access |
| `/leads` | LeadsList | Yes | Admin, Editor, Leasing Agent |
| `/leads/:id` | LeadDetail | Yes | Admin, Editor, Leasing Agent |
| `/showings` | ShowingsList | Yes | Admin, Editor, Leasing Agent |
| `/calls` | CallsList | Yes | Admin, Editor, Leasing Agent |
| `/calls/:id` | CallDetail | Yes | Admin, Editor, Leasing Agent |
| `/reports` | Reports | Yes | Admin, Editor |
| `/knowledge` | KnowledgeHub | Yes | Admin, Editor |
| `/costs` | CostDashboard | Yes | Admin |
| `/analytics/heatmap` | LeadHeatMap | Yes | Admin, Editor |
| `/analytics/voucher` | VoucherIntelligence | Yes | Admin, Editor |
| `/analytics/competitor` | CompetitorRadar | Yes | Admin, Editor |
| `/agents` | AgentsPage | Yes | Admin |
| `/users` | UsersList | Yes | Admin |
| `/users/:id` | UserDetail | Yes | Admin |
| `/system-logs` | SystemLogs | Yes | Admin |
| `/settings` | Settings | Yes | Admin, Editor |
| `/demo-requests` | DemoRequests | Yes | Admin |
| `/p/privacy-policy` | PrivacyPolicy | No | Public |
| `/p/terms-of-service` | TermsOfService | No | Public |
| `/p/referral` | ReferralPage | No | Public |

**404 Catch-All**: `NotFound.tsx` handles all unmatched routes.

---

# 21. What Remains

## 21.1 Production Configuration (Required)

1. **Cron jobs**: Nehemiah (5-min task dispatch) and Doorloop sync (15-min) not yet configured
2. **Webhook URLs**: Need to be configured in Twilio, Bland.ai, and Persona dashboards
3. **API keys**: Need to be set per organization in production database
4. **DB settings**: `app.settings.supabase_url` and `app.settings.service_role_key` must be set

## 21.2 Advisory Items from Audit (Non-Blocking)

| # | Item | Severity | Recommendation |
|---|------|----------|----------------|
| 1 | 4 orphaned lib files | Low | Safe to delete |
| 2 | ~40 remaining `any` types | Low | Gradual cleanup |
| 3 | 10 unused npm packages | Low | Tree-shaken, optional removal |
| 4 | consent_log not written from frontend | Medium | Add to edge function or trigger |
| 5 | Score audit trigger disabled | Medium | Enable in production DB |
| 6 | LeadCapturePopup not implemented | Low | Build when public pages launch |
| 7 | 18+ date format strings | Low | Create centralized utility |
| 8 | Dual toast system | Low | Consolidate to sonner |

---

# 22. Latest Session Update

## Session: February 11, 2026

### Documentation System Organization

Reviewed and confirmed the project documentation architecture:

**Documentation Flow**:
- `PROJECT.md` (in repo) = Source of truth, versionable, always up to date
- `CLAUDE.md` (in repo) = Operational instructions for Claude Code (compact ~145 lines)
- `~/Desktop/md/MD{N}.md` = Historical snapshots (MD5 through MD10)

**Change Applied**:
Updated `CLAUDE.md` "md" command to also copy generated snapshot content back to `PROJECT.md`, ensuring the source of truth stays in sync with the latest documentation generation.

**Updated Codebase Statistics** (vs. MD9):
- Total LoC: 49,324 (up from 48,746)
- Database tables: 39 (up from 32 — discovered 7 additional tables via types.ts: agent_activity_log, agents_registry, campaign_recipients, campaigns, conversion_predictions, doorloop_sync_log, email_events, integration_health, lead_field_changes, lead_notes, notifications, transcript_analyses, user_activity_log, user_feature_toggles, user_notifications_custom)
- Database functions: 36 (up from 19 — discovered 17 additional via types.ts)
- RLS policies: ~209 estimated active (up from 131+)
- Privacy Policy: 556 lines (up from 501 — A2P-compliant update)
- Terms of Service: 613 lines (up from 504 — A2P-compliant update)

---

*Document Version: 10*
*Last Updated: February 11, 2026*
*Project: Rent Finder Cleveland*
*Architecture: Multi-Tenant SaaS*
*Total Lines of Code: 49,324*
