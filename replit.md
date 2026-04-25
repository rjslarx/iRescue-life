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
- Financial management with Stripe integration for donations, fees, and event sales.
- Contact management, "Happy Tails" success stories, supply registry, expenditure tracking, event, and volunteer coordination.
- Medical records management, a medical pipeline dashboard, preventative care backfill, and document management with AI-powered PDF auto-import.
- A native e-signature system for contracts with custom templates and legally verifiable PDF generation.
- Automated daily backups of tenant files to Google Drive and PostgreSQL database backups to Google Cloud Storage.
- Automated email and optional SMS notifications for adopters.
- A mobile-first Foster Portal (My Fosters) for foster parents, including medication task logging.
- A Medication Plan & Task System for staff to create and track foster completion of medication plans.
- Subscription Feature Flags to enable differentiated features based on subscription tiers (Note: Lite tier now has all Pro features unlocked).
- A centralized Notification Preferences system allowing admins to configure event-based notifications.
- **3-Pillar Animal Architecture:** Structuring animal data by `Status`, `Location`, and `Badges`.
- Preventative Care Coverage Tracking and a "Smart Add Medical Order Modal" (CPOE) on the Animal Medical Profile page for efficient order entry.
- Age-Aware Puppy Protocol Automation for intelligent scheduling of puppy vaccinations and preventative care.
- Automated Adoption Packet Generator for professional PDFs of vaccination history, preventative care, and microchip information.
- **Network Transfer Engine (Clone-and-Link):** Facilitates tenant-to-tenant animal transfers, preserving medical history.
- **Two-Layer Animal Identity:** Each animal has a global UUID and a tenant-specific human-readable `local_shelter_id`.
- **Unified Daily Medical Roster:** Provides an aggregated daily view of all pending medical tasks with a 30-second undo window for marked doses and admin override for foster medical tasks with audit trails.
- **Donation & Fundraising Hub:** A centralized dashboard for general donations, targeted animal fundraising, and a fundraiser/event sales module with full campaign pages. Includes "Donor Covers Fees" feature with `fees_covered`, `gross_amount`, and `net_amount` tracking in the donations table.
- **Help & Training Module:** Offers a two-tab page for videos and documents with role-based visibility.
- **TNR (Trap-Neuter-Return) Log Module:** Integrates TNR record management within existing animal data. Includes a Colony Map View with Google Maps integration showing color-coded markers by outcome type, geocoding of colony locations on batch create and edit, and an interactive info panel for each mapped record.
- **Omnichannel Communications Switchboard:** A unified admin control panel for SMS logs and queued messages, including a "Pause Outbound Comms" kill switch and a "Convert Channel" modal.
- **Daily Staff Briefing Email:** An automated HTML email providing a daily summary of shelter, foster, and adopted animal-related tasks and alerts.
- **Pending Applications Digest:** A daily scheduled email alerting configured recipients to new/unreviewed applications across various pipelines.
- **Volunteer SMS Signup:** Volunteers can sign up for open shifts via SMS.
- **Foster Medication SMS Escalation:** A 3-step system of hourly digests, evening nudges, and dashboard alerts for unconfirmed tasks, with fuzzy matching for replies.
- **Adopter Compliance Engine:** Full post-adoption compliance tracking including microchip registration reminders and spay/neuter breach escalation with automated notifications and dashboard alerts.
- **Medical Protocol Engine:** Tenant-customizable treatment intervals via Settings > Medical Protocols page.
- **Medical Record Edit Audit Trail:** All six medical record tables have `lastEditedAt` and `lastEditedBy` columns, with a history timeline and "(Edited)" tooltips.
- **Transfer Packet Section 5:** "Upcoming Preventative & Medical Care" section added to the official Medical Transfer Packet PDF, listing all future-due items.
- **P2P Campaigns & Pledges Module:** Extended peer-to-peer fundraising with unit-based pledges (e.g., "$10/lb lost"), progress tracking, and timeline updates. Public campaign landing page at `/campaign/:slug` (with UUID fallback to legacy emergency campaigns). Staff Campaign Manager tab in Fundraising Hub with animal linking, progress updates, and donor/pledge list with payment-status filtering.
- **Voting Contest Engine ("Vote with your Dollar"):** Gamified fundraising where $1 = 1 Vote, with a public leaderboard and Stripe Checkout integration.
- **Fast-Track / Fee Waived Adoption:** Supports bypassing application steps and waiving adoption fees with a reason.
- **Adoption Checkout Link SMS Delivery:** Default delivery of checkout links via SMS.
- **Email PDF Auto-Import with Gemini IDP:** Inbound email webhook automatically downloads PDF attachments, uploads them to object storage, and triggers AI-powered medical record parsing via Gemini 2.5 Flash, creating records for human-in-the-loop approval.
- **Email PDF Auto-Link to Animal Documents:** Fully reviewed email-imported medical batches automatically save the source PDF to the animal's Documents tab.
- **Forwarded Email Routing via System Inbound Address:** Each tenant has a unique `system_inbound_email` for forwarded-email routing.
- **Grant Readiness & Compliance Dashboard:** Tracks regulatory deadlines, document flags, and provides intake/outcome statistics with live release rate calculation.
- **Social Quick Pledge UI:** Mobile-first campaign landing page layout triggered by `?source=social` URL parameter, with 9:16 vertical media hero, sticky checkout sheet, share tools with QR code generation, and video support in campaign updates.
- **Per-Campaign Theme Customizer:** Each P2P campaign can have optional `primaryColor` and `accentColor` hex values set during creation or editing. These colors are applied to the public campaign landing page (hero gradient overlay, progress bars, CTA buttons, sticky donate bar) and participant sub-pages. Staff see color swatch indicators next to themed campaigns in the Campaign Manager table.
- **Wall of Heroes Recognition Name:** Donors choose how they want to be recognized publicly — first name, family name ("The Smith Family"), business name, or memorial ("In memory of Jojo"). The `subscriptions.display_name` column (TS field `displayName`) is accepted via the new `displayName` field on VIP checkout, the VIP Portal `wall-preferences` POST, and the per-subscription `wall-of-heroes` PATCH (legacy `firstNameDisplay` keys still accepted from older clients and Stripe metadata for in-flight checkouts; both keys are written to Stripe Checkout metadata for transition safety). When a donor opts in but doesn't supply a recognition name, the public Wall fallback chain is: stored `displayName` → "First L." (donor first name + last initial) → "Anonymous". Max length raised to 60 chars to fit longer family/memorial names.
- **VIP Auto-Tag for Monthly Donors:** Every monthly subscription created via Stripe Checkout — regardless of source page (VIP page, regular donation form, fundraiser, etc.) — is automatically tagged with the closest matching VIP tier on that tenant (highest tier whose price is ≤ the monthly amount). Backfill script `scripts/backfill-vip-tiers.ts` retroactively tags pre-existing monthly subs and seeds the three default tiers (Friend of the Pack $10 / Guardian $25 / Hero of Hope $50) on tenants that have none. Admins can customize seeded tiers anytime via Website Builder → VIP Donor Tiers; when the seeded defaults are still in place verbatim, that page surfaces a banner inviting customization, and the VIP Members page links directly to the tier editor. Wall of Heroes still requires the explicit donor opt-in checkbox — auto-tagged donors appear in the staff VIP roster and their own giving-history view but not on the public wall.
- **Campaign Intake Form for External Partners:** Self-service partner invitation system. Admins click "Invite Partner" to send a branded email with a tokenized link to an external partner (school, PTA, organization). The partner fills out a public intake form at `/intake/:token` with campaign details and participant roster. On submission, the system auto-creates the campaign and all participants with random avatars, sends confirmation emails with all sub-links to both partner and admin. Tokens expire after 30 days or upon use. Partner-submitted campaigns show a "Partner-submitted" badge in Campaign Manager.
- **Recurring-Payment Subscription-Link Backfill:** Task #104 fixed double-counting on every NEW recurring donation by stamping `payments.subscription_id` on the optimistic row created in `checkout.session.completed`, so the subsequent `invoice.payment_succeeded` dedup branch can find the seeded row and skip the second credit. To clean up rows created BEFORE that fix shipped, the one-shot script `scripts/backfill-payment-subscription-link.ts` walks every `payments` row where `is_recurring = true` and `subscription_id IS NULL`, looks up the linked Stripe invoice (`stripe_invoice_id`) or checkout session (`stripe_checkout_session_id`) to read its `subscription` field, and stamps the matching `subscriptions.id` from the same tenant. Donor totals are not touched — this is a foreign-key cleanup so subscription-scoped revenue queries (VIP per-tier revenue, etc.) stop silently dropping these renewals. Idempotent; supports `--dry-run`, `--tenant=<uuid>`, `--limit=<n>`. Backfill ran in production after Task #111.
- **Post Optimizer Payment Interception:** AI Post Optimizer (`/dashboard/post-optimizer`) detects P2P payment handles (Venmo `@`/`:`, `$Cashtags`, `paypal.me/x`) in the user's Facebook draft and silently re-routes the post: server-side regex strip of handles from the optimized caption, forced category override to `urgent_emotional`, guaranteed P.S. line, and a first-comment URL pointing to either the picked animal's active `emergency_fund` campaign (`/campaign/<id>`) or `/donate` as a fallback — both stamped with `utm_source=fb_optimizer&utm_medium=first_comment` and an Apple Pay / Google Pay mention. Optional animal picker combobox above the draft scopes the campaign lookup. Brand-only mentions like "We accept Venmo donations" are explicitly NOT triggered (regex requires an explicit handle marker).

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
- **Twilio (optional):** SMS notifications.