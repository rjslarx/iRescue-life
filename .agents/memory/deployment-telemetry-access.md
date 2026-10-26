---
name: Deployment telemetry access mismatch
description: Revision-scoped telemetry can report no deployment even while deployment metadata and the live site work.
---

Revision-scoped runtime telemetry has returned “This App has no deployment” for this project's published autoscale app even though deployment metadata, build history, and the live homepage were available.

**Why:** A failed publish after image upload could not be diagnosed from runtime logs because of this telemetry-access mismatch. The response is not proof that no deployment exists or that startup logs contain no errors.

**How to apply:** Distinguish unavailable telemetry from empty logs. Verify deployment metadata and live health separately; report uncertainty rather than attributing a generic initialization failure to code or infrastructure without evidence.

A build can also be marked failed with “couldn't confirm its final status” after its logs say “Deployment successful.”

**Why:** The live homepage has served the exact asset filename from such a build despite its failed status.

**How to apply:** For this specific failure, compare the live HTML's asset filename with build output and check HTTP health before assuming the old version remains active. Report the mismatch and follow the publishing message's republish recommendation; do not invent a code fix.
