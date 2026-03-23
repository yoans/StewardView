# Plaid Security Questionnaire — Version 6
**Company / Application:** StewardView
**Application Type:** Multi-tenant SaaS — Church Finance Management Platform
**Completed:** March 16, 2026
**Completed By:** Nathaniel Young
**Contact Email:** contact@sagaciasoft.com

---

## Part One: Infrastructure Security

---

### Q1. Describe your hosting strategy (on-premises, cloud, or hybrid).

**Answer:**

StewardView is a fully cloud-hosted application with no on-premises infrastructure. All components are hosted on **Railway.app**, a SOC 2 Type II certified managed cloud platform.

- **Application Server:** Node.js/Express application running on Railway's managed container infrastructure
- **Database:** PostgreSQL hosted as a Railway managed database service with automated backups, encryption at rest, and TLS-encrypted connections
- **Static Assets:** React frontend served from the same origin as the application server
- **No bare-metal or co-located servers are used**

Railway's infrastructure provides physical security, network security, and platform-level patching automatically. Our responsibility is limited to application-layer security, which is documented throughout this questionnaire.

**Supporting documentation:** [Information Security Policy §7.5](information-security-policy.md)

---

### Q2. Do you have a documented information security policy and procedures that have been operationalized to identify, mitigate, and monitor information security risks relevant to your business?

**Answer:** Yes.

StewardView maintains a formal **Information Security Policy** ([information-security-policy.md](information-security-policy.md)) that covers:

- Data classification and handling requirements
- Access control and authentication standards
- Encryption requirements for data at rest and in transit
- Plaid-specific token security procedures
- Audit logging and monitoring
- Incident response procedures
- Vulnerability and patch management
- Vendor risk management

The policy is reviewed annually and after any significant security incident or platform change. It is operationalized through technical controls documented in this questionnaire.

---

### Q3. Describe your network endpoint discovery and visibility processes.

**Answer:**

Because StewardView runs entirely on Railway's managed cloud platform, traditional network endpoint scanning is handled at the infrastructure level by Railway. At the application level, our endpoint security approach includes:

- **API surface inventory:** All API routes are defined in Express.js router files and audited during code review. The full route list is maintained in the application source code.
- **Bot/probe detection:** Automated requests probing for sensitive paths (`.env`, `.git`, `.sql`, `.bak`, `.config`) are detected and blocked with a 404 response, and logged.
- **Health monitoring:** The `/api/health` endpoint is monitored externally for uptime and availability.
- **Rate limiting:** A global rate limiter (200 requests per 15-minute window per IP) detects and throttles abnormal request patterns.
- **HTTP security headers:** Helmet.js is applied globally to harden HTTP responses.
- **Dependency scanning:** `npm audit` is run before each production deployment to identify known vulnerable dependencies.

We do not expose any administrative ports, database ports, or internal services to the public internet. Database access is restricted to the application server within Railway's private network.

---

### Q4. Describe your vulnerability scanning and patching processes.

**Answer:**

**Vulnerability Scanning:**
- `npm audit` is run before each production deployment to identify known vulnerabilities in all dependencies
- GitHub's Dependabot (or equivalent) monitors dependencies for newly disclosed CVEs and opens automated pull requests for updates
- Railway's platform infrastructure receives automated OS-level patching by Railway

**Patch Management:**
- Critical and high-severity vulnerabilities in direct dependencies are remediated before the next production deployment
- Medium/low severity issues are addressed in the next scheduled release cycle
- Node.js LTS updates are applied within 30 days of a new LTS release or within 7 days of a security-only patch
- No end-of-life runtime versions are used in production

**Process:**
1. Dependency vulnerability detected (automated alert or manual audit)
2. Severity assessed against actual attack surface
3. Patched version identified and tested in development
4. Deployed to production via standard CI/CD process
5. Deployment logged and verified via health check

---

### Q5. What endpoint security tools do you use to protect against malicious code on systems that access production data?

**Answer:**

StewardView's production environment runs entirely in Railway's managed container infrastructure — there are no persistent virtual machines or workstations that "run" the application. The attack surface for malicious code is limited accordingly.

**Production environment protections:**
- Railway's container infrastructure provides isolation between application processes
- The Node.js application runs with minimal required permissions (no root)
- No user-uploaded executable code is accepted or executed
- All application code is deployed via Git-based deployments from a private repository — no ad-hoc code execution on production systems

**Developer workstation protections (systems that access production credentials):**
- Developer systems use modern OS-provided endpoint protection (Windows Defender or equivalent)
- Production secrets (env vars, API keys) are accessed exclusively through Railway's dashboard — they are never stored in local files outside of `.env` files in the project root, which are gitignored
- MFA is enforced on the Railway account and the GitHub repository account used for deployments

---

### Q6. Do you have policies governing the use of personal devices (BYOD) for work purposes? Describe your BYOD controls.

**Answer:**

StewardView is operated by a small team. We maintain an **Acceptable Use Policy** ([acceptable-use-policy.md](acceptable-use-policy.md)) governing access to production systems. Key controls include:

- Access to production systems (Railway dashboard, database, GitHub repository) requires MFA on all accounts, regardless of device type
- Developers are required to keep their operating system and browser fully patched and updated
- Production database credentials and API secrets are accessed exclusively through Railway's web dashboard (with MFA) — they are not stored locally on personal devices in plaintext
- Local development uses only Plaid sandbox credentials, never production credentials
- If a personal device used to access production systems is lost or stolen, the incident response process requires immediate revocation of all credentials accessible from that device (Railway, GitHub, Plaid)

---

### Q7. Describe your production access control processes, including how access is provisioned, reviewed, and revoked.

**Answer:**

**Platform-level production access (Railway, GitHub):**
- Production system access is limited to personnel with an operational need
- Access is provisioned individually — no shared accounts
- All production accounts require MFA
- Access is revoked immediately upon role change or departure
- A quarterly review of all users with production access is performed

**Application-level access (within StewardView):**
- All user accounts require authentication (bcrypt-hashed passwords, JWT sessions)
- Accounts are scoped to a specific tenant — cross-tenant access is architecturally prevented
- Four roles enforce least-privilege: Admin, Treasurer, Finance Committee, Viewer
- Admin users can create, modify, and deactivate accounts within their tenant
- Account deactivation is immediate and revokes all active sessions

**Database access:**
- Direct database access is restricted to the application server's private network connection within Railway
- No external database access is permitted (no public database host/port exposure)
- Database credentials are stored as Railway environment variables, not in code

**Audit logging:**
- All significant in-application actions (financial transactions, user management, account changes) are logged to the `audit_log` table with the acting user's ID, IP address, and timestamp

---

### Q8. Describe how you deploy strong authentication factors for systems that access Plaid data.

**Answer:**

**Application authentication (end users accessing Plaid-linked data):**
- All users authenticate with a username/password (bcrypt, 10 salt rounds) and receive a signed JWT (8-hour expiration)
- JWT secrets are cryptographically strong random values stored exclusively as environment variables
- All API endpoints require a valid JWT before returning any data
- Invalid or expired tokens result in a 401 response before any data access occurs
- Role-based authorization is checked on every request beyond authentication

**Platform authentication (developer/admin access to systems holding Plaid credentials):**
- Railway account: protected with MFA (required for all team members)
- GitHub repository: protected with MFA
- Plaid dashboard: protected with MFA

**Plaid API credential security:**
- `PLAID_CLIENT_ID` and `PLAID_SECRET` are stored exclusively as Railway environment variables
- These credentials are never embedded in source code, logs, or client-side code
- The Plaid secret is accessible only to the server-side application process

**Note on end-user 2FA:** Application-level two-factor authentication for end users is on the product roadmap. Currently, strong password requirements, rate limiting, and JWT-based session controls provide the primary authentication defense. See Q25 for additional detail.

---

## Part Two: Development & Data Protection

---

### Q9. Describe your code change building and release processes.

**Answer:**

**Development workflow:**
1. All code changes are developed in feature branches of a private Git repository (GitHub)
2. Changes are reviewed locally and tested in development using Plaid Sandbox credentials
3. Changes are merged to the `main` branch via pull request

**Deployment process:**
1. Merges to `main` trigger Railway's build pipeline (Nixpacks builder)
2. Railway installs dependencies and builds the React frontend (`npm run build`)
3. `npm audit` is run as part of the build process
4. The production application starts and runs database migrations automatically
5. Railway's health check (`/api/health`) must return `ok` before traffic is routed to the new deployment
6. If the health check fails, Railway does not promote the deployment

**Environment separation:**
- Development uses Plaid Sandbox credentials and a local/development database
- Production credentials are stored only as Railway environment variables and are never present in the development environment

---

### Q10. Describe how code testing is enforced before production deployment.

**Answer:**

- All code changes are tested in a local development environment with Plaid Sandbox before being deployed
- The application's health check endpoint (`/api/health`) gates production traffic — deployments that fail health checks are not promoted
- Database migrations are run in a transactional manner with retry logic (10 attempts, 3-second intervals) before the app accepts traffic
- Manual integration testing is performed on all Plaid-related flows (Link, token exchange, sync) against Sandbox before deploying changes that affect the Plaid integration
- API endpoint behavior is verified manually before production pushes for changes affecting financial data handling

**Planned improvement:** Automated integration test suite is on the roadmap to formalize this process.

---

### Q11. Describe how code review and approval is enforced before production deployment.

**Answer:**

- All production deployments originate from the `main` branch of the private GitHub repository
- Code changes require review and approval via GitHub pull request before merging to `main`
- The repository owner (Platform Administrator) reviews all changes affecting security-sensitive areas: authentication, authorization, Plaid integration, encryption, and data access
- Branch protection rules on `main` prevent direct pushes without a pull request
- Emergency hotfixes follow the same PR process with expedited review

---

### Q12. Do you use TLS 1.2 or higher to encrypt communications between clients and servers?

**Answer:** Yes.

- All client-to-server communications use HTTPS with TLS 1.2 or higher, enforced by Railway's infrastructure (which terminates TLS at the edge)
- The application does not serve any HTTP-only endpoints in production
- All Plaid API calls are made over HTTPS to Plaid's endpoints using the Plaid Node.js SDK, which enforces TLS
- Database connections in production use TLS-encrypted connections (`ssl` enabled in Knex.js production configuration)
- HTTP Strict Transport Security (HSTS) headers are set on all responses via Helmet.js

---

### Q13. Do you encrypt Plaid API data at rest? Describe your encryption approach.

**Answer:** Yes.

**Plaid access tokens (highest sensitivity):**
- Encrypted using **AES-256-GCM** before storage in the `bank_accounts.plaid_access_token` database column
- A unique 128-bit initialization vector (IV) is generated for every token
- The encryption key (`PLAID_TOKEN_KEY`) is a 256-bit secret stored exclusively as a Railway environment variable — never in source code, logs, or version control
- Decryption occurs server-side only at the moment of a Plaid API call; the plaintext token is never stored, logged, or transmitted to the client

**Plaid public tokens:**
- Exchanged server-side immediately after the Link flow
- Never stored; they are single-use and discarded after exchange

**Derived data (transactions, balances):**
- Stored in PostgreSQL within Railway's managed database, which provides encryption at rest at the storage layer
- Transaction data is scoped to tenant and accessible only to authenticated, authorized users

**What is NOT stored:**
- Full bank account numbers (only the last-4 mask from Plaid is retained)
- Plaid public tokens (never persisted)
- Any Plaid credential beyond the encrypted access token

---

### Q14. Do you maintain audit trails and logging for production events? Describe your logging approach.

**Answer:** Yes.

**Application audit log (`audit_log` table):**
Every significant action in the system is permanently recorded with:
- `entity_type` and `entity_id` (what was affected)
- `action` (create, update, delete, approve, void, etc.)
- `old_values` and `new_values` (JSON diff of changes)
- `user_id` (who performed the action)
- `ip_address` (originating IP)
- `created_at` (timestamp)

This provides a complete, tamper-evident audit trail of all financial operations and user management actions.

**Plaid-specific logging (`bank_sync_log` table):**
- Every Plaid sync attempt is logged with status (success/failure), timestamp, and error details

**HTTP access logging:**
- All HTTP requests are logged via Morgan middleware (method, path, status code, response time)
- Sensitive values (tokens, passwords, API keys) are explicitly excluded from logs

**Security event logging:**
- Bot/probe attempts (requests for `.env`, `.git`, etc.) are detected and logged
- Rate limit violations are logged
- Failed authentication attempts produce log entries

**Log retention:**
- Application audit logs are retained indefinitely in the database
- HTTP access logs are retained per Railway's platform logging retention policy

---

### Q15. Describe your real-time monitoring and alerting mechanisms.

**Answer:**

- **Health check monitoring:** Railway continuously polls `/api/health` and triggers restart/alerting on failure
- **Process failure alerting:** Railway's `ON_FAILURE` restart policy (max 3 retries) alerts on repeated process crashes
- **Uptime monitoring:** The `/api/health` endpoint is configured for external uptime monitoring (e.g., UptimeRobot or Railway's built-in checks)
- **Plaid sync failure visibility:** Sync errors are surfaced to tenant administrators through the application UI and recorded in `bank_sync_log`
- **Rate limit detection:** The global rate limiter flags and throttles IPs exhibiting anomalous request patterns
- **Log review:** Application and access logs are reviewed following any reported incident or anomaly

**Planned improvement:** Integration of a dedicated alerting service (e.g., Sentry for error tracking, PagerDuty for on-call alerting) is on the roadmap to improve real-time alerting coverage.

---

## Part Three: Governance & Client Security

---

### Q16. Describe your security incident detection and resolution processes.

**Answer:**

See the full **Incident Response Plan** ([incident-response-plan.md](incident-response-plan.md)) for complete procedures. Summary:

**Detection:**
- Anomalous access patterns detected via rate limiting and log review
- Health check failures trigger platform alerts
- User-reported anomalies are triaged by the Platform Administrator
- Plaid sync failures or unexpected token invalidation may indicate compromise

**Response (5-step process):**
1. **Contain** — Revoke compromised credentials, suspend affected tenants, isolate components
2. **Assess** — Determine scope using audit logs and access logs
3. **Notify** — Alert affected tenants within 72 hours; notify Plaid at security@plaid.com per their requirements; comply with state breach notification laws
4. **Remediate** — Rotate credentials, re-encrypt tokens, force password resets, deploy patches
5. **Review** — Post-incident retrospective; update policy and controls

**Plaid token compromise protocol:**
If a Plaid access token is suspected compromised: immediately rotate the encryption key, re-encrypt all stored tokens, notify affected tenants, and report to Plaid support.

---

### Q17. Describe your network segmentation based on asset sensitivity.

**Answer:**

StewardView operates on Railway's managed cloud platform, which provides network segmentation at the infrastructure level:

- **Database isolation:** The PostgreSQL database is on Railway's private network and is not accessible from the public internet. Only the application server process can connect to it, using environment-variable-stored credentials
- **No public database ports:** The database has no externally accessible host/port
- **Application server:** Serves only HTTP/HTTPS on a single port; all other ports are closed
- **No administrative interfaces exposed:** There are no SSH endpoints, admin panels, or management ports exposed to the internet
- **Plaid API calls:** Outbound only, over HTTPS to Plaid's endpoints; no inbound connections from Plaid are required

Within the application, sensitive Plaid credentials are handled only in server-side code (Node.js/Express). No Plaid access tokens or API secrets are ever transmitted to or accessible from the client-side React application.

---

### Q18. Describe your employee and contractor security awareness training processes.

**Answer:**

See the **Security Awareness Training Policy** ([security-awareness-training.md](security-awareness-training.md)).

StewardView is operated by a small team. Our security training approach:

**Onboarding:**
- All new personnel with system access receive onboarding security training covering:
  - This Information Security Policy and all supporting documents
  - Plaid developer policy requirements and obligations
  - Credential handling and secret management practices
  - Phishing and social engineering awareness
  - Incident reporting procedures

**Ongoing:**
- Security policy is reviewed annually; all personnel with system access acknowledge the updated policy
- Security advisories from Plaid, Railway, and npm/Node.js ecosystem are reviewed and acted upon as they arise
- Personnel are briefed on any significant security incidents or near-misses as lessons-learned

**Specific training areas:**
- Never committing secrets to version control
- Using MFA on all production accounts
- Recognizing and reporting phishing attempts
- Proper handling of Plaid credentials and end-user data

---

### Q19. Describe your vendor intake and monitoring processes.

**Answer:**

See the **Vendor Risk Management Policy** ([vendor-risk-management.md](vendor-risk-management.md)).

**Current critical vendors:**

| Vendor | Purpose | Security Certifications | Review Frequency |
|---|---|---|---|
| Plaid | Bank account linking | PCI DSS, SOC 2 Type II, ISO 27001, ISO 27701 | Annual |
| Railway | Hosting & database | SOC 2 Type II | Annual |
| Stripe | Subscription billing | PCI DSS Level 1 | Annual |

**Intake process:**
- Before onboarding a new vendor with access to production data or systems, we review their security posture (SOC 2 reports, public security documentation, certifications)
- Vendor security pages and trust centers are reviewed for recent incidents
- Contracts include data processing and security expectations where applicable

**Ongoing monitoring:**
- Security advisories and status pages for all critical vendors are monitored
- Plaid's developer policy updates are monitored and implemented
- Vendor SOC 2 reports are reviewed upon renewal

---

### Q20. Do you conduct independent auditing and penetration testing? Describe your approach.

**Answer:**

**Current state:**
StewardView has not yet engaged an external firm for formal penetration testing. Given the platform's stage, our current security assurance approach relies on:

- Continuous automated dependency vulnerability scanning (`npm audit`, Dependabot)
- Code review for all changes with security implications
- Manual security testing of authentication, authorization, and Plaid integration flows
- Railway's platform-level security (which undergoes its own third-party audits)
- Plaid's own security controls on the bank-linking flow

**Planned:**
- A formal external penetration test is planned prior to broad production launch. This will specifically target the authentication layer, multi-tenant isolation, Plaid token handling, and API endpoints.
- Results will be remediated and documented.

We are committed to providing Plaid with our penetration test report once completed.

---

### Q21. Do you conduct background checks on employees and contractors with access to production systems?

**Answer:**

StewardView is a small, closely-held business. Personnel with access to production systems are known principals of the company. Formal third-party background check services have not been engaged for the current team.

For any future hires or contractors who would receive access to production systems or customer data, we commit to conducting appropriate background screening (criminal history check at minimum) before granting access.

---

### Q22. How do you obtain consumer consent for data collection via Plaid?

**Answer:**

StewardView's users are church administrators and treasurers — institutional users managing their organization's financial accounts. Consent is obtained as follows:

**In-application consent flow:**
1. The user (church administrator/treasurer) navigates to the "Link Bank Account" feature
2. Before initiating Plaid Link, the user is presented with a clear explanation of what data will be accessed (bank balances and transactions) and why (financial management and reporting)
3. The user explicitly initiates Plaid Link, which itself presents Plaid's own consent flow and privacy disclosures
4. The user authenticates with their bank through Plaid's secure UI — StewardView never sees bank login credentials
5. After successful linking, a confirmation is shown and the linked account appears in their dashboard

**Terms of Service and Privacy Policy:**
- Users agree to StewardView's Terms of Service and Privacy Policy upon account creation
- The Privacy Policy discloses the use of Plaid and the data collected through the integration
- Users can unlink bank accounts at any time through the application, which removes the stored access token

**Plaid's built-in consent:**
Plaid's own Link UI includes Plaid's privacy policy and consent disclosures, providing an additional layer of consumer consent independent of StewardView.

---

### Q23. Describe your data deletion and retention policies.

**Answer:**

See the full **Data Retention and Deletion Policy** ([data-retention-policy.md](data-retention-policy.md)).

**Plaid-specific data retention:**
- Plaid access tokens: retained for as long as the bank account is linked. Deleted immediately when the user unlinks an account.
- Transaction data synced from Plaid: retained for the life of the tenant account for financial record-keeping purposes (churches have legal record-keeping obligations)
- Bank account metadata (institution name, account mask): retained while the account is linked; deleted upon unlinking

**Tenant data retention:**
- Active tenant data is retained for the duration of the subscription
- Upon account cancellation, tenant data is retained for 90 days to allow for data export, then deleted
- Deletion covers all financial records, user accounts, bank account data (including Plaid tokens), and audit logs associated with that tenant

**User account deletion:**
- Individual user accounts can be deleted by tenant admins at any time
- Deletion removes authentication credentials; financial records created by that user are retained for audit integrity

**Backup retention:**
- Automated daily database backups are retained for 30 days, then automatically pruned

---

### Q24. Do you sell consumer data to third parties?

**Answer:** No.

StewardView does not sell, rent, license, or otherwise transfer end-user data or financial data to any third party for commercial purposes. Data collected through Plaid is used exclusively to provide StewardView's financial management features to the tenant organization that authorized the data access.

Data sharing is limited to:
- **Plaid:** To retrieve the authorized financial data on behalf of the user
- **Railway:** As the hosting provider processing data on our behalf
- **Stripe:** Only billing-related data (no financial transaction or Plaid data) for subscription management

No data analytics platforms, data brokers, or advertising platforms receive any customer data.

---

### Q25. Do you enforce two-factor authentication in your client applications?

**Answer:**

**Platform/admin systems:** Yes — MFA is enforced on all production system accounts (Railway, GitHub, Plaid dashboard).

**End-user application:** Application-level two-factor authentication (e.g., TOTP) for StewardView end users is currently not implemented but is on the near-term product roadmap.

Current compensating controls for end-user authentication:
- Bcrypt password hashing (10 salt rounds)
- JWT tokens with 8-hour expiration (sessions do not persist indefinitely)
- Rate limiting (200 requests/15 minutes) mitigates brute-force attacks
- All API traffic over HTTPS/TLS
- Audit logging of all authentication events and data access
- Users are church finance personnel — a relatively low-risk population compared to general consumer fintech

We are committed to implementing TOTP-based 2FA for all user accounts prior to broad production launch and will update Plaid when this is available.

---

## Attestation

I attest that the information provided in this questionnaire is accurate and complete to the best of my knowledge. I understand that StewardView is responsible for maintaining the security controls described herein and for promptly notifying Plaid at security@plaid.com of any security incidents that may affect Plaid data or credentials.

**Name:** ___________________________
**Title:** ___________________________
**Date:** March 16, 2026
**Email:** ___________________________
