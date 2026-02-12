# CLAUDE.md - Rent Finder Cleveland

## Project Overview
AI-powered lead management SaaS for property management. Automates the entire rental lead lifecycle: inbound calls → AI voice agents → lead scoring → follow-ups → showings → applications. Multi-tenant architecture supporting 3 apps on 1 Supabase DB.

**Status**: Code complete (51,500 LoC). Ready for production configuration and testing.

## Tech Stack
- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui (mandatory for all components)
- **Backend**: Supabase (PostgreSQL) with 32 tables, 131 RLS policies, 19 DB functions, 12 triggers
- **Edge Functions**: Deno functions (12 operational agents + utility functions + webhooks)
- **Font**: Montserrat
- **Auth**: Supabase Auth with 5 roles: super_admin, admin, editor, viewer, leasing_agent

## Design System Colors
- Primary: #370d4b (purple dark)
- Accent: #ffb22c (gold)
- Background: #f4f1f1
- Surface: #ffffff
- Success: #22C55E / Error: #EF4444 / Warning: #F59E0B

## Multi-App Architecture
3 domains sharing 1 Supabase database:
- rentfindercleveland.com (primary)
- homeguardmanagement.com
- portafoliodiversificado.com

## Key Architecture Patterns

### Multi-Tenancy
Every table has `organization_id`. All RLS policies scope by user's org. Never query without org context.

### AI Agents (Biblical Names) — 12 Operational Agents
Organized by department:
- **Recepción**: Aaron (inbound calls), Deborah (call processor + smart matching), Ruth (SMS conversational agent)
- **Evaluación**: Daniel (AI scoring, Fair Housing compliant), Isaiah (transcript analysis)
- **Operaciones**: Nehemiah (sole dispatcher, cron every 5 min — campaigns included)
- **Ventas**: Elijah (outbound sales & recapture), Samuel (full showing lifecycle: confirm + no-show + post-showing)
- **Inteligencia**: Solomon (conversion predictor), Moses (insight generator), David (report generator)
- **Administración**: Ezra (Doorloop Bridge, bidirectional sync), Zacchaeus (health monitoring + cost tracking)

**Utility functions** (not agents): joseph_compliance_check(), send_notification(), send_email(), rebekah_match_properties(), backup_lead_to_sheets(), execute_campaign_call()
**Webhook**: Esther (Hemlane email parser)

### Compliance (Non-negotiable)
- **Fair Housing Act**: Scoring NEVER uses race, religion, sex, familial status, disability, age, or proxies
- **TCPA**: All outbound contact requires prior consent. Each outbound agent calls joseph_compliance_check() (DB function) before any contact
- **Call Recording**: Disclosure played at start of every call via Bland.ai configuration

### Human Takeover System
Leads can be taken under manual control, pausing all AI automation. Requires mandatory 20-char reason note. `pause_lead_agent_tasks()` RPC pauses all pending agent_tasks.

## File Structure
```
src/
├── components/          # 62 custom + 54 shadcn/ui
│   ├── ui/             # shadcn/ui components
│   ├── layout/         # Header, Sidebar, MainLayout, MobileNav
│   ├── dashboard/      # 15 widgets
│   ├── leads/          # 10 components (HumanTakeover, Messaging, etc.)
│   ├── properties/     # PropertyCard, PropertyForm, PhotoUpload
│   ├── showings/       # Schedule, Report, Route planning
│   ├── settings/       # 10 tab components
│   ├── insights/       # AIChat, Filters, Results
│   └── public/         # LeadCapturePopup, PropertyGrid
├── pages/              # 30 pages across auth, dashboard, properties, leads, etc.
├── hooks/              # 7 custom hooks (usePermissions, useCostData, etc.)
├── contexts/           # AuthContext
├── lib/                # utils, systemLogger, notificationService
└── integrations/       # Supabase auto-generated client + types

supabase/
├── functions/          # 39 edge functions
│   ├── _shared/        # CORS, supabase client helpers
│   └── agent-*/        # Named agent functions
└── migrations/         # 26 SQL migrations
```

## Database Key Tables
- `organizations` - Multi-tenant core with branding, subscription, API keys
- `leads` - Core lead records with scoring, status flow, human control flags
- `calls` - Voice calls with transcripts, AI analysis, per-service costs
- `showings` - Appointments with confirmation tracking, agent reports
- `agent_tasks` - Scheduled AI actions (pausable for human takeover)
- `lead_score_history` - Explainable scoring audit trail
- `consent_log` - TCPA compliance evidence
- `cost_records` - Per-interaction cost attribution

## Lead Status Flow
new → contacted → engaged → nurturing → qualified → showing_scheduled → showed → in_application → converted
(any status can → lost)

## External Services
- **Twilio**: Voice calls + SMS (Account SID, Auth Token, Phone +12162383390)
- **Bland.ai**: AI voice conversations
- **OpenAI**: Scoring, transcript analysis, insights, PAIp chat
- **Persona**: Identity verification
- **Doorloop**: Application/lease status sync
- **Resend**: Transactional email
- **Google Sheets**: Lead backup

## Commands & Scripts
- `npm run dev` - Start dev server
- `npx supabase functions serve` - Local edge functions
- `npx supabase db push` - Push migrations
- `npx supabase functions deploy <name>` - Deploy single edge function

## Workflow Shortcuts
- **"go"** - Commit all changes with a descriptive message and push to origin. Always do both steps without asking.
- **"lovable"** - Do a git pull from the remote repository before doing anything else. No confirmation needed.
- **"md"** - Generate exhaustively comprehensive project documentation (1500+ lines minimum). Check `~/Desktop/md/` for existing `PROJECT_COMPLETE_Rent_Finder_Cleveland_MD*.md` files, find the highest number, and create the next version. Use `PROJECT.md` as source of truth. Must include ALL sections with full detail:
  1. **Project Overview**: Vision, SaaS model, multi-app architecture (3 domains), core problems, target users (5 roles)
  2. **Current State**: Completion status per phase, ALL codebase statistics (LOC, tables, RLS policies, functions, triggers, migrations, edge functions, pages, components, hooks, cron jobs)
  3. **Tech Stack**: Core platform, ALL external integrations with their edge functions
  4. **Design System**: Full color codes with hex values and usage, typography scale, responsive breakpoints
  5. **Database Schema**: ALL 32 tables with purpose and RLS status, full SQL CREATE statements for key tables (organizations, users, properties, leads), ALL 19 database functions with descriptions, ALL 12 triggers
  6. **User Roles & Permissions**: Complete permission matrix for all 5 roles across all features
  7. **Lead Lifecycle**: All 10 statuses with definitions, automatic transitions, lost reasons
  8. **Lead Scoring System**: Full 0-100 scale, all positive/negative indicators with points, priority triggers, Fair Housing compliance rules
  9. **Human Takeover System**: Complete flow, modal requirements, visual indicators, release process
  10. **AI Agents Architecture**: ALL 30 agents with biblical name, edge function name, line count, purpose (organized by category), ALL auxiliary functions, complete cron schedule
  11. **Compliance**: Joseph compliance check (9 agents), Zacchaeus cost tracking (16 functions), Fair Housing, TCPA, call recording
  12. **Frontend Architecture**: ALL 30 pages with line counts, ALL 62 components by category, ALL 7 hooks, navigation structure
  13. **Multi-Tenancy**: Data isolation, organization structure, ALL configurable settings with defaults
  14. **Cost Dashboard**: Per-interaction recording, cost calculation methods per service with rates
  15. **Integrations**: Doorloop sync, Google Sheets backup, Persona verification, Resend email
  16. **Public Pages**: URL structure, lead capture popup with TCPA consent
  17. **Notifications & Alerts**: All alerts with recipients and channels
  18. **Investor Dashboard**: Metrics, storytelling, insight types
  19. **Fallbacks & Reliability**: Service-specific fallback plans for every integration
  20. **Production Deployment Checklist**: Pre-launch, testing, post-launch items
  21. **What Remains**: Outstanding items for production
  22. **Latest Session Update**: Current session work
  **After creating the snapshot**: Also copy the exact same content to `PROJECT.md` in the repo root, so `PROJECT.md` always reflects the latest generated documentation. This keeps the source of truth in sync with the most recent snapshot.
  No confirmation needed.

## Important Notes
- Never hardcode organization-specific values; always use organization_settings
- All scoring changes MUST go through lead_score_history (trigger enforces this)
- Edge functions use Deno, not Node.js
- Supabase client in edge functions: use `_shared/supabase.ts`
- For cron-triggered agents, DB settings `app.settings.supabase_url` and `app.settings.service_role_key` must be set

## Database Rules
- NEVER run `npx supabase db push` or any supabase CLI database commands - they are not configured in this environment.
- If SQL migrations or database schema changes are needed, tell the user: "This requires a database change. Please run this SQL in the Supabase Dashboard SQL Editor: [provide the SQL]"
- Only edit frontend files (src/, public/, etc.) and push to GitHub.
- After pushing to GitHub, remind the user to trigger a rebuild in Lovable if the live site does not update automatically.

