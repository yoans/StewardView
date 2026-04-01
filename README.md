# StewardView

StewardView is a multi-tenant church finance platform with a public marketing site at `/` and the authenticated application at `/app`.

## Features

- Multi-tenant church finance management
- Public onboarding flow with optional paid Stripe checkout
- Plaid-based bank account linking and manual account entry
- Budgets, funds, audit history, reports, and Givelify support
- Platform admin controls for tenant oversight

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Tailwind CSS           |
| Backend   | Node.js + Express                 |
| Database  | PostgreSQL                        |
| Banking   | Plaid API (any bank or credit union)  |
| Reports   | PDFKit                            |
| Auth      | JWT + bcrypt                      |

## Local Development

```bash
# 1. Install all dependencies
npm run install:all

# 2. Copy environment config
cp server/.env.example server/.env
# Edit server/.env with your local Postgres connection

# 3. Run database migrations & seed data
npm run db:migrate
npm run db:seed

# 4. Start development servers
npm run dev
```

The app will be available at:
- Marketing site: http://localhost:4000
- Authenticated app: http://localhost:3000/app
- API: http://localhost:4000/api

Local development expects PostgreSQL. Set `DEV_DATABASE_URL` in `server/.env` for your local database, or point it at a non-production Postgres database.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEV_DATABASE_URL` | PostgreSQL connection string used for local development |
| `DATABASE_URL` | PostgreSQL connection string used in production |
| `JWT_SECRET` | Secret key for JWT signing |
| `APP_URL` | Public base URL, for example `https://stewardview.com` |
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Plaid secret |
| `PLAID_ENV` | `sandbox`, `development`, or `production` |
| `ORG_NAME` | Default organization name shown in Plaid Link |
| `STRIPE_SECRET_KEY` | Required only for paid onboarding |
| `STRIPE_WEBHOOK_SECRET` | Required only for Stripe webhooks |
| `PLATFORM_ADMIN_SECRET` | Optional shared secret for platform admin APIs |
| `CORS_ORIGINS` | Optional comma-separated allowlist for cross-origin frontend hosting |
| `REPORT_DIR` | Output directory for generated reports |

## Railway Deploy Checklist

1. Create a Railway project and attach a PostgreSQL database.
2. Set these required variables in Railway: `NODE_ENV=production`, `JWT_SECRET`, and `APP_URL`.
3. Confirm Railway injects `DATABASE_URL`.
4. Deploy the app. The server runs migrations automatically on production boot.
5. Verify these URLs:
	- `/` serves the marketing site
	- `/app/login` serves the authenticated app
	- `/api/health` returns a healthy response

## Third-Party Setup

### Plaid

Needed only if you want live bank sync.

1. Create a Plaid account.
2. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, and optionally `ORG_NAME`.
3. In production, switch `PLAID_ENV` to `production`.

### Stripe

Needed only if you want paid self-service onboarding.

1. Create a Stripe account and set `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint at `/api/onboarding/webhook`.
3. Set `STRIPE_WEBHOOK_SECRET` from that webhook.
4. Keep `APP_URL` pointed at your public base domain. The app will send Stripe users back to `/app/payment-success`.

## Bank Integration (Any Bank via Plaid)

This system uses **Plaid** to securely connect to any bank or credit union — over **12,000 institutions** are supported. You're not locked into any specific bank. To set up:

1. Create a free account at [plaid.com](https://plaid.com)
2. Get your `client_id` and `secret` from the Plaid dashboard
3. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `ORG_NAME` in your environment
4. Go to the **Bank Accounts** page in the app and click **"Connect a Bank Account"**
5. The Plaid Link UI will appear — search for and log in to any bank your church uses
6. The system will pull live balances and transactions automatically

**No Plaid? No problem.** You can also add accounts manually (enter balances yourself) from the same Bank Accounts page. Manual and Plaid-linked accounts can coexist.

## Important Notes

- The public site lives at `/`; the authenticated product lives at `/app`.
- The server now uses PostgreSQL in both development and production, so native SQLite/node-gyp builds are no longer part of the normal workflow.
- Production startup runs migrations automatically, but it does not seed demo users.
- Demo credentials shown in the login page are for local seeded development only.
- Custom tenant subdomains or custom domains are not implemented yet. The current multi-tenant model is tenant-ID based, not host-header based.

## Monthly Reports

Reports are generated automatically on the 1st of each month, or on-demand:

```bash
npm run report:monthly
```

Reports include:
- Opening & closing bank balances
- Income summary by category
- Expense summary by category
- Earmarked fund balances & activity
- Budget vs. actual comparison
- Audit notes

## Audit Trail

Every financial action is recorded:
- Transaction creation, edits, and deletions
- Budget changes
- Fund transfers
- Bank reconciliation
- User login/logout

## License

Private.
