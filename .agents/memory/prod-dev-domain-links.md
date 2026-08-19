---
name: Dev-domain links in production emails
description: The deployed app has REPLIT_DEV_DOMAIN set; base-URL helpers must gate on REPLIT_DEPLOYMENT, never trust REPLIT_DEV_DOMAIN alone.
---

The published deployment of this project has `REPLIT_DEV_DOMAIN` set in its environment. Any code that does "if REPLIT_DEV_DOMAIN → use it" produces `.replit.dev` links in real production emails/SMS (adopters landed on Replit instead of the portal).

**Rule:** all outbound link/webhook base URLs must go through `server/lib/app-base-url.ts` `getAppBaseUrl()`, which only uses the dev domain when `REPLIT_DEPLOYMENT !== '1'` and otherwise falls back to `APP_BASE_URL || https://irescue.life`.

**How to apply:** when adding any new email/SMS/webhook URL builder, import the shared helper — never write a fresh `REPLIT_DEV_DOMAIN` ternary. Tenant-specific links should still prefer the tenant's custom domain / subdomain path on top of this base.
