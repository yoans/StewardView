# Vendor Risk Management Policy
**StewardView — Church Finance Management Platform**
**Version:** 1.0
**Effective Date:** March 16, 2026
**Owner:** Platform Administrator

---

## 1. Purpose

This policy defines how StewardView evaluates, onboards, and monitors third-party vendors that have access to, process, or transmit customer data or that provide critical infrastructure for the platform.

---

## 2. Vendor Classification

### Tier 1 — Critical Vendors (access to financial data or credentials)
Vendors that directly process, store, or transmit customer financial data, Plaid data, or production secrets.

### Tier 2 — Infrastructure Vendors (process data on our behalf)
Vendors that provide hosting, database, or compute infrastructure that stores or processes customer data.

### Tier 3 — Supporting Vendors (no direct data access)
Vendors providing tools, services, or SaaS products that do not have direct access to customer financial data.

---

## 3. Current Vendor Register

| Vendor | Tier | Purpose | Security Certifications | Status Page | Last Reviewed |
|---|---|---|---|---|---|
| **Plaid** | 1 | Bank account linking and transaction data | PCI DSS, SOC 2 Type II, ISO 27001, ISO 27701 | status.plaid.com | March 2026 |
| **Railway** | 2 | Application hosting and managed PostgreSQL | SOC 2 Type II | status.railway.app | March 2026 |
| **Stripe** | 1 | Subscription billing | PCI DSS Level 1 Service Provider, SOC 2 | status.stripe.com | March 2026 |
| **GitHub** | 2 | Source code repository | SOC 2 Type II, ISO 27001 | githubstatus.com | March 2026 |

---

## 4. Vendor Intake Process

Before onboarding any new Tier 1 or Tier 2 vendor:

### Step 1: Security Assessment
- Review vendor's publicly available security documentation, trust center, and certifications
- Obtain the most recent SOC 2 Type II report or equivalent (ISO 27001 certification, PCI AOC)
- Review the vendor's incident history and disclosed breaches
- Assess the vendor's data residency and data handling practices

### Step 2: Data Handling Review
- Identify what customer data the vendor will access, process, or store
- Ensure the vendor's data handling practices align with StewardView's Data Retention Policy
- Confirm the vendor provides data deletion capabilities upon contract termination
- Review the vendor's sub-processor list (for Tier 1 vendors)

### Step 3: Contractual Controls
- Ensure a Data Processing Agreement (DPA) is in place for vendors processing personal data
- Confirm the vendor's SLA meets StewardView's availability requirements
- Confirm the vendor's security incident notification obligations (must notify within 72 hours of a breach affecting our data)

### Step 4: Approval
- Platform Administrator reviews and approves the vendor addition
- Vendor is added to the Vendor Register (Section 3)

---

## 5. Ongoing Vendor Monitoring

### Annual Review
All Tier 1 and Tier 2 vendors are reviewed annually:
- Review updated SOC 2 report or certification status
- Review the vendor's trust/security page for any reported incidents in the past year
- Confirm the vendor's services still meet StewardView's security requirements
- Update the Vendor Register with review date

### Continuous Monitoring
- **Status pages** for all Tier 1 and Tier 2 vendors are monitored for service incidents
- **Security advisories** from Plaid, Railway, Stripe, and the Node.js/npm ecosystem are monitored via mailing lists and security advisories
- **CVEs** in vendor software components (SDKs, drivers) are tracked via `npm audit` and Dependabot

### Incident-Triggered Review
If a vendor experiences a security incident that may affect StewardView or its customers:
1. Assess the impact on StewardView's data and operations
2. Follow up with the vendor on remediation steps and timeline
3. Implement compensating controls if necessary
4. If the incident represents an unacceptable risk, begin vendor replacement planning

---

## 6. Vendor Offboarding

When a vendor relationship is terminated:
1. Revoke all credentials and API access provided to the vendor
2. Request confirmation of data deletion from the vendor per the DPA
3. Verify that all customer data previously processed by the vendor is deleted or transferred
4. Remove the vendor from the Vendor Register (or mark as inactive with date)

---

## 7. Plaid-Specific Obligations

As a Plaid developer, StewardView is obligated to:
- Comply with Plaid's Developer Policy at all times
- Never share Plaid credentials with unauthorized parties
- Notify Plaid at security@plaid.com immediately upon any security incident affecting Plaid data or credentials
- Ensure Plaid data is used only for the purposes disclosed during onboarding (church financial management)
- Not sell, rent, or transfer end-user data obtained via Plaid to any third party

These obligations are incorporated into this vendor management policy as binding requirements.

---

## 8. Policy Review

This policy is reviewed annually and updated to reflect changes in the vendor landscape or security requirements.
