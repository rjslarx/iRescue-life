# Multi-Tenant Animal Rescue SaaS Platform

## Overview
The Multi-Tenant Animal Rescue SaaS Platform centralizes and streamlines operations for animal rescue organizations. It provides each organization with a custom subdomain, a public-facing site for animal showcasing and donations, and a secure internal portal for staff. Its core purpose is to enhance outreach, manage adoptions, track finances, coordinate volunteers, manage medical records, and facilitate communication, ultimately improving efficiency and impact within the animal welfare sector. Key capabilities include PWA support, AI assistance, and IoT integration for shelter monitoring.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform utilizes a React, TypeScript, and Vite frontend with Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend is an Express and Node.js application in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
Design emphasizes mobile-first responsiveness, WCAG accessibility, and SEO. It features a Command Center dashboard with real-time activity, a configurable "Quick Actions" sidebar, breadcrumbs, a drag-and-drop kennel layout editor, and streamlined public navigation. The Command Center dashboard uses a 3-zone grid layout (Front Door, Workforce, Animal Health) with role-based ordering and KPI cards. Customizable hero layouts are available for public sites ("Three Doors," "Action Circle," "None").

**Technical Implementations:**
Multi-tenancy is achieved with `tenant_id` foreign keys in a single PostgreSQL database, supporting hybrid URLs (path-based, custom domains, subdomains). Authentication uses email/password with bcrypt, Express sessions, token-based password reset, user invitation, and TOTP MFA for platform admins. JWTs manage sessions. Tenant-scoped Role-Based Access Control (RBAC) supports dynamic role switching and a `platform_admin` role.

The platform includes comprehensive animal, application, and financial management (integrated with Stripe), contact management, Happy Tails, supply registry, expenditure tracking, event/volunteer coordination, medical records, and document management.

*Key Features:*
- **In-Kind Donation Tracking:** Supports Cash, Check, In-Kind Goods, and In-Kind Services with IRS-compliant tracking, separating "Cash Revenue" from "In-Kind Value" in reporting. In-kind donations require specific donor and item details, and receipts show `donorStatedValue` with a "No goods or services were provided" disclaimer.
- **Partner Organizations:** A collaboration hub for managing rescue partners, vets, and shelters, including organization details, contacts, and transfer history tracking.
- **Adoption Application Pipeline:** A complete workflow from `new` to `adopted`, including `trial` periods. Animal statuses synchronize automatically. Staff manage applications via a Kanban board.
- **Medical Pipeline Dashboard:** Centralized management of medical operations across Intake Protocol (vetting checklist), Surgery Queue (spay/neuter scheduling), and Active Treatments (daily medication, controlled substances). Medication backlogging allows historical entry without creating overdue tasks.
- **Phase 1 Intake Pipeline (Surrender Requests):** Dedicated workflow for dog surrender requests with detailed dog information and TCPA-compliant SMS consent. Public forms are available, and staff use a Kanban view. Custom Form Responses store Q&A, including photo URLs rendered as embedded images in emails and the UI.
- **Volunteer Calendar Staffing:** Visual indication of staffing levels (Red, Yellow, Green) based on `minVolunteersRequired`, with management UI and permissions.
- **Dashboard Permission-Based Filtering:** Widgets on the Command Center dashboard are conditionally rendered based on user permissions using the `usePagePermissions` hook.
- **Native Contract Management:** An in-house e-signature system for adoption contracts. Staff create custom templates with merge fields. Signatures are captured, and legally verifiable PDF contracts with embedded signatures are generated via Puppeteer.
- **Foster Agreement PDF Downloads:** Staff can download signed foster agreements as PDF documents. PDFs are generated via Puppeteer when fosters sign, stored in private object storage with `contractPdfUrl`, and accessed via time-limited signed URLs (15-min expiry). Download buttons appear in both the Foster Pipeline Kanban board and Foster Management page for applications with signed agreements.
- **Volunteer & Foster Document Management:** Automatic creation of organized storage folders in Google Drive (or Replit Object Storage fallback) for active volunteers and fosters, with subfolders for specific document types (e.g., Waivers, Agreements, Training). Signed documents are accessible via an API endpoint.
- **Staff Kennel Cards:** Printable cards with comprehensive animal information, including header details, safety banner (color-coded behavior rating), compact status indicators, logistics grid, stray-specific fields, and medical/staff notes.
- **Automated Google Drive Backup:** Daily automated backups of tenant files from Replit Object Storage to Google Drive Shared Drives, with manual trigger options. Files are organized by category, and deduplication is used.
- **Automated Database Backup:** Daily PostgreSQL backups to Google Cloud Storage at 9 AM UTC (3 AM CST). Uses streaming `pg_dump | gzip` compression to handle large databases efficiently. 30-day retention policy automatically deletes old backups. Platform admins can manually trigger backups via POST `/api/admin/trigger-database-backup` and list backups via GET `/api/admin/database-backups`. Requires `GCP_CREDENTIALS` (JSON service account key) and `GCS_BUCKET_NAME` environment variables.
- **Stripe Embedded Components:** The Finance page uses Stripe Connect Embedded Components for secure display of transactions, payouts, and balance information directly from Stripe. A backend endpoint provides Account Session client secrets. The "Paw Pay" platform fee system uses Stripe Connect with a "SaaS + 0%" two-tier model and a 14-day Pro trial. "Donor Covers Fees" feature calculates gross-up amounts. Sensitive data is protected with AES-256-GCM encryption.
- **Animal Photo URL Validation:** Backend validates that animal photo URLs are proper object storage paths (starting with `/objects/` or `objects/`). External URLs like Google Drive links are rejected with a user-friendly error message directing users to upload photos directly. Applied to animal creation, update, photos update, and surrender-to-animal conversion endpoints.
- **Mobile Cloud Storage Detection:** The ObjectUploader component detects when users on mobile devices (iOS/Android) select photos from cloud storage services (Google Drive, iCloud) via the Files app instead of from their Camera Roll. These "reference files" contain URLs rather than actual image data. Both client-side and server-side detection provide helpful error messages directing users to select photos from their Camera Roll or Photos app instead.
- **Preventative Care Backfill:** Bulk generation of missing core preventative care records for all active animals. POST /api/preventative-care/backfill-all scans animals by species, checks for existing records, and auto-creates missing tasks with proper due dates. Bordetella interval updated to 180 days per veterinarian recommendation.
- **Volunteer Screener Notifications:** Additive email notification system for volunteer applications. Configure additional volunteer-specific notification emails in Settings that receive alerts in addition to general form notification recipients. Uses `volunteerApplicationNotificationEmails` field on tenants with dedupe merge logic.
- **User-Based Page Permissions:** Individual user permission grants beyond role-based access. Admins can grant specific users access to pages (like volunteer pipeline) without changing their role. Uses `userPagePermissions` table and integrates with the Edit Team Member dialog in Team Management.

**CRITICAL Drizzle ORM Pattern:**
When using dynamic imports (`await import('@shared/schema')`) in route handlers, ALWAYS use explicit field selection in Drizzle queries. Using `db.select()` without explicit fields or passing table references like `{ record: myTable }` causes `orderSelectedFields` errors. Always select fields explicitly:
```typescript
// CORRECT:
const records = await db.select({
  id: preventativeCareRecords.id,
  name: preventativeCareRecords.careName,
  // ... explicit fields
}).from(preventativeCareRecords);

// WRONG (causes orderSelectedFields error):
const records = await db.select().from(preventativeCareRecords);
```

**CRITICAL Wouter Navigation Pattern:**
When using wouter's `Router` with `base={basePath}`, all `Link href` values and `setLocation()` calls must use **relative paths without the basePath prefix**. The Router's `base` prop automatically prefixes all routes, so adding basePath manually causes double-prefixing and 404 errors.

```typescript
// CORRECT - Use relative paths:
<Link href="/dashboard/animals">Animals</Link>
setLocation("/dashboard/calendar");

// WRONG - Causes 404 due to double-prefixing:
<Link href={`${basePath}/dashboard/animals`}>Animals</Link>
setLocation(`${basePath}/dashboard/calendar`);
```

**Note:** `basePath` is still needed for non-navigation purposes like:
- Route matching with `useRoute()`: `useRoute(`${basePath}/shop/:slug`)`
- API calls that include tenant context
- Building external URLs for sharing

## External Dependencies
- **Stripe:** Payment processing for donations, adoption fees, subscriptions, and connected accounts.
- **Resend:** Email delivery.
- **Google APIs:** OAuth 2.0, Gmail API, Calendar API, Drive API, Google Picker API.
- **PostgreSQL:** Primary database.
- **Vite:** Frontend build tool.
- **Wouter:** React router.
- **TanStack Query:** Data fetching.
- **Tailwind CSS:** CSS framework.
- **shadcn/ui:** UI component library.
- **Drizzle ORM:** TypeScript ORM.
- **Express:** Backend framework.
- **bcrypt:** Password hashing.
- **connect-pg-simple:** PostgreSQL session store.
- **otplib:** TOTP library.
- **qrcode:** QR code generation.
- **helmet:** Security headers.
- **cors:** CORS middleware.
- **express-rate-limit:** Rate-limiting middleware.
- **node-cron:** Scheduled tasks.
- **Twilio (optional):** SMS notifications.