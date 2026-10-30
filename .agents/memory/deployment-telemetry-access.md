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

Production cold-start module loading has exhausted the roughly 60-second readiness window, even when the same build starts successfully in the workspace. A later startup completed imports in 26 seconds, with database preparation and route registration then taking less than half a second.

**Why:** Workspace module/filesystem caches can conceal cold-import costs. Large generated SDK catalogs loaded eagerly are avoidable startup work; keep optional integrations lazy and use scoped SDK entry points where supported.

**How to apply:** Use logs emitted before the application's static import graph to distinguish import delays from database or route initialization. Do not move database safeguards or fake readiness merely because the port timed out.
