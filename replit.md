# Multi-Tenant Animal Rescue SaaS Platform

## Overview
The Multi-Tenant Animal Rescue SaaS Platform is a comprehensive SaaS solution designed for animal rescue organizations. It provides each tenant with a custom subdomain, a public-facing website for animal showcasing and donations, and a secure internal portal for staff. The platform aims to centralize operations, improve efficiency in adoption management, financial tracking, volunteer coordination, medical record management, and communication, ultimately enhancing the impact of animal welfare efforts. It incorporates progressive web app (PWA) support, AI assistance, and IoT integration for advanced shelter monitoring.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform is built with a React, TypeScript, and Vite frontend, utilizing Wouter for routing, TanStack Query for data management, Tailwind CSS for styling, and shadcn/ui for UI components. The backend is an Express and Node.js application, written in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
The design prioritizes mobile-first responsiveness, WCAG accessibility, and SEO. Key UI elements include a customizable Command Center dashboard with real-time activity and role-based widget rendering, a configurable "Quick Actions" sidebar, breadcrumbs, and a drag-and-drop kennel layout editor. Public-facing sites offer customizable hero layouts.

**Technical Implementations:**
Multi-tenancy is achieved through `tenant_id` foreign keys in a single PostgreSQL database, supporting hybrid URLs. Authentication uses email/password with bcrypt, Express sessions, JWTs, token-based password reset, user invitation, and TOTP MFA for platform admins. A tenant-scoped Role-Based Access Control (RBAC) system allows dynamic role switching.

The platform includes robust features for animal management, adoption application pipelines (Kanban board workflow), financial management (Stripe integration, in-kind donation tracking), contact management, Happy Tails, supply registry, expenditure tracking, event and volunteer coordination, medical records management (including a medical pipeline dashboard and preventative care backfill), and document management.

Key functionalities include:
- **Contract Management:** Native e-signature system for various agreements (adoption, foster, volunteer hold harmless, owner surrender, animal placement) with custom templates, merge fields, and legally verifiable PDF generation via Puppeteer. This includes automated workflows for sending signing links and processing signed documents.
- **Automated Document & Database Backups:** Daily automated backups of tenant files to Google Drive and PostgreSQL database backups to Google Cloud Storage.
- **Stripe Embedded Components:** Integration for displaying transactions, payouts, and balance, supporting "Paw Pay" platform fees and "Donor Covers Fees".
- **Mobile Cloud Storage Detection:** Client and server-side detection for photo uploads from cloud services, providing user guidance.
- **Adopter Compliance Notifications:** Automated email and optional SMS notifications for adopters regarding overdue or upcoming preventative care and medication reminders, with user-managed preferences in the My Pets portal.
- **Foster Portal (My Fosters):** A mobile-first portal for foster parents with bottom tab navigation (Dashboard, My Animals, Requests, Profile). Features include medication task logging (Mark Given / Skip with reason), horizontal scroll foster animal cards, quick actions (photo upload, supply requests), and emergency contact. Privacy-enforced: fosters only see their own assigned animals.
- **Medication Plan & Task System:** Staff create medication plans (drug name, dosage, frequency SID/BID/TID/QID, date range) via `medication_plans` table. A background generator creates daily `medication_tasks` with scheduled times and round labels. Fosters log task completion with a 4-hour safety check preventing premature marking. API routes at `/api/medications/`. Tables: `medication_plans`, `medication_tasks`.
- **Subscription Feature Flags (Lite Tier):** Supports different subscription tiers by hiding/showing features based on `subscriptionTier` with specific integrations for Lite tier tenants (e.g., JotForm for application pipelines).
- **Centralized Notification Preferences:** Admin-configurable event-based notification system via `notification_preferences` table. Supports 18 event types across 6 categories (Applications, Animal Management, Agreements, Foster & Compliance, Financial, Operations). Each event can be enabled/disabled with configurable recipient roles and explicit email addresses. API: GET/PATCH `/api/tenant/notification-preferences`. Service: `server/services/notification-dispatcher.ts` with `getNotificationRecipients()`, `shouldNotify()`, and `dispatchEventNotification()`. Integrated with existing form notifications (additive recipient merging). UI: `NotificationPreferencesSettings` component in Settings page.
- **3-Pillar Animal Architecture (Status / Location / Badges):**
  - **Status (Lifecycle):** 8 finalized statuses: `available`, `adoption_pending`, `transfer_pending`, `medical_hold`, `stray_hold`, `adopted`, `transported`, `deceased`. Terminal statuses (`adopted`, `transported`, `deceased`) auto-cancel medical tasks, deactivate medication plans, and complete foster assignments. Constants: `TERMINAL_STATUSES`, `ACTIVE_STATUSES` in `shared/schema.ts`.
  - **Location (Physical Whereabouts):** `locationType` field (`shelter | foster | clinic | transport | offsite`) + `locationName` text field. Shelter animals use kennel assignment (`kennelBuildingId`, `kennelRowId`, `kennelPosition`). Displayed in LocationBar component on animal cards.
  - **Badges (Boolean Warning Flags):** Medical badges: `heartwormPositive`, `needsSpayNeuter`, `specialDiet`. Behavioral badges: `biteHistory`, `isFlightRisk`. Compatibility badges (inverted): `catFriendly=false` shows "No Cats", `dogFriendly=false` shows "No Dogs", `childFriendly=false` shows "No Kids". Badges only appear on the card when the warning condition is true.
  - **Animal Card UI mapping:** Top-right = Status pill, Middle = Badge warning icons (HudBadgeIcon component), Bottom footer = Location (LocationBar component). Animals dashboard has "Show Archived" toggle to show/hide terminal status animals.
- **Tenant-to-Tenant Animal Transfers:** Network transfer system enabling rescue organizations to transfer animal records within the iRescue network. Uses deep clone approach: clones animal profile, vaccine records, preventative care records, microchip records, and medical file documents while excluding internal data (notes, foster assignments, billing, kennel locations). Sender's animal set to `transported` status upon acceptance; receiving tenant gets fresh animal with `intakeSource=transfer`. Table: `tenant_transfers`. API routes at `/api/transfers/`. Notification events: `animal_transfer_received`, `animal_transfer_accepted`. UI: TransferAnimalDialog (initiated from animal card menu), TransfersPage (management with incoming/outgoing tabs, preview, accept/reject/cancel). Navigation: "Network Transfers" in Operations sidebar section.

## External Dependencies
- **Stripe:** Payment processing and financial management.
- **Resend:** Email delivery services.
- **Google APIs:** OAuth 2.0, Gmail API, Calendar API, Drive API, Google Picker API for various integrations.
- **PostgreSQL:** Primary relational database.
- **Vite:** Frontend build tool.
- **Wouter:** Client-side routing for React.
- **TanStack Query:** Server state management and data fetching.
- **Tailwind CSS:** Utility-first CSS framework.
- **shadcn/ui:** Reusable UI components.
- **Drizzle ORM:** TypeScript ORM for database interaction.
- **Express:** Backend web application framework.
- **bcrypt:** For secure password hashing.
- **connect-pg-simple:** PostgreSQL session store.
- **otplib:** One-Time Password (OTP) library for MFA.
- **qrcode:** QR code generation.
- **helmet:** Security middleware for HTTP headers.
- **cors:** Cross-Origin Resource Sharing middleware.
- **express-rate-limit:** Middleware for limiting repeated requests.
- **node-cron:** For scheduling recurring tasks.
- **Twilio (optional):** For SMS notifications.