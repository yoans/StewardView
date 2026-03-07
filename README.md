# HRCOC Finance - Church Finance Transparency System

A comprehensive church finance management application providing full transparency into bank balances, income, expenses, earmarked/directed contributions, budget tracking, and audit history.

## Features

- **Bank Balance Tracking** — Real-time bank balance via Plaid (Bank of America connected)
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
| Banking   | Plaid API (Bank of America)       |
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
| `BOA_ACCESS_TOKEN` | Plaid access token for Bank of America account |

## Bank of America Integration

This system uses **Plaid** to securely connect to Bank of America. Plaid is the industry-standard service used by major financial apps. To set up:

1. Create a free account at [plaid.com](https://plaid.com)
2. Get your `client_id` and `secret` from the Plaid dashboard
3. Use the Plaid Link flow in the app to connect your Bank of America account
4. The system will then pull balances and transactions automatically

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
