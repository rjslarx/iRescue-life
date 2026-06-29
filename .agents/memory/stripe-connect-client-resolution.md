---
name: Stripe client resolution for tenant operations
description: Why operating on existing Stripe objects (subscriptions/charges/refunds) must PROBE multiple accounts, not guess one.
---

Tenants pay through Stripe one of three ways, and an existing object can live on any of three accounts:
- **tenant-key**: tenant has its own encrypted secret key; objects live on their own account.
- **connect (direct charge)**: object created with a `{ stripeAccount: connectedAccountId }` header lives on the connected account.
- **platform (destination charge)**: `createCheckoutSession`/`createPaymentIntent` create Connect objects on the **platform account** using `transfer_data.destination` (NOT the `stripeAccount` header). So VIP subscriptions for Connect tenants live on the **platform account directly**, identified only by `transfer_data`.

**The traps:**
1. `stripeService.getStripeClient(tenant)` returns a client ONLY when the tenant has its own key. For Connect-only tenants it returns `null` → callers surface "Stripe is not configured for this rescue" even though billing works. (First bug.)
2. Guessing `{ stripeAccount: connectedAccountId }` for Connect tenants is ALSO wrong for destination-charge objects — Stripe returns "No such subscription" because the object is on the platform account, not the connected account. (Second bug.)
3. The resolved `stripeArgs` for tenant-key and platform contexts is an EMPTY object `{}` (only the connect context carries `{ stripeAccount }`). Passing `{}` in the trailing positional **options** slot of a stripe-node call (e.g. `subscriptions.update(id, params, {})`, `refunds.create(params, {})`) throws `Unknown arguments ([object Object]). Did you mean to pass an options object?` — stripe-node only treats the trailing object as options if it has a known option key, otherwise it's a stray extra arg. Collapse empty args to `undefined` before passing positionally: `const opts = Object.keys(stripeArgs).length ? stripeArgs : undefined;`. (Third bug.) Note `retrieve(id, {})` does NOT throw because `{}` is accepted as empty params, which is why probing worked but the mutation didn't.

**How to apply:** For any endpoint operating on an EXISTING Stripe object for a tenant, do NOT pick one account. Use `stripeService.getStripeContextsForTenant(tenant)` (ordered: tenant-key → connect → platform) and `stripeService.resolveStripeContext(tenant, probe)` — the probe does a cheap retrieve (e.g. `subscriptions.retrieve`, `paymentIntents.retrieve`, `invoices.retrieve`) and the resolver returns the first context whose probe succeeds. Pass the resolved `stripeArgs` through to every subsequent Stripe call. `getStripeContextsForTenant(tenant).length === 0` means "Stripe not configured"; a non-null contexts list but null resolve means "object not found in Stripe". The subscription reconciler (`subscription-reconciler.ts`) uses the same resolver via `getTenantStripeContexts` — keep them in lockstep.

**Why:** VIP cancel + refund first threw "Stripe is not configured" (used getStripeClient, null for Connect), then "No such subscription" (guessed the connected account, but the sub was created as a destination charge on the platform account).
