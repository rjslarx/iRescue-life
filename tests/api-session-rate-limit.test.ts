import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { apiLimiter } from "../server/config/api-rate-limit";

test("API limiter mounts after session loading and tenant-path normalization", () => {
  const source = readFileSync("server/index.ts", "utf8");
  const limiter = source.indexOf("app.use('/api', apiLimiter)");
  assert.ok(limiter > source.indexOf("app.use(sessionMiddleware)"));
  assert.ok(limiter > source.indexOf("app.use(resolveTenant)"));
  assert.equal(source.match(/app\.use\('\/api', apiLimiter\)/g)?.length, 1);
});

test("staff polling is exempt but anonymous requests and forged identity headers are limited", async () => {
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const app = express();
  let signedIn = true;
  // Simulate the output of server-side session middleware, never a client header.
  app.use((req: any, _res, next) => { req.session = signedIn ? { userId: "staff" } : {}; next(); });
  app.use("/api", apiLimiter);
  app.get("/api/rescue-help/access", (_req, res) => res.json({ allowed: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rescue-help/access`;
  try {
    for (let i = 0; i < 181; i++) assert.equal((await fetch(url)).status, 200);
    signedIn = false;
    for (let i = 0; i < 100; i++) assert.equal((await fetch(url)).status, 200);
    const blocked = await fetch(url, { headers: { "x-user-id": "staff", Cookie: "userId=staff" } });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
    signedIn = true;
    assert.equal((await fetch(url)).status, 200, "exhausted anonymous bucket must not block staff");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
  }
});
