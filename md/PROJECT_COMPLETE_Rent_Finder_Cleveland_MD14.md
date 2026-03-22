# PROJECT COMPLETE — Rent Finder Cleveland
## Version 14 | March 21, 2026

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

Rent Finder Cleveland is an AI-powered lead management SaaS platform for property management. It automates the entire rental lead lifecycle: inbound emails → AI lead processing → lead scoring → follow-ups → showings → applications. The platform serves as a lead funnel that integrates with Doorloop for the actual leasing process.

**SaaS Vision**: While launching as Rent Finder Cleveland, the platform is architected from day one to support multiple property management companies (tenants) as a white-label SaaS product. Each organization operates in complete data isolation with customizable branding, workflows, and pricing rules.

## 1.2 Multi-App Architecture

Three domains sharing one Supabase database:
- **rentfindercleveland.com** — Primary instance
- **homeguardmanagement.com** — Second tenant
- **portafoliodiversificado.com** — Third tenant (Spanish-focused)

Each domain operates as a separate organization with independent branding, API keys, and settings, all on a shared infrastructure.

## 1.3 Core Problems Solved

1. High volume of incoming leads with repetitive questions
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
| Phase 2: AI & Automation | Code Complete | AI agents as edge functions, email-based lead processing, scoring, consent logging |
| Phase 3: Analytics & Integration | Code Complete | Insight Generator, investor storytelling, Doorloop sync, cost dashboard, campaigns |
| Phase 4: Self-Service Showings | Code Complete | Calendly-like public scheduling, slot management, email confirmations, weekly schedule |
| Phase 5: Identity Verification | Code Complete | Persona (primary) + MaxMind minFraud (Plan B fallback) with automatic failover |
| Phase 6: Lead Nurturing & Data Quality | Code Complete | Duplicate merge, incomplete profiles, stale leads, suspect detection |
| Phase 7: Email Queue System | Code Complete | Frontend email queueing, batch processing, Resend history sync |
| Phase 8: DoorLoop Bidirectional Sync | Code Complete | Push leads as prospects, pull application status, bulk sync |
| Phase 9: Telegram Reporting | Code Complete | Hourly activity reports, rent benchmark, on-demand reports via bot |
| Phase 10: Property Groups | Code Complete | Building/unit hierarchy, multi-unit Zillow import, grouped UI |
| Phase 11: Campaigns System | Code Complete | Campaign wizard, audience builder, email campaigns with progress tracking |
| Phase 12: Showings Overhaul | Code Complete | Metrics, filters, reports, email notifications, leasing tab, showing reminders |
| Phase 13: Telegram Showing Reminders | Code Complete | 30-min pre-showing Telegram notifications with Google Maps + call links |
| Pre-Production Deep Audit | Complete | 32-bug deep audit across all edge functions + frontend (security, multi-tenant, functional, hardcoding) |
| Voice/Bland.ai Removal | Complete | All call/voice/Bland.ai functionality removed from codebase (not yet configured) |
| Documentation System | Complete | PROJECT.md (source of truth) + incremental snapshots (MD5-MD14) |

**Status**: Code complete. In active production configuration and testing.

## 2.2 Codebase Statistics

| Metric | Count |
|--------|-------|
| **Total Lines of Code (src/)** | 71,244 |
| **Total Lines of Code (supabase/)** | 15,090 |
| **Combined Total** | 86,334 |
| **TSX files** | 60,582 lines |
| **TS files** | 10,180 lines |
| **CSS files** | 481 lines |
| **SQL migrations** | 3,592 lines |
| **Edge functions (Deno TS)** | 11,498 lines (30 local directories) |
| **Page Files** | 37 (18,326 lines) |
| **Custom Components** | 122 |
| **shadcn/ui Components** | 52 |
| **Custom UI Components** | 3 (EmptyState, LoadingSpinner, StatusBadge) |
| **Total Component Files** | 174 (41,165 lines) |
| **Custom Hooks** | 8 (2,236 lines) |
| **Library Files** | 10 (1,725 lines) |
| **Context Files** | 1 (233 lines) |
| **Integration Files** | 2 (5,156 lines) |
| **Database Tables** | 67 |
| **Database Views** | 1 |
| **RLS Policies (estimated active)** | ~250+ |
| **Database Functions (RPCs)** | 40+ |
| **Database Triggers** | 11 |
| **Database Enums** | 1 (app_role) |
| **SQL Migrations** | 28 (3,592 lines) |
| **Edge Functions (deployed in Supabase)** | 50+ |
| **Edge Functions (local repo)** | 30 |
| **Cron Jobs** | 2 (property alert check + samuel-showing-reminder-5min) |
| **npm Dependencies** | 58 |
| **npm devDependencies** | 21 |
| **Total npm Packages** | 79 |

## 2.3 Build Output

```
vite v6 built in ~3.9s — 0 errors, 0 warnings
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
| **OpenAI** | Scoring, transcript analysis, insights, PAIp chat, AI Chat, Esther LLM parsing | Daniel (scoring), Isaiah (transcript), Solomon (prediction), Moses (insights), David (reports), ai-chat, agent-hemlane-parser, PAIp assistant |
| **Persona** | Identity verification before showings (primary) | Joseph (compliance check / verification), verify-identity (primary provider) |
| **MaxMind** | Identity verification via minFraud risk scoring (Plan B) | verify-identity (fallback provider), test-integration, agent-health-checker |
| **Doorloop** | Application/lease status sync, prospect push | Ezra (pull), sync-leads-to-doorloop (push), send-application-invite |
| **Resend** | Transactional email, queue processing, history sync | process-email-queue, send-notification-email, book-public-showing, sync-resend-history, sync-resend-emails |
| **Gmail / Hemlane** | Parse Hemlane lead notification emails | Esther (Hemlane parser with LLM-powered extraction) |
| **Telegram** | On-demand reports, hourly activity updates, showing reminders | telegram-webhook, agent-hourly-report, showing-reminder |

**Removed** (as of Feb 2026): Twilio (voice/SMS), Bland.ai (AI voice conversations), Google Sheets backup. All call/voice functionality has been stripped from the codebase.

---

# 4. Design System

## 4.1 Color Palette (iOS 26 Glass Aesthetic)

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#4F46E5` (Indigo-600) | Headers, primary buttons, active states |
| Primary Lighter | `#6366F1` (Indigo-500) | Hover states, accents |
| Accent | `#FFB22C` (Gold) | CTAs, highlights, gold accents |
| Background | `#f3f4f6` (Cool Gray) | Page background |
| Surface | `rgba(255,255,255,0.72)` | Glass cards with `backdrop-filter: blur(20px) saturate(1.8)` |
| Sidebar | White glass | `bg-white/80 backdrop-blur-xl`, active items `bg-indigo-50 text-indigo-600` |
| Success | `#22C55E` | Positive states, converted badges |
| Error | `#EF4444` | Errors, alerts, lost badges, destructive actions |
| Warning | `#F59E0B` | Warnings, attention items |
| Text Primary | `#1a1a1a` | Main text |
| Text Secondary | `#6b7280` | Secondary text, labels |

**Note**: Old purple `#370d4b` fully replaced with indigo across all src/ files.

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

## 5.1 Tables (67 total)

The database has grown from 40 tables (v13) to 67 tables. Key tables are listed below; the remainder support new features like property groups, campaigns, job applicants, leases, academy courses, rental registrations, rent benchmarks, and more.

### Core Tables

| # | Table | Purpose | RLS |
|---|-------|---------|-----|
| 1 | `organizations` | Multi-tenant core with branding, subscription, API keys | Yes |
| 2 | `organization_settings` | Per-org configurable settings (agents, scoring, compliance, etc.) | Yes |
| 3 | `organization_credentials` | Encrypted API keys per org (OpenAI, Persona, MaxMind, Resend, DoorLoop, Telegram, etc.) | Yes |
| 4 | `users` | User accounts with roles, org assignment, commission rates | Yes |
| 5 | `user_activity_log` | User action audit trail | Yes |
| 6 | `user_feature_toggles` | Per-user feature flag overrides | Yes |
| 7 | `user_notifications_custom` | Custom notification preferences per user | Yes |
| 8 | `properties` | Rental units with details, photos, Section 8, alternatives. Now links to `property_groups` for multi-unit buildings | Yes |
| 9 | `property_groups` | **NEW** Building-level records for multi-unit properties (duplex/triplex/fourplex). Units are `properties` rows with `property_group_id` FK | Yes |
| 10 | `property_alerts` | Notifications for property events (coming_soon, high interest) | Yes |
| 11 | `investor_property_access` | Maps investors (viewers) to properties they can see | Yes |
| 12 | `leads` | Core lead records with scoring, status flow, human control flags | Yes |
| 13 | `lead_score_history` | Explainable scoring audit trail (every change logged) | Yes |
| 14 | `lead_predictions` | ML-based conversion probability predictions | Yes |
| 15 | `lead_field_changes` | Lead field change audit log | Yes |
| 16 | `lead_notes` | User notes on leads with pinning support | Yes |
| 17 | `lead_properties` | **NEW** Many-to-many lead-property interest mapping | Yes |
| 18 | `lead_property_interests` | Lead property interest tracking | Yes |
| 19 | `communications` | Email logs with delivery status and costs | Yes |
| 20 | `email_events` | Email delivery event tracking | Yes |
| 21 | `showings` | Appointments with confirmation tracking, agent reports | Yes |
| 22 | `showing_available_slots` | Calendly-like time slot management per property | Yes |
| 23 | `agent_tasks` | Scheduled AI actions (pausable for human takeover) | Yes |
| 24 | `agents_registry` | Registry of all AI agents with status and config | Yes |
| 25 | `agent_activity_log` | Agent execution audit trail | Yes |
| 26 | `campaigns` | Outreach campaign definitions | Yes |
| 27 | `campaign_recipients` | Campaign recipient lists and status | Yes |
| 28 | `system_settings` | Key-value settings, per-org or platform-wide | Yes |
| 29 | `system_logs` | Error & integration tracking with resolution workflow | Yes |
| 30 | `integration_health` | Real-time integration status monitoring | Yes |
| 31 | `cost_records` | Per-interaction cost attribution across services | Yes |
| 32 | `faq_documents` | FAQ content with OpenAI vector embeddings (1536 dimensions) | Yes |
| 33 | `consent_log` | TCPA compliance evidence with consent type, method, evidence | Yes |
| 34 | `conversion_predictions` | Lead conversion probability predictions | Yes |
| 35 | `investor_insights` | AI-generated storytelling insights with confidence scores | Yes |
| 36 | `investor_reports` | Generated investor report documents | Yes |
| 37 | `competitor_mentions` | Competitor data extracted from call transcripts | Yes |
| 38 | `doorloop_sync_log` | Doorloop sync operation audit trail | Yes |
| 39 | `referrals` | Referral tracking between leads/sources | Yes |
| 40 | `demo_requests` | Landing page demo request submissions | Yes (anon INSERT allowed) |
| 41 | `notifications` | In-app notification records | Yes |
| 42 | `documents` | General document storage | Yes |
| 43 | `activity_log` | General activity log | Yes |
| 44 | `profiles` | User profiles | Yes |
| 45 | `owner_leads` | Owner/investor lead records | Yes |
| 46 | `leases` | Lease records | Yes |
| 47 | `job_positions` | Job position listings | Yes |
| 48 | `job_applicants` | Job applicant records | Yes |
| 49 | `applicant_notes` | Notes on job applicants | Yes |
| 50 | `academy_courses` | Training courses | Yes |
| 51 | `academy_lessons` | Course lessons | Yes |
| 52 | `rent_benchmarks` | Rent comparison data | Yes |
| 53 | `rental_registrations` | Rental registration records | Yes |
| 54 | `report_favorites` | Saved/favorited reports | Yes |
| 55 | `section8_requests` | Section 8 request records | Yes |
| 56-67 | *(various supporting tables)* | Additional supporting tables for new features | Yes |

**View**: `property_performance` — Aggregated property metrics view

### property_groups Table (NEW)

```sql
-- Building-level record for multi-unit properties
CREATE TABLE property_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Cleveland',
  state TEXT NOT NULL DEFAULT 'OH',
  zip_code TEXT NOT NULL,
  property_type TEXT,            -- duplex, triplex, fourplex
  cover_photo TEXT,
  description TEXT,
  section_8_accepted BOOLEAN,
  hud_inspection_ready BOOLEAN,
  pet_policy TEXT,
  neighborhood_info JSONB,
  investor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Properties now have an optional `property_group_id` FK linking units to their parent building.

### showing_available_slots Table

```sql
-- Calendly-like time slot management for self-service showing scheduling
CREATE TABLE showing_available_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  slot_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  is_enabled BOOLEAN DEFAULT true,
  is_booked BOOLEAN DEFAULT false,
  booked_showing_id UUID REFERENCES showings(id),
  booked_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

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
  primary_color TEXT DEFAULT '#4F46E5',
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
  timezone TEXT DEFAULT 'America/New_York',
  default_language TEXT DEFAULT 'en',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Organization Credentials
```sql
CREATE TABLE organization_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  openai_api_key TEXT,
  persona_api_key TEXT,
  maxmind_account_id TEXT,
  maxmind_license_key TEXT,
  doorloop_api_key TEXT,
  resend_api_key TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
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
  property_group_id UUID REFERENCES property_groups(id),  -- NEW: link to building
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
  source TEXT NOT NULL CHECK (source IN ('inbound_call', 'hemlane_email', 'website', 'referral', 'manual', 'sms', 'campaign', 'web_schedule')),
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
  verification_provider TEXT,
  verification_status TEXT,
  verification_started_at TIMESTAMPTZ,
  verification_completed_at TIMESTAMPTZ,
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
  hemlane_lead_id TEXT,
  hemlane_email_id TEXT
);
```

## 5.3 Key Database Functions (RPCs)

| # | Function | Purpose | Type |
|---|----------|---------|------|
| 1 | `get_user_role(auth_user_id)` | Returns user role from auth UUID (overloaded: no-arg version) | Helper |
| 2 | `get_user_organization_id(auth_user_id)` | Returns org_id for RLS policies | Helper |
| 3 | `has_role(auth_user_id, role)` | Boolean role check | Helper |
| 4 | `is_super_admin(auth_user_id)` | Check if super admin | Helper |
| 5 | `is_admin()` | Check if current user is admin | Helper |
| 6 | `is_editor_or_above()` | Check if editor or higher role | Helper |
| 7 | `get_user_id(auth_user_id)` | Returns internal user.id from auth UUID | Helper |
| 8 | `get_user_internal_id()` | Returns current user's internal ID | Helper |
| 9 | `get_user_org_id()` | Returns current user's org ID (no args) | Helper |
| 10 | `user_has_property_access(auth_user_id, property_id)` | Check investor property access | Helper |
| 11 | `can_manage_property_photos(auth_user_id)` | Check photo upload permission | Helper |
| 12 | `get_org_setting(key, org_id, default)` | Retrieve organization setting value | Helper |
| 13 | `log_score_change(lead_id, change, reason, context)` | Core scoring: inserts history, updates score, auto-priority | Business |
| 14 | `log_agent_activity(agent, action, details, ...)` | Record agent activity with cost tracking | Business |
| 15 | `log_user_activity(user_id, action, category, ...)` | Record user activity | Business |
| 16 | `pause_lead_agent_tasks(lead_id, user_id, reason)` | Human takeover: pause all tasks for a lead | Business |
| 17 | `execute_agent_task_now(task_id, executed_by)` | Immediately execute a scheduled agent task | Business |
| 18 | `handle_sms_opt_out(phone, org_id, keyword)` | Process SMS STOP keyword | Business |
| 19 | `schedule_next_recapture(lead_id, org_id, attempt)` | Schedule next recapture attempt | Business |
| 20 | `schedule_showing_confirmations()` | Schedule confirmation calls for upcoming showings | Business |
| 21 | `schedule_stale_leads_for_recapture()` | Find stale leads and schedule recapture | Business |
| 22 | `schedule_conversion_predictions()` | Schedule prediction generation | Business |
| 23 | `reset_agent_daily_counters()` | Reset daily agent execution counters | Business |
| 24 | `seed_agents_for_organization(org_id)` | Initialize agent registry for new org | Business |
| 25 | `create_default_feature_toggles(user_id, org_id, role)` | Initialize feature toggles for new user | System |
| 26 | `check_coming_soon_expiring()` | Cron: create alerts for expiring properties | Cron |
| 27 | `habakkuk_check_alerts()` | Check and generate system alerts | Cron |
| 28 | `get_dashboard_summary()` | Returns full dashboard metrics JSON | Analytics |
| 29 | `get_lead_funnel(date_from, date_to)` | Returns funnel conversion metrics | Analytics |
| 30 | `get_source_performance(days)` | Performance metrics per lead source | Analytics |
| 31 | `get_zip_code_analytics(days)` | Analytics per zip code | Analytics |
| 32 | `get_property_performance(property_id, org_id, dates)` | Property-level performance metrics | Analytics |
| 33 | `get_lead_full_context(lead_id)` | Full lead context for AI analysis | Analytics |
| 34 | `build_campaign_audience(criteria, org_id)` | Build campaign recipient list from criteria | Campaign |
| 35 | `format_lead_for_sheets(lead_id)` | Format lead data for Google Sheets export | Sync |
| 36 | `map_doorloop_status(status)` | Map Doorloop status to internal status | Sync |
| 37 | `joseph_compliance_check(lead_id, action, org_id)` | TCPA compliance verification | Compliance |
| 38 | `zacchaeus_record_cost(service, amount, context)` | Record interaction cost | Cost |
| 39 | `rebekah_find_alternatives(property_id, org_id)` | Find alternative properties | Matching |
| 40 | `rebekah_match_properties(org_id, criteria)` | Match properties to lead preferences | Matching |

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
| Manage showing slots | Yes | Yes | Yes | - | - |
| **Leads** |
| View all leads | Yes | Yes | Yes | - | - |
| View assigned leads | Yes | Yes | Yes | - | Yes |
| Edit lead info | Yes | Yes | Yes | - | Yes |
| Manually create lead | Yes | Yes | Yes | - | Yes |
| Change lead status | Yes | Yes | Yes | - | Yes |
| Delete lead | Yes | Yes | - | - | - |
| Mark as do-not-contact | Yes | Yes | Yes | - | - |
| Take human control | Yes | Yes | Yes | - | Yes |
| Release human control | Yes | Yes | Yes | - | Yes |
| **Showings** |
| View all showings | Yes | Yes | Yes | - | - |
| View assigned showings | Yes | Yes | Yes | - | Yes |
| Schedule showing | Yes | Yes | Yes | - | Yes |
| Submit showing report | Yes | Yes | Yes | - | Yes |
| Cancel/reschedule | Yes | Yes | Yes | - | Yes |
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
| Configure integration keys | Yes | Yes | - | - | - |

## 6.2 RLS Policy Architecture

- **~250+ Row Level Security policies** across all tables (67 tables)
- **Multi-tenant scoping**: Every policy checks `organization_id = get_user_organization_id(auth.uid())`
- **Security Definer functions**: `get_user_role`, `get_user_organization_id`, `has_role`, `is_super_admin`, `is_admin`, `is_editor_or_above` called from within RLS policies
- **Programmatic deny_anon policies**: Sensitive tables deny all anonymous access
- **Exception**: `demo_requests` allows anonymous INSERT for landing page form submissions
- **Exception**: `showing_available_slots` allows anonymous SELECT for public scheduling page

---

# 7. Lead Lifecycle

## 7.1 Status Flow

```
new -> contacted -> engaged -> nurturing -> qualified -> showing_scheduled -> showed -> in_application -> converted
                                                                                                       ^
(any status can -> lost)                                                                    (Doorloop sync)
```

## 7.2 Status Definitions

| Status | Description | Trigger |
|--------|-------------|---------|
| `new` | Just entered the system | Hemlane email, website form, manual entry, public showing booking |
| `contacted` | System made first contact | AI agent completed first email attempt |
| `engaged` | Lead responded or had conversation | Lead replied to email |
| `nurturing` | Receiving active follow-up | Engaged but not ready to schedule showing |
| `qualified` | High score, priority lead | Lead score >= 70 or is_priority = true |
| `showing_scheduled` | Has confirmed showing appointment | Showing created and confirmed (including self-service) |
| `showed` | Attended the property showing | Leasing agent submitted showing report |
| `in_application` | Started application in Doorloop | Doorloop API sync detected application |
| `lost` | Did not continue | Manual mark or 7+ failed contact attempts |
| `converted` | Signed lease | Doorloop API sync detected signed lease |

## 7.3 Automatic Status Transitions

```
new -> contacted         After first AI email attempt
contacted -> engaged     When lead responds
engaged -> nurturing     If no showing scheduled within 48 hours
nurturing -> qualified   When lead_score >= 70 OR is_priority = true
any -> showing_scheduled When showing is created and confirmed
showing_scheduled -> showed When agent submits showing report
showed -> in_application When Doorloop sync detects application
in_application -> converted When Doorloop sync detects signed lease
any -> lost              After max contact attempts OR manual mark
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

- **Scale**: 0-100
- **Base score**: 40 (all leads start here)
- **Boosts**: +10 inbound source, +5 complete contact, +10 property matched, status bonuses, +30 showing request
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
| Completed showing | +25 | Showing status = completed | "Lead attended scheduled property showing" |
| Responded to follow-up | +10 | Engaged after nurturing | "Lead responded to follow-up communication" |
| Self-scheduled showing | +10 | Source = public booking | "Lead proactively self-scheduled a showing" |
| Showing request (public booking) | +30 | book-public-showing | "Hot Lead - self-scheduled a showing" |
| Inbound source | +10 | source = inbound_call/hemlane_email | "Lead initiated contact (inbound)" |
| Property matched | +10 | interested_property_id is set | "Lead matched to specific property" |

## 8.3 Negative Indicators

| Indicator | Points | Detection Method | Human-Readable Reason |
|-----------|:------:|------------------|----------------------|
| No-show to scheduled showing | -30 | Showing status = no_show | "Lead did not attend scheduled showing" |
| No response after 3+ attempts | -15 | Contact attempts > 3 | "No response after multiple contact attempts" |
| Invalid phone detected | -25 | Verification failed | "Phone number could not be verified" |
| Incomplete info after 3 contacts | -10 | Missing required fields | "Still missing key information after multiple contacts" |
| Staleness (> 7 days no activity) | -5 | Time decay | "No activity for over 7 days" |

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

AI agents organized by department, implemented as Supabase Edge Functions (Deno). The local repository contains 30 edge function directories; additional agents are deployed directly in Supabase (50+ total deployed).

**Note**: All voice/call agents (Aaron, Deborah, Ruth, Joshua, Jonah, Miriam, Luke, Joel, Naomi) have been removed from the codebase. The system now operates via email-based lead processing only.

## 10.2 Active Agent Departments

### Recepcion (1 agent)
| Biblical Name | Edge Function | Purpose |
|--------------|---------------|---------|
| **Esther** | `agent-hemlane-parser` | Parses Hemlane lead notification emails with LLM-powered extraction (GPT-4o-mini), smart property matching |

### Evaluacion (2 agents)
| Biblical Name | Edge Function | Purpose |
|--------------|---------------|---------|
| **Daniel** | `agent-scoring` (deployed in Supabase) | AI lead scoring with OpenAI, Fair Housing compliance enforced |
| **Isaiah** | `agent-transcript-analyst` (deployed in Supabase) | Deep analysis of transcripts for insights and patterns |

### Operaciones (1 agent — sole dispatcher)
| Biblical Name | Edge Function | Purpose |
|--------------|---------------|---------|
| **Nehemiah** | `agent-task-dispatcher` | Orchestrates ALL pending tasks from agent_tasks table (cron every 5 min). Also dispatches campaign tasks. |

### Ventas (2 agents)
| Biblical Name | Edge Function | Purpose |
|--------------|---------------|---------|
| **Elijah** | `agent-recapture` (deployed in Supabase) | Follow-up with dropped/disengaged leads via email |
| **Samuel** | `agent-showing-confirmation` (deployed in Supabase) + `showing-reminder` | Full showing lifecycle: confirmation emails, no-show follow-up, 30-min pre-showing Telegram reminder |

### Inteligencia (3 agents)
| Biblical Name | Edge Function | Purpose |
|--------------|---------------|---------|
| **Solomon** | `agent-conversion-predictor` (deployed in Supabase) | ML-based prediction of lead conversion probability |
| **Moses** | `agent-insight-generator` (deployed in Supabase) | Generate narrative insights from lead/property data |
| **David** | `agent-report-generator` (deployed in Supabase) | Generate comprehensive reports (investor, performance) |

### Administracion (1 agent)
| Biblical Name | Edge Function | Purpose |
|--------------|---------------|---------|
| **Ezra** | `agent-doorloop-pull` / `sync-leads-to-doorloop` | Doorloop Bridge: bidirectional sync of applications and lease status |

**Support agents**:
- **Zacchaeus**: Cost tracking function called by 16+ edge functions; health monitoring via `agent-health-checker`

## 10.3 All 30 Local Edge Functions

| Function | Lines | Purpose |
|----------|:-----:|---------|
| `agent-hemlane-parser` | 1,519 | Esther: Hemlane digest parser with LLM-powered extraction |
| `agent-task-dispatcher` | 1,298 | Nehemiah: Task dispatcher for all agent tasks + campaigns |
| `agent-health-checker` | 590 | Zacchaeus: Health check for services |
| `agent-hourly-report` | 589 | Telegram: Hourly activity report with full dashboard metrics |
| `agent-rent-benchmark` | 240 | Telegram: On-demand rent benchmark analysis |
| `agent-system-analysis` | 355 | **NEW** System analysis and diagnostics |
| `ai-chat` | 303 | Real OpenAI-powered AI chat for Knowledge Hub |
| `book-public-showing` | 765 | Public showing booking + confirmation email via Resend, race condition protection |
| `delete-lead` | 194 | Server-side lead deletion to bypass RLS |
| `delete-user` | 194 | Admin user deletion with FK cleanup (auth-first deletion order) |
| `enhance-report` | 108 | **NEW** AI-enhanced report generation |
| `extract-property-from-image` | 148 | Extract property info from images via AI |
| `generate-lead-brief` | 275 | Generate AI lead brief with actual token cost tracking |
| `import-zillow-property` | 539 | Import property from Zillow URL with multi-unit support (duplex/triplex/fourplex creates property_group + unit rows) |
| `invite-user` | 289 | Send user invitation email |
| `match-properties` | 293 | Weighted property matching with city filter |
| `pathway-webhook` | 533 | Bland.ai mid-call webhook handler (legacy, retained for reference) |
| `predict-conversion` | 257 | Single lead conversion prediction |
| `process-email-queue` | 250 | Multi-tenant email queue processor with dynamic sender domain |
| `recalculate-scores` | 131 | **NEW** Bulk score recalculation for all leads |
| `send-application-invite` | 279 | DoorLoop application invite with org-scoped property lookup |
| `send-message` | 336 | Send email with XSS prevention in email HTML |
| `send-notification-email` | 219 | Send notification email via Resend with dynamic sender domain |
| `showing-reminder` | 239 | **NEW** 30-min pre-showing Telegram reminder with Google Maps + call links |
| `sync-leads-to-doorloop` | 192 | Multi-tenant DoorLoop prospect push (bulk sync) |
| `sync-resend-emails` | 294 | **NEW** Enhanced Resend email sync |
| `sync-resend-history` | 234 | Multi-tenant Resend email history sync for all 3 domains |
| `telegram-webhook` | 140 | Telegram bot webhook for on-demand reports |
| `test-integration` | 357 | Test external service connections |
| `verify-identity` | 338 | Identity verification with Persona->MaxMind fallback |

## 10.4 Showing Reminder System (NEW)

The `showing-reminder` edge function sends Telegram notifications 30 minutes before each scheduled/confirmed showing.

**Mechanism**:
- Cron job `samuel-showing-reminder-5min` invokes the function every 5 minutes
- Queries showings with `scheduled_at` in a 25-35 minute future window
- Groups by organization, checks for already-sent reminders via `system_logs`
- Uses a separate Telegram bot (route bot) configured via `telegram_route_bot_token` / `telegram_route_chat_id` org settings
- Message includes: property address, specs, rent, Section 8 status, lead name, phone, voucher/self-pay badge, Google Maps navigation link, call link

## 10.5 Compliance Gates

**Joseph Compliance Check** — Outbound agents require TCPA compliance verification before execution.

**Zacchaeus Cost Tracking** — 16+ functions call cost recording after execution.

## 10.6 Cron Schedule

| Job | Schedule | Function |
|-----|----------|----------|
| Property alert check | Daily 9:00 AM EST | `check_coming_soon_expiring()` |
| Showing reminder | Every 5 min | `showing-reminder` edge function (`samuel-showing-reminder-5min`) |
| Task dispatcher | Every 5 min (planned) | Nehemiah `agent-task-dispatcher` |
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

**Legal Risk**: $500-$1,500 per unsolicited call/text. Class actions can reach millions.

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Prior express written consent | `SmsConsentCheckbox` component covers both automated calls AND SMS. Consent defaults to `false`, opt-in required | PASS |
| Consent record with timestamp | `consent_log` table with method, evidence, IP, user_agent. `buildConsentPayload()` captures version, URL, user_agent | PASS |
| Opt-out mechanism | `do_not_contact` flag enforced | PASS |
| Calling hours | Configurable `working_hours_start`/`working_hours_end` per org | PASS |
| Joseph compliance gate | Outbound agents check consent before execution | PASS |
| A2P 10DLC compliance | Privacy Policy and Terms of Service updated for Twilio campaign registration | PASS |

## 11.3 Privacy & Data

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Privacy Policy | `/p/privacy-policy` (also `/privacy-policy`) — 555 lines, A2P-compliant | PASS |
| Terms of Service | `/p/terms-of-service` (also `/terms-and-conditions`) — 612 lines, A2P-compliant | PASS |
| SMS Consent Language | Reusable `SmsConsentCheckbox` component (77 lines) with version tracking | PASS |
| Data minimization | Auto-purge configurable (`auto_purge_leads_days`, default 180) | Available |
| Access/deletion requests | Supported via admin panel | Available |

## 11.4 SMS Consent Component

The `SmsConsentCheckbox` component (`src/components/public/SmsConsentCheckbox.tsx`, 77 lines) provides:
- Standardized consent language covering BOTH automated calls and SMS
- Version tracking (`SMS_CONSENT_VERSION = "1.1"`)
- `buildConsentPayload()` function that captures: consent method, source URL, language, version, user agent, timestamp
- Links to Privacy Policy and Terms of Service (relative URLs, multi-tenant safe)
- Used across: landing page demo request, public showing scheduler, SMS signup page

---

# 12. Frontend Architecture

## 12.1 All 37 Pages

| Page | File | Lines | Description |
|------|------|:-----:|-------------|
| Landing Page | `LandingPage.tsx` | 435 | Public marketing page with demo request |
| Login | `auth/Login.tsx` | 171 | Email/password authentication |
| Forgot Password | `auth/ForgotPassword.tsx` | 157 | Password reset request |
| Reset Password | `auth/ResetPassword.tsx` | 258 | Set new password |
| Dashboard (Router) | `dashboard/index.tsx` | 46 | Routes to role-specific dashboard |
| Admin Dashboard | `dashboard/AdminDashboard.tsx` | 788 | Full metrics, widgets, nurturing, activity feed, real-time agent tasks |
| Agent Dashboard | `dashboard/AgentDashboard.tsx` | 429 | Leasing agent's assigned work view |
| Investor Dashboard | `dashboard/InvestorDashboard.tsx` | 230 | Read-only metrics for investors |
| Properties List | `properties/PropertiesList.tsx` | 657 | Property table with groups, filters, health audit, global rules |
| Property Detail | `properties/PropertyDetail.tsx` | 880 | Full property view with edit form, reassign leads |
| Property Group Detail | `properties/PropertyGroupDetail.tsx` | 445 | **NEW** Multi-unit building detail page |
| Leads List | `leads/LeadsList.tsx` | 1,060 | Lead table with filters, CSV import, score recalculation, delete |
| Lead Detail | `leads/LeadDetail.tsx` | 696 | Full lead profile, scoring, timeline |
| Lead Nurturing | `leads/LeadHygiene.tsx` | 158 | Nurturing tool: duplicates, incomplete, stale, suspect tabs |
| Showings List | `showings/ShowingsList.tsx` | 991 | Calendar and list view of showings, manage slots tab, metrics, filters |
| Emails Page | `emails/EmailsPage.tsx` | 1,129 | Email queue, delivery tracking, and template editor |
| Campaigns Page | `campaigns/CampaignsPage.tsx` | 383 | **NEW** Campaign list, creation wizard, progress tracking |
| Reports | `reports/Reports.tsx` | 557 | Analytics reports with charts |
| Knowledge Hub | `insights/KnowledgeHub.tsx` | 416 | AI-powered insight generator with real OpenAI chat |
| Cost Dashboard | `costs/CostDashboard.tsx` | 758 | Per-service and per-lead cost analysis (redesigned as Analytics Dashboard) |
| Settings | `settings/Settings.tsx` | 87 | Tab-based settings container |
| Users List | `users/UsersList.tsx` | 230 | User management table |
| User Detail | `users/UserDetail.tsx` | 629 | User profile with role management |
| System Logs | `SystemLogs.tsx` | 660 | Integration error tracking |
| Agents Page | `agents/AgentsPage.tsx` | 273 | AI agent status with dashboard, overview, schedule, pipeline tabs |
| Demo Requests | `DemoRequests.tsx` | 419 | Manage incoming demo requests |
| Lead Heat Map | `analytics/LeadHeatMap.tsx` | 465 | Geographic demand visualization |
| Competitor Radar | `analytics/CompetitorRadar.tsx` | 335 | Competitor mention tracking |
| Applicants Page | `applicants/ApplicantsPage.tsx` | 402 | DoorLoop application tracking |
| Starktank Page | `starktank/StarktankPage.tsx` | 1,215 | **NEW** Investor pitch deck / presentation page |
| Privacy Policy | `public/PrivacyPolicy.tsx` | 555 | Legal privacy policy (A2P-compliant) |
| Terms of Service | `public/TermsOfService.tsx` | 612 | Legal terms of service (A2P-compliant) |
| Referral Page | `public/ReferralPage.tsx` | 281 | Public referral program page |
| Schedule Showing | `public/ScheduleShowing.tsx` | 1,395 | Public Calendly-like showing scheduler |
| Apply Redirect | `public/ApplyRedirect.tsx` | 65 | **NEW** Redirect to DoorLoop application |
| SMS Signup | `public/SmsSignup.tsx` | 13 | A2P-compliant SMS signup page (iframe) |
| Not Found | `NotFound.tsx` | 24 | 404 catch-all page |

**Total**: 37 pages, 18,326 lines

## 12.2 All Custom Components (by category)

### Layout (5 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `Header.tsx` | 150 | Top navigation bar with breadcrumbs |
| `MainLayout.tsx` | 169 | App shell with sidebar + header |
| `MobileNav.tsx` | 183 | Mobile bottom navigation |
| `NotificationsDropdown.tsx` | 197 | Notification bell dropdown |
| `Sidebar.tsx` | 233 | Left navigation sidebar |

### Dashboard Widgets (20 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `ActivityFeed.tsx` | 152 | Recent activity stream |
| `AgentActivityPanel.tsx` | 282 | **NEW** Agent activity panel with live updates |
| `DashboardCustomizer.tsx` | 283 | Widget visibility toggle |
| `DashboardGreeting.tsx` | 76 | Personalized greeting with date |
| `InsightCard.tsx` | 118 | AI insight display card |
| `IntegrationHealth.tsx` | 275 | Integration status overview |
| `IntegrationStatusMini.tsx` | 430 | Compact integration status bar |
| `InvestorReportsSection.tsx` | 253 | Investor report list |
| `NurturingWidget.tsx` | 217 | Nurturing leads summary on dashboard |
| `PriorityLeadCard.tsx` | 125 | Priority lead highlight |
| `ProgressTimeline.tsx` | 87 | Lead funnel progress |
| `PropertyMetricCard.tsx` | 156 | Property KPI card |
| `RealTimeAgentPanel.tsx` | 410 | **NEW** Real-time agent monitoring panel |
| `ReferralWidget.tsx` | 141 | Referral program widget |
| `ScoreGauge.tsx` | 147 | Circular score visualization |
| `ShowingCard.tsx` | 167 | Upcoming showing card |
| `StatCard.tsx` | 194 | Metric stat card with trend |
| `TaskQueuePanel.tsx` | 336 | **NEW** Task queue panel with UP NEXT + relative time |
| `TopPropertiesWidget.tsx` | 96 | Top properties by lead count |
| `TopSourcesWidget.tsx` | 125 | Top lead sources widget |

### Lead Components (23 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AIBriefSection.tsx` | 106 | AI-generated lead brief |
| `CsvImportDialog.tsx` | 1,229 | Bulk CSV lead import with smart detection, dedup, scoring |
| `DoorloopStatusBadge.tsx` | 91 | Doorloop sync status badge |
| `HumanTakeoverModal.tsx` | 166 | Take control modal |
| `InteractionHistoryCard.tsx` | 195 | Email/showing history timeline |
| `LeadActivityTimeline.tsx` | 455 | Full activity timeline |
| `LeadDetailHeader.tsx` | 599 | Lead detail page header |
| `LeadFilterPills.tsx` | 87 | Quick filter badges |
| `LeadForm.tsx` | 622 | Create/edit lead form |
| `LeadProfileCard.tsx` | 123 | Lead info summary card |
| `LeadStatusBadge.tsx` | 88 | Status badge with colors |
| `LeasingReportTab.tsx` | 259 | **NEW** Leasing report tab for lead detail |
| `MessagingCenter.tsx` | 431 | Email compose and history |
| `NotesTab.tsx` | 399 | Lead notes with pinning |
| `PinnedNotesPreview.tsx` | 102 | Pinned notes summary |
| `PredictionCard.tsx` | 299 | Conversion prediction display |
| `ReleaseControlModal.tsx` | 158 | Release human control modal |
| `ScoreDisplay.tsx` | 82 | Score with gauge display |
| `ScoreHistoryPreview.tsx` | 82 | Recent score changes |
| `SmartMatches.tsx` | 307 | AI property matches for lead |
| `UpcomingActionsPreview.tsx` | 145 | Upcoming agent actions preview |
| `UpcomingAgentActions.tsx` | 343 | Full agent action schedule |

### Lead Nurturing Components (6 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `nurturing/DuplicatesTab.tsx` | 503 | Duplicate lead detection with batch merge |
| `nurturing/EmailTemplatesTab.tsx` | 621 | **NEW** Email template editor for campaigns |
| `nurturing/IncompleteTab.tsx` | 417 | Incomplete profile leads with Clean Data |
| `nurturing/MergeDialog.tsx` | 541 | Lead merge dialog with field-by-field selection |
| `nurturing/StaleTab.tsx` | 350 | Stale leads detection and recapture |
| `nurturing/SuspectTab.tsx` | 788 | Suspect/junk lead detection with restore/delete |

### Property Components (11 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AlternativePropertiesSelector.tsx` | 188 | Select alternative properties |
| `CheckPropertiesDialog.tsx` | 285 | Property health audit dialog (fetches fresh data on open) |
| `PhotoUpload.tsx` | 299 | Property photo upload with drag-drop, WebP conversion |
| `PropertiesTable.tsx` | 202 | Property list table view |
| `PropertyCard.tsx` | 122 | Property list card |
| `PropertyForm.tsx` | 977 | Full property create/edit form |
| `PropertyGroupCard.tsx` | 222 | **NEW** Property group (building) card display |
| `PropertyGroupForm.tsx` | 424 | **NEW** Property group create/edit form |
| `PropertyRulesDialog.tsx` | 166 | **NEW** Global property rules dialog (amenities, Section 8, HUD) |
| `ReassignLeadsDialog.tsx` | 278 | Reassign leads when property changes |
| `ZillowImportDialog.tsx` | 917 | **NEW** Zillow property import with multi-unit support |

### Showing Components (7 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `DailyRouteCard.tsx` | 394 | Daily showing route planner |
| `EnableSlotsDialog.tsx` | 575 | Enable showing slots with weekly schedule auto-fill |
| `ManageSlotsTab.tsx` | 788 | Calendly-like slot management per property per week (shows blocked/booked/cancelled) |
| `MyRouteTab.tsx` | 540 | Agent's showing route view |
| `ScheduleShowingDialog.tsx` | 1,047 | Schedule showing dialog with Telegram notification |
| `ShowingDetailDialog.tsx` | 852 | Showing detail with cancel, reschedule (with date/time picker), SMS notification, email notification |
| `ShowingReportDialog.tsx` | 563 | Submit showing report dialog |

### Agents Components (10 components + 2 TS files)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AgentMetricsBar.tsx` | 80 | Top metrics bar (total agents, active, tasks) |
| `AgentRow.tsx` | 151 | Individual agent row in department view |
| `AgentTaskQueue.tsx` | 70 | Pending task queue for an agent |
| `DashboardTab.tsx` | 837 | **NEW** Agent control center dashboard |
| `DepartmentSection.tsx` | 81 | Department grouping with agents |
| `DepartmentDetailTab.tsx` | 297 | Detailed department drill-down |
| `EstherPipelineTab.tsx` | 379 | **NEW** Esther pipeline monitoring tab |
| `OverviewTab.tsx` | 42 | Department-based overview tab |
| `ActivityLogTab.tsx` | 161 | Agent activity log with filters |
| `ScheduleTab.tsx` | 151 | Agent cron/schedule display |
| `constants.ts` | 177 | Agent department mapping, categories |
| `types.ts` | 67 | TypeScript types for agent data |

### Campaign Components (2 components) — NEW
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `CampaignCreateWizard.tsx` | 886 | Campaign creation wizard with audience builder |
| `CampaignProgressPanel.tsx` | 369 | Campaign progress tracking panel |

### Settings Components (9 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AgentsTab.tsx` | 351 | AI agent configuration |
| `CommunicationsTab.tsx` | 694 | SMS/email templates, Telegram bot settings (separate showings + route bots) |
| `ComplianceTab.tsx` | 174 | Recording disclosure and compliance |
| `DemoDataTab.tsx` | 1,008 | Demo data seeding tool |
| `IntegrationKeysTab.tsx` | 514 | API key management |
| `InvestorReportsTab.tsx` | 583 | Investor report generation |
| `LeadCaptureTab.tsx` | 119 | Lead capture popup settings |
| `OrganizationTab.tsx` | 324 | Organization profile settings |
| `ScoringTab.tsx` | 272 | Lead scoring configuration |

### Insight & Analytics Components (6 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AIChat.tsx` | 256 | AI chat interface with real OpenAI integration |
| `ClevelandHeatGrid.tsx` | 257 | Geographic heat map grid |
| `DocumentsTab.tsx` | 478 | FAQ document management |
| `InsightFilters.tsx` | 341 | Multi-filter panel for insights |
| `LeadHeatMapView.tsx` | 256 | **NEW** Heat map visual component |
| `LeadsResultsTable.tsx` | 254 | Filtered leads result table |
| `ZipDetailPopup.tsx` | 107 | **NEW** Zip code detail popup |

### System Components (1 component)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `DataHealthDashboard.tsx` | 371 | **NEW** Data health dashboard |

### Landing Page Components (7 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `AnimatedStats.tsx` | 181 | Animated counter statistics |
| `AustinChatWidget.tsx` | 439 | Landing page chat demo widget |
| `DemoRequestDialog.tsx` | 242 | Demo request form dialog |
| `FloatingBackground.tsx` | 90 | Animated background decoration |
| `HowItWorksSection.tsx` | 310 | Step-by-step feature explanation |
| `RotatingHeroText.tsx` | 52 | Rotating hero headline text |
| `SocialProofToast.tsx` | 155 | Social proof notification toasts |

### Public Components (1 component)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `SmsConsentCheckbox.tsx` | 77 | Reusable TCPA consent checkbox for calls + SMS |

### Other Components (11 components)
| Component | Lines | Purpose |
|-----------|:-----:|---------|
| `ErrorBoundary.tsx` | 87 | React error boundary (app root) |
| `NavLink.tsx` | 30 | Navigation link helper |
| `ProtectedRoute.tsx` | 85 | Auth-gated route wrapper |
| `ProfileSetupScreen.tsx` | 21 | Profile setup placeholder |
| `CallQualityScore.tsx` | (removed) | *(removed with voice)* |
| `PAIpAssistant.tsx` | 394 | PAIp AI assistant floating widget |
| `LeadFunnelCard.tsx` | 246 | Lead funnel visualization |
| `InviteUserModal.tsx` | 265 | User invitation modal |
| `RoleBadge.tsx` | 42 | User role badge |

## 12.3 52 shadcn/ui Components + 3 Custom UI

**shadcn/ui**: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, date-range-picker, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip, + 3 additional

**Custom UI**: EmptyState, LoadingSpinner, StatusBadge

## 12.4 All 8 Custom Hooks

| Hook | Lines | Purpose |
|------|:-----:|---------|
| `use-mobile.tsx` | 19 | Detect mobile viewport |
| `use-toast.ts` | 221 | Legacy toast notifications |
| `useAgentsData.ts` | 215 | Fetch agent registry and task data |
| `useCostData.ts` | 307 | Fetch and process cost analytics (with null safety + cleanup) |
| `useDashboardAnalytics.ts` | 494 | **NEW** Dashboard analytics data fetching |
| `useOrganizationSettings.ts` | 312 | Read/write organization settings (with maybeSingle fix) |
| `usePermissions.ts` | 187 | Role-based permission checks |
| `useReportsData.ts` | 481 | Fetch report analytics data (with cleanup) |

## 12.5 Library Files

| File | Lines | Purpose |
|------|:-----:|---------|
| `utils.ts` | 6 | Tailwind class merge utility |
| `validation.ts` | 175 | Phone formatting, input validation |
| `emailTemplates.ts` | 448 | Email template definitions |
| `emailTemplateDefaults.ts` | 331 | **NEW** Default email template content |
| `notificationService.ts` | 233 | Notification dispatch service |
| `systemLogger.ts` | 133 | System log writer (dynamic origin, no hardcoded URLs) |
| `errorLogger.ts` | 113 | Error logging utility |
| `supabaseErrors.ts` | 145 | Supabase error message helpers |
| `cityTimezone.ts` | 72 | **NEW** City-based timezone utilities (DST-aware) |
| `imageUtils.ts` | 69 | **NEW** Image processing utilities (WebP conversion) |

## 12.6 Context

| File | Lines | Purpose |
|------|:-----:|---------|
| `AuthContext.tsx` | 233 | Authentication state, user role, organization context |

## 12.7 Navigation Structure

**Sidebar Navigation** (role-dependent visibility):
- Dashboard -> `/dashboard`
- Properties -> `/properties`
- Leads -> `/leads`
- Nurturing -> `/leads/nurturing`
- Showings -> `/showings`
- Emails -> `/emails`
- Campaigns -> `/campaigns`
- Reports -> `/reports`
- Knowledge Hub -> `/knowledge`
- Costs -> `/costs`
- Analytics -> `/analytics/heat-map`, `/analytics/competitor-radar`
- Agents -> `/agents`
- Users -> `/users`
- System Logs -> `/logs` (consolidated into Agents page Logs tab)
- Settings -> `/settings`

---

# 13. Multi-Tenancy

## 13.1 Data Isolation Model

Every table with tenant-specific data includes `organization_id` as a required foreign key. RLS policies ensure queries only return rows matching the authenticated user's organization.

**Isolated per organization**: Properties, property_groups, leads, showings, showing_available_slots, users, settings, documents, cost records, agent tasks, consent log, investor insights, competitor mentions, referrals, notifications, campaigns

**Shared across platform**: System-wide settings (NULL org_id), super admin users, platform metrics

## 13.2 Organization Data Structure

Each organization has:
- **Identity**: Name, slug (URL-friendly), logo
- **Contact**: Owner email, phone, address
- **Branding**: Primary/accent colors (CSS variables)
- **Subscription**: Plan type (starter/professional/enterprise), status, billing, limits
- **Integration Keys**: Each org can have their own OpenAI, Persona, MaxMind, Resend, DoorLoop, Telegram keys or use platform defaults
- **Settings**: Fully configurable behaviors (see below)

## 13.3 Configurable Settings per Organization

| Category | Setting | Default | Purpose |
|----------|---------|---------|---------|
| **Agents** | `recapture_first_delay_hours` | 24 | Hours before first recapture attempt |
| **Agents** | `recapture_max_attempts` | 7 | Maximum recapture attempts |
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
| **Communications** | `email_templates` | {} | Custom email templates |
| **Communications** | `working_hours_start` | "09:00" | Start of calling hours (TCPA) |
| **Communications** | `working_hours_end` | "20:00" | End of calling hours (TCPA) |
| **Communications** | `working_days` | [1,2,3,4,5,6] | Days to make calls (1=Mon) |
| **Communications** | `sender_domain` | (org-specific) | Dynamic email sender domain per org |
| **Communications** | `telegram_showings_bot_token` | (org-specific) | Telegram bot for showing notifications |
| **Communications** | `telegram_showings_chat_id` | (org-specific) | Telegram chat for showing notifications |
| **Communications** | `telegram_route_bot_token` | (org-specific) | Telegram bot for route/reminder notifications |
| **Communications** | `telegram_route_chat_id` | (org-specific) | Telegram chat for route/reminder notifications |
| **Showings** | `default_duration_minutes` | 30 | Default showing length |
| **Showings** | `buffer_minutes` | 15 | Buffer between showings |
| **Showings** | `showing_weekly_schedule` | Mon-Fri 9-5 | Weekly schedule template for EnableSlotsDialog |
| **Compliance** | `recording_disclosure_text` | "This call may be recorded..." | State-specific disclosure |
| **Compliance** | `auto_purge_leads_days` | 180 | Days before inactive leads purged |

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

Every interaction logs costs in the `cost_records` table:
- Every AI operation: `cost_openai`
- Every email: `cost_resend`
- Every verification: `cost_persona` or `cost_maxmind`
- Every AI brief: actual token usage cost (prompt + completion tokens)
- Health checks and platform operations: `p_service: "platform"` (not incorrectly attributed to "openai")

## 14.2 Cost Calculation Methods

| Service | Method | Rate (approximate) |
|---------|--------|-------------------|
| OpenAI (GPT-4o-mini) | Token count x model rate | $0.15/1M input, $0.60/1M output |
| Persona | Verification count x rate | ~$0.50/verification |
| MaxMind | Score query count x rate | ~$0.005/query |
| Resend | Email count x rate | ~$0.001/email |

## 14.3 Dashboard Features (`CostDashboard.tsx`, 758 lines)

- **Summary View**: Total spend by service (pie chart), daily spend trend (line chart), month-over-month comparison
- **Per-Lead Cost**: Table with lead name, source, status, total cost, breakdown by service, cost per funnel stage
- **Per-Source Analysis**: Average cost to acquire, show, and convert by source. ROI calculation.
- **Alerts**: Daily spend threshold, single lead cost threshold, unusual spike detection

---

# 15. Integrations

## 15.1 Doorloop Sync

- **Direction**: Bidirectional
  - Doorloop -> RFC: Application status, lease status
  - RFC -> Doorloop: Lead data when they start application (auto-push on property assignment)
- **Agents**: Ezra (pull), sync-leads-to-doorloop (push), send-application-invite
- **Polling**: Every 15 minutes for status updates
- **Status mapping**: Application created -> `in_application`, Lease signed -> `converted`
- **Side effects**: `in_application` cancels all pending agent tasks; `converted` marks property as `rented`
- **Audit**: `doorloop_sync_log` table tracks all sync operations
- **Bulk sync**: Admin can trigger full sync of all leads to DoorLoop from UI

## 15.2 Identity Verification (Persona + MaxMind)

### Primary: Persona
- **Agent**: Joseph (`agent-persona-verification`)
- **Flow**: Before showings, verify lead identity via Persona inquiry
- **Cost**: ~$0.50/verification

### Plan B: MaxMind minFraud
- **Edge Function**: `verify-identity` — handles the full verification flow
- **Flow**: If Persona is down or fails, MaxMind automatically takes over
- **Auth**: Basic Auth with Account ID + License Key
- **Endpoint**: `https://minfraud.maxmind.com/minfraud/v2.0/score`
- **Risk Scoring**: risk_score < 30 = verified, 30-70 = needs_review, > 70 = failed
- **Cost**: ~$0.005/query (100x cheaper than Persona)
- **Data sent**: IP address (required), email (optional), phone (optional)

### Verification Flow (`verify-identity` edge function)
1. Receive `lead_id`, `organization_id`, `ip_address`, `email`, `phone`
2. Check if lead is already verified (short-circuit)
3. Check `integration_health` table — if Persona is marked "down", skip directly to MaxMind
4. **Try Persona**: Create inquiry via API
5. **If Persona fails**: Automatically fall back to MaxMind minFraud Score
6. Update lead: `identity_verified`, `verification_status`, `verification_provider`
7. Log to `system_logs`, record cost via `zacchaeus_record_cost`

### Fallback Decision Logic
```
Has Persona key? --Yes--> Is Persona "down" in integration_health?
       |                         |Yes              |No
       |                         v                 v
       |                  Skip to MaxMind    Call Persona API
       |                                         |
       |                               Success? --Yes--> Done (provider: persona)
       |                                  |No
       |                                  v
       No                         Has MaxMind key?
       |                               |Yes         |No
       v                               v             v
  Has MaxMind? --Yes--> Call MaxMind    Call MaxMind   Return error
       |No                                   |
       v                               Score result
  Return error               <30: verified, 30-70: review, >70: failed
```

## 15.3 Resend Email

- **Edge Functions**: `process-email-queue` (batch processor), `send-notification-email` (direct send with queue option), `sync-resend-history` (history sync), `sync-resend-emails` (enhanced sync)
- **Architecture**: Frontend emails queue by default via `sendNotificationEmail()` with `queue: params.queue !== false`; queue is processed by `process-email-queue` in batches
- **Templates**: Defined in `src/lib/emailTemplates.ts` (448 lines) + `src/lib/emailTemplateDefaults.ts` (331 lines)
- **Event tracking**: `email_events` table records delivery events
- **Showing confirmations**: `book-public-showing` sends branded HTML confirmation emails with property/date/time details
- **Dynamic sender**: Each org uses its own sender domain from `organization_settings`
- **History sync**: `sync-resend-history` pulls delivery data from Resend API for all 3 app domains
- **Multi-tenant**: All email functions iterate all organizations (not single-org)

## 15.4 Hemlane Email Parsing

- **Agent**: Esther (`agent-hemlane-parser`, ~1,519 lines)
- **Purpose**: Parse Hemlane lead notification emails and daily lead digests into structured lead records
- **Parsing Engine**: LLM-powered extraction using GPT-4o-mini (replaced regex parsing in v14)
- **Security**: Svix webhook signature verification (HMAC-SHA256) with 5-minute timestamp tolerance — **mandatory when secret is configured**
- **Features**:
  - Creates or updates leads with smart property matching by address normalization
  - Handles duplicate phone numbers with narrow merge windows (only merges on hard identifiers)
  - Parses both individual lead notifications and daily digest format
  - Logs consent for incoming communications (method: `listing_inquiry`)
  - Comprehensive system_logs logging across all operations
  - **No auto-create property** — only humans add properties (removed auto-create in v14)

## 15.5 Telegram Bots (3 separate bot configurations)

| Bot | Settings Keys | Purpose |
|-----|--------------|---------|
| **Report Bot** | `telegram_bot_token`, `telegram_chat_id` (in credentials) | On-demand reports, hourly activity |
| **Showings Bot** | `telegram_showings_bot_token`, `telegram_showings_chat_id` (in org settings) | New showing booked notifications |
| **Route Bot** | `telegram_route_bot_token`, `telegram_route_chat_id` (in org settings) | 30-min pre-showing reminders with Google Maps |

- **Edge Functions**: `telegram-webhook` (bot command handler), `agent-hourly-report` (comprehensive activity report), `agent-rent-benchmark` (on-demand rent analysis), `showing-reminder` (30-min pre-showing reminders)
- **Commands**: `/report` (current stats), `/benchmark` (rent comparison), `/status` (system health)
- **Hourly Report**: Full dashboard metrics including new leads, showings, emails, agent activity, with DST-aware timezone handling
- **Rent Benchmark**: Per-property rent comparison with market data
- **Showing Reminder**: Sent 30 min before each showing with property details, lead info, Google Maps link, call link

---

# 16. Public Pages

## 16.1 URL Structure

| Route | Page | Auth |
|-------|------|------|
| `/` | Landing Page | Public |
| `/p/privacy-policy` (also `/privacy-policy`) | Privacy Policy | Public |
| `/p/terms-of-service` (also `/terms-and-conditions`) | Terms of Service | Public |
| `/p/refer/:referralCode` | Referral Program | Public |
| `/sms-signup` | SMS Signup | Public |
| `/p/book-showing` | Self-Service Showing Scheduler (city select) | Public |
| `/p/schedule-showing/:propertyId` | Self-Service Showing Scheduler (property) | Public |
| `/p/apply` (also `/apply`) | **NEW** Apply redirect to DoorLoop | Public |
| `/starktank` | **NEW** Investor pitch deck page | Public |

## 16.2 Landing Page Features

- Animated statistics (AnimatedStats)
- Rotating hero text (RotatingHeroText)
- How It Works step-by-step section
- Austin Chat Widget (live demo)
- Social Proof Toast notifications
- Demo Request Dialog (captures name, email, company, phone, TCPA consent)
- Floating animated background with gold orbs

## 16.3 Self-Service Showing Scheduling System

A complete Calendly-like system for leads to self-schedule property showings:

### Admin Side: ManageSlotsTab (`ManageSlotsTab.tsx`, 788 lines)
- Accessed from Showings page as a tab
- **Per-property slot management**: Select property -> view weekly calendar grid
- **Time slots**: 8:00 AM to 7:00 PM in 30-minute increments
- **Week navigation**: Navigate forward/back with week view
- **Slot toggling**: Click to enable/disable individual slots
- **Bulk operations**: Enable/disable entire days or time rows
- **Copy week**: Copy current week's slot pattern to next week
- **Visual indicators**: Green = available, gray = disabled, purple = booked, shown = cancelled/no-show/rescheduled
- **Blocked time slots**: Visible in calendar instead of hidden
- **Quick-enable**: Click empty calendar cells to quick-enable slots with city picker popover
- **View/Cancel**: Booked slots show View/Cancel Showing button
- **Slot totals**: Summary metrics shown across all tabs
- **Shareable link**: Copy public scheduling URL for the property

### EnableSlotsDialog (`EnableSlotsDialog.tsx`, 575 lines)
- Reads weekly schedule from org settings to auto-fill start/end times per day of week
- Warns when selected date is on an "OFF" day in the schedule
- Multi-city selection support
- 20-minute buffer option alongside 15/30/45/60
- Infers buffer from existing slot gaps when editing
- Safe city removal with booking protection

### Public Side: ScheduleShowing (`ScheduleShowing.tsx`, 1,395 lines)
- **Route**: `/p/schedule-showing/:propertyId` or `/p/book-showing` (city selector)
- **City selector**: Public booking page with city picker for multi-city organizations
- **Step 1**: View property details (photo, address, rent, beds/baths, sqft)
- **Step 2**: Select date from calendar (only dates with available slots highlighted)
- **Step 3**: Select time slot from available options
- **Step 4**: Enter contact info (name, phone, email) with TCPA consent checkbox
- **Step 5**: Confirmation screen with booking details, Apply Now button, calendar links
- **Score boost**: +30 score and "Hot Lead" flag on booking

### Backend: book-public-showing (`book-public-showing/index.ts`, 765 lines)
- Creates showing record in database
- Creates or updates lead record (source = 'website')
- Logs TCPA consent
- **Atomic slot booking** with race condition protection (`.eq("is_booked", false)` conditional update + rollback)
- **Duration-aware buffer**: `Math.ceil((durationMinutes + 30) / 30)` bufferSlots
- Schedules Samuel confirmation task (24h before)
- Sends branded HTML confirmation email via Resend with reschedule button
- DST-aware timezone handling
- Returns booking confirmation

### Data: showing_available_slots table
- Tracks enabled/disabled slots per property per date
- Links booked slots to showing records
- Organization-scoped with RLS

## 16.4 SMS Signup Page

- **Route**: `/sms-signup`
- **Purpose**: A2P 10DLC compliance — standalone SMS opt-in page
- **Implementation**: React wrapper (13 lines)

## 16.5 Privacy & Terms Pages

- **Privacy Policy** (`PrivacyPolicy.tsx`, 555 lines) — A2P-compliant, covers data collection, TCPA, call recording, SMS consent
- **Terms of Service** (`TermsOfService.tsx`, 612 lines) — A2P-compliant, covers user responsibilities, service terms

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
| Showing no-show | Leasing Agent, Editor | In-app |
| 3+ failed contact attempts | Editor | In-app |
| Lead taken under human control | Admin | In-app |
| Public showing self-scheduled | Admin, Editor | In-app + Telegram |
| DoorLoop application started | Team (all editors+) | In-app + Email with direct link |

## 17.3 Showing Alerts

| Alert | Recipient | Channel |
|-------|-----------|---------|
| Showing booked | Admin, assigned agent | Telegram (showings bot) |
| Showing in 30 min | Admin, assigned agent | Telegram (route bot) with Google Maps + call link |
| Showing cancelled | Lead | Email with reschedule link |
| Showing rescheduled | Lead | Email confirmation |

## 17.4 System Alerts

| Alert | Recipient | Channel |
|-------|-----------|---------|
| API error rate high | Admin | Email |
| Doorloop sync failed | Admin | In-app + Email |
| Critical integration failure | Admin | Email (immediate) |
| Identity verification failure | Admin | System log warning |

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

## 18.4 Report Generation

- **Manual**: Admin can generate investor reports via Settings -> Investor Reports tab
- **Edge Functions**: `generate-investor-report` (single) and `generate-all-investor-reports` (batch)
- **Storage**: Reports stored in `investor_reports` table with generated content

---

# 19. Fallbacks & Reliability

## 19.1 Service-Specific Fallback Plans

| Service | Failure Type | Fallback Action | Notification |
|---------|-------------|-----------------|--------------|
| **OpenAI** | API timeout | Use cached/default scoring (+5). Mark for re-analysis | None |
| **OpenAI** | Rate limit | Queue requests. Process in batches when available | None |
| **OpenAI** | API error | Log error. Use defaults. Background retry | Admin if >10/hour |
| **Persona** | Timeout | **Automatic fallback to MaxMind minFraud** | Lead sees "in progress" |
| **Persona** | API error | **Automatic fallback to MaxMind minFraud** | System log warning |
| **Persona** | Service marked "down" | **Skip directly to MaxMind** (health-aware) | None |
| **MaxMind** | API error | Mark "Manual Verification Required" | Admin alert |
| **MaxMind** | Both providers fail | Allow showing with "Pending Verification" status | Admin alert |
| **Doorloop** | Sync failure | Log, retry in 15 min. After 3 failures: alert | Admin alert |
| **Doorloop** | API unavailable | Continue without sync. Queue updates | Admin notification |
| **Resend** | Email failure | Queue for retry. Showing still created. | Admin if persistent |
| **Telegram** | Send failure | Log error, continue (non-blocking) | Console error |

## 19.2 System Logs Panel

- **Location**: Admin dashboard -> System Logs page (`SystemLogs.tsx`, 660 lines)
- **Features**: Real-time log stream, filter by level/service/date/resolution, mark as resolved with notes, export CSV
- **Critical errors**: Automatically email admin with details, affected entities, and suggested action
- **Health Check Widget**: `IntegrationHealth.tsx` (275 lines) shows green/yellow/red status per service
- **Integration Health Table**: `integration_health` table tracks real-time status per service
- **Status Bar**: `IntegrationStatusMini.tsx` (430 lines) in header shows live status dots for all services

---

# 20. Production Deployment Checklist

## 20.1 Pre-Launch

- [ ] Set Supabase `app.settings.supabase_url` and `app.settings.service_role_key` in DB
- [ ] Configure Nehemiah cron job (every 5 min task dispatch)
- [ ] Configure samuel-showing-reminder-5min cron job (every 5 min)
- [ ] Configure Doorloop sync cron (every 15 min)
- [ ] Configure organization API keys (OpenAI, Persona, MaxMind, Doorloop, Resend)
- [ ] Set up Resend domain verification
- [ ] Configure DNS for all 3 domains
- [ ] Set up SSL certificates
- [ ] Enable `prevent_direct_score_update` trigger in database
- [ ] Verify RLS policies with test data across all 5 roles
- [ ] Configure Hemlane webhook (Esther) with Svix signing secret
- [ ] Configure Telegram bot tokens (report bot, showings bot, route bot)
- [ ] Properties: Load properties (Zillow import or manual entry)
- [ ] Hemlane forwarding: Configure Hemlane to forward lead notifications

## 20.2 Testing

- [ ] End-to-end: Hemlane email -> lead creation -> scoring -> follow-up -> showing -> application
- [ ] End-to-end: Public showing booking -> lead creation -> confirmation email -> showing record
- [ ] End-to-end: Identity verification -> Persona primary -> MaxMind fallback
- [ ] Human takeover: take control -> verify paused tasks -> release -> verify resumed
- [ ] Multi-tenant: verify data isolation between organizations
- [ ] All 5 user roles: verify permission boundaries
- [ ] TCPA: verify consent required before outbound contact (SmsConsentCheckbox)
- [ ] Fair Housing: verify no protected class data in scoring
- [ ] Fallback: simulate each service failure, verify graceful degradation
- [ ] Cost tracking: verify per-interaction costs recorded correctly
- [ ] CSV import: test bulk lead import with dedup and scoring
- [ ] Mobile: test all pages on phone/tablet viewports
- [ ] Hemlane parser: test with sample Hemlane notification email
- [ ] DoorLoop push: test bulk sync + individual prospect creation
- [ ] Email queue: verify queued emails are processed and delivered
- [ ] Telegram: test /report and /benchmark commands
- [ ] Telegram: verify showing reminder arrives ~30 min before showing
- [ ] Zillow import: test multi-unit property import (duplex/triplex/fourplex)
- [ ] Campaigns: test campaign creation, audience building, email delivery tracking
- [ ] Reschedule: test cancelled/no-show showing reschedule with email notification

## 20.3 Post-Launch

- [ ] Monitor system logs for first 48 hours
- [ ] Verify cron jobs executing on schedule
- [ ] Check cost dashboard accuracy against service billing
- [ ] Verify Doorloop sync producing correct status updates
- [ ] Run first investor report generation
- [ ] Verify public showing scheduling working end-to-end
- [ ] Enable prevent_direct_score_update trigger
- [ ] Verify MaxMind fallback activates when Persona is unavailable

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

**Note**: Many tables (property_groups, campaigns, etc.) were created via Supabase Management API or Dashboard, not in local migrations.

## 20.5 Route Map (All 35 Authenticated Routes + 11 Public)

| Route | Component | Auth Required | Roles |
|-------|-----------|:------------:|-------|
| `/` | Landing Page | No | Public |
| `/p/privacy-policy` | PrivacyPolicy | No | Public |
| `/privacy-policy` | PrivacyPolicy | No | Public |
| `/p/terms-of-service` | TermsOfService | No | Public |
| `/terms-and-conditions` | TermsOfService | No | Public |
| `/p/refer/:referralCode` | ReferralPage | No | Public |
| `/sms-signup` | SmsSignup | No | Public |
| `/p/book-showing` | ScheduleShowing | No | Public |
| `/p/schedule-showing/:propertyId` | ScheduleShowing | No | Public |
| `/p/apply` | ApplyRedirect | No | Public |
| `/apply` | ApplyRedirect | No | Public |
| `/starktank` | StarktankPage | No | Public |
| `/auth/login` | Login | No | Public |
| `/auth/forgot-password` | ForgotPassword | No | Public |
| `/auth/reset-password` | ResetPassword | No | Public |
| `/dashboard` | Dashboard (role router) | Yes | All |
| `/properties` | PropertiesList | Yes | Admin, Editor, Leasing Agent |
| `/properties/group/:groupId` | PropertyGroupDetail | Yes | All with access |
| `/properties/:id` | PropertyDetail | Yes | All with access |
| `/leads` | LeadsList | Yes | Admin, Editor, Leasing Agent |
| `/leads/:id` | LeadDetail | Yes | Admin, Editor, Leasing Agent |
| `/leads/nurturing` | LeadHygiene (Nurturing) | Yes | Admin, Editor |
| `/showings` | ShowingsList | Yes | Admin, Editor, Leasing Agent |
| `/applicants` | ApplicantsPage | Yes | Admin, Editor |
| `/campaigns` | CampaignsPage | Yes | Admin, Editor |
| `/emails` | EmailsPage | Yes | Admin, Editor |
| `/reports/*` | Reports | Yes | Admin, Editor |
| `/knowledge` | KnowledgeHub | Yes | Admin, Editor |
| `/costs` | CostDashboard | Yes | Admin |
| `/analytics/heat-map` | LeadHeatMap | Yes | Admin, Editor |
| `/analytics/competitor-radar` | CompetitorRadar | Yes | Admin, Editor |
| `/agents` | AgentsPage | Yes | Admin |
| `/users` | UsersList | Yes | Admin |
| `/users/:id` | UserDetail | Yes | Admin |
| `/settings/*` | Settings | Yes | Admin |
| `/demo-requests` | DemoRequests | Yes | Admin |

**Redirects**: `/insights` -> `/knowledge?tab=chat`, `/documents` -> `/knowledge?tab=documents`, `/showings/route` -> `/showings?tab=route`

**404 Catch-All**: `NotFound.tsx` handles all unmatched routes.

---

# 21. What Remains

## 21.1 Production Configuration (Required)

1. **Cron jobs**: Nehemiah (5-min task dispatch) and Doorloop sync (15-min) not yet configured as pg_cron
2. **Webhook URLs**: Need to be configured for Hemlane (Esther) dashboard
3. **API keys**: Need to be set per organization in production database
4. **DB settings**: `app.settings.supabase_url` and `app.settings.service_role_key` must be set
5. **Properties**: Load properties (Zillow import or manual entry)
6. **Resend webhook**: Configure for Esther (Hemlane parser)
7. **Hemlane forwarding**: Configure Hemlane to forward lead notifications
8. **Telegram bots**: Set 3 separate bot tokens for report, showings, and route notifications

## 21.2 Advisory Items from Audit (Non-Blocking)

| # | Item | Severity | Recommendation |
|---|------|----------|----------------|
| 1 | ~40 remaining `any` types | Low | Gradual cleanup |
| 2 | Score audit trigger disabled | Medium | Enable in production DB |
| 3 | Dual toast system | Low | Consolidate to sonner |
| 4 | Edge function code duplication (~45%) | Low | Create `_shared/` directory |

---

# 22. Latest Session Update

## Session: March 21, 2026

### Changes Since MD13 (Feb 25, 2026) — 209 Commits

#### 1. Voice/Call Removal
- **Removed all call/voice/Bland.ai functionality from the codebase**. The system now operates via email-based lead processing only.
- Removed agents: Aaron (inbound calls), Ruth (SMS inbound), Joshua (campaign voice), Jonah (no-show calls), Miriam (welcome calls), Luke (email outbound direct), Joel (campaign orchestrator), Naomi (post-showing calls)
- Removed Twilio voice/SMS integration
- Removed Bland.ai pathway system
- Stopped creating fake call/SMS agent tasks — use email instead

#### 2. Property Groups (Building/Unit Hierarchy)
- New `property_groups` table for multi-unit buildings (duplex/triplex/fourplex)
- Properties link to groups via `property_group_id` FK
- **Zillow import** now supports multi-unit properties — detects duplex/triplex/fourplex and creates property_group + individual unit rows
- **ZillowImportDialog** (917 lines) — full import dialog with multi-unit support
- **PropertyGroupDetail** page (445 lines) — building-level detail view
- **PropertyGroupCard** (222 lines) and **PropertyGroupForm** (424 lines) — group UI components
- Collapsible building rows with direct photo upload (WebP conversion)
- Quick "+" button to add units without expanding
- Leads count column on properties list
- Global **PropertyRulesDialog** (166 lines) — amenities, Section 8, HUD at org level (removed per-property)

#### 3. Comprehensive Showings Overhaul
- **ShowingsList** expanded to 991 lines with metrics, filters, reports, leasing tab
- **ShowingDetailDialog** expanded to 852 lines with:
  - Reschedule button for cancelled/no-show/rescheduled showings with date/time picker
  - Email notification on reschedule
  - Voucher/Self-pay badge display
- **ManageSlotsTab** expanded to 788 lines with:
  - Cancelled/no-show/rescheduled showings visible in calendar
  - Blocked time slots visible (instead of hidden)
  - View/Cancel Showing button on booked slots
  - Quick-enable slots from empty cells with city picker popover
  - Slot totals, Enable Slots, and booking link on all tabs
- **ScheduleShowingDialog** expanded to 1,047 lines with Telegram showing notification
- Compact showing cards with single-row layout, less padding
- Mobile-responsive showings page layout
- Warn before deleting leads with upcoming showings in For Review tab

#### 4. Telegram Showing Reminders (NEW)
- New `showing-reminder` edge function (239 lines) — sends Telegram notifications 30 min before showings
- Cron job `samuel-showing-reminder-5min` runs every 5 minutes
- Uses separate **route bot** (`telegram_route_bot_token` / `telegram_route_chat_id`)
- Message includes: address, specs, rent, Section 8 badge, lead name, voucher badge, Google Maps navigation, call link
- Deduplication via system_logs to prevent repeat reminders

#### 5. Separate Telegram Bot Support
- **3 independent Telegram bots** configurable per organization:
  1. Report bot (credentials table) — hourly reports, on-demand commands
  2. Showings bot (org settings) — new showing booked notifications
  3. Route bot (org settings) — 30-min pre-showing reminders
- CommunicationsTab settings updated with separate bot token/chat ID fields

#### 6. Campaigns System
- New **CampaignsPage** (383 lines) with campaign list
- **CampaignCreateWizard** (886 lines) — step-by-step campaign creation with audience builder
- **CampaignProgressPanel** (369 lines) — real-time campaign progress tracking
- Campaign email stats with deduplication, delivery tracking
- Campaign cards redesigned: compact layout with larger stats numbers

#### 7. Agent Task Dispatcher
- New `agent-task-dispatcher` edge function (1,298 lines) — Nehemiah fully implemented
- Dispatches all pending tasks from agent_tasks table
- Also handles campaign task dispatching
- Custom email template support for dispatched tasks

#### 8. Dashboard & Agents Redesign
- Dashboard redesigned with Agent Activity + Task Queue live panels
- Agent control center with embedded Logs & Costs
- **DashboardTab** (837 lines) — agent dashboard with real-time monitoring
- **EstherPipelineTab** (379 lines) — Esther pipeline monitoring
- **AgentActivityPanel** (282 lines), **RealTimeAgentPanel** (410 lines), **TaskQueuePanel** (336 lines)
- Clean task queue: removed OVERDUE alarm, show UP NEXT + relative time

#### 9. Email System Expansion
- **EmailsPage** expanded to 1,129 lines with Templates tab
- **EmailTemplatesTab** (621 lines) — full email template editor
- Email template defaults library (331 lines)
- Custom template support in agent-task-dispatcher
- Campaign dedup, delivery tracking, and email log

#### 10. Esther Parser Improvements
- Replaced regex parsing with **LLM (GPT-4o-mini)** for more accurate extraction
- Rewritten duplicate checks — only merge on hard identifiers (phone/email match)
- Removed auto-create property — only humans add properties
- Pipeline tab for monitoring Esther's processing
- Narrowed merge windows from 2-5min to 15-30min

#### 11. Properties Redesign
- Compact table view with admin-only edits
- Removed per-property amenities and pet policy (now global in Rules)
- Property Health Check fetches fresh data on open + refresh button
- Inline status change per unit
- Photo upload with WebP conversion
- Google Maps link on addresses, tel: link on phone numbers

#### 12. Mobile & UI Improvements
- Comprehensive mobile UI/UX overhaul
- Mobile-responsive showings page
- Dropdown scroll fixes
- Compact campaign cards
- Standardized all font sizes to Tailwind standard scale
- iOS 26 glass aesthetic with frosted glass cards

#### 13. Starktank Investor Page
- New `/starktank` public page (1,215 lines) — investor pitch deck with animated carousel, YouTube embed, sections for market opportunity, real traction, revenue path

#### 14. Other New Edge Functions
- `recalculate-scores` (131 lines) — bulk score recalculation
- `agent-system-analysis` (355 lines) — system analysis and diagnostics
- `sync-resend-emails` (294 lines) — enhanced Resend email sync
- `enhance-report` (108 lines) — AI-enhanced report generation

#### 15. New Hooks & Libraries
- `useDashboardAnalytics` hook (494 lines) — dashboard analytics data
- `cityTimezone.ts` (72 lines) — DST-aware city timezone utilities
- `emailTemplateDefaults.ts` (331 lines) — default email template content
- `imageUtils.ts` (69 lines) — image processing utilities

#### 16. Other Improvements
- Public booking city selector for multi-city organizations
- Apply redirect page (`/p/apply`) for DoorLoop applications
- Voucher/Self-pay badge on showing cards and detail dialog
- Google Maps links on addresses (excludes unit number from search)
- tel: links on phone numbers
- Lead count column on properties list
- Warn before deleting leads with upcoming showings
- delete-lead edge function used in SuspectTab to handle FK constraints
- City-based timezone handling (not hardcoded Eastern)
- Score recalculation from frontend

### Updated Statistics (vs. MD13)

| Metric | MD13 | MD14 | Change |
|--------|------|------|--------|
| Total LoC (src/) | 57,896 | 71,244 | **+13,348** |
| Total LoC (supabase/) | 8,737 | 15,090 | **+6,353** |
| Combined Total | 67,890 | 86,334 | **+18,444** |
| Edge functions (local) | 24 | 30 | **+6** |
| Edge function lines | 8,737 | 11,498 | +2,761 |
| Page files | 36 | 37 | +1 |
| Page lines | 15,044 | 18,326 | +3,282 |
| Component files (custom) | 111 | 122 | +11 |
| Component lines (total) | 34,895 | 41,165 | +6,270 |
| shadcn/ui components | 52 | 52 | 0 |
| Custom hooks | 7 | 8 | +1 |
| Hook lines | 1,799 | 2,236 | +437 |
| Library files | 7 | 10 | +3 |
| Library lines | 1,100 | 1,725 | +625 |
| Database tables | 40 | 67 | **+27** |
| npm packages | 76 | 79 | +3 |
| Commits (total since Feb 25) | — | 209 | — |

### Key Commits Since MD13

```
bd13d4b feat: showing reminder Telegram notifications + reschedule date/time picker
1eab472 feat: add Reschedule button for cancelled/no-show showings in detail dialog
5c12ce1 feat: support separate Telegram bot for showing notifications
9c2a95e feat: show cancelled/no-show/rescheduled showings in ManageSlotsTab calendar
4f5dec8 fix: mobile-responsive showings page layout
ad48fd8 fix: compact showing cards — single row layout, less padding
ad523a0 feat: show Voucher/Self-pay badge on showing cards and detail dialog
886a10a feat: quick-enable slots from empty cells with city picker popover
d3d18d0 feat: comprehensive showings system overhaul — metrics, filters, reports, emails, leasing tab
8bd71be feat: remove all call/voice/Bland.ai functionality from codebase
eaac540 feat: property groups — building/unit hierarchy, WebP uploads, grouped UI
5b890f0 feat: replace Esther regex parsing with LLM (GPT-4o-mini)
b890fe0 feat: add Esther Pipeline tab to Agents page
129d68a feat: properties section redesign — compact table view, admin-only edits
975c9b6 feat: redesign ScheduleShowingDialog — better UX, available dates, email sequence
eea24b1 feat: public booking city selector, ManageSlotsTab external controls
3af0a59 feat: real-time campaign progress, faster polling, fix sync-resend dedup
69b4612 feat: campaign dedup, delivery tracking, and email log
2083a70 feat: dashboard redesign, Esther name recovery, showings grid, RLS fix
cb15532 feat: timezone fixes, showings rewrite, Esther parser hardening
7ee4e66 feat: add Templates tab to Emails page with full email template editor
9f01074 feat: redesign Cost Dashboard into professional Analytics Dashboard
6ab9ece feat: restructure AI Agents Control Center with Dashboard + embedded Logs & Costs
e4cab28 feat: add Agent Activity + Task Queue live panels to dashboard sidebar
```

### Edge Functions Deployed (30 local, all deployed)

All 30 local edge functions have been deployed to Supabase, including the 6 new ones:
1. `agent-system-analysis` — System analysis and diagnostics
2. `agent-task-dispatcher` — Nehemiah: task dispatcher
3. `enhance-report` — AI-enhanced report generation
4. `recalculate-scores` — Bulk score recalculation
5. `showing-reminder` — 30-min pre-showing Telegram reminders
6. `sync-resend-emails` — Enhanced Resend email sync

---

*Document Version: 14*
*Last Updated: March 21, 2026*
*Project: Rent Finder Cleveland*
*Architecture: Multi-Tenant SaaS*
*Total Lines of Code: 86,334*
