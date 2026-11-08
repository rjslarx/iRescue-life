---
name: Donation notification navigation
description: The notification Donate button should scroll to the home page donation section.
---

The floating recent-donations notification should scroll to the actual home page donation form (Haseya's “Become a Haseya's Hero”), not the “Support Our Mission” introduction; retain tenant-aware Donate navigation only as a fallback when no form exists.

**Why:** After reporting that dedicated-page navigation reached Foster, the user explicitly accepted scrolling to the donation section instead. The cause of the reported Foster destination was not confirmed.

The user subsequently clarified that the intended landing point is the hero donation form below the introduction, so mobile visitors should not need another scroll to find it.

**How to apply:** Target the donation section explicitly, never a generic section or placement CTA. Preserve tenant-aware fallback routing.
