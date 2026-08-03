---
name: Inbound SMS routing & unmatched capture
description: How adopter/foster SMS replies are routed, why replies used to vanish, and the security constraints on the Twilio webhook.
---

- Inbound SMS is matched by exact phone equality to an *active user in the tenant* and then to an *active foster placement*; adopters (or fosters with no active placement) never match. Previously such replies were dropped silently.
- Unmatched inbound messages are now stored in sms_message_logs (direction inbound, status 'received', messageType 'unmatched_inbound', media URLs appended to body) and shown in the Communications feed (feed now includes status 'received' and displays the SENDER number for inbound rows).
- **Why fail-closed:** the Twilio webhook must require X-Twilio-Signature and reject on validation errors — otherwise anyone can spam a tenant's feed via the new unmatched persistence. Unmatched logging only fires when the signature actually validated; dedup is by MessageSid.
- Adoption finalization (all writers: adoptions service, checkout, application stage sync, DocuSign) completes active foster placements via completeActiveFosterPlacements; a startup backfill sweeps leftovers. Leftover 'active' foster rows were causing weekly foster check-in texts to adopted animals.
