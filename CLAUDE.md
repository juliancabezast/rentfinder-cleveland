# CLAUDE.md - Rent Finder Cleveland

## Project Overview
AI-powered lead management SaaS for property management. Automates the entire rental lead lifecycle: inbound calls → AI voice agents → lead scoring → follow-ups → showings → applications. Multi-tenant architecture supporting 3 apps on 1 Supabase DB.

**Status**: Code complete (51,500 LoC). Ready for production configuration and testing.

## Tech Stack
- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui (mandatory for all components)
- **Backend**: Supabase (PostgreSQL) with 32 tables, 131 RLS policies, 19 DB functions, 12 triggers
- **Edge Functions**: 39 Deno functions (25 core agents + 14 auxiliary)
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

### AI Agents (Biblical Names)
30 agents with biblical names. Key ones:
- **Nehemiah** (task-dispatcher) - Orchestrates pending tasks, runs every 5 min
- **Daniel** (scoring) - AI lead scoring with Fair Housing compliance
- **Joseph** (compliance-check) - TCPA gate called by 9 outbound agents before any contact
- **Zacchaeus** (record-cost) - Cost tracking called by 16 edge functions
- **Aaron** (twilio-inbound) - Receives inbound calls
- **Deborah** (bland-call-webhook) - Processes Bland.ai call completions

### Compliance (Non-negotiable)
- **Fair Housing Act**: Scoring NEVER uses race, religion, sex, familial status, disability, age, or proxies
- **TCPA**: All outbound contact requires prior consent. joseph_compliance_check gates all outbound agents
- **Call Recording**: Disclosure played at start of every call

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
- **"md"** - Generate a comprehensive markdown file documenting all work done in this session. Include: what was changed, what files were modified, what was added, what was fixed, and any important notes. Save it inside ~/Desktop/md/ with a sequential number filename. Check existing files in ~/Desktop/md/ to find the highest number, then use the next one (e.g., if last file is 5.md, create 6.md). Create the folder if it doesn't exist. No confirmation needed.

## Important Notes
- Never hardcode organization-specific values; always use organization_settings
- All scoring changes MUST go through lead_score_history (trigger enforces this)
- Edge functions use Deno, not Node.js
- Supabase client in edge functions: use `_shared/supabase.ts`
- For cron-triggered agents, DB settings `app.settings.supabase_url` and `app.settings.service_role_key` must be set
