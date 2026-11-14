---
name: Catalog response compatibility
description: Keep API response additions compatible with already-open strict-validation editors.
---
When adding catalog settings, preserve the response shape expected by older open tabs and preserve settings those clients do not send.

**Why:** The Rescue Vend editor uses strict response validation. Adding a field can make older browser code reject a successful response as a load failure. Successful HTTP status alone cannot verify editor loading.

**How to apply:** Use explicit client capability opt-in for new response fields when old clients are already deployed. Test legacy reads and saves alongside current clients; omitted new fields must not reset existing settings.
