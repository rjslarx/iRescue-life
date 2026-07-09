---
name: Application detail dialogs
description: Three separate staff dialogs show application details; adoption address is top-level columns, not formData.
---
Adoption applications store applicant address in top-level columns (address/city/state/zip); volunteer/foster store it in formData/standard fields. Three distinct staff surfaces each render application details independently and must each be plumbed separately:
- `ApplicationDetailsDialog` (ApplicationsPage, DocumentsPage, PendingApplicationsWidget)
- `ViewApplicationDialog` (AnimalApplicationsPage)
- `ApplicationDetailSheet` (dashboard pipeline)

**Why:** address was invisible to staff because every layer (dialog render, widget interface, dashboard endpoint select, getApplicationById select) omitted it independently.
**How to apply:** when surfacing a new applications column to staff, update all three dialogs plus the pending-applications endpoint and getApplicationById. Note: DocumentsPage calls GET /api/documents/application/:folderId/:itemId which has no server route (pre-existing).
