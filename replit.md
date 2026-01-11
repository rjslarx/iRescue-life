# Multi-Tenant Animal Rescue SaaS Platform

## Overview
This project is a multi-tenant SaaS platform designed for animal rescue organizations, offering each a custom subdomain, a public-facing site for animal showcasing and donations, and a secure internal portal for staff. Its core purpose is to centralize and streamline animal rescue operations, including adoptions, financial contributions, and overall efficiency, while enhancing outreach capabilities and addressing a significant market opportunity within the animal welfare sector.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform utilizes a React, TypeScript, and Vite frontend with Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend is an Express and Node.js application in TypeScript, interacting with PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
A mobile-first, responsive design adhering to WCAG accessibility standards, featuring SEO enhancements, consolidated navigation, and an enhanced dashboard with real-time activity. Key UI elements include a Quick Actions "+" button, breadcrumbs, redesigned kennel layout editor with drag-and-drop, and consolidated volunteer management. Public navigation is enhanced with clear links for fostering, volunteering, surrendering, donating, and team login.

**Multi-Tenancy:**
A single PostgreSQL database is used with `tenant_id` foreign keys for data isolation. It supports a hybrid URL architecture including path-based URLs (`irescue.life/{subdomain}`), custom domains (e.g., `happypaws.org`), and subdomain-based access (e.g., `demo.irescue.life`). Path-based routing is managed by backend middleware. Onboarding includes options for Replit domain purchasing, existing domain setup, or deferred setup.

**Authentication & Authorization:**
Email/password authentication uses bcrypt and Express sessions. Features include secure token-based password reset, a user invitation system, TOTP-based Multi-Factor Authentication (MFA) for platform admins, and JWTs for session management. Tenant-scoped Role-Based Access Control (RBAC) with dynamic role switching and a `platform_admin` role for host administrators is implemented.

**Feature Specifications:**
- **Core Operations:** Comprehensive animal management, application/adoption management, and financial management with Stripe.
- **Management Systems:** Contact, Happy Tails, Supply Registry/Wishlist, Expenditure Tracking, Event Management, Volunteer Coordination, Medical Records, and Document Management.
- **Communication:** Newsletter subscriptions, email campaigns, automated notifications (via Resend), including onboarding sequences and 3-3-3 Rule Adoption Retention Emails for adopter support.
- **Permissions & Calendars:** Unified site permissions, multi-calendar functionality, page-level permissions, and customizable event creation forms.
- **Branding & Content Management:** Admin interfaces for tenant branding, CMS, and custom pages.
- **Analytics & Reports:** Dashboard with key metrics and kennel occupancy tracking.
- **Progressive Web App (PWA):** Mobile installation, offline capabilities, and push notifications with multi-layer tenant-scoping.
- **Platform Integrations:** Admin interface for external adoption platforms and Google Workspace connections.
- **Platform/Host Administration:** Comprehensive admin interface for managing tenants, users, feature flags, audit logs, announcements, and system health, including tenant impersonation.
- **Platform Landing Page:** Public marketing page with demo request lead generation.
- **AI Help Assistant:** Context-aware AI assistant powered by OpenAI GPT-5.
- **Setup Wizard:** Interactive 9-step onboarding for new admin users.
- **Kennel Management System:** Location management with occupancy tracking.
- **Animal Surrender System:** Public-facing form for surrender requests with customizable form fields, intro text, and drag-and-drop question reordering (matching adoption, volunteer, and foster form patterns).
- **Auto-Archiving:** Automatic archiving of supply requests, foster updates, and specific adoption application statuses.
- **Grant Budget Tracking & Restricted Funds:** Grant management system with budget tracking and reporting.
- **Contract Template Editor:** Admin interface for customizable adoption contract templates with merge fields.
- **Native E-Signature System:** Built-in electronic signature capture for adoption contracts (replaces DocuSign). Features draw-to-sign canvas, IP address and timestamp recording for legal verification, signed PDF generation with embedded signature image, and automatic application status updates. Contract signing is integrated into the adoption checkout flow.
- **Fundraising Shop Module:** E-commerce solution for merchandise and raffle tickets with multi-payment integration.
- **Collaboration Hub:** Transport coordination system for animal transfers and alerts.
- **Smart Foster Matching:** Intelligent foster placement system matching animals with compatible foster homes using scoring algorithms and "Send Foster Request" emails.
- **Medical Fund Campaigns:** Medical fund campaign sharing with social buttons, downloadable cards, public campaign pages, and post-donation prompts via Stripe.
- **Govee Temperature Monitoring:** IoT integration for shelter environmental monitoring using Govee WiFi sensors, with API key configuration, device discovery, alerts, historical trends, and secure credential storage.
- **IRS-Compliant Donation Receipts:** Generation and emailing of tax-compliant PDF receipts for cash and in-kind donations with tenant-scoped numbering, branding, and status tracking.
- **Social Media Sharing with OG Tags:** Server-side Open Graph tag injection for social media sharing (Facebook, Twitter, LinkedIn, etc.). When social media crawlers visit animal profile pages (`/{tenant}/animal/{id}`), the server detects the crawler user-agent and returns HTML with dynamically injected OG metadata including animal name, breed, bio/description, photo, and rescue organization name. Share functionality on AnimalCard components generates proper animal-specific URLs for social sharing. Middleware runs after tenant resolution and uses `req.tenant` for tenant context.

**Technical Implementations:**
- **Paw Pay Platform Fee System:** Stripe Connect-based fee collection implementing "SaaS + 0%" two-tier business model:
  - **Free tier:** 5% platform fee on donations (default, configurable via `PLATFORM_FEE_PERCENT` env var), 500 emails/month, unlimited animals, basic reporting.
  - **Professional tier ($39/mo):** 0% platform fee (included in subscription), 10,000 emails/month, unlimited animals, advanced reporting, optional custom domain integration, optional Google Workspace integration, priority support.
  Uses destination charges to route payments through platform's Stripe account with application_fee_amount. Tenants must complete Stripe Connect onboarding (stripeConnectedAccountId) to process payments. Environment variables: `IS_HOSTED_PLATFORM`, `STRIPE_CONNECT_PLATFORM_ID`, `PLATFORM_STRIPE_SECRET_KEY`, `PLATFORM_FEE_PERCENT`. Development bypass: `SKIP_PLATFORM_FEES=true`.
- **Stripe Standard Connect OAuth:** Uses Stripe Standard Connect (OAuth-based) instead of Express Connect for cost savings and tenant data ownership:
  - **Cost:** $0/tenant (Express costs ~$2/month per active account)
  - **Ownership:** Tenants own their Stripe accounts and retain donor data if they leave
  - **Liability:** Tenants are Merchant of Record (handle their own 1099s and chargebacks)
  - **Flow:** OAuth redirect to Stripe → user logs in/creates account → redirect back with auth code → exchange for stripe_user_id
  - **Required env var:** `STRIPE_CLIENT_ID` (starts with `ca_...`) - find in Stripe Dashboard > Settings > Connect > Settings
  - **For test mode:** `TESTING_STRIPE_CLIENT_ID` can be set separately
  - **Endpoints:** `GET /api/stripe/connect` (get OAuth URL), `GET /api/stripe/callback` (OAuth callback handler), `POST /api/stripe/connect/disconnect` (revoke access), `GET /api/stripe/connect/status` (check connection)
- **Alternative Payment Methods Bypass:** Platform admins can enable specific tenants to use PayPal, Venmo, and Cash App for donations and adoption fees without requiring Stripe Connect setup. Toggle via Platform Admin > Tenants page. Enabled tenants can configure their PayPal/Venmo/CashApp usernames in Settings. Useful for small local rescues that prefer simpler payment methods. Field: `allowAlternativePayments` in tenants table. Endpoint: `PATCH /api/admin/tenants/:id/alternative-payments`.
- **Donor Covers Fees Feature:** Checkbox on donation forms allowing donors to add processing fees so 100% of their intended donation goes to the rescue. Calculates gross-up amount to cover both Stripe processing fees (2.2% + $0.30) and platform fees (if applicable). Default-checked as studies show 60-80% of donors opt-in. For paid tiers with 0% platform fee, this effectively makes donations "free" for rescues when donors cover fees.
- **Encryption:** AES-256-GCM for sensitive data.
- **Unified File Storage (TenantFileStorage):** Hybrid storage prioritizing Google Drive (if Google Workspace connected with Shared Drive) and falling back to Replit object storage. Features a structured Google Drive folder system per animal ID and tenant-scoped paths for Replit storage. Private files require authenticated access; public files are universally accessible. Tenant organizational documents (insurance, bylaws, policies, etc.) are uploaded to the `04_General_Docs` folder in Google Drive when connected, with storage type and Drive file ID tracked in the database.
- **Email Service:** Hybrid Resend integration with optional Google Workspace Gmail API.
- **Platform Admin Security:** Subdomain-based resolution, RBAC, frontend guards, authenticated sessions, and TOTP MFA.
- **Subscription Management:** Tenant schema tracks subscription tier, status, and trial periods.
- **Production Security:** Rate limiting, Helmet security headers, CORS fail-closed, environment validation, and session hardening.
- **Google Analytics:** GA4 integration for tracking.
- **Google Workspace Integration:** Optional tenant-level integration for Gmail API, Google Calendar sync, and Google Drive storage, secured with OAuth 2.0. CASA-optimized OAuth scopes: `gmail.send` (sensitive), `calendar` (restricted but necessary), `drive.file` (non-sensitive), `userinfo.email` (non-sensitive). Manual sender name/email configuration replaces auto-detected Send As aliases to avoid restricted `gmail.settings.basic` scope requiring expensive CASA security assessment ($15K-75K). Shared Drive selection via Google Picker API (visual browser) or manual ID entry for `drive.file` scope limitations. Requires `GOOGLE_PICKER_API_KEY` environment variable (browser API key restricted to Picker API in Google Cloud Console). Animal Medical Documents section includes "Select from Google Drive" button (when Drive enabled) using Google Picker to attach Drive files as metadata-only links (driveFileId, fileName, fileUrl, mimeType, iconLink) stored in `animalDriveFiles` table - no file content downloaded. Drive files display with Drive badge and external link icon; removing a link doesn't delete the file from Google Drive.

## Recent Changes (January 2026)
- **Open Source Preparation:** Removed proprietary Givebutter and Zeffy payment integrations. Stripe is now the only default payment processor.
- **Alternative Payment Methods:** PayPal, Venmo, and Cash App are only available when platform admin explicitly enables `allowAlternativePayments` for specific tenants.
- **License:** GNU AGPLv3 for open source release.
- **Dev Routing Fix:** On development hosts (localhost, replit.dev, replit.app), the root `/` now loads the demo tenant directly without path-based routing. Path-based routes like `/demo/*` still work. This fixes blank page issues caused by wouter base path mismatches.

## Development Notes
- **Dev Tenant:** On localhost/replit.dev/replit.app, the demo tenant loads by default at `/` with empty basePath for proper route matching
- **Path-Based Tenants:** `/demo/*`, `/munchkin3/*`, etc. work with basePath set to the tenant slug
- **Demo Credentials:** admin@demo.com / ChangeMeInProduction123! (configured via DEMO_ADMIN_PASSWORD env var)
- **CSP Disabled in Dev:** Content Security Policy is disabled in development mode due to conflicts with Vite HMR and Replit dev tooling; still enforced in production
- **Reserved Paths:** `platform`, `api` are reserved and not treated as tenant slugs

## External Dependencies
- **Stripe:** Primary payment gateway (donations, adoption fees, subscriptions).
- **PayPal:** Alternative payment for shop (when enabled by platform admin).
- **Resend:** Email delivery service.
- **Google APIs:** OAuth 2.0, Gmail API, Calendar API, Drive API.
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
- **Twilio (optional):** SMS notifications for volunteer threshold alerts.