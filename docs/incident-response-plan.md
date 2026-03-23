# Security Incident Response Plan
**StewardView — Church Finance Management Platform**
**Version:** 1.0
**Effective Date:** March 16, 2026
**Owner:** Platform Administrator

---

## 1. Purpose

This plan defines how StewardView detects, responds to, and recovers from security incidents, with specific procedures for incidents involving Plaid data or credentials.

---

## 2. Incident Severity Levels

| Severity | Definition | Examples | Response Time |
|---|---|---|---|
| **Critical (P1)** | Active breach or confirmed exposure of Plaid tokens, financial data, or credentials | Plaid access token exposed in logs; database dump exfiltrated; credential compromise confirmed | Immediate (< 1 hour) |
| **High (P2)** | Probable unauthorized access or significant security control failure | Anomalous API access patterns suggesting account takeover; JWT secret potentially exposed | < 4 hours |
| **Medium (P3)** | Security control degradation or unconfirmed suspicious activity | Rate limiter bypass; dependency with critical CVE deployed; suspicious login patterns | < 24 hours |
| **Low (P4)** | Policy violation or minor security finding with no immediate data risk | Secret accidentally in log (no external access confirmed); expired certificate warning | < 72 hours |

---

## 3. Incident Response Procedures

### Phase 1: Detection and Triage

**Detection sources:**
- Railway health check failures or process crash alerts
- Plaid sync failures or unexpected access token invalidation (may indicate token revocation by Plaid due to compromise)
- Anomalous patterns in HTTP access logs (mass requests, unusual endpoints, unexpected geographic access)
- Rate limiter trigger patterns suggesting brute-force or scraping
- User-reported anomalies (unexpected transactions, unknown accounts)
- `npm audit` or Dependabot alerts for critical CVEs
- External security researchers (responsible disclosure)

**Triage steps:**
1. Acknowledge the potential incident
2. Assign severity level based on Section 2
3. For P1/P2: immediately convene the Platform Administrator
4. Begin an incident log documenting all findings and actions with timestamps

---

### Phase 2: Containment

Actions depend on incident type. Execute relevant containment steps immediately:

**Suspected Plaid credential compromise:**
- [ ] Rotate `PLAID_SECRET` in Plaid dashboard immediately
- [ ] Update the `PLAID_SECRET` environment variable in Railway
- [ ] Redeploy the application to pick up new credentials
- [ ] Monitor Plaid API logs for unauthorized usage

**Suspected Plaid access token exposure (encrypted token key compromised):**
- [ ] Rotate the `PLAID_TOKEN_KEY` encryption key immediately
- [ ] Update `PLAID_TOKEN_KEY` in Railway environment variables
- [ ] Re-encrypt all stored Plaid access tokens with the new key
- [ ] Notify affected tenants to re-link bank accounts via Plaid Link
- [ ] Report to Plaid at security@plaid.com

**Suspected user credential breach:**
- [ ] Force invalidation of all active JWT sessions (rotate `JWT_SECRET`)
- [ ] Require all users to re-authenticate
- [ ] Reset passwords for confirmed compromised accounts
- [ ] Review audit logs for unauthorized actions during the suspected compromise window

**Suspected database exfiltration:**
- [ ] Immediately revoke database credentials in Railway and rotate
- [ ] Verify database connection logs for unauthorized access
- [ ] Determine which tables and tenants may be affected
- [ ] Engage Railway support if platform-level breach is suspected

**Active attack / DDoS:**
- [ ] Engage Railway support to enable additional rate limiting or IP blocking at the infrastructure level
- [ ] Review and tighten application-level rate limits
- [ ] Identify attacking IP ranges and block at platform level

---

### Phase 3: Assessment

Once contained, assess the full scope:

1. **Timeline reconstruction:** Use audit logs, HTTP access logs, and `bank_sync_log` to establish when the incident began, what was accessed, and by whom
2. **Data scope:** Identify which tenants, which accounts, and which data types (transactions, balances, Plaid tokens) were potentially exposed
3. **Root cause:** Identify the vulnerability or failure mode that enabled the incident
4. **Plaid token exposure assessment:** Determine if any Plaid access tokens were accessible in plaintext (i.e., was the `PLAID_TOKEN_KEY` exposed before tokens were decrypted?)

---

### Phase 4: Notification

#### 4.1 Plaid Notification
Per Plaid's Developer Policy, notify Plaid at **security@plaid.com** immediately upon confirmation of any incident affecting:
- Plaid API credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`)
- Plaid access tokens (even encrypted, if the encryption key may be compromised)
- End-user financial data obtained via Plaid

Include in the notification:
- Nature and scope of the incident
- Affected data types and estimated number of affected users
- Containment actions taken
- Planned remediation steps

#### 4.2 Tenant Notification
Affected tenants must be notified within **72 hours** of confirming a breach. The notification must include:
- What happened (in plain language)
- What data was affected
- What StewardView has done in response
- What the tenant should do (e.g., re-link bank accounts, change passwords)
- Contact information for follow-up questions

#### 4.3 Regulatory Notification
Depending on the nature and jurisdiction:
- Most US states require notification of affected individuals within 30–72 days of a breach of personal financial data
- Evaluate applicable state breach notification laws based on where affected tenants are located
- Consult legal counsel if the breach may trigger regulatory reporting obligations

---

### Phase 5: Remediation

1. Deploy patches for any exploited vulnerability
2. Re-encrypt data if encryption keys were compromised
3. Implement additional controls to prevent recurrence
4. Verify remediation effectiveness through testing
5. Update the Acceptable Use Policy if human error contributed to the incident

---

### Phase 6: Post-Incident Review

Within 2 weeks of incident resolution:
1. Conduct a written post-incident retrospective (blameless)
2. Document: what happened, what we detected it with, how we responded, what worked, what didn't
3. Identify and assign remediation action items with owners and deadlines
4. Update this plan and the Information Security Policy as needed
5. Share relevant lessons with all personnel

---

## 4. Specific Plaid Incident Procedures

### 4.1 Plaid Access Token Compromise Protocol
If any Plaid access token is confirmed or suspected to be compromised:

1. **Immediately** rotate `PLAID_TOKEN_KEY` in Railway environment variables
2. Re-encrypt all tokens currently in `bank_accounts.plaid_access_token` with the new key
3. Notify `security@plaid.com` within 24 hours with incident details
4. Notify affected tenants and advise them to re-link their bank accounts via Plaid Link
5. Revoke affected Plaid access tokens via Plaid's API if possible
6. Document the full timeline and scope for the post-incident review

### 4.2 Plaid Credential (Client ID / Secret) Compromise Protocol
If `PLAID_CLIENT_ID` or `PLAID_SECRET` is compromised:

1. **Immediately** rotate credentials in the Plaid developer dashboard
2. Update Railway environment variables with new credentials
3. Redeploy the application
4. Notify `security@plaid.com`
5. Review Plaid API request logs (in Plaid dashboard) for any unauthorized API calls made with the compromised credentials
6. Report any unauthorized API calls to Plaid

---

## 5. Contact Information

| Role | Contact |
|---|---|
| Platform Administrator (primary incident contact) | [Name] — [email] — [phone] |
| Plaid Security | security@plaid.com |
| Railway Support | support@railway.app |
| Legal Counsel | [Name / Firm if applicable] |

---

## 6. Plan Review

This plan is reviewed annually and after every P1 or P2 incident. Tabletop exercises are conducted at least annually to validate response procedures.
