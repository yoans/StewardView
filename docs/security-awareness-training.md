# Security Awareness Training Policy
**StewardView — Church Finance Management Platform**
**Version:** 1.0
**Effective Date:** March 16, 2026
**Owner:** Platform Administrator

---

## 1. Purpose

This policy establishes security awareness training requirements for all StewardView personnel with access to production systems or customer data, ensuring they understand their responsibilities and how to protect sensitive financial information.

---

## 2. Scope

Applies to all employees, contractors, and other authorized individuals who have access to:
- Production infrastructure (Railway, GitHub)
- Production database or customer data
- Plaid, Stripe, or other third-party service credentials
- StewardView source code

---

## 3. Onboarding Training

All new personnel with system access must complete onboarding security training before being granted production access. Onboarding training covers:

### 3.1 Policy Review
- Read and acknowledge the **Information Security Policy**
- Read and acknowledge the **Acceptable Use Policy**
- Read and acknowledge this **Security Awareness Training Policy**
- Review the **Incident Response Plan** and understand how to report incidents

### 3.2 Credential and Secret Handling
- How to access production secrets (via Railway dashboard only)
- Why secrets must never be committed to Git
- What to do if a secret is accidentally exposed
- How Plaid credentials are handled and why they must be protected
- Overview of AES-256-GCM encryption used for Plaid access tokens

### 3.3 Plaid Developer Policy
- Review Plaid's Developer Policy (plaid.com/developer-policy)
- Understand what data StewardView is authorized to collect and use via Plaid
- Understand the prohibition on selling or misusing end-user financial data
- Understand incident reporting obligations to Plaid

### 3.4 Access Controls
- How multi-tenant isolation works (why one tenant cannot see another's data)
- How role-based access control works in StewardView
- How to use MFA on all production accounts
- When and how to revoke access (departing personnel, device loss)

### 3.5 Phishing and Social Engineering
- How to recognize phishing emails and fake login pages
- Why Plaid or other vendors will never ask for credentials via email
- How to report suspected phishing attempts
- Password hygiene (use a password manager, use unique passwords per service)

### 3.6 Incident Reporting
- What constitutes a security incident
- How to report a suspected incident (contact the Platform Administrator immediately)
- Why prompt reporting is critical — the faster we contain, the less damage

---

## 4. Annual Training

All personnel with system access must complete annual refresher training, which includes:

- Acknowledging any updates to the Information Security Policy, Acceptable Use Policy, or Incident Response Plan
- A review of any security incidents or near-misses from the past year and lessons learned
- Updated awareness of any new threats relevant to the platform (e.g., new attack patterns against Node.js apps, Plaid-related phishing)
- Review of Plaid's updated developer policies if changes occurred

Annual training is completed before the anniversary of the employee's start date or the policy effective date, whichever is applicable.

---

## 5. Ad Hoc Training

Ad hoc security briefings occur when:
- A significant security incident or near-miss occurs (lessons-learned briefing within 2 weeks)
- A critical vulnerability is disclosed in a technology StewardView uses (briefing within 1 week)
- Plaid or Railway issues significant security guidance or policy updates
- A new threat pattern emerges that is directly relevant to the platform

---

## 6. Training Records

The Platform Administrator maintains records of training completion, including:
- Date of training completion
- Topics covered
- Name of personnel trained
- Acknowledgment signature (electronic or written)

Records are retained for a minimum of 3 years.

---

## 7. Consequences of Non-Compliance

Personnel who do not complete required training by the deadline will have their production access suspended until training is completed. Repeated non-compliance or deliberate violation of security policies may result in permanent revocation of access and termination.

---

## 8. Policy Review

This training policy is reviewed annually and updated to reflect changes in security requirements, platform changes, or lessons learned from incidents.
