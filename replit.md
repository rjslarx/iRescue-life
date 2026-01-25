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
The design prioritizes mobile-first responsiveness, WCAG accessibility, and SEO. Key UI elements include an enhanced Command Center dashboard with real-time activity, a "Favorites" sidebar section (configurable quick actions), breadcrumbs, a drag-and-drop kennel layout editor, and consolidated volunteer management. Public navigation is streamlined for core activities like fostering, volunteering, and donating. The Command Center dashboard features a 3-zone grid layout (Front Door, Workforce, Animal Health) with role-based ordering and clickable KPI cards.

**Sidebar Favorites:**
The management portal sidebar features a collapsible "Favorites" section at the top displaying configured quick actions. Admins can customize which actions appear via Settings → Dashboard Quick Actions. Default actions include: Add Animal, Intake Manager, Medical Pipeline, Add Volunteer, and New Application. "Record Donation" is now supported in sidebar favorites, opening a modal dialog for quick donation entry.

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

**Adoption Application Pipeline:**
A complete adoption workflow is supported with stages from `new` to `adopted`, including a `trial` period for foster-to-adopt scenarios. Animal statuses automatically synchronize with application stages (e.g., `adoption_pending`, `in_trial`, `adopted`). A "hold" system prevents new applications for animals already in process, while public pages display animal status badges. Staff manage applications via a Kanban board.

**Medical Pipeline Dashboard:**
This centralized dashboard manages all medical operations across three sections:
- **Intake Protocol:** A vetting checklist for new animals, tracking tests, vaccinations, and exams.
- **Surgery Queue:** Manages spay/neuter scheduling and tracking.
- **Active Treatments:** Daily medication management with overdue and due-today sections, including controlled substance tracking.

**Phase 1 Intake Pipeline (Surrender Requests):**
A dedicated pipeline for dog surrender requests, featuring a `surrender_requests` table with a `new` to `intaken` status workflow. Enhanced fields include detailed dog information and TCPA-compliant SMS consent. Public forms are available, and staff use a Kanban view for intake management.

**Volunteer Calendar Staffing Color-Coding:**
Volunteer calendars visually indicate staffing levels (Red, Yellow, Green) based on `minVolunteersRequired`, with management UI to set these requirements and assign permissions.

**Customizable Hero Layouts:**
Tenants can select from "Three Doors" (customizable action cards), "Action Circle," or "None" for their public site hero sections.

**Native Contract Management System:**
The platform includes an in-house e-signature system for adoption contracts. Staff can create custom templates using rich text or a guided builder, supporting merge fields for auto-filling data. Signatures are captured via `signature_pad`, and Puppeteer generates legally verifiable PDF contracts with embedded signatures, stored securely with controlled access.

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
- **Twilio (optional):** SMS notifications.