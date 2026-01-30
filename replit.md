# Multi-Tenant Animal Rescue SaaS Platform

## Overview
The Multi-Tenant Animal Rescue SaaS Platform is designed to centralize and streamline operations for animal rescue organizations. It provides each organization with a custom subdomain, a public-facing site for animal showcasing and donations, and a secure internal portal for staff. The platform's core purpose is to enhance outreach, manage adoptions, track finances, coordinate volunteers, manage medical records, and facilitate communication within the animal welfare sector. It aims to improve efficiency and impact through features like PWA capabilities, AI assistance, and IoT integration for shelter monitoring, ultimately boosting an organization's reach and operational effectiveness.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform is built with a React, TypeScript, and Vite frontend utilizing Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend is an Express and Node.js application in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
The design prioritizes mobile-first responsiveness, WCAG accessibility, and SEO. Key UI elements include an enhanced Command Center dashboard with real-time activity, a "Quick Actions" sidebar section (configurable shortcuts), breadcrumbs, a drag-and-drop kennel layout editor, and consolidated volunteer management. Public navigation is streamlined for core activities like fostering, volunteering, and donating. The Command Center dashboard features a 3-zone grid layout (Front Door, Workforce, Animal Health) with role-based ordering and clickable KPI cards.

**Quick Actions:**
The management portal features a unified "Quick Actions" system accessible from both the sidebar (collapsible section at top) and the mobile header (+ button). Both access points display the same configured actions. Admins can customize which actions appear via Settings → Dashboard Quick Actions. Default actions include: Add Animal, Intake Manager, Medical Pipeline, Add Volunteer, and New Application. "Record Donation" is supported, opening a modal dialog for quick donation entry.

**In-Kind Donation Tracking:**
The donations system supports separate types: Cash, Check, In-Kind Goods (Package icon), and In-Kind Services (Wrench icon). Cash/Check donations track monetary amounts, while In-Kind donations track item descriptions with full IRS compliance. Dashboard stats and reports separate "Cash Revenue" (sum of monetary donations) from "In-Kind Value" (sum of estimated values).

*IRS Compliance for In-Kind Donations:*
- **Required fields for in-kind:** Donor email, full mailing address (street, city, state, ZIP), description, and donor-stated value
- **Dual value tracking:** `donorStatedValue` (shown on receipt per IRS rules) separate from `estimatedValue` (internal tracking only)
- **Receipt content:** In-kind receipts show description and donor-stated value (not org estimate per IRS requirements)
- **Defense-in-depth validation:** Frontend, backend API, and receipt generation all enforce required fields
- **All receipts include disclaimer:** "No goods or services were provided in exchange for this contribution."
- **Receipt labels:** "In-Kind Goods (Non-Cash)" or "In-Kind Services (Non-Cash)" displayed specifically

**Multi-Tenancy:**
Data isolation is achieved within a single PostgreSQL database using `tenant_id` foreign keys. The platform supports a hybrid URL architecture including path-based URLs (`irescue.life/{subdomain}`), custom domains, and subdomain-based access (`demo.irescue.life`), with path-based routing managed by backend middleware.

**Authentication & Authorization:**
Email/password authentication is implemented with bcrypt and Express sessions, featuring secure token-based password reset, a user invitation system, TOTP-based Multi-Factor Authentication (MFA) for platform admins, and JWTs for session management. Tenant-scoped Role-Based Access Control (RBAC) supports dynamic role switching and includes a `platform_admin` role.

**Feature Specifications:**
The platform encompasses comprehensive animal, application, and financial management (integrated with Stripe). It includes contact management, Happy Tails, supply registry, expenditure tracking, event and volunteer coordination, medical records, and document management.

**Partner Organizations:**
A collaboration hub for managing relationships with rescue partners, veterinary clinics, shelters, and other organizations. Each partner record includes:
- Organization details (name, type, address, website, notes)
- Primary contact with job title (name, title, email, phone)
- Secondary contact (optional) with full details (name, title, email, phone)
- Transfer history tracking for animal movements between organizations
- Active/archived status management

**Adoption Application Pipeline:**
A complete adoption workflow is supported with stages from `new` to `adopted`, including a `trial` period for foster-to-adopt scenarios. Animal statuses automatically synchronize with application stages (e.g., `adoption_pending`, `in_trial`, `adopted`). A "hold" system prevents new applications for animals already in process, while public pages display animal status badges. Staff manage applications via a Kanban board.

**Medical Pipeline Dashboard:**
This centralized dashboard manages all medical operations across three sections:
- **Intake Protocol:** A vetting checklist for new animals, tracking tests, vaccinations, and exams.
- **Surgery Queue:** Manages spay/neuter scheduling and tracking.
- **Active Treatments:** Daily medication management with overdue and due-today sections, including controlled substance tracking.

*Medication Backlogging:*
Staff can record historical medication prescriptions without generating overdue tasks:
- When adding a prescription with a start date in the past, a "Next Dose Due" field appears (amber-highlighted)
- This field auto-populates with today's date but can be adjusted
- Dose generation uses `nextScheduledDose` as the starting point instead of `startDate`
- Server-side enforcement ensures this field defaults to today if startDate is past and the field is not provided
- This allows backloading medical records without flooding the dashboard with overdue tasks

**Phase 1 Intake Pipeline (Surrender Requests):**
A dedicated pipeline for dog surrender requests, featuring a `surrender_requests` table with a `new` to `intaken` status workflow. Enhanced fields include detailed dog information and TCPA-compliant SMS consent. Public forms are available, and staff use a Kanban view for intake management.

*Custom Form Responses:*
- The `customResponses` JSON column stores all Q&A responses from dynamic form fields
- Photo-type fields are stored as URLs and rendered as embedded images in:
  - Staff email notifications (inline `<img>` tags)
  - Inbound email inbox records (HTML with embedded photos)
  - Pipeline UI detail sheets (clickable thumbnail images)
- All user-provided data is HTML-escaped in email templates to prevent XSS
- Form field labels are fetched and passed through for proper display formatting

**Volunteer Calendar Staffing Color-Coding:**
Volunteer calendars visually indicate staffing levels (Red, Yellow, Green) based on `minVolunteersRequired`, with management UI to set these requirements and assign permissions.

**Dashboard Permission-Based Filtering:**
The Command Center dashboard uses the `usePagePermissions` hook to conditionally render widgets based on user permissions:
- **MedicalSnapshotWidget:** Visible only if user has 'medical-tasks' permission
- **Quick Actions:** Visible only if user has 'dashboard' permission AND at least one permitted action
- **StatsOverview:** Visible only if user has explicit 'dashboard' permission
- **PipelineManager:** Visible only if user has access to any pipeline (applications, fosters, or volunteers)
- **ComplianceWidget:** Visible only if user has 'analytics' OR 'reports' permission
- **FloatingActionButton (Record Donation):** Visible only if user has 'finance' permission

*Role-Based Exceptions (Intentional):*
- **Foster Dashboard:** Users with foster role see a dedicated "My Foster Animals" view instead of Command Center widgets
- **OnboardingChecklist:** Admin-only setup wizard for initial platform configuration
- **SetupWizard:** Admin-only first-run configuration dialog

*Limited Access View:*
Users with minimal permissions (e.g., calendar-only) see a simplified view with a "Go to Calendar" button instead of the full Command Center.

**Customizable Hero Layouts:**
Tenants can select from "Three Doors" (customizable action cards), "Action Circle," or "None" for their public site hero sections.

**Native Contract Management System:**
The platform includes an in-house e-signature system for adoption contracts. Staff can create custom templates using rich text or a guided builder, supporting merge fields for auto-filling data. Signatures are captured via `signature_pad`, and Puppeteer generates legally verifiable PDF contracts with embedded signatures, stored securely with controlled access.

**Volunteer & Foster Document Management:**
When volunteers or fosters are moved to `active_pool` status, the system automatically creates organized storage folders:
- **Google Drive (if configured):** Creates `03_Volunteers/{Name} (ID_xxx)` or `04_Fosters/{Name} (ID_xxx)` with subfolders
  - Volunteer subfolders: Waivers, Training, Certifications, Notes
  - Foster subfolders: Agreements, Updates, Notes
- **Fallback to Replit Object Storage** if Google Drive is not configured
- `driveFolderId` column on `volunteer_applications` and `foster_applications` tracks the folder location
- Signed waivers/agreements are accessible via "Documents" tab in the application detail dialog
- PDF download endpoint (`/api/signed-documents/:id/download`) generates legal-grade documents using Puppeteer

**Staff Kennel Cards:**
Printable kennel cards designed for single-page printing with comprehensive animal information:
- Header: Animal name, ID, microchip barcode, Staff Portal QR code (scan to edit), and print timestamp
- Safety banner with color-coded behavior rating (green/yellow/red/purple)
- Compact status indicators: Kids/Cats/Dogs friendly, Heartworm (HW+/-), Spay/Neuter status
- Logistics grid: Intake date, source, weight, activity level
- Stray-specific fields: Location found and stray hold until date (only shown for strays)
- Medical notes and staff notes sections

**Automated Google Drive Backup:**
The platform includes automated daily backups of all tenant files from Replit Object Storage to Google Drive Shared Drives:
- **Scheduled backup:** Runs daily at 4:00 AM UTC via node-cron
- **Manual trigger:** Admins can trigger backups from Settings → Integrations → Google Workspace
- **Files backed up:** Animal photos, medical documents, volunteer waivers, foster agreements, donation receipts, website assets
- **Folder structure:** Organized into 01_Active_Animals, 02_Adopted_Archive, 03_Volunteers, 04_Fosters, 05_Website_Assets, 06_Finance
- **Deduplication:** Uses deterministic filenames based on object URL hashes to prevent duplicate uploads
- **Requirements:** Tenant must have Google Workspace connected with useDrive enabled and a Shared Drive configured

**Technical Implementations:**
The "Paw Pay" platform fee system uses Stripe Connect with a "SaaS + 0%" two-tier model (Free and Professional tiers). A Pro trial system is in place, allowing organizations a 14-day trial before reverting to the Free tier. Stripe Standard Connect OAuth enables tenant-owned Stripe accounts, and a "Donor Covers Fees" feature calculates gross-up amounts. Sensitive data is protected with AES-256-GCM encryption. Unified file storage prioritizes Google Drive, falling back to Replit object storage. Email services use Resend, with optional Google Workspace Gmail API integration. Platform admin security features subdomain resolution, RBAC, frontend guards, authenticated sessions, and TOTP MFA. Production security includes rate limiting, Helmet security headers, CORS fail-closed, and session hardening. Google Analytics 4 is integrated. Optional Google Workspace integration provides Gmail API, Calendar sync, and Drive storage, optimized for CASA OAuth scopes.

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
- **Twilio (optional):** SMS notifications. Supports both direct phone number sending and Messaging Service SID for A2P 10DLC registered campaigns (improved deliverability).