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
- **Volunteer & Foster Document Management:** Automatic creation of organized storage folders in Google Drive (or Replit Object Storage fallback) for active volunteers and fosters, with subfolders for specific document types (e.g., Waivers, Agreements, Training). Signed documents are accessible via an API endpoint.
- **Staff Kennel Cards:** Printable cards with comprehensive animal information, including header details, safety banner (color-coded behavior rating), compact status indicators, logistics grid, stray-specific fields, and medical/staff notes.
- **Automated Google Drive Backup:** Daily automated backups of tenant files from Replit Object Storage to Google Drive Shared Drives, with manual trigger options. Files are organized by category, and deduplication is used.
- **Stripe Embedded Components:** The Finance page uses Stripe Connect Embedded Components for secure display of transactions, payouts, and balance information directly from Stripe. A backend endpoint provides Account Session client secrets. The "Paw Pay" platform fee system uses Stripe Connect with a "SaaS + 0%" two-tier model and a 14-day Pro trial. "Donor Covers Fees" feature calculates gross-up amounts. Sensitive data is protected with AES-256-GCM encryption.

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