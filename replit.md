# Multi-Tenant Animal Rescue SaaS Platform

## Overview
This project is a multi-tenant SaaS platform for animal rescue organizations, providing each with a custom subdomain, a public-facing site for animal showcasing and donations, and a secure internal staff portal. Its purpose is to centralize and streamline operations like adoptions, financial contributions, and outreach. Key capabilities include managing animals, applications, finances, volunteers, medical records, and communications, alongside advanced features such as PWA, AI assistance, and IoT integration for shelter monitoring. The platform aims to enhance operational efficiency and expand outreach within the animal welfare sector.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform utilizes a React, TypeScript, and Vite frontend with Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend is an Express and Node.js application in TypeScript, leveraging PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
The design is mobile-first, responsive, WCAG accessible, and SEO-enhanced. It features a consolidated navigation, an enhanced dashboard with real-time activity and "Quick Actions," breadcrumbs, a drag-and-drop kennel layout editor, and streamlined public navigation for fostering, volunteering, surrendering, and donating.

**Multi-Tenancy:**
Data isolation is enforced in a single PostgreSQL database using `tenant_id` foreign keys. It supports a hybrid URL architecture including path-based URLs, custom domains, and subdomain-based access, with routing managed by backend middleware.

**Authentication & Authorization:**
Email/password authentication uses bcrypt and Express sessions, incorporating secure token-based password reset, a user invitation system, TOTP-based MFA for platform admins, and JWTs for session management. Tenant-scoped Role-Based Access Control (RBAC) supports dynamic role switching and includes a `platform_admin` role.

**Feature Specifications:**
The platform offers comprehensive animal, application, and financial management (Stripe integrated). It includes contact management, supply registry, expenditure tracking, event management, volunteer coordination, medical records, and document management. Customizable hero layouts are available for tenant websites. Communication features encompass newsletters, email campaigns (via Resend), and automated notifications. Core functionalities include unified site permissions, multi-calendar, page-level permissions, customizable event forms, and admin interfaces for tenant branding, CMS, custom pages, and analytics. PWA capabilities offer mobile installation, offline access, and push notifications. Integrations include external adoption platforms and Google Workspace. A platform admin interface manages tenants, users, feature flags, audit logs, and system health. Additional features include an AI Help Assistant, setup wizard, kennel management, public animal surrender, auto-archiving, grant budget tracking, a contract template editor with a native e-signature system, a fundraising shop module, a collaboration hub, smart foster matching, medical fund campaigns, Govee temperature monitoring, IRS-compliant donation receipts, and social media sharing with Open Graph tags.

**Foster Application Pipeline:**
A 7-stage Kanban workflow manages foster applications, from 'New App' to 'Rejected,' with drag-and-drop functionality. It includes native e-signing for foster agreements and an active foster pool with searchable preferences. Automated email notifications are sent for agreement signing.

**Dashboard Form Submissions Widget:**
The admin dashboard features a widget displaying recent custom form submissions with status badges (Pending, Signed, Awaiting Payment, Completed), counts for awaiting payment and new submissions, and auto-refresh every 30 seconds. Activity is logged, and staff receive email notifications.

**Custom Forms with Fee Collection:**
The system supports custom forms with integrated fee collection and optional donation requests. Staff can configure fee amounts and labels. The payment flow integrates with Stripe, and staff can waive fees. Payments are processed through Stripe Connect, tracking various payment statuses.

**Native Contract Management System:**
A native e-signature system for adoption contracts includes a template editor (Rich Text or Guided Builder) supporting merge fields for auto-filling adopter, animal, and financial information. It incorporates native e-signature capture, optional driver's license verification, and PDF generation with embedded signatures, IP, and timestamps. Signed contracts are stored securely with time-limited download access. A conditional spay/neuter contract is available for unaltered animals.

**Technical Implementations:**
"Paw Pay" utilizes Stripe Connect with a "SaaS + 0%" two-tier subscription model (Free and Professional). A 14-day Pro trial is available once per organization, reverting to the Free tier upon expiration. Stripe Standard Connect OAuth manages tenant payments. A "Donor Covers Fees" feature calculates gross-up amounts. ACH bank transfer is supported for one-time donations. Sensitive data uses AES-256-GCM encryption. Unified file storage prioritizes Google Drive, falling back to Replit object storage. Email services integrate Resend with optional Google Workspace Gmail API. Platform admin security includes subdomain resolution, RBAC, frontend guards, authenticated sessions, and TOTP MFA. Production security features rate limiting, Helmet, CORS fail-closed, environment validation, and session hardening. Google Analytics 4 is integrated. Optional Google Workspace integration provides Gmail API, Calendar sync, and Drive storage.

**Transfer Workflow & Partner Organizations:**
The platform supports comprehensive org-to-org animal transfers with partner organization management. Partner organizations are stored separately from general contacts, with fields for name, contact info, address, and notes. Transfer features include:
- **Partner Organization Management:** Dedicated page under People section with add/edit/archive functionality
- **Medical Packet Generator:** One-click export of vaccination, procedures, diagnostics, prescriptions, and exams as printable summary (individual or batch)
- **Microchip Release Checklist:** Checkbox on manifest items with reminder alert before departure for animals with unreleased microchips
- **Transfer Fee Tracking:** Pull fee (per animal), transport fee, and fee notes fields on transport events
- **Optional Transfer Agreements:** Tenant setting (enableTransferAgreement, defaults false) to generate printable org-to-org ownership transfer agreements with organizations, animal list, fees, legal terms, and signature lines

API routes for transfer workflow:
- GET `/api/transport/events/:transportId/medical-packet/:animalId` (individual animal)
- GET `/api/transport/events/:transportId/medical-packet` (batch for all animals)
- PATCH `/api/transport/manifest/:itemId/microchip-release` (toggle release status)
- GET `/api/transport/events/:transportId/transfer-agreement` (generate agreement)

**Petfinder FTP Sync Integration:**
The platform automates animal synchronization to Petfinder via FTP. Tenants configure FTP credentials, and the system generates Petfinder-compatible CSVs, maps breeds, calculates animal ages, and uploads images. Syncs can be scheduled (every 6 hours) or triggered manually, with sync status and errors tracked.

**Adopter Portal ("My Pets"):**
A dedicated portal for pet adopters accessible at `/my-pets` with password-less magic link authentication. Features include:
- **Pet Dashboard:** View all adopted pets with photos and adoption dates
- **Compliance Tab:** Download vaccination certificates, view microchip numbers with registry links, access medical exam history
- **Health Tab:** Medication reminder tracking with one-click confirmation via magic links, weight logging with visual graph
- **Alumni Tab:** Submit Happy Tail photo updates that feed back to the rescue organization
- **PWA Install Prompt:** iOS-specific instructions for adding to Home Screen (required for push notifications on iOS)
- **Double Tap Notifications:** Medication reminders sent via email on due dates with 48-hour follow-up for unconfirmed medications
- **Magic Links:** Password-less one-click confirmation for medication reminders, tokens expire after 7 days and single-use
- **Staff Compliance Dashboard:** Track adopter medication compliance rates, view overdue reminders, recent confirmations

Adopter Portal Routes:
- `/my-pets` - Pet dashboard
- `/my-pets/:animalId` - Pet detail with Compliance/Health/Alumni tabs
- `/my-pets/login` - Magic link login page
- `/dashboard/adopter-compliance` - Staff compliance tracking dashboard

API Endpoints (mounted at `/api/adopter/`):
- GET `/my-pets` - Get user's adopted animals
- GET `/pets/:animalId` - Get single adopted animal details
- GET `/pets/:animalId/vaccinations` - Get vaccination records
- GET `/pets/:animalId/exams` - Get medical exam history
- GET `/pets/:animalId/medications` - Get medication reminders
- POST `/pets/:animalId/medications` - Create medication reminder
- POST `/pets/:animalId/medications/:reminderId/confirm` - Confirm medication given
- GET `/pets/:animalId/weight` - Get weight logs
- POST `/pets/:animalId/weight` - Log new weight
- POST `/pets/:animalId/happy-tail` - Submit Happy Tail update
- GET `/confirm-medication/:token` - Magic link medication confirmation
- POST `/magic-login` - Authenticate via magic link token
- POST `/request-magic-link` - Request new login magic link
- GET `/staff/compliance/stats` - Get compliance statistics
- GET `/staff/compliance/reminders` - Get all reminders with details
- GET `/staff/compliance/confirmations` - Get recent confirmation logs

Database Tables:
- `animal_adopters` - Links users to adopted animals with adoption date
- `adopter_weight_logs` - Weight tracking entries
- `adopter_medication_reminders` - Scheduled medication reminders
- `medication_confirmation_logs` - Confirmation history
- `happy_tail_updates` - Photo updates from adopters
- `magic_links` - Authentication and confirmation tokens

Scheduled Jobs:
- Adopter medication notifications run at 9 AM and 6 PM UTC
- Due date notifications + 48-hour follow-up for unconfirmed medications

**Adoption Success Emails ("Success Loop"):**
Automated personalized emails sent to sponsors when their sponsored animal gets adopted, featuring "going home" photos and encouraging continued engagement with the rescue. Sponsor donations converted to one-time payments to avoid cancellation issues after adoption.

## External Dependencies
- **Stripe:** Payment gateway.
- **Resend:** Email delivery.
- **Google APIs:** OAuth 2.0, Gmail API, Calendar API, Drive API.
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
- **basic-ftp:** FTP client for Petfinder sync.