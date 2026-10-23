---
name: Deployment telemetry access mismatch
description: Revision-scoped telemetry can report no deployment even while deployment metadata and the live site work.
---

Revision-scoped runtime telemetry has returned “This App has no deployment” for this project's published autoscale app even though deployment metadata, build history, and the live homepage were available.

**Why:** A failed publish after image upload could not be diagnosed from runtime logs because of this telemetry-access mismatch. The response is not proof that no deployment exists or that startup logs contain no errors.

**How to apply:** Distinguish unavailable telemetry from empty logs. Verify deployment metadata and live health separately; report uncertainty rather than attributing a generic initialization failure to code or infrastructure without evidence.
