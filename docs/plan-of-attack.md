# Plan of attack — hardening & going multi-nonprofit

Goal: make StewardView safe and credible to sell as **name-your-price** software to any small nonprofit, not just churches.

## Done (2026-11-25)

- **Cross-tenant fund edit fixed.** `PUT /api/funds/:id` now checks the fund belongs to the caller's church.
- **Pre-MFA token can't be used as a session.** `authenticate()` rejects any JWT with a `purpose` claim.
- **Login no longer reveals which emails exist.** Password is checked (against a dummy hash for unknown emails) before any account-status message.
- **Platform secret compared in constant time.**
- **Workbook setup is home-church only.** The budget-sections migration and bank payee rules (natpay, Des Moines Water, …) apply only to `HOME_TENANT_ID` (default 1). Other organizations keep their categories and get generic starter rules.
- **Backups are per church and contain no secrets.** One shared service (`server/src/services/backups.js`) drives both the manual button and the 2 AM job. It strips `password_hash`, never includes token tables or `data_backups`, and keeps 30 nightly backups per church.

## Phase 1 — finish the security cleanup (small, do next)

| # | Item | Why | Size |
|---|------|-----|------|
| 1.1 | **Purge old all-tenant backups** (`data_backups` rows where `tenant_id IS NULL`) | They hold every church's data, including password hashes and encrypted bank tokens. Deleting them is permanent, so check whether you want to export one first. | S |
| 1.2 | **Separate bank-token encryption key** (`TOKEN_ENCRYPTION_KEY`) | Today the key comes from `JWT_SECRET`, so rotating the JWT secret breaks every SimpleFIN connection. Read the new key, fall back to the old derivation when decrypting, re-encrypt on the next sync. | S |
| 1.3 | **MFA attempt limit per code**, not just per IP | The limit is 5 attempts per IP per 15 minutes; someone using many IPs can keep guessing. Add an attempts column to `mfa_codes` and burn the code after 5 misses. | S |
| 1.4 | **Turn the CSP back on** | Helmet's CSP is off and the session token lives in `localStorage`, so any XSS means account takeover. Start in report-only mode, then enforce. | M |
| 1.5 | **Monthly report cron does nothing** | It works out the month, logs it, and stops. Either generate a report per church, or remove it. | S |
| 1.6 | **Validate fund update input** | `PUT /funds/:id` copies `target_amount`, `is_active`, etc. straight from the request body with no type checks. | S |

## Phase 2 — make tenant isolation structural

The fund bug happened because every route has to remember `tenant_id`. Make forgetting it impossible.

1. **Cross-tenant test suite** — seed two churches, call every `/:id` route as church A on church B's ids, expect 404. Run it in CI. *(do this first; cheap insurance)*
2. **`tenantDb(req)` helper** — returns a query builder with `tenant_id` already applied; migrate routes to it one file at a time.
3. **Postgres row-level security** (optional, later) — `SET app.tenant_id` per request + RLS policies. Strongest guarantee; more operational work.

## Phase 3 — broaden from churches to nonprofits

| Item | Notes |
|------|-------|
| `org_type` on tenants (church, nonprofit, school, club, other) | Chosen at onboarding. |
| Wording map | "church" → "organization", "congregation" → "members/donors", "giving" → "donations". Centralize in one client file + email templates. |
| Default categories per org type | `defaultCategories.js` already exists — key it by type. |
| Landing page | Lead with "fund accounting for small nonprofits"; churches become one use case. |

## Phase 4 — self-serve SaaS readiness

- **Email verification before a free account is usable** (onboarding currently returns a session token right away for free plans).
- **Bot protection on `/api/onboarding/register`** — honeypot field + Turnstile/hCaptcha.
- **Per-tenant quotas** — CSV import size, backups count, users.
- **Full data export** (CSV zip / QuickBooks-friendly) and a **documented account deletion** flow — makes name-your-price feel low-risk.
- **Trust page** linking the existing policies in `docs/` (security, retention, incident response).
- **Status page + uptime monitor** on `/api/health`.
- Rate limiter is in-memory — fine on one Railway instance; move to Postgres/Redis store before scaling horizontally.

## Phase 5 — pricing & growth

- Name-your-price with an **anchor** ("orgs your size usually pay $X") and an **annual** option (fewer card fees, better retention).
- Let tenants change their amount in-app (Stripe customer portal).
- **Read-only transparency link** — shareable monthly summary for members/boards. The product's core promise, and its best marketing.
- First-run **setup checklist** on the dashboard (connect bank → funds → budget).

## Phase 6 — code health (supports all of the above)

- Split the very large pages (`BudgetPage.js` ~1,000 lines, `AdminPage`, `TransactionsPage`) into components.
- Add `"test": "node --test"` to `server/package.json` and run it in CI.

## Suggested order

1.1 → 1.2 → 2.1 → 1.3 → 1.5/1.6 → 1.4 → Phase 3 → Phase 4 → Phase 5, with Phase 6 picked up alongside.
