---
name: Public lead contact safety
description: Integrity and concurrency rules for anonymous forms that link submissions to master contacts.
---

Anonymous public-form input must never overwrite the name, phone, or other established identity fields of an existing master contact matched by email. Keep submitted values on the lead snapshot; for an existing contact, merge only safe provenance such as the new source.

**Why:** Anyone can submit a known email address. Treating that unauthenticated input as authoritative lets a visitor corrupt donor, adopter, volunteer, or staff contact data.

**How to apply:** Any public form that creates or links a contact should preserve existing identity fields, create a contact only when none exists, and serialize contact creation for the same tenant/email.

Duplicate suppression must be atomic across the lead insert and durable internal side effects. Only the winning insert may create feed/activity entries or dispatch notifications.

**Why:** A read-then-insert duplicate check races under simultaneous clicks or retries, creating duplicate records and emails.

**How to apply:** Lock or constrain a stable tenant-scoped fingerprint inside a transaction, recheck under that guard, and gate all post-commit notification dispatch on whether the transaction actually inserted the lead.