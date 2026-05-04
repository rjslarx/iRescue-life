# Multi-Tenant Animal Rescue SaaS Platform

## Overview
The Multi-Tenant Animal Rescue SaaS Platform is a comprehensive SaaS solution designed to centralize and streamline operations for animal rescue organizations. It provides each tenant with a custom subdomain, a public-facing website for showcasing animals and accepting donations, and a secure internal portal for staff. The platform aims to improve efficiency in adoption management, financial tracking, volunteer coordination, medical record management, and communication, ultimately enhancing animal welfare efforts. Key capabilities include PWA support, AI assistance, and IoT integration for advanced shelter monitoring, offering significant market potential for animal welfare organizations.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform is built with a React, TypeScript, and Vite frontend, utilizing Wouter for routing, TanStack Query for data management, Tailwind CSS for styling, and shadcn/ui for UI components. The backend is an Express and Node.js application, written in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
Design principles prioritize mobile-first responsiveness, WCAG accessibility, and SEO. Key UI elements include a customizable Command Center dashboard, a configurable "Quick Actions" sidebar, breadcrumbs, a drag-and-drop kennel layout editor, and customizable public-facing website layouts.

**Technical Implementations:**
Multi-tenancy is achieved through `tenant_id` foreign keys in a single PostgreSQL database, supporting hybrid URLs. Authentication employs email/password with bcrypt, Express sessions, JWTs, token-based password reset, user invitation, and TOTP MFA for platform administrators. A tenant-scoped Role-Based Access Control (RBAC) system allows for dynamic role switching.

Core functionalities include:
- Comprehensive animal management with Kanban-workflow-driven adoption application pipelines.
- Financial management with Stripe integration for donations, fees, and event sales, including a "Donor Covers Fees" feature.
- Contact management, "Happy Tails" success stories, supply registry, expenditure tracking, event, and volunteer coordination.
- Medical records management, a medical pipeline dashboard, preventative care backfill, document management with AI-powered PDF auto-import, and a "Smart Add Medical Order Modal" (CPOE).
- Native e-signature system for contracts with custom templates and legally verifiable PDF generation.
- Automated daily backups of tenant files to Google Drive and PostgreSQL database backups to Google Cloud Storage.
- Automated email and optional SMS notifications for adopters.
- Mobile-first Foster Portal (My Fosters) with medication task logging and a Medication Plan & Task System for staff.
- Subscription Feature Flags to enable differentiated features based on subscription tiers.
- Centralized Notification Preferences system for event-based notifications.
- **3-Pillar Animal Architecture:** Structuring animal data by `Status`, `Location`, and `Badges`.
- Age-Aware Puppy Protocol Automation for vaccinations and preventative care.
- Automated Adoption Packet Generator for professional PDFs.
- **Network Transfer Engine (Clone-and-Link):** Facilitates tenant-to-tenant animal transfers, preserving medical history.
- **Two-Layer Animal Identity:** Global UUID and tenant-specific `local_shelter_id`.
- **Unified Daily Medical Roster:** Aggregated daily view of pending medical tasks with audit trails for foster medical tasks.
- **Donation & Fundraising Hub:** Centralized dashboard for general donations, targeted animal fundraising, and event sales with campaign pages.
- **Help & Training Module:** Role-based visibility for videos and documents.
- **TNR (Trap-Neuter-Return) Log Module:** Integrates TNR record management with a Colony Map View using Google Maps.
- **Omnichannel Communications Switchboard:** Unified admin control panel for SMS logs and queued messages.
- Automated Daily Staff Briefing Email and Pending Applications Digest.
- Volunteer SMS Signup and Foster Medication SMS Escalation.
- Adopter Compliance Engine for post-adoption tracking.
- Medical Protocol Engine for tenant-customizable treatment intervals.
- Medical Record Edit Audit Trail for all medical record tables.
- Transfer Packet Section 5: "Upcoming Preventative & Medical Care" section.
- **P2P Campaigns & Pledges Module:** Peer-to-peer fundraising with unit-based pledges, progress tracking, and public campaign landing pages.
- **Voting Contest Engine ("Vote with your Dollar"):** Gamified fundraising with a public leaderboard.
- Fast-Track / Fee Waived Adoption functionality.
- Adoption Checkout Link SMS Delivery.
- Email PDF Auto-Import with Gemini IDP for AI-powered medical record parsing.
- Email PDF Auto-Link to Animal Documents.
- Forwarded Email Routing via System Inbound Address for each tenant.
- Grant Readiness & Compliance Dashboard for regulatory tracking and statistics.
- Social Quick Pledge UI for mobile-first campaign landing pages.
- Per-Campaign Theme Customizer for public campaign landing pages.
- Wall of Heroes Recognition Name for donor display preferences.
- VIP Auto-Tag for Monthly Donors based on subscription tiers.
- Campaign Intake Form for External Partners for self-service campaign creation.
- ACH Bounce Donor Notice with try-again functionality.
- Post Optimizer Payment Interception: AI detection of P2P payment handles in social media drafts for re-routing and campaign linking.
- Surgery Day Request Signed-Agreement PDF: lazily-generated, downloadable PDF of the partner's signed liability agreement (signature image + acknowledgment text + animal list + signer/timestamp + linked partner organization) with strict signature data-URI sanitization, available from the staff dashboard.
- **One-Click "Log Given" for Recurring Medications:** Both the Animal Medical page (Active Medications) and the Daily Medical Roster expose a one-click `Log Given` button alongside the existing two-click `Administer…` (custom time + notes) flow. Recurring preventatives (`MONTHLY`, `Q3M`, `Q6M`, `Q8M`, `ANNUALLY`) auto-schedule the next dose when one is logged — staff never need to recreate the prescription each month. Doses overdue for more than 14 days show an inline hint guiding staff to either `Log Given` (if it was administered off-system) or `Unable`.
- **Latest-Record-Per-Series-Wins for Preventative Care Coming-Due:** The `/api/medical/preventative-care/coming-due` endpoint groups records by `(animal, series)` and surfaces only the most recent record per series. PCR series are derived from the care-type's `coversHeartworm` / `coversFleaTick` flags (so combo products like Credelio Quattro count for both heartworm and flea series, while a flea-only NexGard does not suppress a heartworm gap). Vaccines are grouped by a normalized "family" key (DAPPVL2 / DAPPL-9 / DA2PP / DHPP / Dapp+L4 → "dhpp"; Bordetella variants, Rabies, Lepto, Lyme, Influenza, FVRCP, FeLV similarly). This eliminates phantom overdues that previously appeared once a newer dose was logged or when staff swapped brands mid-series. Canonical `vaccineFamily()` and `seriesKeysForPcr()` helpers live in `server/services/medical-supersession.ts` and are imported by the coming-due endpoint, the startup backfill script, and every write-time supersession call (drift-free single source of truth).
- **Write-Time Supersession of Preventative/Vaccine Records:** Every PCR/vaccine insert path that writes a `next_due_date` or `date_due` immediately calls `supersedeOlderPreventativeCareRecords()` / `supersedeOlderVaccineRecords()` (in `server/services/medical-supersession.ts`) to null those columns on older same-series records for the same animal. Combo-safe: a candidate is only superseded if it loses to the new record in EVERY series it participates in (a heartworm-only product can't null a heartworm+flea combo's flea coverage). Wired into the main vaccine create endpoint (replacing a buggy exact-itemName supersession that missed brand swaps), the main PCR create endpoint, the auto-scheduled follow-up insert, and the calendar-events medical scheduler. Combined with the one-time startup backfill from #159, this keeps the underlying tables consistent with what the dashboard surfaces — no more periodic phantom-overdue duplicates leaking back into grant reports, transfer packets, or audit views.
- **Terminal-Status Animal Filtering for Daily Briefing & Medical Cleanup:** Animals whose status is `adopted`, `deceased`, `transported`, `returned_to_owner`, or `returned_to_field` (the canonical `TERMINAL_STATUSES`) are excluded from every medical query in the Daily Staff Briefing email — exams (today + overdue), diagnostics, procedures, preventative-care overdues, missed CPOE doses (foster + shelter), and missed foster medication tasks. Read-time filter uses `notInArray(animals.status, TERMINAL_STATUSES)` on queries that already join `animals`, plus a per-tenant `terminalAnimalIds` set fetched once per run that filters prescription/task results that don't join `animals`. Write-time cleanup in `PATCH /api/animals/:id` and `PATCH /api/animals/:id/deceased` now also: (a) marks pending `medical_doses` (status='due') as `skipped`, (b) sets `medical_prescriptions.endDate=NOW()` and nulls `nextScheduledDose` on open prescriptions, and (c) nulls `preventativeCareRecords.nextDueDate` on records with a future due date. `medical_exams.status` enum is `pending|completed` only, so exams are not touched at write time and rely solely on the read-time filter. A one-time `backfillTerminalAnimalMedicalCleanup()` startup script (marker key `backfill:terminal_animal_medical_cleanup_v1` in `platform_settings`) sweeps the existing data so previously-stale rows for already-terminal animals stop leaking into the briefing.
- **Adopter Heartworm Compliance Warning System:** Auto-sends a strongly-worded contract-enforcement warning (email + SMS) when a parasite-prevention item is overdue ≥14 days for an adopted animal with no proof uploaded and no warning sent in the past 30 days; runs daily at 14:00 UTC alongside other adopter compliance jobs. Hardcoded 7-day deadline referenced in `{{deadlineDate}}`. Per-tenant template with merge tokens `{{rescueName}} {{adopterFirstName}} {{dogName}} {{deadlineDate}} {{portalLink}}`; defaults to the Haseya manager wording. Manual "Send Warning Now" button on the Adopter Compliance "Heartworm Watch" tab is also gated by the 30-day dedup window. Bypasses adopter email/SMS opt-outs and quiet hours because it is a transactional contract-enforcement notice.

## External Dependencies
- **Stripe:** Payment processing and financial management.
- **Resend:** Email delivery services.
- **Google APIs:** Gmail API, Calendar API, Drive API, Google Picker API.
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
- **Twilio (optional):** SMS notifications.