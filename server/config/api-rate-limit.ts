import rateLimit from "express-rate-limit";
import type { Request } from "express";

// Mount after session loading and tenant-path normalization. Normal authenticated
// dashboard polling exceeds the anonymous budget; sensitive routes keep their
// own limits regardless of this exemption.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: "Too many requests",
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === "development") return true;
    const session = (req as Request & { session?: { userId?: string } }).session;
    return !!session?.userId;
  },
});
