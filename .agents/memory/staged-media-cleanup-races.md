---
name: Staged media cleanup races
description: Concurrency rule for safely deleting private staged objects that may be referenced by submissions.
---

Cleanup of rejected staged media and creation of new submission references must serialize on the same parent-record lock. A submission must re-verify object existence and ownership while holding that lock; checking before waiting on the lock is insufficient.

**Why:** A rejection can otherwise check that no references exist and delete an object after another request has already verified it but before that request inserts its pending submission, leaving a dangling record.

**How to apply:** For any staged object promoted through an approval queue, lock the owning domain row during both cleanup and submission creation, check all live/pending references under that lock, and re-verify storage immediately before recording a new reference.