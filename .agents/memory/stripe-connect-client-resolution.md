---
name: Stripe client resolution for tenant operations
description: Why operating on existing Stripe objects (subscriptions/charges/refunds) must not use getStripeClient(tenant) alone.
---

Tenants pay through Stripe one of two ways:
- **Stripe Connect** (most tenants): objects (subscriptions, charges, invoices) live on the **platform** Stripe account, scoped to the tenant's `stripeConnectedAccountId`. These tenants can have `stripeEnabled=true` but **no own secret key**.
- **Own key**: tenant has its own encrypted secret key; objects live on their own account.

**The trap:** `stripeService.getStripeClient(tenant)` returns a client ONLY when the tenant has its own encrypted secret key. For Connect-only tenants it returns `null`, which callers surface as "Stripe is not configured for this rescue" — even though billing works fine. Creating checkouts always worked because `createCheckoutSession` selects the platform key + connected account for Connect tenants; but mutation/read handlers that operate on *existing* objects (cancel subscription, refund) used `getStripeClient` and broke for Connect tenants.

**How to apply:** For any endpoint that operates on an existing Stripe object for a tenant, resolve the client with `stripeService.getStripeContextForTenant(tenant)` → `{ stripe, stripeArgs }`. It returns the platform client + `{ stripeAccount: connectedAccountId }` for Connect tenants, the tenant's own client + `{}` for own-key tenants, or `null` when neither is configured. Always pass `stripeArgs` through to every Stripe call (cancel/update/retrieve/refunds.create/charges.retrieve/etc.) so the request targets the right account. Do NOT gate on `getStripeClient(tenant)` alone.

**Why:** VIP cancel + refund returned "Stripe is not configured" for a Connect tenant (own key absent). The handlers already built `stripeArgs` from the connected account but fetched the wrong base client.
