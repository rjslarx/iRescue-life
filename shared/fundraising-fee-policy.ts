import { z } from "zod";

export const fundraisingFeePolicySchema = z.enum(["rescue", "optional", "required"]);
export type FundraisingFeePolicy = z.infer<typeof fundraisingFeePolicySchema>;

/** The campaign setting, not a buyer-supplied flag, decides whether fees apply. */
export function customerCoversFundraisingFees(policy: FundraisingFeePolicy, optedIn: boolean): boolean {
  return policy === "required" || (policy === "optional" && optedIn);
}

/** Null preserves legacy Events & Products behavior until explicitly edited. */
export function fundraiserEventFeePolicy(
  policy: FundraisingFeePolicy | null | undefined,
  legacyPassFeesToBuyer: boolean,
): FundraisingFeePolicy {
  return policy ?? (legacyPassFeesToBuyer ? "required" : "rescue");
}
