# HRCOC Finance - Church Finance Transparency System

A comprehensive church finance management application providing full transparency into bank balances, income, expenses, earmarked/directed contributions, budget tracking, and audit history.

## Features

- **Bank Balance Tracking** — Connect any bank via Plaid (12,000+ institutions supported) or add accounts manually
- **Income & Expense Tracking** — Every transaction recorded with categories and descriptions
- **Earmarked / Directed Contributions** — Track funds designated for specific purposes (missions, building fund, benevolence, etc.)
- **Audit Trail** — Every change is logged with who, what, when, and why
- **Monthly Reports** — Auto-generated PDF reports with income, expenses, fund balances, and budget vs. actuals
- **Budget Management** — Annual and monthly budgets with real-time variance tracking
- **Role-Based Access** — Treasurer, Elder, Finance Committee, and View-Only roles

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Tailwind CSS           |
| Backend   | Node.js + Express                 |
| Database  | SQLite (dev) / PostgreSQL (prod)  |
| Banking   | Plaid API (any bank or credit union)  |
| Reports   | PDFKit                            |
| Auth      | JWT + bcrypt                      |

## Quick Start

```bash
# 1. Install all dependencies
npm run install:all

# 2. Copy environment config
cp server/.env.example server/.env
# Edit server/.env with your settings

# 3. Run database migrations & seed data
npm run db:migrate
npm run db:seed

# 4. Start development servers
npm run dev
```

The app will be available at:
- Frontend: http://localhost:3000
- API: http://localhost:4000

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (prod) |
| `JWT_SECRET` | Secret key for JWT tokens |
| `PLAID_CLIENT_ID` | Plaid API client ID |
| `PLAID_SECRET` | Plaid API secret |
| `PLAID_ENV` | Plaid environment (sandbox/development/production) |
| `PLAID_CLIENT_ID` | Plaid API client ID (from plaid.com) |
| `PLAID_SECRET` | Plaid API secret |
| `PLAID_ENV` | `sandbox` for testing, `production` for live |
| `ORG_NAME` | Your church name (shown in Plaid Link UI) |

## Bank Integration (Any Bank via Plaid)

This system uses **Plaid** to securely connect to any bank or credit union — over **12,000 institutions** are supported. You're not locked into any specific bank. To set up:

1. Create a free account at [plaid.com](https://plaid.com)
2. Get your `client_id` and `secret` from the Plaid dashboard
3. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `ORG_NAME` in `server/.env`
4. Go to the **Bank Accounts** page in the app and click **"Connect a Bank Account"**
5. The Plaid Link UI will appear — search for and log in to any bank your church uses
6. The system will pull live balances and transactions automatically

**No Plaid? No problem.** You can also add accounts manually (enter balances yourself) from the same Bank Accounts page. Manual and Plaid-linked accounts can coexist.

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

Private — HRCOC Internal Use Only
