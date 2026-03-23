# Acceptable Use Policy
**StewardView — Church Finance Management Platform**
**Version:** 1.0
**Effective Date:** March 16, 2026
**Owner:** Platform Administrator

---

## 1. Purpose

This policy defines acceptable use of StewardView's production systems, credentials, and data by personnel (employees, contractors, and other authorized individuals) to protect the security of the platform and its customers' financial data.

---

## 2. Scope

This policy applies to all individuals who have been granted access to any of the following:
- StewardView production hosting environment (Railway)
- Production database
- Source code repository (GitHub)
- Plaid developer credentials (Client ID, Secret)
- Stripe credentials
- Any environment variables or secrets used in production

---

## 3. General Principles

All authorized personnel must:

- Use production system access only for legitimate, work-related purposes
- Protect credentials and access tokens as confidential information
- Report any suspected security incident or unauthorized access immediately to the Platform Administrator
- Comply with this policy, the Information Security Policy, and all related procedures at all times

---

## 4. Credential and Secret Management

### 4.1 Prohibition on Sharing Credentials
- Production credentials (API keys, database passwords, JWT secrets, Plaid credentials) must **never** be shared with unauthorized parties
- Credentials must **never** be communicated via email, Slack, SMS, or any unencrypted channel
- Each authorized user must use their own individual account — shared credentials are prohibited

### 4.2 Secret Storage
- Secrets must be stored **only** in Railway's environment variable management system
- Secrets must **never** be committed to version control (Git), included in code comments, or hardcoded in application files
- `.env` files containing secrets must be kept off of shared drives and out of version control at all times
- If a secret is inadvertently committed to version control, it must be treated as compromised: rotate it immediately and report the incident

### 4.3 Local Development
- Local development must use Plaid Sandbox credentials only — production Plaid credentials must never be used in local development environments
- Local development databases must not contain real customer financial data

---

## 5. Device and Access Controls

### 5.1 Multi-Factor Authentication
- MFA must be enabled on all accounts used to access production systems: Railway, GitHub, Plaid dashboard, Stripe dashboard
- Loss of an MFA device must be reported immediately so access can be reviewed and re-secured

### 5.2 Device Security
Personnel accessing production systems from any device (personal or company) must:
- Keep the operating system and browser fully patched and updated
- Use a device with active endpoint protection (antivirus/antimalware)
- Lock their screen when stepping away
- Not access production systems from public computers or untrusted networks without a VPN

### 5.3 Lost or Stolen Devices
If a device used to access production systems is lost or stolen:
1. Report immediately to the Platform Administrator
2. The Platform Administrator will revoke all credentials accessible from that device (Railway session, GitHub session, etc.)
3. A security review will be conducted to determine if any credentials may have been exposed

---

## 6. Personal Device (BYOD) Policy

StewardView permits use of personal devices to access production systems subject to the following conditions:

- The device meets the security requirements in Section 5.2
- MFA is active on all production accounts accessed from the device
- Production secrets are accessed via Railway's web dashboard, not stored in plaintext files on the device
- If the device is used for non-work purposes (social media, personal email, etc.), care must be taken to ensure that work credentials are not accessible via those channels (e.g., no password manager autofill sharing secrets with personal services)

---

## 7. Data Handling

- Customer financial data must not be downloaded to personal devices for non-operational purposes
- Customer data must not be shared with, shown to, or discussed with unauthorized parties
- No customer data may be used for testing, development, or demonstration purposes — Plaid Sandbox data must be used instead
- Personnel must not attempt to access data belonging to tenants they are not authorized to support

---

## 8. Prohibited Activities

The following are strictly prohibited:

- Sharing, selling, or disclosing Plaid credentials or customer data to any third party
- Using Plaid API access for any purpose not directly related to StewardView's stated use case (church finance management)
- Attempting to access or modify another tenant's data
- Running scripts, queries, or tools against production systems for non-operational purposes
- Disabling or bypassing security controls (rate limiting, authentication, audit logging)
- Using production systems to process transactions on behalf of entities not registered as tenants

---

## 9. Violations

Violations of this policy may result in:
- Immediate revocation of system access
- Termination of employment or contractor relationship
- Legal action where applicable
- Mandatory notification to affected customers and Plaid

---

## 10. Policy Review

This policy is reviewed annually. All personnel with system access must acknowledge this policy upon initial access grant and upon each annual review.

---

**Acknowledgment:**
By accessing StewardView's production systems, you acknowledge that you have read, understood, and agree to comply with this Acceptable Use Policy.
