import { createHash } from "node:crypto";

/** A comparison token, not authorization: every checkout still loads its tenant-scoped campaign. */
export function versionFundraisingQuote<T extends object>(tenantId: string, resource: string, quote: T) {
  return {
    ...quote,
    quoteVersion: createHash("sha256").update(JSON.stringify([tenantId, resource, quote])).digest("hex"),
  };
}

export function fundraisingQuoteConflict(expected: unknown, quote: { quoteVersion: string }) {
  if (typeof expected === "string" && /^[a-f0-9]{64}$/.test(expected) && expected === quote.quoteVersion) return null;
  return {
    code: "FUNDRAISING_QUOTE_CHANGED",
    error: "The price or fee settings changed. Review the updated total, then continue again to confirm.",
    quote,
  };
}
