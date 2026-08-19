---
name: Dev-domain links in production emails
description: Published runtimes can expose REPLIT_DEV_DOMAIN without a reliable REPLIT_DEPLOYMENT flag; outbound links need stronger production detection.
---

The published deployment of this project has `REPLIT_DEV_DOMAIN` set in its environment, and `REPLIT_DEPLOYMENT` was not consistently present. Any code that treats the dev domain or that single flag as authoritative can produce `.replit.dev` links in real production emails/SMS.

**Rule:** all outbound link/webhook base URLs must go through the shared base-URL helper. An explicit public base URL wins; `NODE_ENV=production` or the deployment flag forces the public fallback; the dev domain is allowed only outside production.

**How to apply:** when adding any new email/SMS/webhook URL builder, import the shared helper — never write a fresh `REPLIT_DEV_DOMAIN` ternary. Tenant-specific links should still prefer the tenant's custom domain / subdomain path on top of this base.
