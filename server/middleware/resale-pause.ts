import type { RequestHandler } from "express";
import { isPausedResaleApi, isPausedResalePage, RESALE_PAUSED_MESSAGE } from "../../shared/resale-availability";

export const pauseResaleApi: RequestHandler = (req, res, next) => {
  if (!isPausedResaleApi(req.method, req.path)) return next();
  res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex, nofollow");
  res.status(410).json({ error: RESALE_PAUSED_MESSAGE });
};

// Run before social metadata injection: old shared links must not advertise items.
export const pauseResalePages: RequestHandler = (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) || !isPausedResalePage(req.path, req.url.split("?")[1])) return next();
  res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex, nofollow");
  res.status(410).type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Rescue Resale unavailable</title></head><body><main><h1>Rescue Resale is paused</h1><p>${RESALE_PAUSED_MESSAGE}</p></main></body></html>`);
};
