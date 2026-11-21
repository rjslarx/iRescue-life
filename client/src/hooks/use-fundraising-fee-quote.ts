import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { FundraisingFeePolicy } from "@shared/fundraising-fee-policy";

export type FundraisingFeeQuote = {
  policy: FundraisingFeePolicy;
  covered: boolean;
  totalCents: number;
  baseAmountCents: number;
  feeContributionCents: number;
  platformFeeCents: number;
  estimatedProcessingCents: number;
};

export function useFundraisingFeeQuote(path: string | undefined, amountCents: number, coverFees: boolean, quantity?: number) {
  return useQuery<FundraisingFeeQuote>({
    queryKey: [path, amountCents, coverFees, quantity],
    enabled: !!path && Number.isSafeInteger(amountCents) && amountCents >= 1 && amountCents <= 99_999_999,
    retry: false,
    queryFn: async () => {
      const response = await apiRequest("POST", path!, { amountCents, coverFees, quantity });
      return response.json();
    },
  });
}
