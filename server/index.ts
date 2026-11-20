import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { catVaccineGuardSql } from "./lib/cat-vaccine-guard";
import { donationAuditSchemaSql } from "./lib/donation-audit";
import { fundraiserOrderNumbersSql } from "./lib/fundraiser-order-numbers";
import { rescueVendSchemaSql } from "./lib/rescue-vend-schema";
import { rescueResaleSchemaSql } from "./lib/rescue-resale-schema";
import { communityResaleSchemaSql } from "./lib/community-resale-schema";
import { rescueHelpSchemaSql } from "./lib/rescue-help-schema";
import { smsSuppressionSchemaSql } from "./lib/sms-suppression-schema";
import { registerRoutes } from "./routes";
import { pauseResalePages } from "./middleware/resale-pause";
import { setupVite, serveStatic, log } from "./vite";
import { sessionMiddleware, authenticateUser } from "./middleware/auth";
import { resolveTenant, redactTrainingTokenFromUrl } from "./middleware/tenant";
import { injectOGTags, ogImageRouter } from "./middleware/og-tags";
import { validateEnvironment } from "./config/env-validation";
import { helmetConfig, getCorsConfig, configureTrustProxy, apiLimiter } from "./config/security";
import { initializeScheduler } from "./lib/scheduler";
import { backfillNewPagePermissions } from "./services/page-permissions-seeding";
import { seedPlatformPreventativeProtocols } from "./services/preventative-protocols-seeding";
import { backfillSupersededPreventativeCare } from "./scripts/backfill-superseded-preventative-care";
import { backfillTerminalAnimalMedicalCleanup } from "./scripts/backfill-terminal-animal-medical-cleanup";
import { backfillComplianceObligationsSync } from "./scripts/backfill-compliance-obligations-sync";
import { backfillAdoptionsFromApplications } from "./scripts/backfill-adoptions-from-applications";
import { backfillRtoSignedAgreements } from "./scripts/backfill-rto-signed-agreements";
import { seedTrapLoanForm } from "./scripts/seed-trap-loan-form";
import { db } from "./db";
import { medicalCatalog, medicalPrescriptions, medicalDoses } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { isSensitiveVolunteerTrainingUrl } from "@shared/sensitive-routes";

async function ensurePeerCampaignThemeColumn() {
  try {
    await db.execute(sql`ALTER TABLE peer_campaigns ADD COLUMN IF NOT EXISTS theme_background text`);
    console.log('[Startup] peer_campaigns theme_background column ensured');
  } catch (err) {
    console.error('[Startup] peer_campaigns theme_background column patch failed:', err);
  }
}

async function patchBravectoPlusInterval() {
  try {
    const result = await db
      .update(medicalCatalog)
      .set({ defaultIntervalDays: 56, defaultFrequency: 'Every 8 weeks' })
      .where(and(
        eq(medicalCatalog.name, 'Bravecto Plus'),
        eq(medicalCatalog.defaultIntervalDays, 60),
      ));
    console.log('[Startup] Bravecto Plus interval patch applied (60→56 days for any affected rows)');
  } catch (err) {
    console.error('[Startup] Bravecto Plus interval patch failed:', err);
  }
}

async function backfillRunawayDailyDosingPrescriptions() {
  // One-time backfill for the Panacur runaway-schedule bug, guarded by a
  // platform_settings marker so it runs at most once per database. Idempotent
  // SQL is still used as a safety net.
  const MARKER_KEY = 'backfill:runaway_daily_dosing_v1';
  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if ((existing as any)?.rows?.length || (existing as any)?.rowCount) {
      console.log('[Startup] Runaway daily-dosing backfill already applied (marker present); skipping');
      return;
    }
  } catch (err) {
    // If platform_settings doesn't exist yet (fresh DB), proceed and create marker after.
    console.warn('[Startup] Could not read backfill marker, proceeding:', (err as any)?.message);
  }
  try {
    const capResult = await db.execute(sql`
      UPDATE medical_prescriptions
      SET end_date = start_date + INTERVAL '14 days'
      WHERE end_date IS NULL
        AND UPPER(frequency) IN ('SID','BID','TID','QID','HS','EOD')
    `);
    const capped = (capResult as any)?.rowCount || 0;
    if (capped > 0) {
      console.log(`[Startup] Capped end_date on ${capped} runaway daily-dosing prescription(s) (no endDate set)`);
    }

    const deleteResult = await db.execute(sql`
      DELETE FROM medical_doses md
      USING medical_prescriptions mp
      WHERE md.prescription_id = mp.id
        AND md.tenant_id = mp.tenant_id
        AND md.status = 'due'
        AND mp.end_date IS NOT NULL
        AND md.due_date > mp.end_date
        AND UPPER(mp.frequency) IN ('SID','BID','TID','QID','HS','EOD')
    `);
    const deleted = (deleteResult as any)?.rowCount || 0;
    if (deleted > 0) {
      console.log(`[Startup] Deleted ${deleted} orphan 'due' dose(s) past end_date for daily-dosing prescriptions`);
    }

    const clearResult = await db.execute(sql`
      UPDATE medical_prescriptions
      SET next_scheduled_dose = NULL
      WHERE next_scheduled_dose IS NOT NULL
        AND end_date IS NOT NULL
        AND next_scheduled_dose > end_date
        AND UPPER(frequency) IN ('SID','BID','TID','QID','HS','EOD')
    `);
    const cleared = (clearResult as any)?.rowCount || 0;
    if (cleared > 0) {
      console.log(`[Startup] Cleared next_scheduled_dose past end_date on ${cleared} daily-dosing prescription(s)`);
    }
    console.log(`[Startup] Runaway daily-dosing prescription backfill complete (capped=${capped}, deletedDoses=${deleted}, clearedNext=${cleared})`);
    try {
      await db.execute(sql`
        INSERT INTO platform_settings (key, value, description, category, is_public)
        VALUES (
          ${MARKER_KEY},
          ${sql.raw(`'${JSON.stringify({ appliedAt: new Date().toISOString(), capped, deleted, cleared }).replace(/'/g, "''")}'::jsonb`)},
          'Marker: one-time backfill for runaway daily-dosing prescription schedules (Task #157)',
          'general',
          false
        )
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (markerErr) {
      console.warn('[Startup] Could not write backfill marker (will re-run next boot, still idempotent):', (markerErr as any)?.message);
    }
  } catch (err) {
    console.error('[Startup] Runaway daily-dosing prescription backfill failed:', err);
  }
}


async function backfillStaleNextScheduledDose() {
  try {
    const frequencyIntervals: Record<string, string> = {
      MONTHLY: "1 month",
      WEEKLY: "7 days",
      BIWEEKLY: "14 days",
      ANNUALLY: "1 year",
      Q6M: "6 months",
      EOD: "2 days",
      SID: "1 day",
      BID: "12 hours",
    };

    for (const [freq, interval] of Object.entries(frequencyIntervals)) {
      const result = await db.execute(sql`
        UPDATE medical_prescriptions mp
        SET next_scheduled_dose = subq.last_given + INTERVAL '${sql.raw(interval)}'
        FROM (
          SELECT md.prescription_id, MAX(md.given_at) AS last_given
          FROM medical_doses md
          WHERE md.status = 'given' AND md.given_at IS NOT NULL
          GROUP BY md.prescription_id
        ) subq
        WHERE mp.id = subq.prescription_id
          AND UPPER(mp.frequency) = ${freq}
          AND mp.next_scheduled_dose IS NOT NULL
          AND mp.next_scheduled_dose < subq.last_given
      `);
      const count = (result as any)?.rowCount || 0;
      if (count > 0) {
        console.log(`[Startup] Backfilled ${count} stale nextScheduledDose for ${freq} prescriptions`);
      }
    }
    console.log('[Startup] nextScheduledDose backfill complete');
  } catch (err) {
    console.error('[Startup] nextScheduledDose backfill failed:', err);
  }
}

// Validate environment variables before starting
validateEnvironment();

const app = express();

// Configure trust proxy for correct client IPs behind reverse proxy
configureTrustProxy(app);

// Handle malformed URL requests (security scanners/bots sending invalid encodings)
app.use((req: Request, res: Response, next: NextFunction) => {
  try {
    decodeURIComponent(req.path);
    next();
  } catch (e) {
    // Silently reject malformed URLs (common from bots/scanners)
    res.status(400).send('Bad Request');
  }
});

// Static asset serving is handled by serveStatic() after route registration
// This ensures proper SPA routing with fallback to index.html

// Security headers
app.use(helmetConfig);
// Only the public, data-free vending cabinet may be framed by this site.
// Keep dashboard and other application pages protected by DENY.
app.use('/rescue-vend', express.static(
  path.resolve(process.cwd(), process.env.NODE_ENV === 'production' ? 'dist/public/rescue-vend' : 'client/public/rescue-vend'),
  {
    index: false,
    redirect: false,
    setHeaders(res) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'self'; object-src 'none'; base-uri 'none'");
    },
  },
));
app.use((req, res, next) => {
  if (isSensitiveVolunteerTrainingUrl(req.originalUrl || req.url)) {
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
  next();
});

// CORS configuration
app.use(getCorsConfig());

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Cookie parser middleware (needed for PWA manifest tenant hint cookies)
app.use(cookieParser());

// Session middleware
app.use(sessionMiddleware);

// Tenant resolution middleware
app.use(resolveTenant);

// Load the server-validated session and normalize tenant-prefixed paths first.
// Otherwise staff polling consumes the anonymous API budget.
app.use('/api', apiLimiter);

// These community boards are shared by direct link, not search discovery.
// Set this before HTML/OG middleware so crawlers see it without running JS.
app.use((req, res, next) => {
  if (/^\/(?:squares\/|dashboard\/free-squares(?:\/|$))/.test(req.path)) {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.set("Cache-Control", "no-store");
  }
  next();
});

// User authentication middleware
app.use(authenticateUser);

// OG image optimization endpoint (must be before OG tags middleware)
app.use(ogImageRouter);

// Open Graph tags injection for social media crawlers
app.use(pauseResalePages);
app.use(injectOGTags);

app.use((req, res, next) => {
  const start = Date.now();
  const path = redactTrainingTokenFromUrl(req.path);
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !path.includes("community-resale")) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run before any route can select the new donation columns.
  const { pool } = await import("./db");
  console.log("[Startup] Preparing donation audit schema");
  await pool.query(donationAuditSchemaSql);
  await pool.query(fundraiserOrderNumbersSql);
  console.log("[Startup] Preparing cat vaccine safeguards");
  await pool.query(catVaccineGuardSql);
  console.log("[Startup] Preparing vending menu settings");
  await pool.query(rescueVendSchemaSql);
  console.log("[Startup] Preparing Rescue Resale");
  await pool.query(rescueResaleSchemaSql);
  await pool.query(communityResaleSchemaSql);
  await pool.query(rescueHelpSchemaSql);
  await pool.query(smsSuppressionSchemaSql);
  console.log("[Startup] Preparing transport SMS operations");
  const { transportSmsSchemaSql } = await import("./lib/transport-sms-schema");
  await pool.query(transportSmsSchemaSql);
  console.log("[Startup] Registering application routes");
  const server = await registerRoutes(app);
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    const inboxAlertTimer = setInterval(() => {
      void import("./services/rescue-help-alerts").then(m=>m.dispatchHelpAlerts())
        .catch(()=>console.error("[Rescue Inbox] Alert delivery check failed"));
    }, 30 * 1000);
    inboxAlertTimer.unref();
    const welcomeTimer = setInterval(() => {
      void import("./services/foster-welcome").then(m => m.dispatchFosterWelcomes())
        .catch(() => console.error("[Foster welcome] Pending delivery check failed"));
    }, 5 * 60 * 1000);
    welcomeTimer.unref();
    let resaleSweepRunning = false;
    const resaleTimer = setInterval(async () => {
      if (resaleSweepRunning) return;
      resaleSweepRunning = true;
      try { await (await import("./services/rescue-resale")).reconcileResaleOrders(); }
      catch { console.warn("[Resale] Reconciliation unavailable; will retry"); }
      try { await (await import("./services/community-resale")).reconcileCommunityOrders(); }
      catch { console.warn("[Community resale] Reconciliation unavailable; will retry"); }
      try { await (await import("./services/resale-delivery")).reconcilePendingResaleDeliveries(); }
      catch { console.warn("[Resale] Delivery reconciliation unavailable; will retry"); }
      finally { resaleSweepRunning = false; }
    }, 15 * 60 * 1000);
    resaleTimer.unref();
  }
  console.log("[Startup] Application routes registered");

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if ((err?.constraint || err?.cause?.constraint) === "cat_canine_vaccine_guard") {
      return res.status(400).json({error: "Canine combination vaccines cannot be assigned to cats. Select the appropriate feline vaccine."});
    }
    // Translate Zod validation errors → 400 (instead of leaking as 500s).
    // Detect by name as well as instanceof so it works regardless of which
    // copy of zod the throwing module imported.
    const isZodError =
      err?.name === 'ZodError' ||
      (Array.isArray(err?.issues) && err?.issues?.[0]?.code) ||
      (Array.isArray(err?.errors) && err?.errors?.[0]?.code);
    if (isZodError) {
      const issues = err.issues ?? err.errors ?? [];
      console.warn(`[Validation] 400 — ZodError`, issues);
      if (!res.headersSent) {
        res.status(400).json({ message: 'Validation failed', issues });
      }
      return;
    }
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error] ${status} — ${message}`, err);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Initialize scheduled jobs (demo reset, etc.)
    initializeScheduler();
    
    // Backfill any new page permissions for existing tenants
    backfillNewPagePermissions();
    
    // Seed platform default preventative protocols
    seedPlatformPreventativeProtocols();

    // Patch Bravecto Plus interval from 60 → 56 days across all tenants
    ensurePeerCampaignThemeColumn();
    patchBravectoPlusInterval();

    // Keep the shared demo admin login in sync with the configured password
    // so credentials emailed to demo requesters always work.
    import('./lib/demo-reset')
      .then(m => m.ensureDemoAdminPassword())
      .catch(err => console.error('[Startup] Demo admin password sync failed:', err));

    // Add newly-introduced default catalog items to tenants that seeded
    // their catalog before these items existed (idempotent).
    import('./services/medical-catalog-seeding')
      .then(m => m.ensureNewDefaultCatalogItems([
        'Barrier Flea & Heartworm (Dog)',
        'Barrier Flea & Heartworm (Cat)',
        'Virbantel (Praziquantel/Pyrantel/Febantel)',
      ]))
      .catch(err => console.error('[Startup] New catalog item backfill failed:', err));

    // Complete leftover 'active' foster placements for animals already
    // adopted, so foster check-in texts stop going to adopters (idempotent).
    import('./services/adoptions')
      .then(m => m.backfillFosterPlacementsForAdoptedAnimals())
      .catch(err => console.error('[Startup] Adopted-animal foster backfill failed:', err));

    // Backfill stale nextScheduledDose for prescriptions where it's behind the last given dose
    backfillStaleNextScheduledDose();

    // Cap runaway daily-dosing prescriptions that were created without an endDate
    backfillRunawayDailyDosingPrescriptions();

    // One-time: clear next_due_date on PCR + vaccine records that have been
    // superseded by a newer same-series record, so direct-table reports
    // (grant readiness, transfer packets, audit history) no longer surface
    // phantom overdues. The coming-due endpoint already filters at read time.
    // (Replaces the earlier inline `backfillSupersededNextDueDates` from main:
    // same algorithm, but per-tenant scoped, typed, with self-tests and a
    // marker that's only written when every tenant succeeds.)
    backfillSupersededPreventativeCare();

    // Task #163: One-time cleanup of pending medical work (CPOE doses, open
    // prescriptions, pending PCRs, foster med plans/tasks) for animals
    // already in a terminal status. Going forward the PATCH /api/animals/:id
    // and /api/animals/:id/deceased endpoints handle this at write time.
    backfillTerminalAnimalMedicalCleanup();

    // Task #164: One-time backfill that creates adoptions rows for animals
    // already in status='adopted' but missing from the adoptions table
    // (Kanban-adopted or PATCH-adopted historically didn't insert). Without
    // this row the adopter compliance/warning engine silently skips them.
    backfillAdoptionsFromApplications();

    // Task #175: One-time sync of compliance_obligations against existing
    // PCR/vaccine/exam/animal-field state. Closes obligations that were
    // already satisfied at adoption time (e.g. spay_neuter when neuter_status
    // was already set, or microchip_registration when chip was on file).
    // Runtime hooks in vaccine create, PCR create, exam create, animal PATCH,
    // and the staff confirmation-approve endpoint handle new events.
    backfillComplianceObligationsSync();

    // One-time: regenerate signed Reclaim Agreement PDFs for historical RTOs
    // that only have the bare signature image on file. Going forward the
    // POST /api/animals/:id/reclaim endpoint stores the full signed PDF live.
    backfillRtoSignedAgreements();

    // One-time: seed the public CNR Trap Loan Agreement form for southernpets
    // (idempotent — skips if the form already exists).
    seedTrapLoanForm();
  });
})();
