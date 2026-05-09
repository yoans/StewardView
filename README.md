# StewardView

StewardView is a multi-tenant church finance platform with a public marketing site at `/` and the authenticated application at `/app`.

## Features

- Multi-tenant church finance management
- Public onboarding flow with optional paid Stripe checkout
- Manual bank account management with CSV transaction import
- Budgets, funds, audit history, reports, and Givelify support
- Platform admin controls for tenant oversight

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Tailwind CSS           |
| Backend   | Node.js + Express                 |
| Database  | PostgreSQL                        |
| Banking   | Manual accounts + CSV import          |
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
| `STRIPE_SECRET_KEY` | Required only for paid onboarding |
| `STRIPE_WEBHOOK_SECRET` | Required only for Stripe webhooks |
| `PLATFORM_ADMIN_SECRET` | Optional shared secret for platform admin APIs |
| `CORS_ORIGINS` | Optional comma-separated allowlist for cross-origin frontend hosting |
| `REPORT_DIR` | Output directory for generated reports |
| `SEED_ADMIN_EMAIL` | Optional local seed admin email for non-production setup |
| `SEED_ADMIN_PASSWORD` | Optional local seed admin password for non-production setup |

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

### Stripe

Needed only if you want paid self-service onboarding.

1. Create a Stripe account and set `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint at `/api/onboarding/webhook`.
3. Set `STRIPE_WEBHOOK_SECRET` from that webhook.
4. Keep `APP_URL` pointed at your public base domain. The app will send Stripe users back to `/app/payment-success`.

## Bank Transaction Import

StewardView supports any bank that can export transactions as CSV. To use it:

1. Add the bank account on the **Bank Accounts** page.
2. Export transactions from online banking as CSV.
3. Open **Bank Accounts → Import** and upload the file.
4. Review imported transactions on the **Transactions** page to assign categories and funds.

The importer accepts common columns such as `date`, `posting_date`, `amount`, `debit`, `credit`, `description`, `memo`, `details`, `check_number`, and `notes`. Likely duplicate rows are skipped automatically.

## Important Notes

- The public site lives at `/`; the authenticated product lives at `/app`.
- The server now uses PostgreSQL in both development and production, so native SQLite/node-gyp builds are no longer part of the normal workflow.
- Production startup runs migrations automatically and never seeds users or financial data.
- Local seeds create reference categories and funds only. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` if you want a local bootstrap admin.
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
