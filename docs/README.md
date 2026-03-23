# StewardView Security Documentation

This directory contains all security policies and compliance documentation for StewardView's Plaid production access review.

## Documents

| Document | Purpose | Plaid Questionnaire Reference |
|---|---|---|
| [Plaid Security Questionnaire](plaid-security-questionnaire.md) | **Start here** — completed answers to all 25 Plaid questionnaire questions | — |
| [Information Security Policy](information-security-policy.md) | Master security policy covering all controls | Q2 |
| [Incident Response Plan](incident-response-plan.md) | Detection, containment, notification, and remediation procedures | Q16 |
| [Data Retention and Deletion Policy](data-retention-policy.md) | What data is kept, for how long, and how it is deleted | Q23 |
| [Acceptable Use Policy](acceptable-use-policy.md) | BYOD, credential handling, and system access rules | Q6, Q7 |
| [Security Awareness Training Policy](security-awareness-training.md) | Onboarding and annual training requirements | Q18 |
| [Vendor Risk Management Policy](vendor-risk-management.md) | Vendor intake, monitoring, and offboarding | Q19 |

## Before Submitting to Plaid

Fill in the following placeholders throughout the documents:

- **[Platform Administrator Name]** — the name of the person responsible for security
- **[security contact email]** — the email Plaid should use for security communications (this is what you'll put on the questionnaire and what Plaid will use to reach you)
- **[Name] — [email] — [phone]** in the Incident Response Plan contact table
- Sign and date the attestation section at the bottom of the questionnaire

## Plaid Submission Checklist

- [ ] Complete all `[placeholder]` fields in the questionnaire
- [ ] Sign the attestation at the bottom of the questionnaire
- [ ] Attach or link the Information Security Policy when prompted
- [ ] Submit at: https://dashboard.plaid.com → Settings → Security
- [ ] Notify Plaid that penetration testing is planned (Q20 answer)
- [ ] Plan to implement end-user 2FA before broad launch (Q25 answer)
