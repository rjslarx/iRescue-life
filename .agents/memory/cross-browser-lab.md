---
name: Cross-browser lab environments
description: Runtime and measurement boundaries for marketing browser checks
---

Provision compatible Playwright browser runtimes before claiming Firefox or
WebKit verification in a Nix workspace; package installation alone is insufficient.
Do not assemble a broad LD_LIBRARY_PATH from arbitrary Nix store libraries.

**Why:** Downloaded Linux browsers can lack their matching system libraries.
Mixing Nix library generations caused libc incompatibilities rather than a
working browser. Missing-runtime failures must remain failures, not skipped passes.

**How to apply:** Use a supported provisioned runner or compatible patched browser
executables. Keep unthrottled cross-engine functional assertions separate from
Chromium CDP performance metrics; WebKit tests are not physical Safari tests.
