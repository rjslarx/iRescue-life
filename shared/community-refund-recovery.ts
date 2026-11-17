import { z } from "zod";

/** Never infer identity from an amount, another refund, or an empty history. */
export function savedRefundReference(raw: string): string | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const parsed = z.string().uuid().safeParse(value.requestId);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function settledRefund(refund: any): boolean {
  return !!refund && (["failed", "canceled"].includes(refund.status) ||
    (refund.status === "succeeded" && refund.recoveryStatus === "recovered"));
}
