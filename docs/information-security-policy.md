# Information Security Policy and Procedures
**StewardView — Church Finance Management Platform**
**Version:** 1.0
**Effective Date:** March 16, 2026
**Last Reviewed:** March 16, 2026
**Owner:** Nathaniel Young
**Contact Email:** contact@sagaciasoft.com

---

## 1. Purpose and Scope

This document establishes the information security policy and operational procedures for StewardView, a multi-tenant SaaS platform providing financial management and transparency tools for churches and religious organizations. StewardView integrates with Plaid to enable secure bank account linking and transaction synchronization on behalf of its customers (church administrators and treasurers).

This policy applies to:
- All StewardView platform infrastructure, code, and data systems
- All personnel with access to production systems or customer data
- All third-party integrations, including Plaid, Stripe, and Railway
- All tenant (customer) data processed or stored by the platform

---

## 2. Information Security Governance

### 2.1 Policy Owner
The Platform Administrator is responsible for maintaining, reviewing, and enforcing this policy. The policy is reviewed at minimum annually and after any significant security incident or material change to the platform.

### 2.2 Objectives
- Protect the confidentiality, integrity, and availability of customer financial data
- Maintain compliance with Plaid's developer policies and security requirements
- Minimize risk of unauthorized access to bank account credentials and transaction data
- Ensure data is processed lawfully and with appropriate controls

### 2.3 Risk Management Approach
Security risks are identified, assessed, and mitigated through:
- Periodic threat modeling of new features before deployment
- Review of dependency vulnerabilities (npm audit) before releases
- Monitoring of Plaid and Railway security advisories
- Incident retrospectives to identify and close gaps

---

## 3. Data Classification

| Classification | Examples | Handling |
|---|---|---|
| **Critical** | Plaid access tokens, JWT secret, database credentials, encryption keys | Encrypted at rest and in transit; never logged; stored only in environment variables |
| **Confidential** | Bank account numbers (masked), balances, transaction records, user passwords | Encrypted in transit (TLS); access restricted by RBAC; audit-logged |
| **Internal** | Tenant configuration, report data, audit logs | Access restricted to authenticated users within their tenant |
| **Public** | Marketing content, general platform information | No restrictions |

---

## 4. Access Control

### 4.1 Authentication
- All user accounts require a password (minimum 8 characters) hashed with bcrypt (10 salt rounds)
- Sessions are managed via signed JWT tokens with an 8-hour expiration
- JWT secrets are cryptographically strong random values stored as environment variables, never in source code
- Failed or expired tokens are rejected with 401 responses before any data is returned

### 4.2 Role-Based Access Control (RBAC)
StewardView enforces four roles with least-privilege access:

| Role | Permissions |
|---|---|
| **Admin** | Full tenant management, user administration, bank account linking |
| **Treasurer** | All financial operations (transactions, funds, budgets, reports) |
| **Finance Committee** | Read/write transactions and reports; no user or bank management |
| **Viewer** | Read-only access to financial data |

All API endpoints enforce role checks server-side. Frontend restrictions alone are never relied upon for security.

### 4.3 Multi-Tenant Isolation
- Every database query is scoped to the authenticated user's `tenant_id`
- Tenant IDs are derived from the verified JWT, not from user-supplied input
- It is architecturally impossible for one tenant's query to return another tenant's data

### 4.4 Platform Administration
- Platform-level administrative operations require a separate `PLATFORM_ADMIN_SECRET` in addition to an admin JWT
- Platform admin capabilities are not exposed to regular tenant users

### 4.5 Minimum Admin Requirement
The platform enforces that each tenant maintains at least two admin users at all times, preventing account lockout and ensuring continuity of access controls.

---

## 5. Plaid Integration Security

### 5.1 Token Handling
- Plaid public tokens are exchanged server-side immediately after the Link flow; they are never stored
- Plaid access tokens are encrypted before storage using **AES-256-GCM** with a unique 128-bit IV per token
- The encryption key (`PLAID_TOKEN_KEY`) is a 256-bit secret stored exclusively as an environment variable; it is never committed to source code or logs
- Decryption occurs only at the moment of API calls to Plaid; the plaintext token is never persisted or returned to the client

### 5.2 Scope Limitation
- StewardView requests only the Plaid products necessary for its function: **Transactions** and **Auth** (balance retrieval)
- No investment, identity, income, or other Plaid products are requested

### 5.3 Data Minimization
- Only the last 30 days of transactions are synced from Plaid
- Bank account numbers are never stored in full; only the last-4-digit mask provided by Plaid is retained
- Sync activity is logged in `bank_sync_log` for audit purposes

### 5.4 API Credentials
- `PLAID_CLIENT_ID` and `PLAID_SECRET` are stored as environment variables only
- Production credentials use Plaid's `production` environment; development uses `sandbox`
- Credentials are rotated immediately upon suspected compromise

---

## 6. Encryption

### 6.1 Data at Rest
- Plaid access tokens: AES-256-GCM encrypted in the database
- User passwords: bcrypt-hashed (never stored in plaintext or reversibly)
- Database encryption at rest: provided by Railway's managed PostgreSQL service

### 6.2 Data in Transit
- All client-to-server traffic is served over HTTPS/TLS (enforced by Railway's infrastructure)
- Database connections in production use TLS (`ssl: { rejectUnauthorized: false }` due to Railway's certificate chain; transport is still encrypted)
- All Plaid API calls are made over HTTPS to Plaid's endpoints

### 6.3 Key Management
- Encryption keys and secrets are stored as environment variables in Railway's secret management system
- Keys are never committed to version control (`.env` files are gitignored)
- Key rotation procedures: new key is set in environment; tokens are re-encrypted on next sync cycle

---

## 7. Network and Infrastructure Security

### 7.1 HTTP Security Headers
Helmet.js is configured on all API responses, providing:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`

### 7.2 Rate Limiting
- Global rate limit: 200 requests per 15-minute window per IP address
- Requests exceeding the limit receive a `429 Too Many Requests` response
- This mitigates brute-force attacks against authentication endpoints

### 7.3 CORS Policy
- Cross-Origin Resource Sharing is restricted to explicitly configured allowed origins
- Origins are set via the `CORS_ORIGINS` environment variable; default restricts to known application origins
- Wildcard origins (`*`) are not permitted in production

### 7.4 Bot and Probe Protection
- Requests probing for sensitive files (`.env`, `.git`, `.sql`, `.bak`, `.config`) are detected and blocked with a 404 response
- These requests are logged for monitoring purposes

### 7.5 Infrastructure
- Application is hosted on Railway.app, a SOC 2-compliant platform
- PostgreSQL is hosted as a managed Railway service with automated backups
- No self-managed servers or bare-metal infrastructure

---

## 8. Audit Logging and Monitoring

### 8.1 Audit Trail
Every significant action in the system is written to the `audit_log` table, capturing:
- Entity type and ID affected
- Action performed (create, update, delete, approve, etc.)
- Old and new values (for changes)
- User ID and IP address of the actor
- Timestamp

This provides a complete, immutable record of all financial operations for accountability.

### 8.2 Application Logging
- Server logs (via Morgan) capture all HTTP requests with method, path, status code, and response time
- Sensitive values (tokens, passwords, keys) are never included in logs
- Log output is collected by Railway's logging infrastructure

### 8.3 Sync Monitoring
- All Plaid sync attempts are logged in `bank_sync_log` with status and error details
- Failed syncs surface errors to tenant admins through the application UI

### 8.4 Alerting
- Railway restart alerts notify on repeated process failures (ON_FAILURE restart policy, max 3 retries)
- Health check endpoint (`/api/health`) enables external uptime monitoring

---

## 9. Data Backup and Recovery

### 9.1 Automated Backups
- A daily scheduled job (2:00 AM) creates a full snapshot of all critical database tables into the `data_backups` table
- The 30 most recent daily backups are retained; older backups are automatically pruned

### 9.2 Railway Managed Backups
- Railway's PostgreSQL service provides platform-level automated backups independent of application-level backups
- Point-in-time recovery is available through Railway's infrastructure

### 9.3 Recovery Objectives
- Recovery Point Objective (RPO): ≤ 24 hours (daily backup cadence)
- Recovery Time Objective (RTO): estimated < 4 hours for full restore from backup

---

## 10. Incident Response

### 10.1 Incident Definition
A security incident includes any confirmed or suspected:
- Unauthorized access to tenant data
- Exposure or compromise of Plaid access tokens or API credentials
- Data breach affecting financial records or user credentials
- Platform compromise or unauthorized code execution

### 10.2 Response Procedures

**Step 1 — Contain**
- Revoke compromised credentials or tokens immediately (rotate Plaid secret, JWT secret, or `PLAID_TOKEN_KEY` as applicable)
- Suspend affected tenant(s) if data compromise is confirmed
- Isolate affected infrastructure components

**Step 2 — Assess**
- Determine scope: which tenants, which data, what access was obtained
- Review audit logs and access logs to establish timeline
- Determine whether Plaid access tokens were exposed in plaintext

**Step 3 — Notify**
- Notify affected tenants within 72 hours of confirmed breach
- Notify Plaid per their incident notification requirements
- Comply with applicable state breach notification laws

**Step 4 — Remediate**
- Re-encrypt any potentially compromised tokens with new key
- Force password resets for affected users
- Deploy patches for any exploited vulnerability

**Step 5 — Review**
- Conduct post-incident retrospective
- Update this policy and security controls as needed
- Document lessons learned

### 10.3 Plaid Token Compromise Protocol
If a Plaid access token is suspected to be compromised:
1. Immediately rotate the `PLAID_TOKEN_KEY` encryption key
2. Re-encrypt all stored Plaid tokens with the new key
3. Notify affected tenant(s) and advise them to re-link their bank accounts via Plaid Link
4. Report to Plaid support

---

## 11. Vulnerability and Patch Management

- npm dependencies are audited before each production deployment (`npm audit`)
- Critical and high severity vulnerabilities in direct dependencies are remediated before deployment
- The Node.js runtime is kept on a supported LTS version (currently Node.js 18+)
- Railway's managed infrastructure receives OS and platform patches automatically
- GitHub Dependabot or equivalent tooling is used to monitor for new vulnerability disclosures in dependencies

---

## 12. Secure Development Practices

- Source code is managed in a private Git repository; secrets are never committed
- `.env` files are excluded via `.gitignore`
- All API input is validated server-side; client-side validation is supplemental only
- SQL queries use parameterized statements via Knex.js (no raw string concatenation with user input)
- HTTP security headers applied globally via Helmet.js
- Authentication and authorization checks are server-side and applied before any data access
- New features with security implications are reviewed before deployment

---

## 13. Third-Party Vendor Security

| Vendor | Purpose | Security Posture |
|---|---|---|
| **Plaid** | Bank account linking and transaction data | PCI DSS compliant, SOC 2 Type II, ISO 27001 |
| **Railway** | Hosting and managed PostgreSQL | SOC 2 Type II compliant infrastructure |
| **Stripe** | Subscription billing | PCI DSS Level 1 Service Provider |

Vendor relationships are reviewed annually. Vendor security advisories are monitored and acted upon.

---

## 14. Policy Review and Maintenance

This policy is reviewed:
- Annually at minimum
- Following any security incident
- When material changes are made to the platform architecture or integrations
- When Plaid or other key vendors update their security requirements

---

## 15. Acceptance and Acknowledgment

This Information Security Policy has been approved and is effective as of the date stated above. All personnel with access to StewardView's production systems are expected to understand and comply with this policy.

---

*Document maintained by the StewardView Platform Administrator.*
*For questions regarding this policy, contact the platform owner.*
