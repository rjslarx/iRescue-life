---
name: Donation notification navigation
description: The notification Donate button should open the dedicated tenant Donate page.
---

The floating recent-donations notification must navigate to the rescue's dedicated Donate page, even when the current page contains a donation section.

**Why:** The user reported that the old scroll-to-section behavior felt like being sent to the home page instead of the expected Donate page. Preserve this distinction from homepage donation-section links.

**How to apply:** Keep navigation tenant-aware for custom domains and path-based tenants; do not restore a scroll-to-section shortcut to this notification.
