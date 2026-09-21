---
name: Volunteer training compliance
description: Informational-only training policy and durable completion ownership and token-security rules.
---

Training is informational only. Preserve who completed which training and when, including version history, but never use incomplete or overdue training to block team invitations, acceptance, activation, role grants, or access restoration. Do not fabricate completions to permit access.

**Why:** The user explicitly reversed mandatory training enforcement because it caused administrative onboarding friction. Older mandatory-gate decisions are superseded.

**How to apply:** Keep completion/status tracking and exact-version attestations separate from access authorization. Admin invitations must not require a volunteer application or training override simply because tracked training exists. Preserve tenant, account, and recipient ownership security.

Use compatible non-key row locks when completion writes reference users, and derive role mutations from locked current roles rather than stale snapshots.

**Why:** A user FOR UPDATE lock followed by a completion advisory lock can deadlock with a completion insert holding that advisory lock and waiting for its user foreign key; stale role arrays can regrant removed roles.

**How to apply:** Use NO KEY UPDATE for non-key user mutations where appropriate. Retain atomic invitation creation/finalization so failures do not strand accounts and prevent retries.

Public bearer attestation must revalidate access and insert the completion in one transaction using the same application-person lock order as identity approval.

**Why:** A precheck followed by a separate completion transaction can commit after staff links an account and revokes the bearer session, incorrectly attributing a stale public attestation to the new owner.

**How to apply:** Use an initial session lookup only as a routing hint. Lock application and contact before the session, then recheck stage, recipient, ownership, revocation, opened state, and exact version before inserting.

Sensitive-route browser protection must run before analytics observes a History API mutation, not only in React effects.

**Why:** Enhanced measurement can capture a bearer URL before effects suppress tracking. Making history methods read-only breaks Wouter's strict-mode startup patch.

**How to apply:** Preserve the pre-analytics full-document navigation guard and strict-mode-compatible wrapper chaining. Test against the installed router, not just a non-strict mock. Keep sensitive URLs out of canonical/social metadata and apply no-referrer before outbound requests.

**How to apply:** Exclude token pages from URL-derived middleware before logging and allowlist public responses. Preserve immutable completion history; reconcile only through explicit application/contact/user identifiers, reject conflicting ownership, and enforce it on history reads. Public intake must not adopt existing contacts from submitted email. Preserve exact recipient ownership for application-bound welcome invitations without requiring training completion. Keep renewal dates informational.