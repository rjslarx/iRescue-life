# Multi-Tenant Animal Rescue SaaS Platform

## Overview
The Multi-Tenant Animal Rescue SaaS Platform is a comprehensive SaaS solution designed to centralize and streamline operations for animal rescue organizations. It provides each tenant with a custom subdomain, a public-facing website for showcasing animals and accepting donations, and a secure internal portal for staff. The platform aims to improve efficiency in adoption management, financial tracking, volunteer coordination, medical record management, and communication, ultimately enhancing animal welfare efforts. Key capabilities include PWA support, AI assistance, and IoT integration for advanced shelter monitoring.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform is built with a React, TypeScript, and Vite frontend, utilizing Wouter for routing, TanStack Query for data management, Tailwind CSS for styling, and shadcn/ui for UI components. The backend is an Express and Node.js application, written in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
Design principles prioritize mobile-first responsiveness, WCAG accessibility, and SEO. Notable UI elements include a customizable Command Center dashboard with real-time activity and role-based widgets, a configurable "Quick Actions" sidebar, breadcrumbs, and a drag-and-drop kennel layout editor. Public-facing websites offer customizable hero layouts.

**Technical Implementations:**
Multi-tenancy is achieved through `tenant_id` foreign keys in a single PostgreSQL database, supporting hybrid URLs. Authentication employs email/password with bcrypt, Express sessions, JWTs, token-based password reset, user invitation, and TOTP MFA for platform administrators. A tenant-scoped Role-Based Access Control (RBAC) system allows for dynamic role switching.

Core functionalities include:
- Comprehensive animal management, Kanban-workflow-driven adoption application pipelines, and financial management with Stripe integration. Adoption form fields support a `speciesFilter` column (`all`, `Dog`, `Cat`, etc.) enabling species-specific questions — the public adoption dialog filters fields by the animal's species, and the admin Form Settings page includes a "Show For Species" dropdown per question.
- Contact management, "Happy Tails" success stories, supply registry, expenditure tracking, event and volunteer coordination.
- Medical records management, including a medical pipeline dashboard and preventative care backfill, alongside document management.
- A native e-signature system for contracts, featuring custom templates and legally verifiable PDF generation.
- Automated daily backups of tenant files to Google Drive and PostgreSQL database backups to Google Cloud Storage.
- Integration of Stripe Embedded Components for transaction, payout, and balance display, supporting platform fees and "Donor Covers Fees" options.
- Client and server-side detection for photo uploads from various cloud services.
- Automated email and optional SMS notifications for adopters regarding overdue or upcoming preventative care.
- A full audit trail for all inbound and outbound SMS communications via Twilio, with detailed logging and contextual information.
- A mobile-first Foster Portal (My Fosters) for foster parents, including medication task logging.
- A Medication Plan & Task System for staff to create and track foster completion of medication plans.
- Subscription Feature Flags to enable differentiated features based on subscription tiers.
- A centralized Notification Preferences system allowing admins to configure event-based notifications across categories.
- **3-Pillar Animal Architecture:** Structuring animal data by `Status` (lifecycle), `Location` (physical whereabouts and kennel assignments), and `Badges` (boolean warning flags for medical, behavioral, and compatibility issues).
- Configurable Stripe checkout integration for owner surrender fees.
- Preventative Care Coverage Tracking, automatically updating `medicalDueDates` based on product coverage.
- A "Smart Add Medical Order Modal" (CPOE) on the Animal Medical Profile page, offering active order context, quick picks, autocomplete search, and species-aware catalog filtering for preventatives.
- An expanded `medical_catalog` supporting `species_target`, `default_route`, and `manufacturer` for enhanced preventative care management, including auto-filling during CPOE.
- CPOE Medical Catalog & Order Sets for managing orderable items (medications, vaccines, labs) and bulk protocol groups.
- Age-Aware Puppy Protocol Automation for intelligent scheduling of puppy vaccinations and preventative care.
- Automated Adoption Packet Generator for professional, certificate-style PDFs of vaccination history, preventative care, and microchip information, generated during adoption finalization.
- **Network Transfer Engine (Clone-and-Link):** Facilitates tenant-to-tenant animal transfers by cloning records and linking them, preserving medical history while creating a new local identity.
- **Two-Layer Animal Identity:** Each animal has a global UUID (`id`) and a tenant-specific human-readable `local_shelter_id` (e.g., `D-26-0015`), with a `transfer_network_id` for off-platform transfers.
- **Unified Daily Medical Roster:** Provides an aggregated daily view of all pending medical tasks across various categories, with a month-view calendar and categorized roster for efficient task management and completion. Medication doses (`dose` type) support a **30-second undo window** after being marked as given — an inline "Undo (Xs)" button with live countdown appears on the row; clicking it calls `POST /api/daily-roster/undo-mark-given` (server enforces a 90-second guard) which resets `status='due'`, clears `givenAt` and `administeredBy`. The `administeredBy` field on `medicalDoses` records which user marked each dose as given, visible on the Animal Medical page and in adoption packets.
- **Admin Override for Foster Medical Tasks:** Staff can mark foster animal tasks as complete directly from the Daily Roster (staff override). A `completionMethod` column (`foster_sms` | `staff_override`) on `medical_doses`, `preventative_care_records`, and `medication_tasks` tracks HOW each task was completed. Visual badges on the Animal Medical page show "Confirmed via SMS by [Foster Name]" or "Manually cleared by [Staff Name]" for full audit trail transparency. The Twilio webhook sets `completionMethod: 'foster_sms'` when fosters reply DONE; the roster bulk-mark endpoint sets `completionMethod: 'staff_override'`.
- **Donation & Fundraising Hub:** A centralized `/dashboard/fundraising` page consolidating fundraising tools into three sections: (1) General Rescue Donations with QR code generation, copy link, and download QR for the tenant's Stripe donation URL; (2) Targeted Animal Fundraising with a searchable animal combobox that navigates to the animal's profile; (3) Social Media Playbook with educational accordions on "Link in Comments" strategy and keyword auto-responder setup. A dedicated "Fundraising" sidebar group contains the hub, Donation Links, Fundraisers, and Event Ticket Sales.
- **Fundraiser / Event Sales Module:** Enables full campaign pages with Stripe Connect checkout, inventory caps, and pickup time tracking, supporting custom images and rich content for public-facing event pages and an administrative fulfillment dashboard.
- **Help & Training Module:** Offers a two-tab page for videos and documents, with admin CRUD capabilities and per-item role visibility for controlling access to training materials.
- **TNR (Trap-Neuter-Return) Log Module:** Integrates TNR record management within the existing animal data structure, enabling per-tenant activation, specific APIs for TNR records, and attachment capabilities.
- **Omnichannel Communications Switchboard:** A unified admin control panel (`/dashboard/communications-switchboard`) aggregating all SMS logs and queued messages. Features channel/status filtering, search, colored status badges, a `message_queue` table for scheduled/cancellable messages with a per-minute cron dispatcher, a tenant-level "Pause Outbound Comms" emergency kill switch (`commsPaused` flag on tenants table) that halts all SMS delivery when activated, and a **Convert Channel** modal allowing admins to swap a scheduled message between SMS and Email (with recipient contact validation, server-side HTML stripping for SMS, 160-char counter, subject field for email, and atomic race-safe updates via conditional WHERE on status=scheduled).
- **Daily Staff Briefing Email:** An automated HTML email sent each morning (5 AM UTC, configurable via `DAILY_BRIEFING_EMAIL_SCHEDULE`). Recipient roles are configurable per tenant via `briefingRecipientRoles` (default: `['admin']`), managed from the Notification Preferences settings page. Includes sections for: missed foster medications from yesterday, today's surgeries, medical exams, diagnostics/labs, procedures, overdue preventative care, foster compliance alerts, calendar events, foster updates (yesterday), and new foster photos (yesterday). Uses `EmailService` (Gmail API primary, Resend fallback). Recipients are deduplicated by email address. The dashboard Daily Briefing widget also surfaces missed foster medication tasks from the previous day.
  - **3-Pillar Layout:** The email is organized into three contextual groups: **SHELTER** (surgeries, exams, diagnostics, procedures, shelter overdue preventative care, calendar events), **FOSTER** (missed foster medications, foster compliance alerts, foster overdue preventative care, foster updates from yesterday, new foster photos from yesterday), and **ADOPTED** (pending adopter HELP requests from `adopter_help_requests`, overdue compliance obligations from `compliance_obligations` including spay/neuter breaches). Each pillar only appears when it has items. Overdue preventative care is split between shelter and foster animals using the active foster assignments.
- **Volunteer SMS Signup:** Volunteers can reply to urgent recruitment alerts to sign up for open shifts via SMS. Single-shortage alerts prompt "Reply SIGNUP to claim this shift!"; multi-shortage alerts number the options (e.g., "1. Morning Cleaners Tue 3/4") and accept "Reply SIGNUP or a # to claim a shift!". The inbound SMS handler (`handleIncomingSms`) matches the sender's phone to a user, computes live shortages, checks for duplicates, and creates a `calendar_events` signup using the calendar's `fixedDayTimes`. Numeric replies are gated by a 24-hour check for a recent `volunteer_recruitment_urgent` SMS to prevent conflicts with other handlers. A quiet hours guard (8 PM – 6 AM CST) blocks all outbound SMS. Files: `server/lib/twilio-service.ts`, `server/services/volunteer-recruitment-sms.ts`, `server/routes.ts`.
- **Foster Medication SMS Escalation:** A 3-step system: (1) hourly medication digest SMS when tasks become due, (2) evening nudge SMS at 5 PM UTC for unconfirmed tasks from earlier that day (configurable via `FOSTER_NUDGE_SCHEDULE`), (3) dashboard alerts for staff the next morning. Fuzzy matching (Levenshtein distance <= 2) accepts common typos of DONE/YES/CONFIRMED. Auto-reply confirmation ("Got it, thanks! Meds confirmed.") and "Did you mean DONE?" hints for ambiguous replies.
- **Adopted Animal Backfill:** A manual entry form on the Security & Access page (`/dashboard/settings/security`) for rescues joining the platform to register previously adopted animals with their owner info. Creates the animal (status: adopted), adopter contact, adopter user account, magic token for Pet Portal access, compliance obligations (rabies/DHPP), and preventative care records from medical due dates. Sends a welcome email with magic link. API: `POST /api/import/adopted-backfill`. Files: `server/routes/adoptedBackfill.ts`, `SecuritySettingsPage.tsx`.
- **Adopter Compliance Engine:** Full post-adoption compliance tracking including: (1) **Microchip Registration Reminder** — 7-day post-adoption SMS/email with chip number, manufacturer, and registration URL, scheduled automatically during adoption checkout if animal has a microchip record; (2) **HELP Keyword Routing** — adopters texting HELP get auto-reply and a `help_request` record is created in `adopter_help_requests` table, surfaced in the Compliance Widget's "Help" tab on the Command Center dashboard for staff visibility and resolution; (3) **Spay/Neuter Breach Escalation** — daily cron auto-escalates `pending` obligations past their contractual due date to `overdue` status, sends follow-up SMS/email with portal link, 7-day dedup on notifications; Dashboard shows "Compliance Breach: Spay/Neuter" with strong red styling. Also includes spay/neuter 14-day warning SMS, annual vaccine 11-month reminder, 3-3-3 retention emails+SMS, and daily compliance notifications.

## External Dependencies
- **Stripe:** Payment processing and financial management.
- **Resend:** Email delivery services.
- **Google APIs:** OAuth 2.0, Gmail API, Calendar API, Drive API, Google Picker API.
- **PostgreSQL:** Primary relational database.
- **Vite:** Frontend build tool.
- **Wouter:** Client-side routing.
- **TanStack Query:** Data management.
- **Tailwind CSS:** Styling.
- **shadcn/ui:** UI components.
- **Drizzle ORM:** Database interaction.
- **Express:** Backend web application framework.
- **bcrypt:** Password hashing.
- **connect-pg-simple:** PostgreSQL session store.
- **otplib:** One-Time Password library.
- **qrcode:** QR code generation.
- **helmet:** Security middleware.
- **cors:** Cross-Origin Resource Sharing.
- **express-rate-limit:** Request limiting.
- **node-cron:** Task scheduling.
- **Twilio (optional):** SMS notifications.