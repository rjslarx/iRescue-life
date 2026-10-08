---
name: Resend inbound account routing
description: Platform webhook receives both tenant and platform mail; unmatched recipients must not trigger endless retries.
---

The user clarified that admin@irescue.life and notifications@irescue.life belong to the platform administrator, not a rescue. Route both to the configured platform administrator destination before tenant routing. Other missing tenant mappings are permanent routing outcomes, not endpoint failures; acknowledge authenticated unmatched messages and keep them accessible in Resend rather than returning 404 and causing retries that can disable all inbound delivery.

**Why:** The receiving endpoint was disabled after failures; the recent receiving messages targeted platform addresses without tenant mappings, and the old handler returned 404 for those addresses. Historical delivery-attempt logs were not available to conclusively attribute every failure.

**How to apply:** Never drop platform-address mail or assign it to a rescue. Preserve attachments, original reply routing, signature verification and duplicate suppression. Reject a forwarding destination that is itself one of the inbound aliases. Distinguish unmatched recipients from transient database/provider failures. Fetch messages using the receiving account's key, not a tenant's independent sending-account key. The inbound endpoint uses RESEND_WEBHOOK_SIGNING_SECRET; do not confuse it with the separate delivery-events endpoint's secret name.
