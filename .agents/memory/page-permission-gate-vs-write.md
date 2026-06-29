---
name: Page-permission gating vs write-guard asymmetry
description: Why "can view but 403 on save" happens — frontend canAccessPage and backend requireRoleOrPageAccess use different rules, and route pageId can differ from the write guard's pageId.
---

# Page access (view) vs write guard can silently diverge

Two independent traps cause "user can open the page but gets 403 when saving":

1. **Different pageId on the route vs the write API.** A page's frontend route
   (`ProtectedRoute pageId=...` in `client/src/App.tsx`) and sidebar mapping
   (`urlToPageId` in `AppSidebar.tsx`) can be gated by a *different* pageId than
   the write endpoints guard. Example fixed here: the Fundraisers page was gated
   by `finance` for viewing, but `/api/fundraiser-events` writes are guarded by
   `fundraiser-events`. Granting `finance` let users in but they 403'd on create.

2. **Frontend and backend evaluate "page access" with different rules:**
   - Frontend `usePagePermissions.canAccessPage` honors BOTH individual
     `user_page_permissions` grants AND role-based `page_permissions.allowed_roles`.
   - Backend `requireRoleOrPageAccess` (server/middleware/auth.ts) honors role
     hierarchy + individual `user_page_permissions` grants, but does NOT consult
     role-based `page_permissions.allowed_roles`.
   So a board_member/staff with only *role-based* page access can VIEW but cannot
   WRITE. An INDIVIDUAL grant satisfies both → clean view+write.

**How to apply:** When wiring a managed page, gate the route/sidebar by the SAME
pageId the write endpoints guard. If a permission's default `allowedRoles` is a
superset of the page's writers, gate the create/edit/delete UI controls behind a
`canManage` that mirrors the backend write rule (admin/owner/platform_admin OR
individual grant via `userPermissions.some(p => p.pageId === '<id>')`) so
read-only viewers never see a button that 403s.

**Why:** Granting "one permission = view + create" only works cleanly for the
*individually-granted* user; role-based viewers stay read-only by design unless
the backend write guard is broadened (a deliberate product decision, not a bug).
