---
name: Platform marketing SEO boundaries
description: Canonical homepage choice and tenant isolation for marketing metadata.
---
Use the platform root as the canonical marketing homepage; keep /platform available as an alias. Omit sitemap modification dates unless actual content-change dates are known.

**Why:** The public audit found conflicting homepage canonical signals and dates that falsely claimed every page had changed on each request.

**How to apply:** Keep client and server canonical decisions aligned. Tenant resolution strips path prefixes before metadata middleware, so a request path of / alone does not identify a platform homepage. Preserve tenant custom-domain, legacy-subdomain, and path-based metadata.

Parent React effects can overwrite a child page's canonical after mount. Verify the final canonical with both mounted, not only the individual URL helper or HTTP source.

**Why:** The app shell and page-level metadata effects both write the canonical; an isolated test passed while the shell restored the alias URL.
