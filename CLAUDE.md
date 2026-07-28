# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm install              # Required first — node_modules not in repo
npm run dev              # Vite dev server
npx vite build           # Production build
npm run typecheck        # tsc --noEmit -p tsconfig.app.json (this DOES exist)
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
**NEVER run `npx supabase db push`** — migration history is out of sync with Lovable. Use one of these (in order of preference):

1. **MCP Supabase tools** when available (`mcp__supabase__execute_sql`, `mcp__supabase__apply_migration`) — configured via `~/.mcp.json`.
2. **Fallback to Management API** — pull the token from `~/.mcp.json` so it never lives in this repo:
   ```bash
   SUPABASE_TOKEN=$(grep -oE 'access-token=sbp_[a-z0-9]+' ~/.mcp.json | cut -d= -f2)
   curl -s -X POST "https://api.supabase.com/v1/projects/glzzzthgotfwoiaranmp/database/query" \
     -H "Authorization: Bearer $SUPABASE_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query": "YOUR SQL HERE"}'
   ```
3. **Last resort: SQL Editor** at https://supabase.com/dashboard/project/glzzzthgotfwoiaranmp/sql/new — only if neither of the above works.

After pushing to GitHub, remind the user to trigger a Lovable rebuild if the live site needs updating.

## Working Style
- **Always execute actions yourself.** Run commands (deploy, build, push) immediately — never tell the user to do it.
- The user only acts when something truly requires their manual intervention (e.g., Supabase Dashboard UI, Lovable rebuild).

## Workflow Shortcuts
- **"go"** — Commit all changes with a descriptive message and push to origin. No asking.
- **"lovable"** — `git pull` before doing anything else. No confirmation.
- **"md"** — Generate comprehensive project documentation. Check `md/` (project root) for existing `PROJECT_COMPLETE_Rent_Finder_Cleveland_MD*.md` files, increment the number. Use `PROJECT.md` as source of truth. Also copy to `PROJECT.md` in repo root. No confirmation.

## Project Overview
AI-powered lead management SaaS for property management. Automates the rental lead lifecycle: inbound emails → AI lead processing → lead scoring → follow-ups → showings → applications. Currently runs as a **single tenant on a single domain** (rentfindercleveland.com), while the multi-tenant plumbing (`organization_id` + RLS) is retained as defense-in-depth.

### Reorientation (2026-06-29)
- **Single-domain focus**: only `rentfindercleveland.com`. HomeGuard & Portafolio removed from product scope (the legacy "3 apps / 3 domains" model is historical/aspirational). The 10DLC/SMS legal text referencing those brands is flagged for separate legal review; functional `homeguard.app.doorloop.com` DoorLoop URLs are retained because they are the live apply portal, not the brand.
- **Single-tenant consolidation** (not a destructive collapse): exactly one organization ("Rent Finder Cleveland", slug `rent-finder-cleveland`). `organization_id` columns and RLS policies stay as defense-in-depth.
- **Doc drift corrected**: 6 canonical agents / 4 departments, voice fully removed. (DB counts as of that date were 67 tables / 291 RLS / 77 functions / 33 triggers — see the Tech Stack section above for the current, verified numbers.)
- **Security hardening in progress**: users self-update privilege-escalation blocked via trigger; `send-message` now authenticates callers; `joseph_compliance_check()` calls fixed to fail-closed. (The scoring RPCs mentioned here historically were dropped outright in the 2026-07-26 demolition.)

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, shadcn/ui (mandatory for all UI)
- **Backend**: Supabase (PostgreSQL) — **71 tables, 166 RLS policies, 96 DB functions, 37 triggers, 1 view** (counts verified against production 2026-07-28)
- **Edge Functions**: Deno (not Node.js) — **55 functions in `supabase/functions/`, all deployed**. Production also has **2 orphans that are NOT in the repo**: `persona-webhook` and `verify-identity`, leftovers from the retired Persona integration — candidates for deletion, do not redeploy.
- **Auth**: Supabase Auth — roles: super_admin, admin, editor, viewer, leasing_agent
- **Font**: Montserrat
- **Design colors**: Primary #4F46E5 (indigo), Accent #ffb22c (gold), Background #f3f4f6 (cool gray). iOS 26 glass aesthetic.

## Architecture

### Multi-Tenancy
Every table has `organization_id`. All RLS policies scope by user's org. **Never query without org context.** Never hardcode org-specific values — use `organization_settings` table.

### Domain (Single-Domain Consolidation)
The product now runs on a **single domain**: `rentfindercleveland.com`. The historical "3 apps / 3 domains on 1 DB" model (which also listed homeguardmanagement.com and portafoliodiversificado.com) is no longer in product scope — those brands have been removed. Still use `window.location.origin` for URLs and org settings for sender domains; never hardcode domain names (this keeps the code multi-domain-safe even though only one domain is active).

### Code Patterns
- **Exports**: Components use named exports (`export const X`). Pages use `export default` (required for React.lazy).
- **Imports**: Double quotes dominant. File-level consistent.
- **Toast**: Import from `@/hooks/use-toast` directly. Sonner (`toast` from `"sonner"`) also available — both Toasters mounted in App.tsx.
- **Edge functions**: Use raw `fetch` for streaming; otherwise `supabase.functions.invoke()`.
- **Email sending**: All frontend emails queue by default via `sendNotificationEmail()` in `src/lib/notificationService.ts` (respects Resend rate limits). Only set `queue: false` for test emails.
- **Data fetching**: `@tanstack/react-query` (v5) used across ~33 locations. QueryClient provided in App.tsx.
- **lucide-react `Map` icon**: Always import as `Map as MapIcon` — bare `import { Map }` shadows the native `Map` constructor and causes `TypeError: Map is not a constructor` at runtime.

### AI Agents (Biblical Names)
**6 canonical agents in 4 English departments** (source of truth: `src/components/agents/constants.ts`). Voice/SMS-call agents and Ruth (SMS) are removed — SMS automation will be replaced by n8n.
- **Qualification** (`calificacion`): **Aaron** = "Inbound Lead Processing" (EMAIL-based, not calls); **Esther** = "Email Reception" (`agent-hemlane-parser`); **Nehemiah** = "Qualification Analyst" + sole task dispatcher (`agent-task-dispatcher`; absorbs scoring, transcript analysis, conversion prediction, insights, reports, notifications).
- **Leasing**: **Elijah** = "Leasing Consultant" (outbound/campaigns/recapture/welcome).
- **Closing** (`cierre`): **Samuel** = "Closing Agent" (showings, applications, DoorLoop pull, no-show/post-showing).
- **System** (`sistema`): **Zacchaeus** = "Health & Cost Monitor".

**Legacy → canonical mapping** (`LEGACY_TO_CANONICAL`): Daniel/Isaiah/Solomon/Moses/David → Nehemiah; Ezra → Samuel. **Deborah removed**, **Ruth removed**.

**Joseph is NOT a department agent** — it is the `joseph_compliance_check()` DB RPC (TCPA / Fair-Housing gate).

**Utility functions**: joseph_compliance_check(), send-notification-email, send-message, match-properties, generate-lead-brief, predict-conversion, book-public-showing, process-email-queue
**Webhook**: Esther (agent-hemlane-parser — Hemlane/Resend email parser)

### Lead Status Flow
new → contacted → engaged → nurturing → qualified → showing_scheduled → showed → in_application → converted (any → lost)

### Compliance (Non-negotiable)
- **Fair Housing Act**: Scoring NEVER uses race, religion, sex, familial status, disability, age, or proxies
- **TCPA**: All outbound contact requires prior consent. Outbound paths call `joseph_compliance_check()` DB function before contact (calls now fail-closed). Outbound is SMS/email only — no voice.
- **Consent logging**: Every consent action recorded in `consent_log` table with evidence text

### Human Takeover System
Leads can be taken under manual control, pausing all AI automation. Requires mandatory 20-char reason note. `pause_lead_agent_tasks()` RPC pauses all pending agent_tasks.

### Key Database Tables
- `organizations` — Multi-tenant core with branding, subscription
- `organization_credentials` — Per-org API keys (Twilio SMS, OpenAI, Resend, DoorLoop, Telegram ×4 bots)
- `organization_settings` — Per-org config (key/value with category)
- `leads` — Core records with scoring, status flow, human control flags
- `agent_tasks` — Scheduled AI actions (columns: `agent_type`, `action_type`, `status`)
- `campaigns` — Email blasts. Queue rows by SQL: campaign `paused` → `INSERT…SELECT` into `email_events` (status `queued`) → flip to `in_progress`. ⚠️ **`max_per_hour` is DEAD CONFIG — no code reads it.** Real pacing = `BATCH_SIZE` in `process-email-queue` (× the 1/min cron); `send_delay_seconds` can only slow a campaign down, never speed it up. ⚠️ `sent_count` only counts rows still in status `sent`, so it collapses as Resend webhooks flip them to `delivered` — a low number is NOT a failed send
- `consent_log` — TCPA compliance evidence
- `email_events` — Email queue + delivery tracking (details JSONB with `status: "queued"/"sent"/"failed"`)
- `cost_records` — Per-interaction cost attribution

### External Services
- **Twilio**: SMS only (credentials in organization_credentials, phone in twilio_phone_number; also `fetch-twilio-messages`). Voice has been fully removed.
- **OpenAI**: Scoring, analysis, insights (GPT-4o-mini for briefs, GPT-4o for vision)
- **Resend**: Transactional email (webhook secret: RESEND_WEBHOOK_SECRET, queue via process-email-queue)
- **DoorLoop**: Application/lease sync

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
- **There is NO lead scoring (demolished 2026-07-26)**. `leads.lead_score`, `leads.is_priority`, `leads.priority_reason`, the `lead_score_history` table and the whole milestone engine (`compute_milestone_score`, `apply_milestone_score`, `recalculate_lead_scores`, `log_score_change` + 10 legacy RPCs) were **DROPPED**. Verified 2026-07-28: 0 of those columns and 0 of those functions exist. Do not reintroduce them, and do not write code that selects `lead_score` — the pre-demolition build still does, which is why the panel's Leads/Nurturing are broken until the next Lovable rebuild. Funnel/analytics are computed from **facts** instead: `showings` rows (booked / showed) and `leads.applied_at` (applied).
- Edge functions use Deno imports (`https://deno.land/std@0.168.0/`, `https://esm.sh/`)
- For cron-triggered agents, DB settings `app.settings.supabase_url` and `app.settings.service_role_key` must be set
- Emails: sender domain should come from org's `sender_domain` setting, not hardcoded
- Timezone: use dynamic DST-aware offset computation, never hardcode `-05:00` (see Timezone Handling section above)
- `agent_tasks` table has NO `updated_at` column (trigger was removed) — don't add one

## Edge Functions (55 in repo, all deployed — verified 2026-07-28)
agent-daily-report, agent-doorloop-pull, agent-doorloop-push, agent-health-checker, agent-hemlane-parser, agent-hourly-report, agent-rent-benchmark, agent-sheets-backup, agent-task-dispatcher, ai-chat, book-public-showing, capture-lead, check-coming-soon, delete-lead, delete-user, enhance-report, extract-property-from-image, generate-all-investor-reports, generate-investor-report, generate-lead-brief, generate-property-description, hemlane-photo-import, hemlane-sync-listings, import-zillow-property, invite-user, leasing-report-pdf, leasing-tracker-lookup, manage-org-credentials, match-properties, paip-chat, predict-conversion, process-email-queue, reconcile-inbound-emails, resend-webhook, resolve-lead-token, send-application-invite, send-message, send-notification-email, send-telegram-notification, showing-reminder, showings-ics, submit-application, submit-business-lead, submit-demo-request, submit-inquiry, sync-leads-to-doorloop, sync-resend-emails, sync-resend-history, telegram-clean-chats, telegram-notify, telegram-webhook, test-integration, track-property-view, trigger-referral-campaign, unsubscribe

⚠️ **Deployed but NOT in the repo** (orphans from the retired Persona integration): `persona-webhook`, `verify-identity`. Candidates for deletion; do not redeploy.

⚠️ Functions named in older docs that **no longer exist**: `pathway-webhook`, `agent-system-analysis`, `fetch-twilio-messages`, `process-sms-queue`, `recalculate-scores`.

**After deploying, verify the result by reading the deployed source** (`mcp__supabase__get_edge_function`), not the CLI's success message.
