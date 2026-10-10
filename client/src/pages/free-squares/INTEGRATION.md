# Existing-app integration

All newly created frontend feature files are confined to `client/src/pages/free-squares`.
Existing client integration files have also been modified:

1. `client/src/App.tsx` imports the staff and public pages directly and adds regular wouter routes inside the existing
   tenant-based RouterSwitch, before the custom-page fallback:
   - `/dashboard/free-squares` -> `FreeSquaresPage`
   - `/squares/:id` -> `PublicFreeSquaresPage`
   The staff page has its own auth, active-role and stable resolved tenant-ID gate.
   Do not put it behind a new/unregistered `RequirePageAccess` page ID; that would
   incorrectly deny staff. Do not add the tenant base path to either route.
2. `client/src/components/AppSidebar.tsx` adds a Community navigation group after
   ordinary page-permission filtering.
   It checks the resolved `/api/tenant` ID against the shared allowlist and the
   authenticated active role, including platform_admin. Do not put it under
   Fundraising or add it to the public navigation.
3. `squares` is added to BOTH client reserved-path lists: TenantContext and tenantApi.
   This is essential for custom-domain and path-based tenant routing.
4. Consider a server `X-Robots-Tag: noindex, nofollow, noarchive` header for the
   public board HTML path as defense in depth. Both pages add a scoped robots meta
   tag on mount. Do not add board URLs to the sitemap.

Uses the supplied `/api/free-squares` contract, snake_case records, existing
`apiRequest`, tenant-separated query cache, existing DashboardLayout and UI primitives.
No dependencies or package changes. No backend files changed.

Reservation and send mutations never retry automatically. Lost reservation
responses keep the same requestKey unless the form changes. Lost send responses
freeze the exact payload and expose an explicit same-request check. Persisted
unknown/sending results cannot be resent from their history entry.

Email is disabled when the address is missing or `email_revoked_at` is set.
Text messages require a phone number, `sms_consent_at`, and no `sms_revoked_at`.
The server's unsubscribe confirmation page requires no client route.
