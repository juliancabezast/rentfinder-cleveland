# PROJECT COMPLETE — Rent Finder Cleveland

> **⚠️ 2026-07-20:** Persona y MaxMind fueron RETIRADOS por completo (funciones borradas, columnas dropeadas, UI depurada). Las menciones más abajo son históricas.
## Version 18 | July 20, 2026

> Supersedes **MD17** (Jul 19, 2026 — renter marketplace pivot + Hemlane lead-gen + Telegram ops). This snapshot records the two-day arc that followed: the **scoring system was proven fake and replaced with a facts-only milestone engine**, lead-count definitions were unified, the **Reports + Costs pages were merged into one honest Analytics page**, the **Agents Control Center was purged of dead/fake infrastructure and rebuilt as a real-time 3D pipeline funnel**, **Persona + MaxMind were retired**, and the **admin dashboard was rebuilt as a live, animated dashboard**. MD17's product/schema/roles reference is retained below unchanged.

---

## A. Headline — what changed since MD17

1. **Scoring was fake; now it's facts.** A 19-agent forensic audit confirmed the old `lead_score` was noise (a sawtooth cron, completeness echo, 87.8% of scores in 3 values, AUC 0.833). Replaced by a **milestone engine**: `lead_score ∈ {0,10,50,80,100}` = MAX of what actually happened (0 normal · 10 intentó · 50 agendó · 80 asistió · 100 aplicó). The DB is the only writer (triggers on `showings`/`leads.status`); `log_score_change` neutralized. The "Great Demotion" took 18,111 leads → **109 real hot** (`is_priority = score≥50 AND not lost`). Hot Telegram triggers DISABLED by owner decision.
2. **One definition of "leads".** Six coexisting count definitions (17,446 "complete" / 18,111 total / 18,077 active / a 5,000-cap bug …) unified to **TOTAL everywhere** per owner; the hidden completeness filter was removed from LeadsList/Reports/funnel; `lead_counts()` RPC is the single source of truth.
3. **Analytics = Reports + Costs merged.** One `/analytics` page (6 tabs, URL-synced global filters). Killed the fake metrics ($0.09 AI-spend was a 1000-row PostgREST cap of the real $0.40; $1,000 pipeline value = 1 lead; 0% conversion forever; snapshot-funnels). New honest panels: milestone funnel, per-campaign email performance, real bounce rate, first-response median, estimated channel costs. Backed by `analytics_*` RPCs.
4. **Agents rebuilt.** Purged dead agents (Aaron, Ruth), ghost crons (isaiah/luke/sync-costs/boaz), and **all SMS**; deleted 12 edge functions; fixed Samuel's 100%-dead showing confirmations (`call`→`email`). `/agents` is now a **real-time 3D pipeline funnel** (react-three-fiber; planet-per-stage cosmos with the Milky Way, live particles + shockwaves on agent activity, 2D SVG fallback), fed by `agents_live_status()` + realtime.
5. **Persona + MaxMind retired** (identity verification + geo-IP removed): edge functions deleted, columns dropped, UI/health/test surfaces cleaned.
6. **Live admin dashboard.** `/dashboard` rebuilt: 4 merged KPI cards (Leads / Showings / Portafolio / Emails), a redesigned Next-Showings timeline, animated numbers + floating "+N" on realtime events, a Task-Queue **forecast** ("~N salen en la próxima hora · cola vacía en ~Xh"), the greeting moved into the top header, brand set to "Rent Finder" + favicon logo, and the global focus ring removed.

---

## B. Milestone scoring v1 (the truth)

- **Model**: `compute_milestone_score(lead)` = GREATEST(status→100 for in_application/converted, MAX showing CASE). Showing CASE: completed→80, no_show→10, scheduled/confirmed→50, else→10; leads status ladder mirrored. `apply_milestone_score()` writes `lead_score`/`is_priority`/`priority_reason` + one honest history row (`triggered_by='milestone_engine'`, reasons `milestone_normal|intento|agendo|asistio|aplico`).
- **Triggers**: `trg_milestone_showings` (AFTER INSERT/UPDATE OF status on showings), `trg_milestone_leads`, `trg_milestone_leads_ins`.
- **Dead code removed**: scoring crons, regex/keyword boosts, `agent-scoring` edge fn (deleted — note it was **resurrected once by an external Lovable redeploy**; re-verify after every rebuild), `agent-hemlane-parser` intent boosts.
- **The ladder is duplicated** in `compute_milestone_score`, `recalculate_lead_scores` LATERAL, `ScoreDisplay.getMilestoneLabel`, and ScoringTab `MILESTONES` — change all together.
- Migrations `20260719190544_milestone_scoring_v1` + `20260719192422_v1_1_review_fixes` (the critical bug: `'confirmed'` showing status fell through ELSE→10, demoting 50→10 on confirm; caught by 3 independent review finders).

## C. Unified lead counts

- `lead_counts(p_org)` → `{total, active, applicants, hot, incomplete, lost}` = `{18111, 18077, 61, 109, 663, 34}` at ship. Predicates: `is_demo IS NOT TRUE`; active = NOT IN (lost, converted); hot = `is_priority`; incomplete = name/phone/email NULL.
- Completeness filter removed from LeadsList, Reports, AdminDashboard, `get_lead_funnel`. `useDashboardAnalytics` `.limit(5000)` cap bug fixed. Demo predicate standardized `.eq("is_demo",false)` → `.not("is_demo","is",true)`. Migration `20260719201932_unified_lead_counts_total`. Commit `5b9f16c`.

## D. Analytics page (Reports + Costs → `/analytics`)

- **Route**: new `src/pages/analytics/Analytics.tsx` (editor+); `/reports/*` and `/costs` redirect in. Tabs: Resumen · Pipeline & Fuentes · Propiedades & Showings · Email & Campañas · **Costos & Sistema (admin+)** · Informes. Global filter bar (date presets in Cleveland TZ, source, property) URL-synced; `tab` param sanitized per-user perms.
- **RPCs** (`SECURITY DEFINER`, org from `auth.uid()`, TZ NY, demo-excluded): `analytics_overview`, `analytics_time_series`, `analytics_email_campaigns` (email aggregated on `details->>'status'`, never the junk `event_type`; per-campaign join `campaigns.id::text = details->>'campaign_id'`). v1.1 fixes: first-response also matches `recipient_email` (lead_id sparse), avg-score scored-leads-only, `attempted` denominator.
- **Deleted**: Reports.tsx, CostDashboard.tsx, useReportsData, useDashboardAnalytics, useCostData, LeadFunnelCard; the Costs tab inside `/agents`.
- Design: zero purged `hsl(280…)`; indigo/gold tokens; charts `role="img"`. Migrations `20260720013237` + `20260720020054`. Commit `3978bf9`.

## E. Agents v2 — purge + 3D funnel

- **The real-vs-fake table (7-day evidence)**: alive = **Elijah** (welcome-email drain), **Esther** (inbound parser + reconcile + doorloop-pull), **Nehemiah** (the dispatcher; heartbeat added), **Samuel** (Telegram reminders; confirmations fixed), **Zacchaeus** (hourly health). Dead → removed: **Aaron** (0 execs ever), **Ruth** (SMS, last Mar 12), ghost crons (isaiah/luke → `investor_insights` 0 rows ever; sync-costs no-op; boaz inactive; habakkuk dormant).
- **Purge** (mig `20260720055247` + `20260720062943`): 8 crons unscheduled (22→14); `habakkuk_check_alerts` rewritten to insert `notifications` with working dedup; **Samuel P1**: `schedule_showing_confirmations` `call`→`email` (291/291 were auto-cancelled); anti-wave dedup on the priority trigger; `claim_pending_tasks` claims notifications first + LEFT JOIN (lead-less tasks claimable); bulk-cancelled 566 pending + 494 failed notify tasks + dead-branch tasks; registry 7→5; `integration_health` minus bland/twilio; **realtime publication was empty for leads/agent_tasks/agent_activity_log** (every "live" panel in the app was silently dead) → ADD TABLE.
- **Dispatcher/health-checker** redeployed: BATCH 40/DELAY 300 (drain accelerated), cancel-on-sight guard (call/sms/dead types/unroutable notifications), all Bland/Twilio/SMS paths removed, Nehemiah heartbeat, per-org counters.
- **12 edge functions deleted** from prod: `agent-scoring` (zombie), `process-sms-queue`, `agent-sms-inbound`, `fetch-twilio-messages`, `pathway-webhook`, `agent-notification-dispatcher`, `agent-conversion-predictor`, `batch-predictions`, `agent-insight-generator`, `agent-report-generator`, `agent-paip-assistant`, `agent-system-analysis`. Repo dirs + 12 `config.toml` blocks purged. SMS tab removed from Campaigns.
- **`agents_live_status()`** (mig `20260720060403`): one JSON — per-agent live health/tasks/activity, funnel stage counts, 24h flows, queue depths, integrations. Polled 15s.
- **The page** (`src/pages/agents/AgentsPage.tsx` + `components/agents/funnel/*`): `three@0.171 + @react-three/fiber@8.18 + @react-three/drei@9.122` (**pinned for React 18 — v9/v10 need React 19; never `npm update` these majors**) + `@react-three/postprocessing@2`; lazy `vendor-three` chunk (~227KB gz, loads only on /agents). Cosmos: Milky Way backdrop + procedural gas-giant planet textures (canvas, zero CDN), fresnel atmospheres, Saturn rings, Bloom. On agent activity: expanding shockwave ring + elastic pop + emissive spike + fast particle burst down the edge (red on failure). Centered camera sway. 2D SVG fallback (no-WebGL / reduced-motion). Glass detail panels; labels hidden while a panel is open. Deleted 11 old agent components + `SystemLogs.tsx`. Commits `25f370f`, `a94c5f9`, `06ad972`, `0e9cba1`, `b667d85`, `f81799f`.

## F. Persona + MaxMind retired

- Edge functions deleted (`verify-identity`, `persona-webhook`); 4 columns dropped; UI/health-checker/test-integration/docs cleaned; types regenerated. `PERSONA_WEBHOOK_SECRET` pending item CANCELLED. Do not reintroduce. (Landed via the other session's Lovable auto-commit `0e43f8e`; documented in memory `persona-maxmind-retired`.)

## G. Live admin dashboard + Task-Queue forecast

- **`dashboard_live()`** (mig `20260720160921` + v1.1 `20260720162645`): one JSON `{leads, showings, portfolio, comms, next_showings}`, org from `auth.uid()`, TZ NY day/week, demo excluded; `ALTER PUBLICATION … ADD showings`.
- **`useDashboardLive`**: poll 10s + realtime (leads INSERT, showings *, agent_activity_log INSERT, agent_tasks UPDATE) → debounced invalidate + LIVE blink. `LiveNumber` tweens on every change (starts from the currently-shown value); `LiveKpiCard` floats a "+N" (poll-delta as the single source, no double-count). 19-agent review fixes: isLoading gates first-load only (RPC error keeps last-good data + banner), channel topic per-org, prevRef reset on org change, per-flash timers cleared on unmount, throttled blink.
- **4 merged hero cards**: Leads (⊕ this-week ⊕ hot), Showings (⊕ show-up% ⊕ applicants), Portafolio (Total Doors ⊕ Available), Emails. Removed: Hot-Awaiting-Contact, Uncontacted-Backlog, Lead-Response-Time, Leads-From-Email, SMS-Sent.
- **Next Showings** timeline (Cleveland TZ Hoy/Mañana), replaces the Nurturing widget, capped at 5.
- **Task Queue "Pronóstico"** (mig `20260720170134` `task_queue_insights()`): "~N salen en la próxima hora" (min of due & real throughput), "cola vacía en ~Xh a ~N/h" (ETA from last-hour throughput, fallback today's average), composition line; "al día" when empty.
- **Brand**: Sidebar + MainLayout → `/favicon-96.png` + "Rent Finder" (dropped "Cleveland" / org name). Greeting moved into the top header (compact variant, replaces "Dashboard" title). **Global focus ring removed** system-wide. Commits `0e43f8e`, `42a55b2`, `dcc59cb`, `f81799f`, `0067c61`, `40b7cc7`.

## H. Schedule-showing audit (why "Shawanda was invisible")

- Root cause: `booked_by` FK pointed at `public.users.id` but the value was `auth.users.id` — admin bookings had been dead ~16 days; plus the lead picker capped at 10k while she ranked 15,772. Both fixed (`userRecord.auth_user_id`, uncapped search via `src/lib/leadSearch.ts` with sanitized `.or()` grammar). 726 duplicate leads merged (18,837→18,111) via `merge_leads`; 134 risky groups held for manual review. E.164 normalizer + normalized dedup trigger added. Commits `0977628`/`822044c`/`29f8db0`/`c190e43`.

---

## I. New / changed DB objects (this snapshot)

**RPCs added**: `lead_counts`, `analytics_overview`, `analytics_time_series`, `analytics_email_campaigns`, `agents_live_status`, `dashboard_live`, `task_queue_insights`, `compute_milestone_score`, `apply_milestone_score`, `recalculate_lead_scores` (repurposed). **Rewritten**: `habakkuk_check_alerts`, `schedule_showing_confirmations`, `claim_pending_tasks`, `auto_task_priority_notification`, `get_lead_funnel`, `log_score_change` (no-op). **Realtime publication** now includes `leads, agent_tasks, agent_activity_log, showings`. **Migrations** (Jul 19–20): 154207, 154358, 190544, 192422, 201932, 055247, 060403, 062943, 013237, 020054, 160921, 162645, 170134.

**Edge functions deleted (−12)**: agent-scoring, process-sms-queue, agent-sms-inbound, fetch-twilio-messages, pathway-webhook, agent-notification-dispatcher, agent-conversion-predictor, batch-predictions, agent-insight-generator, agent-report-generator, agent-paip-assistant, agent-system-analysis, verify-identity, persona-webhook (14 total incl. Persona/MaxMind). Registry 7→5. Crons 22→14.

## J. Live statistics (2026-07-20)

| Metric | Value |
|---|---|
| Leads (total, non-demo) | 18,112 |
| Hot (is_priority, score≥50) | 109 |
| Milestone dist {0,10,50,80,100} | 17,969 · 29 · 7 · 45 · 61 |
| Applicants (in_application) | 61 |
| Showings (resolved show-rate) | 78 · 80.7% |
| Properties (doors / distinct) | 107 / 67 · 44% occupied |
| Email events (bounce all-time) | 38.7k · 19.1% |
| agent_tasks (completed/pending) | 18k+ / ~1.1k pending (draining) |
| Edge functions | −14 deleted this arc |

## K. Pending / follow-ups (owner-blocked)

- **🔴 Lovable rebuild** — ALL of the above frontend only reaches the live site after a rebuild. **After the rebuild, re-verify the 14 deleted edge functions did not resurrect** (`agent-scoring` came back once via an external redeploy).
- 134 duplicate-lead groups held for manual review.
- Telegram funnel v3 (parallel session) — deployed, ownership shared.
- Legal 10DLC "HomeGuard" review; n8n inbound-SMS confirmation.
- The welcome-email backlog (~1.1k) drains itself at ~480/h (owner chose drain-accelerated over cancel).

---

## Version 17 | July 19, 2026

---

# MD17 — Renter Marketplace Pivot + Lead-Gen Engine + Telegram Ops (2026-07-19)

> This snapshot supersedes MD16 (June 29, 2026). MD16 recorded the single-domain reorientation and the security "saneamiento" plan. The three weeks since have been the most productive stretch of the project: the product **pivoted from a SaaS-first surface to a renter-facing marketplace**, a **Hemlane-fed lead-generation engine** was built and loaded (4k → ~18.8k leads), the **showings + Telegram operations layer** was rebuilt into an interactive control surface, and the saneamiento audit findings were shipped. The full MD16 reference (agents, schema, roles, compliance) is retained below unchanged; this section records what moved.

## A. Headline — what changed since MD16

1. **Renter marketplace is now the front door.** `/` is a renter marketplace homepage (hero, faceted filter bar, Section-8/voucher-first CTAs); the SaaS/admin app moved to `/saas` + role-gated routes. New public renter surfaces: property detail (`/property/:id` and `/p/property/:id`), marketplace application flow (`ApplicationDialog` → `submit-application`), public showing booking with deep-link prefill + attribution.
2. **SEO/GEO content hub.** 342 static renter articles + 3 pillars under `public/` targeting "Houses For Rent in Cleveland OH", Fair-Housing-gated, plus a B2B repositioning (Housing Partners / Corporate Leasing) and `business_leads` capture. Sitemap index + `llms.txt` + AI-crawler `robots.txt`.
3. **Hemlane lead-gen engine.** Public Hemlane GraphQL sync (73 units + ~954 re-hosted photos), a daily `ownerListings` re-sync cron, a rebuilt **Esther** inbound-email parser (persist-first ingestion, shell leads, reply loop, reconciliation cron, hardened dedup/merges), and a **bulk load of 14,768 Hemlane leads** (from 60 xlsx / 23,651 rows → ~15,291 unique) with a **city-tag** taxonomy (Cleveland 8,618, Detroit 3,597, STL 937, Elyria 778, Milwaukee 531, East Cleveland 159, Akron 18).
4. **Multi-property TAG model.** `interested_property_id` (single-column axis) was **dropped**; leads now carry multiple `lead_property_interests` tags with recency. Every property-touch surface (parser, booking, heat map, tracker) reads tags.
5. **Showings rebuilt.** Single-flow availability calendar (calendar "+", drag-range to open times, Monday-start week, measured now-line), a **single-agent time-blocking booking model** (a booked time blocks that slot across all properties — the double-booking guard is load-bearing), and `coming_soon` = **VISIBLE but NOT bookable** (bookable = `['available']` only), enforced in RLS + 4 edge fns + frontend guards.
6. **Telegram operations layer (2–3 bots).** RFC "report" bot + Showings "hot leads" bot + interactive LeasingAgent scheduling bot. Interactive "agendar showing" state machine, hot-lead call-now cards, showing-report flow (attendance + notes + photo + AI enrich + PDF), daily/hourly digests, and — as of this snapshot — **automated 🆕 new-lead + 🔥 hot-lead alerts** for Hemlane paired-email leads (see §F).
7. **Mass-email campaign engine.** Compliant batched pipeline (`campaigns` → `email_events` queued rows → `process-email-queue` cron → Resend, auto-bounce-suppression, per-recipient unsubscribe HMAC + prefill token). Ran weekend blasts (2,310 CLE + 777 MKE; later an 11,032-recipient Cleveland/EC/Akron blast at ~3,000/hr, 91% delivered, 0 spam complaints).
8. **Saneamiento shipped.** The MD16 audit findings + two further sweeps (23-issue + 18-finding) were fixed and deployed: profiles/users privilege-escalation closed at policy level, edge-auth gates, TCPA/CAN-SPAM, fail-closed compliance. RLS consolidated for performance.

## B. Live statistics — MD16 → MD17 delta

| Metric | MD16 (Jun 29) | MD17 (Jul 19) | Note |
|--------|---------------|---------------|------|
| Organizations | 1 | 1 | Single tenant ("Rent Finder Cleveland", `rent-finder-cleveland`) |
| **Leads** | ~4,066 | **18,836** | +14,768 from the Hemlane bulk load, city-tagged |
| Properties (total / available) | — | **107 / 37** | multi-unit; `coming_soon` visible-not-bookable |
| **Tables** | 67 | **71** | +business_leads, lead_reminders, telegram sessions, inbound_emails, etc. |
| **DB functions** | 77 | **92** | scoring, tagging, timezone, reconcile helpers |
| **Triggers** (rows) | 33 | **~42** | incl. `lead_became_priority`, tag helpers |
| **RLS policies** | 291 → 254 | **163** | perf consolidation (fewer, combined policies) |
| **Edge functions** (deployed) | ~36 | **67** | repo↔prod parity maintained |
| Build | Vite, 0 errors | Vite, 0 errors | `npx vite build` is the TS check |

## C. Major workstreams (Jul 1–19)

**Renter marketplace & homepage** — `daefa7b` marketplace homepage; `216ea3b` full overhaul (3.3MB hero video, sticky faceted filter bar, coming-soon ribbon, voucher CTAs, self-hosted brand assets); `b36b426` mobile-first (bottom-sheet filters); `4c43d40`/`4da26f9` City filter (Cleveland default) + evenly-distributed filter pills; public property detail page; `submit-application` marketplace flow + `intake_preferences`.

**SEO / content / B2B** — `eb8fff4` 342-article content hub + GEO/SEO; `4a5f9fc` PM→"local rental team" repositioning + 85 B2B articles; `2721205` llms.txt Housing Partners/Corporate Leasing; `business_leads` + `submit-business-lead` + `/business`.

**Hemlane pipeline & Esther** — `b4b343d` multi-host photo-import edge fn; `5623eb8` daily ownerListings re-sync; `240a423` rent-benchmark anchored on real Hemlane medians; `477623a` + `0079ccc` Esther tier-b overhaul (persist-first `inbound_emails`, shell leads, reply loop `reconcile-inbound-emails` + cron); bulk load of 14,768 leads + city tagging.

**Lead tag migration** — `ca98078` multi-property tag model; `ea07723` `interested_property_id` GONE (verified live, bundle-hash match).

**Showings & calendar** — `8d60c6d` single-flow availability calendar + status gate; `d73d2a6` drag-range open; `0c86c9f` Monday-start + booked-cell names; `c77e42e`/`c295711` open-cell city checkboxes reflect real state; `421519f` admin books any half-hour/any date; `coming_soon` = visible-not-bookable across RLS + edge fns.

**Telegram ops** — `dbf6096` more reports on 2 bots + live Google Sheets sync; `9754a25` interactive showing-scheduler bot + hot-lead call cards; `4a6605d` leasing-report PDF + email confirmation + tappable phone; `56003a5` LeasingAgent-bot alerts + custom day/time; `4092418` Hot Leads actions + next-day reminders + agenda quick-SMS + showing reports; `4f24a27` showing-report picker/photo fixes; `33a0cca` **new-lead + hot-lead alerts fire for Hemlane paired-email leads** (this snapshot).

**Dashboards & analytics** — `7419618` real-data heat map overhaul + communications hub; `8850cd5` honest categorized stat chips + live task queue + bounce suppression; `88c7c4a` uncapped 1000-row widgets + multi-date agenda banner.

**Leasing Tracker** — `612f9eb` public owner-facing tracker (grouped buildings, open slots, de-identified agent comments, ES/EN); `a6210f1`/`d94de78` PII redaction + recent-interest metric + open-agenda banner; `leasing-tracker-lookup` comment date now `scheduled_at` (not `completed_at`).

**Booking funnel** — `973f288` removed conversion-killers (optional consent, deep-link prefill via `resolve-lead-token`, attribution, lead-time date filter); `showing_lead_time_minutes` 1440→180; Resend open/click tracking on; confirmation-email 401 outage fixed (internal edge→edge must use raw fetch with service key in both `Authorization` and `apikey`).

**Security** — `29696af` self role-escalation closed at policy WITH CHECK on users/profiles; `efe8cd4` publish-gate findings (definer view + RLS id joins); RLS perf consolidation (254→163).

## D. Edge functions (67 deployed — repo↔prod parity)

Notable additions since MD16: `agent-conversion-predictor`, `agent-doorloop-pull`/`-push`, `agent-insight-generator`, `agent-notification-dispatcher`, `agent-report-generator`, `agent-scoring`, `agent-sheets-backup`, `batch-predictions`, `capture-lead`, `check-coming-soon`, `generate-investor-report`(+`-all`), `hemlane-photo-import`, `hemlane-sync-listings`, `leasing-report-pdf`, `leasing-tracker-lookup`, `manage-org-credentials`, `persona-webhook`, `reconcile-inbound-emails`, `resolve-lead-token`, `submit-application`, `submit-business-lead`, `submit-demo-request`, `submit-inquiry`, `telegram-notify`, `telegram-webhook`, `track-property-view`, `trigger-referral-campaign`.

The Telegram alert stack: **`telegram-notify`** (single service-role choke point; formats `new_lead`/`hot_lead`/`lead_reminder`/`hemlane_digest`/`showing_scheduled`; force-routes all per-lead events to the Showings bot; phone-gates lead cards) and **`telegram-webhook`** (interactive scheduling + showing-report state machine, per-bot session keys, owner allowlist).

## E. Compliance & data notes

- **Fair Housing / TCPA** unchanged in principle: scoring never uses protected classes; inbound listing inquiries log a `transactional_reply` consent basis (NOT marketing consent); `joseph_compliance_check()` fails closed.
- **City-tag taxonomy** replaces ZIP for audience building (user directive: "por ciudad, no por zip"; Elyria is its own city). Campaign audiences are city-scoped.
- **Featured-campaign rules** (memory): NEVER feature 13671 Euclid / Yorick / Whitcomb; ALWAYS pin Imperial Unit C, Westropp, Mount Auburn, Jeffries, 1361 E 45th, Dunlap. Campaign phone (440) 444-4737.

## F. This snapshot's change — Telegram new-lead/hot-lead fix (`33a0cca`)

New Hemlane leads weren't reaching Telegram. A 3-agent diagnostic found two causes, both fixed + deployed:
- **Parser (Esther):** Hemlane sends each inquiry as two emails (name-only shell, then the contact half), so the actionable lead lands as an UPDATE (`isNew=false`) and the 🆕 alert was skipped. `upsertLead` now returns `gainedPhone` + `finalName/Phone/Property`; a `notifyNewLead` helper fires on `isNew || gainedPhone` (and for extra leads).
- **Dispatcher (Nehemiah):** `handleNotificationDispatch` was a throwing stub, so `priority_lead` tasks (enqueued by the `lead_became_priority` trigger) never sent a 🔥 card. It now fetches the lead + top tagged property and posts `telegram-notify event:hot_lead` to the Showings bot (skips gracefully without a phone).
- **Behavior:** 🆕 for every new lead + 🔥 additionally for priority ones, both to the Showings bot. The 4 missed leads (Tylesha/Charlene 🔥, Richard/Gabrielle 🆕) were backfilled live.

## G. Known open items / standing flags

- **12,193 pending `welcome_sequence` tasks** (backlog from the Hemlane bulk load) — do NOT invoke the dispatcher manually (would blast welcome emails); confirm whether the sequence should run, pause, or be purged.
- **494 old `priority_lead` notify tasks are `failed`** (won't retry) — going-forward is fixed; historical backfill is optional.
- **`new_lead` 🆕 is Hemlane-only** — website/campaign new leads don't push a 🆕 card (hot_lead 🔥 IS source-agnostic via the dispatcher).
- **Frontend conversion-killers** partially open (deep-link CTA, prefill) pending further rebuild iterations.
- **Legal text** referencing legacy brands still flagged for separate review.
- **Edge-function duplication** (~45%, no `_shared/`) and Deno std version drift remain.

---

# MD16 — Reorientation to Single-Domain + System Saneamiento (2026-06-29)

> This snapshot supersedes MD15 (May 30, 2026). It records a strategic reorientation, the findings of a full system audit, and the sequential remediation ("saneamiento") plan now in progress. All factual sections below have been corrected to match the live database and code (6 agents / 4 departments, voice removed, real DB counts, single tenant).

## A. The Reorientation Decision

- **Single domain.** The product now targets **only `rentfindercleveland.com`**. The legacy "3 apps / 3 domains on 1 Supabase DB" model (which also listed `homeguardmanagement.com` and `portafoliodiversificado.com`) is historical/aspirational and out of product scope.
- **Brands removed.** HomeGuard Management and Portafolio Diversificado are removed from product scope. The 10DLC / SMS legal copy that still references those brands is **flagged for separate legal review** (not silently deleted). The functional `homeguard.app.doorloop.com` DoorLoop URLs are **retained** — they are the live apply/portal endpoints, not brand identity.
- **Single-tenant consolidation (non-destructive).** The database holds exactly **one organization**: "Rent Finder Cleveland", slug `rent-finder-cleveland`. This is a consolidation, not a collapse: every table keeps `organization_id` and all RLS policies remain active as defense-in-depth, so the multi-tenant plumbing can be re-activated later without a migration.
- **Voice is gone.** All Bland.ai / voice-call functionality is removed. Twilio remains for **SMS only** (plus `fetch-twilio-messages`).

## B. Audit Summary (June 2026)

**What works well**
- Core CRUD + dashboards + auth across 5 roles, build is clean (Vite, 0 errors).
- Email pipeline (queue → Resend → webhook), campaigns (email + SMS), public showing booking, DoorLoop sync, Telegram reporting, identity verification (Persona → MaxMind fallback).
- Multi-tenant RLS scaffolding is broad (291 policies) and storage buckets were hardened in MD15.

**Key broken / risky items by severity**

| Severity | Finding |
|----------|---------|
| **CRITICAL** | `users` self-update RLS allowed privilege escalation (a user could change their own `role`/`organization_id`). |
| **CRITICAL** | `send-message` edge function was effectively unauthenticated — any caller could send email/SMS on the org's behalf. |
| **CRITICAL** | `recalculate_lead_scores` / `log_score_change` granted `EXECUTE` to the `anon` role — anonymous score manipulation. |
| **CRITICAL** | `joseph_compliance_check()` call sites failed *open* — on error/exception the outbound contact proceeded instead of being blocked (dead compliance gate). |
| **HIGH** | Scoring audit trigger `prevent_direct_lead_score_update` is **DISABLED** — `lead_score_history` integrity is convention-only. |
| **HIGH** | Doc drift: docs claimed 11 agents / 6 Spanish departments, voice calls, and stale DB counts (32 tables / 131 RLS / 19 fns / 12 triggers) vs. real 67 / 291 / 77 / 33. |
| **HIGH** | Brand/domain hardcoding referencing HomeGuard/Portafolio in legal + email copy. |
| **MEDIUM** | DB performance: missing/duplicative indexes, unindexed FKs flagged by Supabase advisors. |
| **MEDIUM** | Source/schema drift: many tables (property_groups, campaigns, etc.) created via Management API, not in local migrations; edge-function code duplication (~45%, no `_shared/`). |
| **MEDIUM/LOW** | Build hardening (~40 `any` types), dual toast system, Fair-Housing prompt review, and a UI/UX live-test pass. |

## C. Sequential Remediation Plan (Phases 0–11)

Executed in strict order; each phase verified before the next begins.

| Phase | Name | Scope |
|-------|------|-------|
| **0** | Secrets + branch | Rotate/verify secrets, confirm token reads from `~/.mcp.json`, create a working branch. |
| **1** | Critical security | Block `users` self-escalation via trigger; revoke `anon` EXECUTE on `recalculate_lead_scores`/`log_score_change`; authenticate `send-message`; make `joseph_compliance_check` call sites fail-closed. |
| **2** | Docs / MD16 | Correct doc drift (this snapshot + CLAUDE.md + PROJECT.md): 6 agents/4 depts, voice removed, real DB counts. |
| **3** | Brand removal | Remove HomeGuard & Portafolio from product surfaces; flag their 10DLC/SMS legal text for legal review; keep functional DoorLoop `homeguard.app.doorloop.com` URLs. |
| **4** | Single-tenant consolidation | Confirm one org; keep `organization_id` + RLS as defense-in-depth; remove multi-domain assumptions from runtime. |
| **5** | High-sec + functional bugs | Enable/clean the score audit trigger, fix remaining auth/RLS gaps and functional defects. |
| **6** | Compliance / Fair-Housing | Re-verify TCPA consent gating and Fair-Housing scoring prompts; ensure no protected-class proxies. |
| **7** | DB performance | Add missing indexes, index unindexed FKs, remove duplicates per Supabase advisors. |
| **8** | Source / schema drift | Reconcile Management-API-created tables into migrations; reduce edge-function duplication. |
| **9** | Build hardening | Reduce `any` types, consolidate toast system, ensure clean `vite build` + lint + tests. |
| **10** | UI/UX live test | End-to-end live testing of the single-domain product across all 5 roles. |
| **11** | Final verify + deploy | Full verification, deploy edge functions, push, trigger Lovable rebuild. |

---

# Table of Contents

0. [MD16 — Reorientation to Single-Domain + System Saneamiento (2026-06-29)](#md16--reorientation-to-single-domain--system-saneamiento-2026-06-29)
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

## 1.2 Architecture (Single-Domain Consolidation)

The product runs as a **single tenant on a single domain**:
- **rentfindercleveland.com** — the only active domain (organization "Rent Finder Cleveland", slug `rent-finder-cleveland`).

**Historical note**: earlier snapshots described a multi-app model where three domains (rentfindercleveland.com, homeguardmanagement.com, portafoliodiversificado.com) shared one Supabase database. As of MD16 that model is **historical/aspirational** — HomeGuard and Portafolio have been removed from product scope. The multi-tenant plumbing (`organization_id` on every table + RLS scoping) is **retained as defense-in-depth**, so additional tenants/domains can be re-introduced later without a destructive migration.

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
| Voice/Bland.ai Removal | Complete | All call/voice/Bland.ai functionality removed from codebase (Twilio retained for SMS only) |
| Single-Domain Reorientation (MD16) | In Progress | Single domain (rentfindercleveland.com); HomeGuard & Portafolio removed from product scope; single-tenant consolidation (RLS retained as defense-in-depth) |
| System Saneamiento (MD16) | In Progress | Sequential 12-phase remediation (Phases 0–11): critical security, docs, brand removal, compliance, DB performance, schema drift, build hardening, live test |
| Documentation System | Complete | PROJECT.md (source of truth) + incremental snapshots (MD5-MD16) |

**Status**: Code complete. Undergoing single-domain reorientation and a sequential security/quality remediation (see top "MD16" section).

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
| **Edge functions (Deno TS)** | 35 local directories |
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
| **RLS Policies (verified, live DB)** | 291 |
| **Database Functions** | 77 |
| **Database Triggers** | 33 |
| **Database Enums** | 1 (app_role) |
| **SQL Migrations** | 28 (3,592 lines) |
| **Edge Functions (deployed total)** | 66 (35 from local repo + 31 Lovable-only) |
| **Edge Functions (local repo)** | 35 |
| **Organizations (tenants)** | 1 (Rent Finder Cleveland / `rent-finder-cleveland`) |
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
| **OpenAI** | Scoring, transcript analysis, insights, PAIp chat, AI Chat, Esther LLM parsing | Nehemiah (scoring/transcript/prediction/insights/reports via agent-task-dispatcher), ai-chat, agent-hemlane-parser, PAIp assistant |
| **Persona** | Identity verification before showings (primary) | verify-identity (primary provider); compliance gate is the `joseph_compliance_check()` DB RPC |
| **MaxMind** | Identity verification via minFraud risk scoring (Plan B) | verify-identity (fallback provider), test-integration, agent-health-checker |
| **Doorloop** | Application/lease status sync, prospect push | Samuel (pull, agent-doorloop-pull), sync-leads-to-doorloop (push), send-application-invite |
| **Resend** | Transactional email, queue processing, history sync | process-email-queue, send-notification-email, book-public-showing, sync-resend-history, sync-resend-emails, resend-webhook |
| **Twilio** | **SMS only** (voice removed) — campaign blasts + outbound messages | send-message, process-sms-queue, fetch-twilio-messages |
| **Gmail / Hemlane** | Parse Hemlane lead notification emails | Esther (Hemlane parser with LLM-powered extraction) |
| **Telegram** | On-demand reports, hourly activity updates, showing reminders | telegram-webhook, agent-hourly-report, showing-reminder, send-telegram-notification |

**Removed**: Bland.ai (AI voice conversations) and all voice-call functionality, plus Google Sheets backup. **Twilio is retained for SMS only** — voice has been fully stripped from the codebase. The `pathway-webhook` function remains in the repo only as a legacy Bland.ai reference and is not part of the active flow.

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

The live database has **77 functions** in the `public` schema. The most important ones are listed below.

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

## 5.4 Database Triggers (33 total)

The live database has **33 non-internal triggers**. The majority are `updated_at` row-stamp triggers across the 67 tables; the representative set below covers the core tables and the one business-logic trigger. The scoring audit trigger `prevent_direct_lead_score_update` exists but is **DISABLED** (see note).

### Updated_at Triggers (representative)
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

- **291 Row Level Security policies** (verified, live DB) across all tables (67 tables)
- **Multi-tenant scoping**: Every policy checks `organization_id = get_user_organization_id(auth.uid())`. Retained as defense-in-depth even though the system currently runs a single tenant.
- **Security Definer functions**: `get_user_role`, `get_user_organization_id`, `has_role`, `is_super_admin`, `is_admin`, `is_editor_or_above` called from within RLS policies
- **Programmatic deny_anon policies**: Sensitive tables deny all anonymous access
- **Privilege-escalation fix (MD16)**: `users` self-update is now blocked by a trigger so a user can no longer change their own `role`/`organization_id`; `anon` EXECUTE was revoked from `recalculate_lead_scores` / `log_score_change`.
- **Exception**: `demo_requests` allows anonymous INSERT for landing page form submissions
- **Exception**: `showing_available_slots` allows anonymous SELECT (restricted to `is_enabled = true AND is_booked = false`) for public scheduling page

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

**Enforcement note (MD16)**: This is **convention, not hard-enforced**. The audit-trail trigger `prevent_direct_lead_score_update` — which would force every `leads.lead_score` write through `log_score_change()` — is currently **DISABLED**. Until it is re-enabled, scoring changes should go through `log_score_change` / the `recalculate-scores` edge function by convention. (`anon` EXECUTE on these scoring RPCs was revoked in the MD16 security pass.)

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

The canonical agent model is **6 agents in 4 English departments** (source of truth: `src/components/agents/constants.ts`). Agents are implemented as Supabase Edge Functions (Deno). The local repository contains **35** edge function directories; combined with Lovable-only functions there are **66 deployed** in Supabase.

**Voice removed**: All voice/call agents and Bland.ai integration have been removed from the codebase. The system now operates via **email-based lead processing** (plus SMS via Twilio for campaigns). **Aaron is NOT a voice agent** — it is the email-based "Inbound Lead Processing" agent.

**Consolidation**: The older agent roster (Daniel, Isaiah, Solomon, Moses, David, Ezra, Deborah, Ruth, etc.) has been consolidated into 6 canonical agents. `LEGACY_TO_CANONICAL` maps the old keys: Daniel/Isaiah/Solomon/Moses/David → **Nehemiah**; Ezra → **Samuel**. **Deborah** and **Ruth** are removed (SMS automation to be replaced by n8n).

## 10.2 Active Agent Departments (6 agents / 4 departments)

### Qualification (`calificacion`) — 3 agents
| Biblical Name | Canonical Role | Edge Function | Purpose |
|--------------|----------------|---------------|---------|
| **Aaron** | Inbound Lead Processing | (email intake) | Processes inbound leads — **EMAIL-based, not calls**. Captures name/email/phone, hands off to qualification. |
| **Esther** | Email Reception | `agent-hemlane-parser` | Parses Hemlane lead notification emails with LLM-powered extraction (GPT-4o-mini), smart property matching, dedup. |
| **Nehemiah** | Qualification Analyst + sole dispatcher | `agent-task-dispatcher` | Orchestrates ALL pending tasks in `agent_tasks` (cron). **Absorbs** scoring, transcript analysis, conversion prediction, insights, reports, and notifications (the old Daniel/Isaiah/Solomon/Moses/David roles). Also dispatches campaign tasks. |

### Leasing — 1 agent
| Biblical Name | Canonical Role | Edge Function | Purpose |
|--------------|----------------|---------------|---------|
| **Elijah** | Leasing Consultant | `agent-recapture` (+ campaign paths) | Outbound contact: campaigns, recapture of dropped/disengaged leads, welcome sequences. |

### Closing (`cierre`) — 1 agent
| Biblical Name | Canonical Role | Edge Function | Purpose |
|--------------|----------------|---------------|---------|
| **Samuel** | Closing Agent | `agent-showing-confirmation` + `showing-reminder` + `agent-doorloop-pull` / `sync-leads-to-doorloop` | Full showing → application → close lifecycle: confirmation emails, no-show / post-showing follow-up, 30-min pre-showing Telegram reminder, and DoorLoop application/lease pull (the old Ezra role). |

### System (`sistema`) — 1 agent
| Biblical Name | Canonical Role | Edge Function | Purpose |
|--------------|----------------|---------------|---------|
| **Zacchaeus** | Health & Cost Monitor | `agent-health-checker` | Health monitoring of all services + cost tracking (cost function called by 16+ edge functions). |

**Joseph is NOT a department agent** — it is the `joseph_compliance_check()` DB RPC, a TCPA / Fair-Housing gate invoked before outbound contact (now fail-closed; see §10.5 and §11).

## 10.3 All 35 Local Edge Functions

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
| `sync-resend-history` | 234 | Resend email history sync (org-iterating; single active domain) |
| `telegram-webhook` | 140 | Telegram bot webhook for on-demand reports |
| `test-integration` | 357 | Test external service connections |
| `verify-identity` | 338 | Identity verification with Persona->MaxMind fallback |
| `process-sms-queue` | ~270 | SMS campaign worker mirroring process-email-queue (atomic claim-and-send via Twilio) |
| `resend-webhook` | 241 | Real-time Resend delivery-status handler with Svix signature verification |
| `fetch-twilio-messages` | — | Pull inbound/outbound Twilio SMS history (SMS only — no voice) |
| `generate-property-description` | — | AI-generated property listing copy |
| `send-telegram-notification` | — | Generic Telegram notification sender |

## 10.4 Showing Reminder System (NEW)

The `showing-reminder` edge function sends Telegram notifications 30 minutes before each scheduled/confirmed showing.

**Mechanism**:
- Cron job `samuel-showing-reminder-5min` invokes the function every 5 minutes
- Queries showings with `scheduled_at` in a 25-35 minute future window
- Groups by organization, checks for already-sent reminders via `system_logs`
- Uses a separate Telegram bot (route bot) configured via `telegram_route_bot_token` / `telegram_route_chat_id` org settings
- Message includes: property address, specs, rent, Section 8 status, lead name, phone, voucher/self-pay badge, Google Maps navigation link, call link

## 10.5 Compliance Gates

**Joseph Compliance Check** — the `joseph_compliance_check()` DB RPC (NOT a department agent). Outbound paths must pass this TCPA / Fair-Housing gate before execution. As of MD16 the call sites are **fail-closed**: on error/exception the contact is blocked rather than allowed through.

**Zacchaeus Cost Tracking** — 16+ functions call cost recording after execution.

## 10.6 Cron Schedule

| Job | Schedule | Function |
|-----|----------|----------|
| Property alert check | Daily 9:00 AM EST | `check_coming_soon_expiring()` |
| Showing reminder | Every 5 min | `showing-reminder` edge function (`samuel-showing-reminder-5min`) |
| Task dispatcher | Every 5 min (planned) | Nehemiah `agent-task-dispatcher` |
| Doorloop sync | Every 15 min (planned) | Samuel `agent-doorloop-pull` |
| Email queue | Every minute | `process-email-queue` |
| SMS queue | Every minute | `process-sms-queue` |
| Resend sync | Every 5 min | `sync-resend-emails` |

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
| Prior express written consent | `SmsConsentCheckbox` component; consent defaults to `false`, opt-in required. **Voice removed** — TCPA now applies to **SMS** (Twilio) and email only; legacy "automated calls" wording in the consent copy is flagged for legal review. | PASS |
| Consent record with timestamp | `consent_log` table with method, evidence, IP, user_agent. `buildConsentPayload()` captures version, URL, user_agent | PASS |
| Opt-out mechanism | `do_not_contact` flag enforced | PASS |
| Contact hours | Configurable `working_hours_start`/`working_hours_end` per org | PASS |
| Joseph compliance gate | `joseph_compliance_check()` RPC checks consent before outbound execution — now **fail-closed** (MD16) | PASS |
| A2P 10DLC compliance | Privacy Policy and Terms of Service support Twilio SMS campaign registration. **HomeGuard/Portafolio brand references** in this 10DLC/SMS legal text are flagged for **separate legal review** (single-domain reorientation). | REVIEW |

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

> **Single-tenant consolidation (MD16)**: The system currently runs **one organization** ("Rent Finder Cleveland", slug `rent-finder-cleveland`) on **one domain** (`rentfindercleveland.com`). The multi-tenant model described in this section is **retained as defense-in-depth**, not actively used for multiple tenants — `organization_id` + RLS stay in place so additional tenants can be re-introduced without a destructive migration.

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
- **Agents**: Samuel (pull, `agent-doorloop-pull`), sync-leads-to-doorloop (push), send-application-invite
- **Polling**: Every 15 minutes for status updates
- **Status mapping**: Application created -> `in_application`, Lease signed -> `converted`
- **Side effects**: `in_application` cancels all pending agent tasks; `converted` marks property as `rented`
- **Audit**: `doorloop_sync_log` table tracks all sync operations
- **Bulk sync**: Admin can trigger full sync of all leads to DoorLoop from UI

## 15.2 Identity Verification (Persona + MaxMind)

### Primary: Persona
- **Edge Function**: `verify-identity` (Persona is the primary provider). Note: `joseph_compliance_check()` is the separate TCPA/Fair-Housing **DB RPC** gate, not a verification agent.
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
- **History sync**: `sync-resend-history` pulls delivery data from the Resend API for the active domain
- **Org-iterating**: Email functions iterate all organizations by design (defense-in-depth), though only one org is currently active

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
- [ ] Configure DNS for `rentfindercleveland.com` (single active domain)
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

## Session: June 29, 2026 — Reorientation + System Saneamiento (MD16)

This session pivoted the product and kicked off a sequential remediation. Full detail is in the top **"MD16 — Reorientation to Single-Domain + System Saneamiento"** section; summary:

- **Single-domain reorientation**: the product now targets **only `rentfindercleveland.com`**. **HomeGuard Management** and **Portafolio Diversificado** are removed from product scope. Their 10DLC/SMS legal copy is **flagged for separate legal review** (not auto-deleted); the functional `homeguard.app.doorloop.com` DoorLoop apply URLs are **retained** (live portal, not brand).
- **Single-tenant consolidation**: the DB holds exactly one organization ("Rent Finder Cleveland", slug `rent-finder-cleveland`). `organization_id` + RLS retained as defense-in-depth.
- **Doc drift corrected**: agent model is **6 canonical agents in 4 English departments** (Qualification/Leasing/Closing/System), **voice/Bland.ai fully removed** (Twilio = SMS only), and real DB counts (**67 tables, 291 RLS, 77 functions, 33 triggers**) replace the stale 32/131/19/12 figures. Edge functions: **35 local + 31 Lovable = 66 deployed**.
- **Security hardening in progress**: `users` self-update privilege-escalation blocked via trigger; `anon` EXECUTE revoked on `recalculate_lead_scores` / `log_score_change`; `send-message` now authenticates callers; `joseph_compliance_check()` call sites fixed to **fail-closed**.
- **Remediation plan**: Phases 0–11 (secrets+branch → critical security → docs/MD16 → brand removal → single-tenant consolidation → high-sec+functional bugs → compliance/Fair-Housing → DB performance → source/schema drift → build hardening → UI/UX live test → final verify+deploy).

---

## Session: May 27–30, 2026

### Changes Since MD14 (Mar 21, 2026) — 303 Commits

This window focused on three pillars: **the public booking page (`/p/book-showing`)**, **end-to-end Campaigns hardening + new features**, and **security hardening of storage + slots**. Plus a handful of high-leverage admin fixes (Schedule Showing manual, lead search at scale, dispatcher self-healing) and infrastructure work (cron jobs, Resend webhook, Supabase MCP).

---

#### 1. Public Booking Page Redesign (`/p/book-showing`)

**Bugs fixed (book-public-showing edge function)**:
- `rent_price` was missing from the property SELECT — Telegram alerts always showed empty rent.
- Buffer-BEFORE only blocked one 30-min slot regardless of `buffer_minutes` (vs. buffer-AFTER which looped correctly).
- `agent_tasks.scheduled_for` could land in the past for same-day bookings — guarded with `confirmationTime > now` check.
- Email template colors `#370d4b` (legacy purple) → `#4F46E5` indigo across all templates.
- Hardcoded "Rent Finder Cleveland • HomeGuard Management" brand → now reads `organizations.name` + `primary_color` + `accent_color`.
- `leadEmail` variable shadowing in Telegram block — used form-only email, ignoring existing lead email.

**Bugs fixed (frontend, `ScheduleShowing.tsx`)**:
- Today's already-passed slots leaked into multi-mode counts/nextSlot — added TZ-aware filter using per-property `getTimezoneForCity`.
- "Only X left" badge was a **hash-based fake** number (1-3 from `hashStr(address) % 3 + 1`) — now shows real `spotsNextDay`, badge style chosen by actual scarcity.
- Phone field validated only `.trim()` non-empty — now requires 10 digits with inline error.
- Multi-mode lead-time fetch now triggered by `properties[0]?.organization_id` (was only after a property was picked).

**New design (matches user reference)**:
- `PhotoCarousel` component: swipeable scroll-snap with **visible prev/next arrow buttons**, "📷 N PHOTOS" badge top-left, "1 / N" position counter top-right.
- `BuildingSelectCard` and `UnitSelectCard` rebuilt as compact horizontal cards (photo ~112px left, info right, full-width CTA below). Drops from ~350px tall to ~140px.
- Featured property card uses the same horizontal layout with amber border + "Featured" ribbon overlay.
- Post-selection card carries the carousel through.
- Date pills compact; optional note field; tap-photo-fullscreen viewer (commit `849224a`).

**Featured property fix**:
- Silent save failure in `useOrganizationSettings.updateSetting`: `.insert/.update` without `.select()` meant RLS-blocked writes returned no error. Switched to `upsert + select().single()` so failures surface.
- `LandingPageTab.handleSave` toast now shows the actual error message.

---

#### 2. Campaigns — End-to-End Hardening + New Features

##### 2.1 Initial Audit (red flags found)
- `handleCampaign` in `agent-task-dispatcher` was a **stub** that returned "completed" without doing anything — replaced with explicit `throw` so tasks fail visibly.
- `CampaignCreateWizard` was inserting `phone: \`no-phone-\${Date.now()}-\${rand}\`` for leads without phone — fake E.164 strings polluting the leads table and breaking dedup. Changed to `phone || null` (column is nullable since commit `47dd90a`).
- `process-email-queue` reverted failed emails to `queued` with **no `max_attempts`, no backoff** → infinite retry storm on hard-bounced emails. Added `attempt_number` + `max_attempts` columns; emails now graduate to `failed` after 3 attempts.
- Campaign "completed" was a false positive — marked done when queue was empty regardless of delivery. Now requires `pending === 0 AND (sent + failed) > 0`.
- Cost recording was `unit_cost: 0.0` everywhere. Now reads `email_unit_cost` / `sms_unit_cost` from `organization_settings` (default Resend $0.001 / Twilio $0.0083).
- `email_marketing_consent` consent gate added to `send-notification-email` — campaigns / newsletter / marketing notification types are blocked if lead has `unsubscribed_at` or `email_marketing_consent = false`. Transactional emails bypass the gate (CAN-SPAM legitimate interest).
- Stats list query used `.contains("details", { campaign_id })` which silently returned 0 rows in production due to jsonb_contains type-coercion edge case. Switched to `.eq("details->>campaign_id", c.id)` text-path equality.
- `CampaignProgressPanel` realtime subscription was invalidating on every email_events change in the org. Now filters payload by `payload.new.details.campaign_id`.
- Showings count was counting **every showing each campaign lead had ever booked**, not just ones booked after the campaign launched. Now scoped by `campaigns.started_at`.

##### 2.2 New Features in Wizard (`CampaignCreateWizard.tsx`)
- **Audience Source toggle** with 3 modes:
  - `upload` — CSV/Excel file (existing).
  - `property_history` — every lead ever associated with the selected unit (`interested_property_id` ∪ showings ∪ prior campaign recipients), unsubscribed leads filtered out.
  - `all_org_leads` — entire org's active leads (excludes `status IN ('lost','converted')` and `unsubscribed_at` rows). Filter applied client-side because PostgREST `NOT IN` drops NULL-status rows silently.
- **Empty-state taxonomy** with one-click switches: `no_property` / `no_history` / `only_filtered` / `ok`.
- **Channel selector**: Email / SMS / Both with SMS textarea, segment counter (160 / 480 hard limit), TCPA reminder.
- **All 7 templates** exposed (was hardcoded `welcome` + `schedule_showing`).
- **Send Pacing** select: Burst (1s) / Normal (5s) / Conservative (15s) / Trickle (1min) / Drip (5min). Stored in `campaigns.send_delay_seconds` (new column) with fallback to `target_criteria.send_delay_seconds` JSONB if column missing.
- **Launch flow refactor — bulk insert**: was 997 sequential `send-notification-email` invocations (~8 min for 1k leads). Now 5 batched passes: resolve identities → bulk INSERT new leads (500/chunk) → bulk UPSERT campaign_leads (1000/chunk) → bulk UPSERT campaign_recipients for SMS → bulk INSERT email_events with rendered HTML (100/chunk). **Drops to ~5 seconds.**
- **`launchStage` progress text** in the Launch button: "Resolving N leads…" → "Creating N new leads…" → "Queued X of N emails…" → "Finalizing…".

##### 2.3 Pause / Resume
- New `CampaignDetailView` with Pause + Resume buttons in the detail header.
- On pause: flips all the campaign's queued `email_events.details.status` to `"paused"` so `process-email-queue` no longer claims them (the RPC selects by `status='queued'`). Was previously skipping in-memory after claim, which consumed batch budget and starved other campaigns.
- On resume: flips status back to `"queued"`.

##### 2.4 SMS Campaign Channel
- New `campaign_type` values: `sms_blast`, `multi_channel`.
- SMS recipients queued via `campaign_recipients` with `channel='sms'`, `status='pending'`.
- New edge function **`process-sms-queue`** (~270 lines): atomic claim-and-send via `update WHERE status='pending'`, per-campaign delay from `send_delay_seconds`, invokes `send-message` (which handles TCPA + Twilio + cost recording), updates recipient row with `sent` / `failed` + error_message.
- Skips leads without phone or without `sms_consent=true` — recorded as `failed` with reason.
- `CampaignProgressPanel` shows SMS Progress section (Pending / Sent / Failed) when campaign has SMS recipients.

##### 2.5 Real Progress Panel
- Replaced 4-bucket conflation (queued/sent/delivered/failed where "sent" was lumped with "delivered") with **9 honest buckets**: `queued`, `processing`, `sent`, `delivered`, `opened`, `clicked`, `failed`, `bounced`, `complained`.
- `statusPriority` map prevents downgrades (`delivered` outranks `sent`).
- Stat cards: With Email · Queued · Sent · **Delivered** · Engaged · Bounced/Failed.

---

#### 3. New Edge Functions

| Function | Purpose | Lines |
|---|---|---|
| `process-sms-queue` | SMS campaign worker mirroring `process-email-queue` | ~270 |
| `resend-webhook` | Real-time Resend event handler with Svix signature verification | 241 |

`resend-webhook` accepts `email.sent / delivered / delivery_delayed / bounced / complained / opened / clicked`, applies a status priority map so out-of-order events never downgrade a row, writes event-specific timestamps (`delivered_at`, `opened_at`, etc.) into `details`. Endpoint configured in Resend dashboard. Replaces 5-min polling delay with real-time updates.

`sync-resend-emails` rewritten as multi-org cron-friendly: empty body iterates over all orgs with a Resend API key; bulk SELECT existing rows by `resend_email_id` in 100-id chunks; bulk INSERT/UPDATE partitioning; `MAX_PAGES` lowered from 20 to 5 (500 emails/run) so it fits under edge function CPU limit.

---

#### 4. Schedule Showing Manual Dialog Fix

`ScheduleShowingDialog.tsx` had **two queries missing `.eq("property_id", selectedPropertyId)`**:
- `fetchAvailableDates` (line 218-225) — calendar enabled every date that had ANY property's slot.
- `fetchAvailableSlots` (line 245-252) — time picker rendered duplicate `10:30 AM` entries (one per property with a 10:30 slot).

Symptom: user clicked one of the duplicate "10:30 AM" entries, expected showing for Property A, but the `slot.id` belonged to Property C. Atomic booking marked Property C's slot booked; the showing INSERT used the user's `selectedPropertyId` (correct); the all-properties block then also booked Property A's 10:30. End state: showing existed but the slot↔showing link was on the wrong property, making the user think nothing was saved.

Frontend fix adds the `property_id` filter to both queries + defensive client-side dedup by `slot_time`. DB hardening adds `UNIQUE (organization_id, property_id, slot_date, slot_time)` constraint so the existing `.upsert({ onConflict: ... })` calls in `EnableSlotsDialog` and `ManageSlotsTab` become truly atomic (the constraint didn't exist before, so `onConflict` was a no-op).

Lovable also wrapped the submit handler's side effects (lead score update, agent_tasks, system_logs) in try/catch (commit `a94d383`) so a single failure no longer kills the booking.

---

#### 5. Security Hardening

##### Storage bucket RLS
Detected by Supabase Security Advisor — applicant resumes, tenant statements, and documents were publicly readable; anyone could upload to the academy bucket. Property photos let any authenticated user delete/update across orgs.

Fixed via SQL migration applied directly:
- `applicant-files` → bucket private, all ops restricted to admin/super_admin.
- `statements`, `documents`, `work-order-files` → bucket private, all ops admin/editor/super_admin.
- `academy` → read by any authenticated user, write/delete by super_admin only.
- `property-photos` → public read (booking page needs it); writes org-scoped via `(storage.foldername(name))[2]` joined to `properties.organization_id`.
- Dropped 10 legacy `Allow read X` / `Allow uploads X` policies that gave public access.

##### Showing slot anon read
`showing_available_slots` anon SELECT now restricted to `is_enabled = true AND is_booked = false`. Internal columns (`booked_showing_id`, `booked_at`, `created_at`, etc.) no longer projected to anon traffic.

---

#### 6. DB Hardening Migration

Single migration covering retry + uniqueness + RLS + consent + pacing:

```sql
-- email_events
ALTER TABLE email_events
  ADD COLUMN attempt_number INT NOT NULL DEFAULT 0,
  ADD COLUMN max_attempts INT NOT NULL DEFAULT 3;

-- UNIQUE constraints
ALTER TABLE campaign_leads
  ADD CONSTRAINT campaign_leads_campaign_lead_unique UNIQUE (campaign_id, lead_id);
ALTER TABLE campaign_recipients
  ADD CONSTRAINT campaign_recipients_campaign_lead_unique UNIQUE (campaign_id, lead_id);
ALTER TABLE showing_available_slots
  ADD CONSTRAINT showing_available_slots_org_property_date_time_unique
  UNIQUE (organization_id, property_id, slot_date, slot_time);

-- RLS for users (was only service_role)
-- campaigns / campaign_leads / campaign_recipients now have authenticated
-- read + admin/editor write policies, all org-scoped.

-- Marketing consent columns
ALTER TABLE leads
  ADD COLUMN email_marketing_consent BOOLEAN,
  ADD COLUMN email_marketing_consent_at TIMESTAMPTZ,
  ADD COLUMN unsubscribed_at TIMESTAMPTZ;

-- Per-campaign pacing
ALTER TABLE campaigns
  ADD COLUMN send_delay_seconds INT NOT NULL DEFAULT 5;

-- GIN index for campaign stats queries
CREATE INDEX idx_email_events_details_campaign_status
  ON email_events USING gin (details jsonb_path_ops)
  WHERE details ? 'campaign_id';
```

All code paths gracefully degrade when columns don't exist yet — wizard launch retries the INSERT without `send_delay_seconds` on 42703, consent check is wrapped in try/catch, etc.

---

#### 7. Dispatcher Self-Healing

Production showed Cildred James receiving a Showing Reminder email reading "your scheduled property" instead of the actual address. Cause: older `agent_tasks` rows had empty `context.property_address` (queued before `book-public-showing` started passing the address).

New helper `resolvePropertyAddress(supabase, ctx, fallback)` in `agent-task-dispatcher`:
1. Returns `ctx.property_address` if non-empty.
2. Else SELECTs from `properties` by `ctx.property_id`.
3. Else SELECTs from `showings` by `ctx.showing_id` → `property_id` → `properties`.
4. Only returns the literal fallback string if all three sources are empty.

Applied to `handleShowingConfirmation`, `handleNoShowFollowup`, `handlePostShowing`.

Old purple `#370d4b` (and related shades `#5a1d7a` / `#5b1a7a` / `#f8f5ff` / `#f9f5fc`) replaced with current design system across **29 occurrences** in the dispatcher's inline email templates.

---

#### 8. Cron Jobs Activated

`pg_cron` + `pg_net` schedules created via SQL:
- `process-email-queue-every-minute` — `* * * * *`
- `process-sms-queue-every-minute` — `* * * * *`
- `sync-resend-emails-every-5-min` — `*/5 * * * *`

These run the edge functions without any body params; functions now iterate over all orgs that have the relevant credentials.

---

#### 9. Smaller Fixes

- `ScheduleShowingDialog` lead dropdown query gained `.limit(10000)` — PostgREST default 1000 was dropping Virginia Mcbee and every other lead alphabetically past row 1000.
- `CampaignsPage` list stats responsive (mobile 4-col grid, desktop flex).
- `CampaignProgressPanel` realtime subscription scoped by JSONB `campaign_id`.
- `SmsHistoryTab` cost configurable via `sms_unit_cost` org setting (was hardcoded $0.0079, Twilio US tariff is now $0.0083).
- `FeaturedPropertiesPage` weekend calculation uses dynamic timezone via `getTimezoneForCity` (was hardcoded `America/New_York`).

---

#### 10. Infrastructure

- **Supabase MCP** registered in `~/.mcp.json` with project-scoped access token. When Claude Code starts with the MCP server, dedicated tools (`mcp__supabase__execute_sql`, `apply_migration`, `deploy_edge_function`, etc.) replace ad-hoc curl invocations.
- **CLAUDE.md** rewritten so the Management API token is **read from `~/.mcp.json` at call time** via a shell snippet — token no longer hardcoded in the repo (GitHub Secret Scanning was rejecting commits that touched the old hardcoded token anyway).

---

### Updated Statistics (vs. MD14)

| Metric | MD14 | MD15 | Change |
|--------|------|------|--------|
| Total LoC (src/) | 71,244 | 74,271 | **+3,027** |
| Total LoC (supabase/) | 15,090 | 12,795 | **−2,295** ¹ |
| Combined Total | 86,334 | 87,066 | **+732** |
| Edge functions (local) | 30 | 35 | **+5** |
| Database tables | 67 | 67 | 0 |
| Commits since MD14 | — | 303 | — |

¹ supabase/ LoC dropped because the previous count included migration files that have been consolidated.

### Key Commits Since MD14

```
b371af4 chore: read Supabase token from ~/.mcp.json instead of hardcoding
fa436af fix(showings): Schedule Showing — duplicate times + bad slot binding
ba990c0 Fixed 3 security issues (Lovable auto-fix)
a94d383 fix(showings): isolate side-effects so one failure doesn't kill the booking
b431862 fix(showings): Schedule Showing dialog couldn't find leads past row 1000
6225166 fix(dispatcher): self-heal missing property_address in agent_task context
1ce306c fix(campaigns): use details->>campaign_id text-path for stats query
37a6df9 feat(campaigns): real-time delivery status via Resend webhook
84a7b5c fix(sync-resend-emails): batch operations + multi-org cron-friendly
68c6f68 fix(campaigns): scope showings to campaign.started_at
fa36a1e fix(campaigns): pause/resume now flips email_events status
f5f1273 perf(campaigns): bulk-insert launch — minutes to seconds
7d18433 fix(campaigns): launch tolerates missing send_delay_seconds column
bde86f8 fix(campaigns): tolerate missing email_marketing_consent column
e5c6b63 fix(campaigns): All-Active-Leads now finds leads with NULL status
849224a feat(booking): tap a photo to open fullscreen viewer
9d16e0b feat(campaigns): All Active Leads mode + explicit empty states
2f1de4f fix(booking): allow anon to read featured + city-cover settings
43d7166 feat(campaigns): pause/resume + SMS channel
964b436 feat(campaigns): target-by-property, pacing, all templates, real progress
bf4243c fix(campaigns): end-to-end hardening — RLS, retry limits, real costs, consent
c48cd76 fix(booking): compact horizontal cards + carousel arrows
```

### Edge Functions Deployed (35 local, all deployed)

The 5 new local edge functions since MD14:
1. `process-sms-queue` — SMS campaign worker (atomic claim-and-send)
2. `resend-webhook` — Real-time Resend delivery status (Svix-signed)

The remaining 3 ("new" since MD14) were already present in production but not in local repo — now synced.

---

*Document Version: 16*
*Last Updated: June 29, 2026*
*Project: Rent Finder Cleveland*
*Architecture: Single-tenant on a single domain (multi-tenant plumbing retained as defense-in-depth)*
*Total Lines of Code: 87,066*
