# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm install              # Required first — node_modules not in repo
npm run dev              # Vite dev server
npx vite build           # Production build (also serves as TypeScript check — no standalone tsc)
npm run lint             # ESLint
npm test                 # vitest run
npm run test:watch       # vitest watch mode
```

### Edge Function Deployment
```bash
npx supabase functions deploy <function-name> --no-verify-jwt
```
When doing "go" (commit + push), deploy any new/modified edge functions before finishing.

### Database Changes
**NEVER run `npx supabase db push`** — migration history is out of sync with Lovable. Instead, use the Supabase Management API:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/glzzzthgotfwoiaranmp/database/query" \
  -H "Authorization: Bearer sbp_05357b6cf938526921753a46354cbe8fffd978d3" \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR SQL HERE"}'
```
After pushing to GitHub, remind the user to trigger a Lovable rebuild if the live site needs updating.

## Working Style
- **Always execute actions yourself.** Run commands (deploy, build, push) immediately — never tell the user to do it.
- The user only acts when something truly requires their manual intervention (e.g., Supabase Dashboard UI, Lovable rebuild).

## Workflow Shortcuts
- **"go"** — Commit all changes with a descriptive message and push to origin. No asking.
- **"lovable"** — `git pull` before doing anything else. No confirmation.
- **"md"** — Generate comprehensive project documentation. Check `md/` (project root) for existing `PROJECT_COMPLETE_Rent_Finder_Cleveland_MD*.md` files, increment the number. Use `PROJECT.md` as source of truth. Also copy to `PROJECT.md` in repo root. No confirmation.

## Project Overview
AI-powered lead management SaaS for property management. Automates the rental lead lifecycle: inbound calls → AI voice agents → lead scoring → follow-ups → showings → applications. Multi-tenant architecture with 3 apps on 1 Supabase DB.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, shadcn/ui (mandatory for all UI)
- **Backend**: Supabase (PostgreSQL) — 32 tables, 131 RLS policies, 19 DB functions, 12 triggers
- **Edge Functions**: Deno (not Node.js) — 24 local functions in `supabase/functions/`, ~20 more deployed via Lovable
- **Auth**: Supabase Auth — roles: super_admin, admin, editor, viewer, leasing_agent
- **Font**: Montserrat
- **Design colors**: Primary #4F46E5 (indigo), Accent #ffb22c (gold), Background #f3f4f6 (cool gray). iOS 26 glass aesthetic.

## Architecture

### Multi-Tenancy
Every table has `organization_id`. All RLS policies scope by user's org. **Never query without org context.** Never hardcode org-specific values — use `organization_settings` table.

### Multi-App Domains
3 domains share 1 Supabase database: rentfindercleveland.com, homeguardmanagement.com, portafoliodiversificado.com. Use `window.location.origin` for URLs, org settings for sender domains. Never hardcode domain names.

### Code Patterns
- **Exports**: Components use named exports (`export const X`). Pages use `export default` (required for React.lazy).
- **Imports**: Double quotes dominant. File-level consistent.
- **Toast**: Import from `@/hooks/use-toast` directly. Sonner (`toast` from `"sonner"`) also available — both Toasters mounted in App.tsx.
- **Edge functions**: Use raw `fetch` for streaming; otherwise `supabase.functions.invoke()`.
- **Email sending**: All frontend emails queue by default via `sendNotificationEmail()` in `src/lib/notificationService.ts` (respects Resend rate limits). Only set `queue: false` for test emails.
- **Data fetching**: `@tanstack/react-query` (v5) used across ~33 locations. QueryClient provided in App.tsx.
- **lucide-react `Map` icon**: Always import as `Map as MapIcon` — bare `import { Map }` shadows the native `Map` constructor and causes `TypeError: Map is not a constructor` at runtime.

### AI Agents (Biblical Names)
12 operational agents organized by department:
- **Recepción**: Aaron (inbound calls), Deborah (call processor + smart matching), Ruth (SMS)
- **Evaluación**: Daniel (AI scoring, Fair Housing compliant), Isaiah (transcript analysis)
- **Operaciones**: Nehemiah (sole dispatcher, cron every 5 min)
- **Ventas**: Elijah (outbound sales), Samuel (showing lifecycle)
- **Inteligencia**: Solomon (conversion predictor), Moses (insights), David (reports)
- **Administración**: Ezra (DoorLoop Bridge), Zacchaeus (health monitoring + cost tracking)

**Utility functions**: joseph_compliance_check(), send-notification-email, send-message, match-properties, generate-lead-brief, predict-conversion, book-public-showing, process-email-queue
**Webhook**: Esther (agent-hemlane-parser — Hemlane/Resend email parser)

### Lead Status Flow
new → contacted → engaged → nurturing → qualified → showing_scheduled → showed → in_application → converted (any → lost)

### Compliance (Non-negotiable)
- **Fair Housing Act**: Scoring NEVER uses race, religion, sex, familial status, disability, age, or proxies
- **TCPA**: All outbound contact requires prior consent. Outbound agents call `joseph_compliance_check()` DB function before contact
- **Consent logging**: Every consent action recorded in `consent_log` table with evidence text
- **Call Recording**: Disclosure at start of every call via Bland.ai

### Human Takeover System
Leads can be taken under manual control, pausing all AI automation. Requires mandatory 20-char reason note. `pause_lead_agent_tasks()` RPC pauses all pending agent_tasks.

### Key Database Tables
- `organizations` — Multi-tenant core with branding, subscription
- `organization_credentials` — Per-org API keys (Twilio, OpenAI, Resend, DoorLoop, Bland)
- `organization_settings` — Per-org config (key/value with category)
- `leads` — Core records with scoring, status flow, human control flags
- `agent_tasks` — Scheduled AI actions (columns: `agent_type`, `action_type`, `status`)
- `lead_score_history` — Explainable scoring audit trail (trigger-enforced)
- `consent_log` — TCPA compliance evidence
- `email_events` — Email queue + delivery tracking (details JSONB with `status: "queued"/"sent"/"failed"`)
- `cost_records` — Per-interaction cost attribution

### External Services
- **Twilio**: Voice + SMS (credentials in organization_credentials, phone in twilio_phone_number)
- **Bland.ai**: AI voice conversations (webhook secret: BLAND_WEBHOOK_SECRET)
- **OpenAI**: Scoring, analysis, insights (GPT-4o-mini for briefs, GPT-4o for vision)
- **Resend**: Transactional email (webhook secret: RESEND_WEBHOOK_SECRET, queue via process-email-queue)
- **DoorLoop**: Application/lease sync
- **Persona**: Identity verification

### Timezone Handling (Cleveland = America/New_York)
All date/time computations must be DST-aware. Never hardcode UTC offsets like `-05:00`.

**In edge functions (Deno)**: Use `toLocaleDateString("en-CA", { timeZone: "America/New_York" })` for YYYY-MM-DD, or compute Cleveland midnight:
```ts
const orgTz = "America/New_York";
const clevelandNow = new Date(now.toLocaleString("en-US", { timeZone: orgTz }));
clevelandNow.setHours(0, 0, 0, 0);
const offset = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: orgTz })).getTime();
const todayStart = new Date(clevelandNow.getTime() + offset).toISOString(); // UTC equivalent of Cleveland midnight
```

**In frontend**: Same pattern, or use DB functions `count_leads_today(p_organization_id)` / `count_complete_leads_today(p_organization_id)` which handle timezone via `AT TIME ZONE 'America/New_York'`.

**In DB functions**: Use `(NOW() AT TIME ZONE 'America/New_York')::date::timestamp AT TIME ZONE 'America/New_York'` for Cleveland midnight in UTC.

### Edge Function Patterns
- No `_shared/` directory exists — utility code is duplicated across functions (~45% duplication)
- All Deno std imports standardized on `https://deno.land/std@0.168.0/`
- Every query MUST filter by `organization_id` passed in the request body

## Critical Rules
- All scoring changes MUST go through `lead_score_history` (trigger enforces this)
- Edge functions use Deno imports (`https://deno.land/std@0.168.0/`, `https://esm.sh/`)
- For cron-triggered agents, DB settings `app.settings.supabase_url` and `app.settings.service_role_key` must be set
- Emails: sender domain should come from org's `sender_domain` setting, not hardcoded
- Timezone: use dynamic DST-aware offset computation, never hardcode `-05:00` (see Timezone Handling section above)
- `agent_tasks` table has NO `updated_at` column (trigger was removed) — don't add one

## Edge Functions Deployed from Local Repo
invite-user, send-notification-email, pathway-webhook, agent-hemlane-parser, import-zillow-property, book-public-showing, test-integration, send-message, match-properties, generate-lead-brief, predict-conversion, agent-health-checker, process-email-queue, sync-resend-history, sync-leads-to-doorloop, agent-hourly-report, agent-rent-benchmark, send-application-invite, delete-lead, delete-user, verify-identity, extract-property-from-image, ai-chat, telegram-webhook
