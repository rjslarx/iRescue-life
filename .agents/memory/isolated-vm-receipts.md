---
name: Isolated VM receipt tests
description: Cross-realm pitfalls when executing receipt code with the real PDF renderer.
---

Normalize array dimensions and plain point objects at the PDF renderer boundary when calling a host-loaded pdf-lib from a Node VM.

**Why:** pdf-lib validates some inputs with realm-sensitive instance checks. Valid VM-created arrays and points can be rejected with misleading “NaN” type errors, before any receipt assertions run.

**How to apply:** Convert dimensions with the host's Array.from and copy start/end points into host objects. Keep the actual PDF renderer and receipt service running; observe drawn text as well as the resulting PDF and email.
