---
name: SMS provider suppression scope
description: Twilio STOP/START is not marketing consent or an account preference override.
---

Treat verified Twilio START as clearing only the phone-level provider-event suppression, not an independently recorded account opt-out or any marketing consent. Consume provider control messages before resale, foster, or other reply routing, returning empty TwiML.

**Why:** Accountless resale participants and donors need durable unsubscribe protection, but opting back into provider delivery does not authorize marketing or erase separate account preferences. Twilio owns its confirmation messages.

**How to apply:** Keep phone suppression and account consent independent. The webhook's permanent message-SID ledger prevents previously handled STOP/START retries reversing newer state. Distinct unseen events use database arrival order because the inbound payload has no trustworthy event timestamp; do not claim arbitrary out-of-order delivery reconciliation.

Reserve bare YES for the application's medication-confirmation flow unless verified Twilio OptOutType explicitly identifies START. **Why:** Generic provider keyword lists overlap with established application commands; consuming YES as a fallback opt-in would both lose care confirmations and clear suppression unintentionally.
