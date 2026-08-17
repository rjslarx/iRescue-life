---
name: Adopter portal deep links & login redirect
description: Compliance emails link straight to /my-pets/:animalId; how unauthenticated deep links and post-magic-login redirects must work.
---

Compliance/warning emails link adopters directly to `/my-pets/{animalId}` (custom domain or `/{subdomain}` prefixed). Adopters are rarely logged in.

**Rules:**
- Adopter pages must redirect unauthenticated visitors to `/my-pets/login` (gate on `useAuth` user + `adopter` role, like AdopterPortalPage) — never render "Pet not found" on 401. Note: the shared queryClient rewrites error messages to the server's `json.error`, so `message.startsWith("401")` checks DO NOT work.
- Return path is saved in localStorage `adopter-login-redirect` (only `/my-pets*` paths honored) and consumed by AdopterLoginPage after magic login.
- **Why full page load:** after magic-login, SPA `setLocation` to the pet page bounced back to login even after `await checkAuth()` (stale auth state race). The fix is `window.location.href = tenantPrefix + target`, deriving the tenant prefix from the current pathname.
- Daily compliance reminder job (`adopter-compliance-notifications.ts`) must skip preventative records that have an `adopter_compliance_confirmations` row in `pending_review`/`approved` (tenant+animal scoped — scheduler has no user context), mirroring the portal due-care filter. Otherwise adopters keep getting overdue emails after submitting proof.
- Dev testing trick: seed a magic token by inserting into `adopter_magic_tokens` (bcrypt hash of a random hex token, 24h expiry) for an adopter user; tokens are single-use.
