# Multi-Tenant Animal Rescue SaaS Platform

## Overview
This project is a multi-tenant SaaS platform designed for animal rescue organizations. It provides each organization with a custom subdomain, a public-facing website for showcasing animals and accepting donations, and a secure internal portal for staff. The platform aims to centralize and streamline key operations such as animal management, adoption applications, financial contributions, volunteer coordination, medical records, and communication. Advanced features include PWA capabilities, AI assistance, and IoT integration for shelter monitoring. The overarching goal is to enhance operational efficiency and expand the outreach of animal welfare efforts.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform is built with a React, TypeScript, and Vite frontend, utilizing Wouter for routing, TanStack Query for data fetching, Tailwind CSS for styling, and shadcn/ui for UI components. The backend is an Express and Node.js application in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
The design prioritizes mobile-first responsiveness, WCAG accessibility, and SEO. It features a consolidated navigation, an enhanced dashboard with real-time activity and "Quick Actions," breadcrumbs, a drag-and-drop kennel layout editor, and streamlined public navigation for fostering, volunteering, surrendering, and donating.

**Multi-Tenancy:**
Data isolation within a single PostgreSQL database is achieved using `tenant_id` foreign keys. The system supports a hybrid URL architecture including path-based URLs, custom domains, and subdomain-based access, with routing handled by backend middleware.

**Authentication & Authorization:**
Email/password authentication is implemented using bcrypt and Express sessions, incorporating secure token-based password reset, a user invitation system, TOTP-based MFA for platform administrators, and JWTs for session management. Tenant-scoped Role-Based Access Control (RBAC) supports dynamic role switching and includes a `platform_admin` role.

**Feature Specifications:**
Core functionalities include comprehensive animal, application, and financial management (integrated with Stripe). It offers contact management, supply registry, expenditure tracking, event management, volunteer coordination, medical records, and document management. Tenant websites feature customizable hero layouts. Communication tools include newsletters, email campaigns (via Resend), and automated notifications. The platform also provides unified site permissions, multi-calendars, page-level permissions, customizable event forms, and admin interfaces for tenant branding, CMS, custom pages, and analytics. PWA capabilities enable mobile installation, offline access, and push notifications. Integrations extend to external adoption platforms and Google Workspace. A platform admin interface facilitates management of tenants, users, feature flags, audit logs, and system health. Additional features encompass an AI Help Assistant, a setup wizard, kennel management, public animal surrender, auto-archiving, grant budget tracking, a contract template editor with a native e-signature system, a fundraising shop module, a collaboration hub, smart foster matching, medical fund campaigns, Govee temperature monitoring, IRS-compliant donation receipts, and social media sharing with Open Graph tags.

**Foster Application Pipeline:**
A 7-stage Kanban workflow manages foster applications, featuring drag-and-drop functionality, native e-signing for foster agreements, and an active foster pool with searchable preferences. Automated email notifications are sent for agreement signing.

**Custom Forms with Fee Collection:**
The system supports custom forms with integrated fee collection and optional donation requests. Staff can configure fee amounts, and the payment flow integrates with Stripe Connect, including the ability to waive fees and track various payment statuses.

**Native Contract Management System:**
A native e-signature system for adoption contracts includes a template editor supporting merge fields for auto-filling information. It features native e-signature capture, optional driver's license verification, and PDF generation with embedded signatures, IP, and timestamps. Signed contracts are securely stored with time-limited download access, including a conditional spay/neuter contract for unaltered animals.

**Technical Implementations:**
"Paw Pay" utilizes Stripe Connect with a "SaaS + 0%" two-tier subscription model (Free and Professional), including a 14-day Pro trial. Stripe Standard Connect OAuth manages tenant payments, and a "Donor Covers Fees" feature calculates gross-up amounts. ACH bank transfer is supported for one-time donations. Sensitive data is protected using AES-256-GCM encryption. Unified file storage prioritizes Google Drive, with Replit object storage as a fallback. Email services integrate Resend with optional Google Workspace Gmail API. Platform admin security includes subdomain resolution, RBAC, frontend guards, authenticated sessions, and TOTP MFA. Production security features rate limiting, Helmet, CORS fail-closed, environment validation, and session hardening. Google Analytics 4 is integrated, and optional Google Workspace integration provides Gmail API, Calendar sync, and Drive storage.

**Transfer Workflow & Partner Organizations:**
The platform supports comprehensive animal transfers between organizations, including partner organization management, a one-click medical packet generator, a microchip release checklist, transfer fee tracking, and optional printable org-to-org ownership transfer agreements.

**Petfinder FTP Sync Integration:**
The platform automates animal synchronization to Petfinder via FTP. Tenants configure credentials, and the system generates Petfinder-compatible CSVs, maps breeds, calculates animal ages, and uploads images. Syncs can be scheduled or manually triggered, with status and errors tracked.

**Adopter Portal ("My Pets"):**
A dedicated portal for adopted pet owners accessible via password-less magic link authentication. Features include a pet dashboard, compliance tab for medical records, a health tab for medication reminders and weight logging, and an alumni tab for submitting "Happy Tail" updates. It also includes PWA installation prompts and double-tap notifications for medication reminders.

**Foster Portal ("Co-Pilot" Dashboard):**
A dedicated portal for foster caregivers accessible via password-less magic link authentication, providing operational task management with write access. Key features include a Co-Pilot dashboard with daily tasks, an AI-powered bio builder, a photo upload system with staff approval, weight tracking with charts, behavior notes with "flag-for-concern" alerts, and a supply request system with a staff fulfillment workflow.

**Adoption Success Emails ("Success Loop"):**
Automated personalized emails are sent to sponsors when their sponsored animal is adopted, featuring "going home" photos and encouraging continued engagement. Sponsor donations are converted to one-time payments upon adoption.

## External Dependencies
- **Stripe:** Payment gateway for financial transactions.
- **Resend:** Email delivery service.
- **Google APIs:** OAuth 2.0, Gmail API, Calendar API, Drive API for various integrations.
- **PostgreSQL:** Primary relational database.
- **Vite:** Frontend build tool.
- **Wouter:** Client-side routing for React.
- **TanStack Query:** Data fetching and state management.
- **Tailwind CSS:** Utility-first CSS framework.
- **shadcn/ui:** Reusable UI components.
- **Drizzle ORM:** TypeScript ORM for database interactions.
- **Express:** Backend web application framework.
- **bcrypt:** Library for password hashing.
- **connect-pg-simple:** PostgreSQL session store for Express.
- **otplib:** Library for one-time password generation (TOTP).
- **qrcode:** QR code generation library.
- **helmet:** Middleware for setting security-related HTTP headers.
- **cors:** Middleware for enabling Cross-Origin Resource Sharing.
- **express-rate-limit:** Middleware for limiting repeated requests to public APIs and/or endpoints.
- **node-cron:** For scheduling tasks in Node.js.
- **basic-ftp:** FTP client for Petfinder synchronization.