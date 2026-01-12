# Multi-Tenant Animal Rescue SaaS Platform

## Overview
This project is a multi-tenant SaaS platform designed for animal rescue organizations. It provides each organization with a custom subdomain, a public-facing site for showcasing animals and accepting donations, and a secure internal portal for staff. The platform aims to centralize and streamline animal rescue operations, including adoptions, financial contributions, and overall efficiency, while enhancing outreach capabilities within the animal welfare sector. It offers a comprehensive solution to manage animals, adoptions, finances, volunteers, medical records, and communications, alongside advanced features like PWA capabilities, AI assistance, and IoT integration for shelter monitoring.

## User Preferences
- Must use PostgreSQL database (NOT Firebase)
- Must use email/password authentication (NOT OAuth or Replit Auth)
- Multi-tenant architecture with subdomain-based access
- Single database schema with tenant_id foreign keys (NOT separate schemas per tenant)

## System Architecture
The platform features a React, TypeScript, and Vite frontend with Wouter, TanStack Query, Tailwind CSS, and shadcn/ui. The backend is an Express and Node.js application in TypeScript, utilizing PostgreSQL via Drizzle ORM.

**UI/UX Decisions:**
The design is mobile-first, responsive, and adheres to WCAG accessibility standards, with SEO enhancements and consolidated navigation. It includes an enhanced dashboard with real-time activity, a "Quick Actions" button, breadcrumbs, a drag-and-drop kennel layout editor, and consolidated volunteer management. Public navigation is streamlined for fostering, volunteering, surrendering, donating, and staff login.

**Multi-Tenancy:**
A single PostgreSQL database enforces data isolation using `tenant_id` foreign keys. It supports a hybrid URL architecture including path-based URLs (`irescue.life/{subdomain}`), custom domains, and subdomain-based access (`demo.irescue.life`). Path-based routing is managed by backend middleware.

**Authentication & Authorization:**
Email/password authentication leverages bcrypt and Express sessions, featuring secure token-based password reset, a user invitation system, TOTP-based Multi-Factor Authentication (MFA) for platform admins, and JWTs for session management. Tenant-scoped Role-Based Access Control (RBAC) supports dynamic role switching and includes a `platform_admin` role for host administrators.

**Feature Specifications:**
The platform offers comprehensive animal, application, and financial management (with Stripe). It includes contact management, Happy Tails, supply registry, expenditure tracking, event management, volunteer coordination, medical records, and document management. Communication features include newsletters, email campaigns (via Resend), and automated notifications. It provides unified site permissions, multi-calendar functionality, page-level permissions, and customizable event forms. Admin interfaces allow tenant branding, CMS, custom pages, and analytics dashboards. PWA capabilities include mobile installation, offline access, and push notifications. Integrations include external adoption platforms and Google Workspace. A platform admin interface manages tenants, users, feature flags, audit logs, and system health. Other features include an AI Help Assistant, a setup wizard, kennel management, a public animal surrender system, auto-archiving, grant budget tracking, a contract template editor, a native e-signature system, a fundraising shop module, a collaboration hub, smart foster matching, medical fund campaigns, Govee temperature monitoring integration, IRS-compliant donation receipts, and social media sharing with dynamic Open Graph tags.

**Technical Implementations:**
The "Paw Pay" platform fee system uses Stripe Connect with a "SaaS + 0%" two-tier model:

**Subscription Tiers:**
- **Free Tier ($0/mo):** Permanent free tier with 5% platform fee, 500 emails/month. All core features included. No payment required.
- **Professional Tier ($39/mo):** 0% platform fee, 10,000 emails/month, custom domain support. Optional.

**Pro Trial System:**
- New organizations start on Free tier with 'active' status (no payment required)
- Optional 14-day Pro trial available at signup or anytime later via `/api/platform/start-pro-trial`
- Each organization can only use the Pro trial once (tracked via `pro_trial_used` column)
- When trial expires, organizations automatically revert to Free tier (handled by daily cron job at 3 AM UTC)
- Trial expiration sends notification email with upgrade options

It utilizes Stripe Standard Connect OAuth for tenant payment processing, allowing tenants to own their Stripe accounts. A "Donor Covers Fees" feature calculates gross-up amounts to cover both Stripe and platform processing fees. ACH bank transfer support is implemented for one-time donations with asynchronous payment handling (not adoption fees). Sensitive data is protected with AES-256-GCM encryption. Unified file storage prioritizes Google Drive (if connected) and falls back to Replit object storage. Email services use a hybrid Resend integration with optional Google Workspace Gmail API. Platform admin security includes subdomain resolution, RBAC, frontend guards, authenticated sessions, and TOTP MFA. Subscription management tracks tenant tiers and trial periods. Production security features rate limiting, Helmet security headers, CORS fail-closed, environment validation, and session hardening. Google Analytics 4 is integrated for tracking. Optional Google Workspace integration provides Gmail API, Calendar sync, and Drive storage, using CASA-optimized OAuth scopes and requiring `GOOGLE_PICKER_API_KEY` for Google Picker API integration.

## External Dependencies
- **Stripe:** Payment gateway for donations, adoption fees, and subscriptions.
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
- **Twilio (optional):** SMS notifications.