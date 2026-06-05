# SEO Strategy

## In scope
- Platform marketing pages under `/platform/**`
- Platform blog index and blog posts under `/platform/blog/**`
- Tenant public-facing pages such as `/`, `/animals`, `/animal/:animalId`, `/donate`, `/vip-club`, `/wall-of-heroes`, `/campaign/**`, `/shop/**`, `/wishlist`, `/contact`, `/volunteer`, `/become-a-foster`, `/surrender`, `/transparency`, and published custom pages
- Multi-tenant crawlability assets that affect public discovery, including `robots.txt`, `sitemap.xml`, `manifest.json`, and public metadata handling

## Out of scope
- Authenticated dashboard routes under `/dashboard/**`
- Platform admin and internal staff routes under `/platform/dashboard`, `/platform/tenants`, `/platform/users`, and similar internal operations pages
- Authenticated adopter or foster portal areas unless they are intentionally public landing pages

## Target audience
- Animal rescue organizations evaluating rescue-management software
- Donors, adopters, fosters, volunteers, and supporters visiting tenant public sites

## Primary keywords
- Animal rescue software
- Animal rescue management platform
- Rescue management software
- Animal adoption platform
- Animal rescue donations, fostering, and volunteering

## Architecture notes
- Public pages are currently delivered through a Vite SPA shell (`client/index.html` + `client/src/main.tsx`) rather than SSR or build-time prerendering.
- Route-specific metadata is primarily set with `client/src/hooks/useSEO.ts`, which runs after hydration.
- Express adds some tenant-specific metadata for recognized social crawlers in `server/middleware/og-tags.ts`, but that is not a general SSR solution.
- Tenant public sites can resolve through path-based URLs on `irescue.life`, verified custom domains, or legacy subdomains.

## Dismissed categories
- None yet
