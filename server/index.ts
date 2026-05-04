import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { sessionMiddleware, authenticateUser } from "./middleware/auth";
import { resolveTenant } from "./middleware/tenant";
import { injectOGTags, ogImageRouter } from "./middleware/og-tags";
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

async function backfillSupersededNextDueDates() {
  // One-time backfill that nulls `next_due_date` on any preventative-care or
  // vaccine record that has been superseded by a newer same-series record for
  // the same animal. Mirrors the canonical "latest-record-per-series-wins"
  // logic used by GET /api/medical/preventative-care/coming-due (Task #158).
  // Without this, downstream queries that hit the tables directly (grant
  // reports, transfer packets, audit history) still see the phantom overdues.
  // Idempotent: re-running on already-cleaned data is a no-op because nulled
  // rows are excluded by `WHERE next_due_date IS NOT NULL`.
  const MARKER_KEY = 'backfill:superseded_next_due_date_v1';
  try {
    const existing = await db.execute(sql`
      SELECT 1 FROM platform_settings WHERE key = ${MARKER_KEY} LIMIT 1
    `);
    if ((existing as any)?.rows?.length || (existing as any)?.rowCount) {
      console.log('[Startup] Superseded next-due backfill already applied (marker present); skipping');
      return;
    }
  } catch (err) {
    console.warn('[Startup] Could not read superseded backfill marker, proceeding:', (err as any)?.message);
  }

  // NOTE: Keep these two helpers in sync with the matching helpers inside
  // the /api/medical/preventative-care/coming-due endpoint in server/routes.ts.
  const vaccineFamily = (raw: string | null): string => {
    if (!raw) return 'unknown';
    const n = raw.trim().toLowerCase();
    if (/rabies/.test(n)) return 'rabies';
    if (/bordet|bordat|brachy|kennel\s*cough/.test(n)) return 'bordetella';
    if (/dapp|dhpp|da2p|distemper|parvo/.test(n)) return 'dhpp';
    if (/lepto/.test(n)) return 'lepto';
    if (/canine\s*influenza|civ\b|\bflu\b/.test(n)) return 'influenza';
    if (/lyme/.test(n)) return 'lyme';
    if (/fvrcp|hcp|panleuk/.test(n)) return 'fvrcp';
    if (/felv|feline\s*leukemia/.test(n)) return 'felv';
    if (/heartworm.*test|hw.*test|antigen/.test(n)) return 'hw_test';
    return `other:${n.replace(/\s+/g, ' ')}`;
  };

  type PcrRow = {
    id: string;
    animal_id: string;
    care_type_id: string | null;
    care_name: string | null;
    care_category: string | null;
    next_due_date: Date | string;
    covers_heartworm: boolean | null;
    covers_flea_tick: boolean | null;
  };
  const seriesKeysForPcr = (r: PcrRow): string[] => {
    const cat = (r.care_category || 'other').toLowerCase();
    if (cat === 'parasite_prevention' && (r.covers_heartworm !== null || r.covers_flea_tick !== null)) {
      const keys: string[] = [];
      if (r.covers_heartworm) keys.push('pp|hw');
      if (r.covers_flea_tick) keys.push('pp|ft');
      if (keys.length === 0) keys.push('pp|other');
      return keys;
    }
    if (r.care_type_id) return [`${cat}|type:${r.care_type_id}`];
    const name = (r.care_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return [`${cat}|name:${name}`];
  };

  let pcrCleared = 0;
  let vaxCleared = 0;
  try {
    // ---------- Preventative care records ----------
    const pcrResult = await db.execute(sql`
      SELECT pcr.id, pcr.animal_id, pcr.care_type_id, pcr.care_name, pcr.care_category, pcr.next_due_date,
             pct.covers_heartworm, pct.covers_flea_tick
      FROM preventative_care_records pcr
      LEFT JOIN preventative_care_types pct ON pct.id = pcr.care_type_id
      WHERE pcr.next_due_date IS NOT NULL
    `);
    const pcrRows = (((pcrResult as any).rows ?? pcrResult) as PcrRow[]) || [];

    const pcrWinners = new Map<string, { id: string; ms: number }>();
    for (const r of pcrRows) {
      const ms = new Date(r.next_due_date as any).getTime();
      for (const sk of seriesKeysForPcr(r)) {
        const k = `${r.animal_id}|${sk}`;
        const existing = pcrWinners.get(k);
        if (!existing || ms > existing.ms) pcrWinners.set(k, { id: r.id, ms });
      }
    }

    // A record survives if it wins ANY series it belongs to (combo product
    // safe). Otherwise it has been superseded — clear its next_due_date.
    const pcrToNull: string[] = [];
    for (const r of pcrRows) {
      const wins = seriesKeysForPcr(r).some(sk => {
        const w = pcrWinners.get(`${r.animal_id}|${sk}`);
        return w && w.id === r.id;
      });
      if (!wins) pcrToNull.push(r.id);
    }

    for (let i = 0; i < pcrToNull.length; i += 1000) {
      const chunk = pcrToNull.slice(i, i + 1000);
      const ids = chunk.map(id => sql`${id}::uuid`);
      const upd = await db.execute(sql`
        UPDATE preventative_care_records
        SET next_due_date = NULL
        WHERE id IN (${sql.join(ids, sql`, `)})
      `);
      pcrCleared += (upd as any)?.rowCount || 0;
    }

    // ---------- Vaccine records ----------
    type VaxRow = { id: string; animal_id: string; item_name: string | null; date_due: Date | string };
    const vaxResult = await db.execute(sql`
      SELECT id, animal_id, item_name, date_due
      FROM vaccine_records
      WHERE date_due IS NOT NULL
    `);
    const vaxRows = (((vaxResult as any).rows ?? vaxResult) as VaxRow[]) || [];

    const vaxWinners = new Map<string, { id: string; ms: number }>();
    for (const r of vaxRows) {
      const ms = new Date(r.date_due as any).getTime();
      const k = `${r.animal_id}|${vaccineFamily(r.item_name)}`;
      const existing = vaxWinners.get(k);
      if (!existing || ms > existing.ms) vaxWinners.set(k, { id: r.id, ms });
    }

    const vaxToNull: string[] = [];
    for (const r of vaxRows) {
      const k = `${r.animal_id}|${vaccineFamily(r.item_name)}`;
      const w = vaxWinners.get(k);
      if (!w || w.id !== r.id) vaxToNull.push(r.id);
    }

    for (let i = 0; i < vaxToNull.length; i += 1000) {
      const chunk = vaxToNull.slice(i, i + 1000);
      const ids = chunk.map(id => sql`${id}::uuid`);
      const upd = await db.execute(sql`
        UPDATE vaccine_records
        SET date_due = NULL
        WHERE id IN (${sql.join(ids, sql`, `)})
      `);
      vaxCleared += (upd as any)?.rowCount || 0;
    }

    console.log(`[Startup] Superseded next-due backfill complete (pcrScanned=${pcrRows.length}, pcrCleared=${pcrCleared}, vaxScanned=${vaxRows.length}, vaxCleared=${vaxCleared})`);

    try {
      await db.execute(sql`
        INSERT INTO platform_settings (key, value, description, category, is_public)
        VALUES (
          ${MARKER_KEY},
          ${sql.raw(`'${JSON.stringify({ appliedAt: new Date().toISOString(), pcrCleared, vaxCleared, pcrScanned: pcrRows.length, vaxScanned: vaxRows.length }).replace(/'/g, "''")}'::jsonb`)},
          'Marker: one-time backfill nulling next_due_date on superseded preventative-care + vaccine records (Task #159)',
          'general',
          false
        )
        ON CONFLICT (key) DO NOTHING
      `);
    } catch (markerErr) {
      console.warn('[Startup] Could not write superseded backfill marker (will re-run, still idempotent):', (markerErr as any)?.message);
    }
  } catch (err) {
    console.error('[Startup] Superseded next-due backfill failed:', err);
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

// OG image optimization endpoint (must be before OG tags middleware)
app.use(ogImageRouter);

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

    // Cap runaway daily-dosing prescriptions that were created without an endDate
    backfillRunawayDailyDosingPrescriptions();

    // Null `next_due_date` on superseded preventative-care + vaccine records
    // (Task #159) — mirror of the supersession logic used by the
    // /api/medical/preventative-care/coming-due endpoint.
    backfillSupersededNextDueDates();
  });
})();
