import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { sessionMiddleware, authenticateUser } from "./middleware/auth";
import { resolveTenant } from "./middleware/tenant";
import { injectOGTags } from "./middleware/og-tags";
import { validateEnvironment } from "./config/env-validation";
import { helmetConfig, getCorsConfig, configureTrustProxy, apiLimiter } from "./config/security";
import { initializeScheduler } from "./lib/scheduler";
import { backfillNewPagePermissions } from "./services/page-permissions-seeding";
import { seedPlatformPreventativeProtocols } from "./services/preventative-protocols-seeding";
import { db } from "./db";
import { medicalCatalog, medicalPrescriptions, medicalDoses } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

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

// CORS configuration
app.use(getCorsConfig());

// Rate limiting for all API routes
app.use('/api', apiLimiter);

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

// User authentication middleware
app.use(authenticateUser);

// Open Graph tags injection for social media crawlers
app.use(injectOGTags);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
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
      if (capturedJsonResponse) {
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
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
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
    patchBravectoPlusInterval();

    // Backfill stale nextScheduledDose for prescriptions where it's behind the last given dose
    backfillStaleNextScheduledDose();
  });
})();
