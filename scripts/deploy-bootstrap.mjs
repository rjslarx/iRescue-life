// Log before loading the application graph: static imports run before index.ts
// can emit any startup messages. Never log environment values or credentials.
const startedAt = Date.now();
console.log(`[Startup] Node ${process.version}; loading application modules`);
const waiting = setInterval(() => {
  console.warn(`[Startup] Still loading application modules after ${Math.round((Date.now() - startedAt) / 1000)}s`);
}, 15000);
waiting.unref();

try {
  await import("../dist/index.js");
  console.log(`[Startup] Application modules loaded in ${Date.now() - startedAt}ms`);
} catch (error) {
  console.error("[Startup] Application module loading failed:", error);
  process.exitCode = 1;
} finally {
  clearInterval(waiting);
}
