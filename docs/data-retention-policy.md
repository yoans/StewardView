# Data Retention and Deletion Policy
**StewardView — Church Finance Management Platform**
**Version:** 1.0
**Effective Date:** March 16, 2026
**Owner:** Platform Administrator

---

## 1. Purpose

This policy defines how StewardView retains, archives, and deletes data — including financial records, user data, and data obtained through the Plaid integration — to meet legal, operational, and contractual requirements while minimizing unnecessary data retention.

---

## 2. Data Categories and Retention Periods

### 2.1 Plaid Integration Data

| Data Type | Retention Period | Deletion Trigger |
|---|---|---|
| Plaid access tokens (encrypted) | Duration of account link | Immediate on account unlink or tenant deletion |
| Plaid public tokens | Never stored | Exchanged immediately, discarded |
| Transaction data synced from Plaid | Life of tenant account | 90 days after tenant cancellation, then deleted |
| Bank account metadata (institution, mask) | Duration of account link | Immediate on account unlink or tenant deletion |
| Bank sync logs | 12 months | Automatic purge after 12 months |

### 2.2 Financial Records

| Data Type | Retention Period | Rationale |
|---|---|---|
| Transaction records | Life of tenant account + 90 days | Church financial record-keeping obligations (typically 7 years) |
| Fund records and balances | Life of tenant account + 90 days | Audit and governance requirements |
| Budget data | Life of tenant account + 90 days | Financial reporting continuity |
| Monthly reports (PDFs) | Life of tenant account + 90 days | Financial accountability records |
| Audit log | Life of tenant account + 90 days | Immutable transaction history |

**Note:** Church organizations are subject to financial record-keeping requirements (generally 7 years under IRS guidance for US nonprofits). Tenants are advised to export their data before account cancellation if they require records beyond the 90-day post-cancellation window.

### 2.3 User Data

| Data Type | Retention Period | Notes |
|---|---|---|
| User accounts (credentials) | Until deleted by admin or tenant deletion | bcrypt hash only; passwords not recoverable |
| User profile (name, email, role) | Until deleted by admin or tenant deletion | |
| Individual user deletion | Immediate | Financial records attributed to the user are retained for audit integrity; personal identifiers are disassociated where possible |

### 2.4 Tenant Data

| Data Type | Retention Period | Notes |
|---|---|---|
| Active tenant data | Duration of subscription | |
| Canceled tenant data | 90 days post-cancellation | Allows data export before permanent deletion |
| Suspended tenant data | Duration of suspension + 90 days if not reactivated | |
| Tenant configuration (branding, settings) | 90 days post-cancellation | |

### 2.5 Backups

| Data Type | Retention Period | Notes |
|---|---|---|
| Automated daily database backups | 30 days | Older backups are automatically pruned by the scheduled backup job |
| Railway platform backups | Per Railway's policy (minimum 7 days) | Managed by Railway infrastructure |

### 2.6 Logs

| Data Type | Retention Period | Notes |
|---|---|---|
| HTTP access logs | 30 days | Retained by Railway's logging infrastructure |
| Application audit log | Life of tenant + 90 days | Stored in `audit_log` database table |
| Security event logs | 90 days minimum | Rate limit violations, probe attempts |

---

## 3. Deletion Procedures

### 3.1 User-Initiated Account Unlinking (Plaid)
When a user unlinks a bank account through the StewardView application:
1. The Plaid access token is immediately deleted from the `bank_accounts` table
2. The bank account record is soft-deleted (marked inactive)
3. Historical transaction data synced from that account is retained for financial record-keeping
4. The deletion is recorded in the audit log

### 3.2 Individual User Account Deletion
When a tenant admin deletes a user account:
1. Authentication credentials (password hash, JWT) are invalidated immediately
2. The user record is removed from the `users` table
3. Financial records (transactions, audit entries) attributed to the user are retained with the user ID reference preserved for audit integrity
4. The deletion is recorded in the audit log

### 3.3 Tenant Account Cancellation
When a tenant cancels their subscription:
1. The tenant status is set to `canceled` — all application access is immediately blocked
2. A 90-day data retention window begins
3. During this window, the tenant may contact support to export their data
4. After 90 days, a scheduled deletion job permanently deletes:
   - All bank accounts and associated Plaid access tokens
   - All financial records (transactions, funds, budgets)
   - All user accounts
   - All reports and backups
   - All audit logs
   - All tenant configuration
5. Deletion is logged at the platform level before execution

### 3.4 Data Deletion Requests
If an individual user requests deletion of their personal data:
1. The request is triaged by the Platform Administrator
2. Personal identifiers (name, email) are removed from the user record
3. Financial records attributed to the user are retained (audit integrity requirement) with personal identifiers disassociated
4. A response is provided to the requester within 30 days

---

## 4. Data Export

Tenants may request a full data export at any time by contacting support. Exports include:
- All transaction records
- Fund balances and history
- Budget data
- User list (without password hashes)
- Monthly reports

Exports are provided in a machine-readable format (JSON or CSV) within 5 business days of request.

---

## 5. Policy Review

This policy is reviewed annually and updated to reflect changes in legal requirements, platform capabilities, or Plaid's requirements.
