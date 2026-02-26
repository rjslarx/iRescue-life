# Multi-Tenant Animal Rescue SaaS Platform

## Overview
The Multi-Tenant Animal Rescue SaaS Platform is a comprehensive SaaS solution for animal rescue organizations. It provides each tenant with a custom subdomain, a public-facing website for animal showcasing and donations, and a secure internal portal for staff. The platform centralizes operations, improves efficiency in adoption management, financial tracking, volunteer coordination, medical record management, and communication, aiming to enhance animal welfare efforts. It supports progressive web apps (PWA), AI assistance, and IoT integration for advanced shelter monitoring.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform features a React, TypeScript, and Vite frontend with Wouter for routing, TanStack Query for data management, Tailwind CSS for styling, and shadcn/ui for UI components. The backend is an Express and Node.js application, written in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
Design emphasizes mobile-first responsiveness, WCAG accessibility, and SEO. Key UI elements include a customizable Command Center dashboard with real-time activity and role-based widgets, a configurable "Quick Actions" sidebar, breadcrumbs, and a drag-and-drop kennel layout editor. Public-facing sites offer customizable hero layouts.

**Technical Implementations:**
Multi-tenancy is implemented using `tenant_id` foreign keys in a single PostgreSQL database, supporting hybrid URLs. Authentication uses email/password with bcrypt, Express sessions, JWTs, token-based password reset, user invitation, and TOTP MFA for platform admins. A tenant-scoped Role-Based Access Control (RBAC) system enables dynamic role switching.

Core functionalities include:
- Animal management, adoption application pipelines (Kanban workflow), and financial management (Stripe integration).
- Contact management, Happy Tails, supply registry, expenditure tracking, event and volunteer coordination.
- Medical records management (including a medical pipeline dashboard and preventative care backfill), and document management.
- Native e-signature system for contracts with custom templates and legally verifiable PDF generation.
- Automated daily backups of tenant files to Google Drive and PostgreSQL database backups to Google Cloud Storage.
- Stripe Embedded Components for transaction, payout, and balance display, supporting platform fees and "Donor Covers Fees".
- Client and server-side detection for photo uploads from cloud services.
- Automated email and optional SMS notifications for adopters regarding overdue or upcoming preventative care.
- A mobile-first Foster Portal (My Fosters) for foster parents, including medication task logging.
- Medication Plan & Task System for staff to create plans and track completion by fosters.
- Subscription Feature Flags to support different subscription tiers by showing/hiding features.
- Centralized Notification Preferences system for admin-configurable event-based notifications across various categories.
- **3-Pillar Animal Architecture:**
    - **Status (Lifecycle):** 8 statuses, including terminal statuses that trigger automated actions (e.g., cancel medical tasks).
    - **Location (Physical Whereabouts):** `locationType` and `locationName` fields, with kennel assignments for shelter animals.
    - **Badges (Boolean Warning Flags):** Medical, behavioral, and compatibility warning icons displayed on animal cards.
- Configurable Stripe checkout integration for owner surrender fees.
- Preventative Care Coverage Tracking, automatically updating `medicalDueDates` based on product coverage.
- Smart Add Medical Order Modal for Computerized Provider Order Entry (CPOE) on the Animal Medical Profile page, offering active order context, quick picks, autocomplete search, and **species-aware catalog filtering** (Dog animals only see Dog/Both preventatives; Cat animals only see Cat/Both).
- **Expanded Medical Catalog**: `medical_catalog` now carries `species_target`, `default_route`, and `manufacturer` per item. 20 specific preventative products replace the old generic list, each with correct species targeting, administration route, and manufacturer (for grant reporting). Manufacturer is stored internally but intentionally hidden from CPOE search UI. `preventative_care_records` stores `administration_route`. `preventative_care_types` stores `manufacturer` for the 8 seeded platform-wide care types.
- **CPOE → Preventative Care auto-fill**: When a preventative is selected via CPOE, `AddPreventativeCareDialog` pre-fills the Administration Route (Oral/PO, Topical, Collar) and Manufacturer. Standalone path auto-fills only Manufacturer from the selected care type; route remains blank for manual selection.
- CPOE Medical Catalog & Order Sets for managing orderable items (medications, vaccines, labs) and bulk protocol groups.
- Age-Aware Puppy Protocol Automation for intelligent scheduling of puppy vaccinations and preventative care based on DOB.
- Automated Adoption Packet Generator for professional, certificate-style PDFs of vaccination history, preventative care, and microchip information, generated during adoption finalization.
- **Network Transfer Engine (Clone-and-Link):** Tenant-to-Tenant animal transfers using a clone-and-link model: (1) Tenant A's original record becomes `transported` (terminal, read-only, full medical records preserved), (2) Tenant B receives a cloned animal with new UUID, new `local_shelter_id`, and copies of all COMPLETED medical records (vaccines, preventive care with `status='given'`, microchips, medical files, and medical exams with `status='completed'`), (3) Clone is linked back to original via `source_animal_id` field. Animals with `source_animal_id` show a "Transferred In" indicator in the UI.
- **Two-Layer Animal Identity:** Each animal has (1) a UUID primary key (`id`) as the global permanent identifier and (2) a `local_shelter_id` (format: `D-26-0015`) as the human-readable per-tenant sequential identifier. The generator utility (`server/utils/shelterId.ts`) creates IDs scoped to `(tenant, species initial, year)`. The old globally-unique `animalId` field is preserved for backward compatibility but no longer displayed. New field `transfer_network_id` (text, nullable) tracks the partner org name for off-platform transfers.
- **Unified Daily Medical Roster:** Aggregated daily view of all pending medical tasks across 5 tables (medication doses, preventative care, exams, procedures, diagnostics). Two-column layout with month-view calendar (badge dots on days with pending items) and categorized roster. Three action sections: (A) In-House Meds & Preventatives with checkbox bulk "Mark Given", (B) Vet Visits & Surgeries with "Log Completion" dialog (cost, notes), (C) Labs & Diagnostics with "Enter Results" dialog (Positive/Negative/Inconclusive). API: `GET /api/daily-roster`, `GET /api/daily-roster/calendar`, `POST /api/daily-roster/bulk-mark-given`. Page: `DailyRosterPage.tsx`. Sidebar: Operations > Daily Roster.
- **Medical Pipeline ↔ Daily Roster Sync (fixed):** Three data-consistency gaps resolved: (1) `AddPreventativeCareDialog` now always sends `createFollowUp: false` — prevents phantom duplicate `status='pending'` records from being created when a next-due-date is set; (2) `GET /api/medical/preventative-care/coming-due` now queries `vaccine_records` (via `dateDue`) in parallel with `preventative_care_records`, merging and sorting both sets into overdue/dueToday/comingSoon — vaccines now appear in the Medical Pipeline Preventative tab; (3) Daily Roster shelter location filter changed from `eq(locationType,'shelter')` to `or(eq(locationType,'shelter'), isNull(locationType))` to match the Medical Pipeline's inclusive definition, so animals with null locationType appear under "Shelter" in both views. Note: `animals` table has `locationType` and `locationName` fields — there is no `animals.location` field.
- **CPOE Consolidated Entry Point:** `AddMedicalOrderDialog` now includes a "Preventative Protocols" quick-pick section alongside Order Sets, exposing all 5 protocols (Adult Dog Standard, Adult Cat Standard, Kitten Protocol, Intake Default – Dog, Intake Default – Cat). Selecting a protocol shows a review card with item list and "Mark all items as given today" checkbox before applying via `POST /api/animals/:id/preventative-care/apply-protocol`. The Preventative tab header also has an "+ Add Record" shortcut button that opens the CPOE dialog directly, making the tab self-sufficient without scrolling to the global CPOE button.

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