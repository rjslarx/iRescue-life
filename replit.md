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
- Surgery Day Request Signed-Agreement PDF: lazily-generated, downloadable PDF of the partner's signed liability agreement.
- **One-Click "Log Given" for Recurring Medications:** Simplifies medication tracking by allowing one-click logging and auto-scheduling of next doses.
- **Latest-Record-Per-Series-Wins for Preventative Care Coming-Due:** Ensures only the most recent and relevant preventative care records are surfaced, eliminating phantom overdues.
- **Write-Time Supersession of Preventative/Vaccine Records:** Automatically updates and supersedes older preventative and vaccine records upon new entries.
- **Terminal-Status Animal Filtering for Daily Briefing & Medical Cleanup:** Excludes animals with terminal statuses from medical queries and cleans up associated medical tasks and prescriptions.
- **Aligned Adoption Guardrails Across All Three Entry Points:** Enforces mandatory checks and provides consistent warning/override mechanisms across all adoption finalization paths.
- **Adopter Heartworm Compliance Warning System:** Automates sending warning notices for overdue parasite prevention to adopters, with smart deduping and phone number fallback.
- **Social Post Templates:** Save Social Post Architect generations as named, tenant-scoped templates that staff can one-click re-load (form inputs, hashtags, and previously generated outputs all restored) and delete from inside the architect dialog.
- **Wall of Heroes Memorial Photos:** VIP monthly subscriptions can attach an optional memorial photo (PNG/JPG/WebP/HEIC ≤5MB, EXIF-stripped, resized to 512x512 JPEG via sharp/heic-convert) with a heart or paw frame. Donors edit theirs in the VIP Portal; staff can edit on behalf of donors from the Members page. The public Wall of Heroes renders an "In Memory" section above the standard hero grid that auto-folds memorial-photo tiles AND any existing recognition names beginning with "In memory of"/"In honor of" (case-insensitive), respects search and tier filters, and is hidden when empty. **Forever Hero:** When a tribute subscription (memorial photo set OR memorial-phrase recognition name) is canceled after billing actively for 12+ months, the `customer.subscription.deleted` webhook flips a `foreverHero` flag so the tile remains pinned to the public Wall permanently. Helper at `server/lib/memorial-photo.ts`; donor + staff endpoints under `/api/vip-portal/subscriptions/:id/memorial-photo|memorial-frame` and `/api/vip-club/members/:id/memorial-photo|memorial-frame`. No moderation.
- **VIP Tribute & Honor Gifting (Task #197):** Public VIP Club page surfaces a "Gift this membership" button beside every tier. The gifter pays the recurring monthly amount and provides honoree name (required), optional honoree email, optional personal note, optional announcement date, and Wall opt-in (default-on, "In honor of [Name]"). Stripe webhook detects gifts via `gift.*` checkout-session metadata and writes a `subscription_gifts` row (one-per-subscription via `unique_subscription_gift`). A daily cron (`VIP_GIFT_ANNOUNCEMENT_SCHEDULE`, default `0 13 * * *` UTC) sends the "you've been honored" email — tasteful tone, never reveals the dollar amount — and stamps `announcement_sent_at` to dedupe. Donor portal labels gifted subscriptions with "Gift in honor of [Name]" plus Edit (PATCH `/api/vip-portal/subscriptions/:id/gift`) and Re-send announcement (POST `/api/vip-portal/subscriptions/:id/gift/resend`) controls. Staff Members page shows a tooltip badge with gifter+honoree+email. Wall recognition stays in lockstep with the honoree name on edits.
- **One-Time Donation Tributes:** Optional "in memory of / in honor of" section on the public Donate page (radio kind, honoree name, optional family-notify recipient name+email+message, default-on Wall opt-in, optional photo with heart/paw frame). Tribute fields persist on `donations` rows; tasteful family acknowledgment email never reveals the amount and is deduped via `tributeAcknowledgmentSentAt` (deferred to ACH-clear for bank transfers). New "Tribute Wall" section on the Wall of Heroes lists tribute gifts from the last 12 months, collapsing multiple gifts to the same honoree as "Honored by N donors", hidden when empty, respects search filter. No moderation.
- **Unified Communications Helper (`server/lib/unified-comms.ts`):** All adopter & foster automated SMS/email is routed through `sendCommunication()`, which writes a `message_queue` row (status `processing` → `delivered`/`failed`), then dispatches via `sendSms` or `EmailService`. Audit tables (`adopter_notification_logs`, `compliance_reminder_notifications`, `adopter_compliance_warnings`, `compliance_reminders`) carry a nullable `message_queue_id` FK so the Communications Switchboard becomes a single source of truth.

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