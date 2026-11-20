---
name: Fundraiser email recovery
description: Conservative duplicate-prevention policy for confirmation recovery.
---

Do not infer that an old paid fundraiser order needs an email when it has no delivery history. Do not retry an uncertain provider acceptance automatically.

**Why:** Historical paid orders may already have received confirmations. Gmail and transport timeouts cannot guarantee non-delivery, so retrying an unknown outcome could repeat a successful confirmation.

**How to apply:** Retry recorded, definite failures only. Preserve the original order number and email payload. Treat interrupted sends and ambiguous failures as requiring provider review, not as ordinary retryable failures.
