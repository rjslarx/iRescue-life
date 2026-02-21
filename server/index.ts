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

    res.status(status).json({ message });
    throw err;
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
  });
})();
