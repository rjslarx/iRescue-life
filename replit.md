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
Design principles prioritize mobile-first responsiveness, WCAG accessibility, and SEO. Key UI elements include a customizable Command Center dashboard with real-time activity and role-based widgets, a configurable "Quick Actions" sidebar, breadcrumbs, a drag-and-drop kennel layout editor, and customizable public-facing website hero layouts.

**Technical Implementations:**
Multi-tenancy is achieved through `tenant_id` foreign keys in a single PostgreSQL database, supporting hybrid URLs. Authentication employs email/password with bcrypt, Express sessions, JWTs, token-based password reset, user invitation, and TOTP MFA for platform administrators. A tenant-scoped Role-Based Access Control (RBAC) system allows for dynamic role switching.

Core functionalities include:
- Comprehensive animal management with Kanban-workflow-driven adoption application pipelines.
- Financial management with Stripe integration, including platform fees and "Donor Covers Fees" options.
- Contact management, "Happy Tails" success stories, supply registry, expenditure tracking, event, and volunteer coordination.
- Medical records management, a medical pipeline dashboard, preventative care backfill, and document management.
- A native e-signature system for contracts with custom templates and legally verifiable PDF generation.
- Automated daily backups of tenant files to Google Drive and PostgreSQL database backups to Google Cloud Storage.
- Client and server-side detection for photo uploads from various cloud services.
- Automated email and optional SMS notifications for adopters regarding overdue or upcoming preventative care.
- A full audit trail for all inbound and outbound SMS communications via Twilio.
- A mobile-first Foster Portal (My Fosters) for foster parents, including medication task logging.
- A Medication Plan & Task System for staff to create and track foster completion of medication plans.
- Subscription Feature Flags to enable differentiated features based on subscription tiers.
- A centralized Notification Preferences system allowing admins to configure event-based notifications.
- **3-Pillar Animal Architecture:** Structuring animal data by `Status`, `Location`, and `Badges`.
- Configurable Stripe checkout integration for owner surrender fees.
- Preventative Care Coverage Tracking, automatically updating `medicalDueDates`.
- A "Smart Add Medical Order Modal" (CPOE) on the Animal Medical Profile page for efficient order entry.
- An expanded `medical_catalog` supporting `species_target`, `default_route`, and `manufacturer`.
- CPOE Medical Catalog & Order Sets for managing orderable items and bulk protocol groups.
- Age-Aware Puppy Protocol Automation for intelligent scheduling of puppy vaccinations and preventative care.
- Automated Adoption Packet Generator for professional PDFs of vaccination history, preventative care, and microchip information.
- **Network Transfer Engine (Clone-and-Link):** Facilitates tenant-to-tenant animal transfers, preserving medical history.
- **Two-Layer Animal Identity:** Each animal has a global UUID and a tenant-specific human-readable `local_shelter_id`.
- **Unified Daily Medical Roster:** Provides an aggregated daily view of all pending medical tasks with a 30-second undo window for marked doses. Admin override for foster medical tasks with audit trails.
- **Donation & Fundraising Hub:** A centralized dashboard for general donations, targeted animal fundraising, and social media playbook.
- **Fundraiser / Event Sales Module:** Enables full campaign pages with Stripe Connect checkout, inventory caps, and pickup time tracking.
- **Help & Training Module:** Offers a two-tab page for videos and documents with role-based visibility.
- **TNR (Trap-Neuter-Return) Log Module:** Integrates TNR record management within existing animal data.
- **Omnichannel Communications Switchboard:** A unified admin control panel for SMS logs and queued messages, including a "Pause Outbound Comms" kill switch and a "Convert Channel" modal.
- **Daily Staff Briefing Email:** An automated HTML email providing a daily summary of shelter, foster, and adopted animal-related tasks and alerts, sent to configurable recipient roles.
- **Volunteer SMS Signup:** Volunteers can sign up for open shifts via SMS.
- **Foster Medication SMS Escalation:** A 3-step system of hourly digests, evening nudges, and dashboard alerts for unconfirmed tasks, with fuzzy matching for replies.
- **Adopted Animal Backfill:** A manual entry form for rescues to register previously adopted animals, creating necessary records and sending welcome emails.
- **Adopter Compliance Engine:** Full post-adoption compliance tracking including microchip registration reminders, HELP keyword routing, and spay/neuter breach escalation with automated notifications and dashboard alerts.
- **Medical Protocol Engine:** Tenant-customizable treatment intervals via Settings > Medical Protocols page. Supports `puppyIntervalDays` for age-aware scheduling (under 6 months). Platform defaults are shared; tenants can override intervals (clone-on-first-edit) or add custom products (tenant-scoped). Products grouped by Dewormer/Flea & Tick/Heartworm coverage.

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