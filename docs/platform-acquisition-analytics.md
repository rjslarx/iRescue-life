# Platform acquisition measurement

## Scope and event definitions

Custom events run only on `/platform`, `/platform/pricing`, and `/platform/signup`.
Every event includes `funnel=platform_acquisition`. Tenant animal/donation pages,
the demo site, login pages, and signup success URLs are excluded. Team-login
buttons do not emit acquisition CTA events. This is action-level separation:
an existing customer deliberately using an acquisition CTA can still be counted.

| Description | Event name |
| --- | --- |
| Pricing section becomes at least 10% visible, once per page mount | `platform_pricing_view` |
| Signup, pricing or live-demo CTA clicked | `platform_cta_click` |
| Valid demo form starts an API request | `platform_demo_request` |
| Demo API responds successfully | `platform_demo_success` |
| Demo validation or API failure | `platform_demo_error` |
| First signup form change, once per mount | `platform_signup_start` |
| Valid signup form starts an API request | `platform_signup_attempt` |
| Signup API confirms both success and tenant ID | `platform_signup_success` |
| Signup validation, identifier availability or API failure | `platform_signup_error` |

Dimensions are closed enums: location (landing/pricing/signup), placement
(header/body/footer), action (signup/pricing/demo), plan (lite/professional),
demo_type (live/requested), and category (validation/conflict/rate_limited/
server/network/request/unexpected). No names, email, organization, identifier,
tenant ID, password, form content, tokens or raw errors are sent. Custom-event
URL context is a fixed allowed pathname, with empty referrer and static title.
No new tracker script, website ID or analytics credentials are configured.

## Interpretation and limits

Use platform pageviews → pricing views → signup CTA → signup start → attempt →
confirmed success. Demo request → demo success is a separate branch, not a
completed signup. Demo success means the request was accepted, not that the
visitor opened the demo tab or received an email.

Compare by plan, location, placement and safe error category. Event counts
are not unique-person conversion rates: repeat attempts, remounts, validation
errors on multiple fields and debounced identifier checks can emit repeatedly.
Use visitor/session metrics when supported rather than dividing raw counts
across unrelated visitors. Do not sum landing and pricing exposures as unique users.

Tracking is best effort, with no replay when the tracker is unavailable or
blocked. The server remains authoritative for account creation; a lost response
can mean an account exists without a client success event. No historic events
are backfilled. Automatic pageviews are hosting-managed and not sanitized by
this custom wrapper; audit their URL/query privacy configuration separately.
Custom events intentionally omit referrer attribution; use privacy-reviewed
automatic acquisition reports for source comparisons, not form values or raw URLs.

Analytics access was authorized before implementation. Changes are on the task
branch, not production. Collection requires analytics enabled in Publishing
settings and a future release containing the merged changes; no publish was
performed as part of this task.

## Search Console data still needed

No Search Console dataset was supplied or queried. Obtain a verified property
covering the canonical iRescue marketing host, with:

- Search performance for the last 90 days and preceding comparable period:
  clicks, impressions, CTR and average position by date, query, page, device
  and country. Separate branded iRescue searches from non-branded rescue-software
  searches, and marketing pages from tenant animal/donation content.
- Page indexing status and exclusion reasons for marketing URLs; sitemap
  submission/read status; URL Inspection results for landing, pricing and
  signup URLs showing Google-selected versus declared canonicals.
- Exact export dates, search type and filters, with the analytics reporting
  timezone and post-release collection dates recorded for comparison.

Low impressions with indexing problems suggest discoverability issues; indexed
pages with low non-brand impressions/positions suggest visibility problems.
Impressions with weak CTR suggest search-result relevance or presentation.
Search clicks reaching marketing pages but few CTA/start/success events point
to conversion friction. Compare matching periods and device segments; Search
Console clicks are not analytics visitors and cannot be joined to individuals.
Allow time for meaningful post-release samples before drawing conclusions.

Useful questions once data exists:
- Which pricing placement sends the most visitors into signup?
- Do Lite or Professional signup attempts fail more often, and in which categories?
- How often are demo requests accepted compared with signup accounts confirmed?
