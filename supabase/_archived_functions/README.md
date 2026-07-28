# Archived edge functions

Source of edge functions that were **deployed to production but never lived in this
repo**, kept here as a record before deleting them from Supabase.

> ⚠️ This directory is deliberately **outside `supabase/functions/`** so the Supabase
> CLI does not pick it up and redeploy these. Nothing here is live.

---

## `persona-webhook` and `verify-identity` — deleted 2026-07-28

Both were the Persona (ID verification) + MaxMind (fraud score) integration, which
was **retired earlier and marked "do not reintroduce"**. Their source was never in
the repo; they were only ever in production, at version 1, deployed 2026-07-19 and
never updated.

They were deleted because they were **broken and inert**, not because of a security
problem. Verified against production on 2026-07-28:

| Fact | Evidence |
|---|---|
| `leads.persona_verification_id` was dropped | `persona-webhook`'s first `SELECT` names it, so the query errors and the handler always answers `lead_not_found` |
| `organization_credentials` lost all 3 credential columns (`persona_api_key`, `maxmind_account_id`, `maxmind_license_key`) | `verify-identity` cannot reach either provider — it returns 400 `No identity verification service configured` |
| Nothing ever verified | `select count(*) from leads where identity_verified is true` → **0** |
| No caller | Neither function is referenced anywhere in `src/` or in another edge function |

**Neither was a security hole.** Both are fail-closed despite being deployed with
`verify_jwt = false`:

- `persona-webhook` requires a valid Persona HMAC signature — with no
  `PERSONA_WEBHOOK_SECRET` it answers 503, with a bad signature 401.
- `verify-identity` rejects anonymous callers and the anon key outright, and
  requires either the service-role key or a logged-in, active user (whose org is
  then forced from their own record rather than trusted from the request body).

**The one real reason to remove them:** `verify-identity` writes
`verification_status = 'in_progress'` and `verification_started_at` onto the lead
*before* it discovers there are no credentials — so an authenticated caller could
dirty lead rows for no benefit. Beyond that, a function that lives only in
production is one nobody audits or patches; these two quietly broke the
"repo ↔ prod parity" invariant and caused real confusion during the July 2026 audit.

**If identity verification is ever wanted again**, this code is a starting point but
not a drop-in: the credential columns it reads no longer exist, so the schema would
have to come back first.
