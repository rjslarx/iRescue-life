---
name: Medical date integrity
description: Invalid medical dates must remain correctable without rewriting clinical history.
---

Reject obviously mistyped years on medication entry, but preserve existing medical history until staff confirms its intended date. Rendering must tolerate invalid or missing dates without silently substituting today or the Unix epoch.

**Why:** A truncated year persisted successfully, then dose generation failed. Retrying produced duplicate prescriptions, while the medical page's date formatting could fail independently of successful API reads. A successful medical GET does not establish that the browser rendered the records.

**How to apply:** Validate dates before writes and date arithmetic, including edit forms and optional scheduling dates. Keep warnings explicit and correction controls usable. Do not delete apparent duplicates or mark doses administered merely because a date was corrected.
