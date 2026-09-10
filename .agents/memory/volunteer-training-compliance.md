---
name: Volunteer training compliance
description: Durable onboarding, versioning, activation, renewal, and identity rules for required volunteer training.
---

Required volunteer training before account activation must use an expiring, hashed, application-bound access link. An attestation applies only to the exact training version the volunteer opened. Required-content edits must lock, version, update, and create the immutable snapshot in one transaction. Every path that can activate a volunteer, including waiver automation and welcome-invitation acceptance, must use the same live training-compliance decision.

**Why:** Volunteer accounts are created only after activation, so requiring an authenticated attestation creates a circular onboarding flow. Separate activation paths can bypass one another, and email matching can transfer compliance when an address is changed or reused.

Final activation decisions must serialize with requirement publication, not rely on a requirement count read before account creation. Lock current user state when deciding whether a role is being newly granted. When a user mutation may record a completion, use a row-lock mode compatible with foreign-key key-share checks.

**Why:** Password hashing leaves time for requirements to change; concurrent role removal can invalidate an earlier role snapshot. A user FOR UPDATE lock followed by a completion advisory lock can deadlock with a completion insert holding that advisory lock and waiting for its user foreign key.

**How to apply:** Preserve shared policy-lock ordering for publication and activation. Use NO KEY UPDATE for non-key user mutations. Keep explicit, audited identity approval separate from training overrides: an existing donor/foster needs a supported staff verification path without public email-based adoption.

Public bearer attestation must revalidate access and insert the completion in one transaction using the same application-person lock order as identity approval.

**Why:** A precheck followed by a separate completion transaction can commit after staff links an account and revokes the bearer session, incorrectly attributing a stale public attestation to the new owner.

**How to apply:** Use an initial session lookup only as a routing hint. Lock application and contact before the session, then recheck stage, recipient, ownership, revocation, opened state, and exact version before inserting.

Sensitive-route browser protection must run before analytics observes a History API mutation, not only in React effects.

**Why:** Enhanced measurement can capture a bearer URL before effects suppress tracking. Making history methods read-only breaks Wouter's strict-mode startup patch.

**How to apply:** Preserve the pre-analytics full-document navigation guard and strict-mode-compatible wrapper chaining. Test against the installed router, not just a non-strict mock. Keep sensitive URLs out of canonical/social metadata and apply no-referrer before outbound requests.

**How to apply:** Exclude token pages from URL-derived middleware before any logging, and allowlist every public response rather than returning internal compliance/application objects. Preserve immutable completion history; reconcile only through explicit application/contact/user identifiers; reject conflicting ownership; enforce ownership again on compliance/history reads. Bind volunteer welcome invitations to the approved application and recheck current training and exact contact ownership before creating or activating an account. Public intake must not adopt an existing contact from a submitted email; keep the application provisional until staff approves a high-confidence match. Waiver automation may use only an already-established identity, while pre-account links remain usable during orientation and waiver-waiting stages. When linking legacy applications, prefer established completion owners; only use an unambiguous, tenant-bound email plus name/phone backfill when no completion owner exists, then persist the result instead of repeating email lookup. Allow early renewal near the due date without shortening the current term or turning retries into extra cycles.