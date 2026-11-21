import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import type { FundraisingFeePolicy } from "@shared/fundraising-fee-policy";

export type FundraisingFeeQuote = {
  quoteVersion: string;
  policy: FundraisingFeePolicy;
  covered: boolean;
  totalCents: number;
  baseAmountCents: number;
  feeContributionCents: number;
  platformFeeCents: number;
  estimatedProcessingCents: number;
};

export function useFundraisingFeeQuote(path: string | undefined, amountCents: number, coverFees: boolean, quantity?: number) {
  const client = useQueryClient();
  const queryKey = [path, amountCents, coverFees, quantity, buildTenantUrl(path ?? ""), getTenantHeaders()];
  const query = useQuery<FundraisingFeeQuote>({
    queryKey,
    enabled: !!path && Number.isSafeInteger(amountCents) && amountCents >= 1 && amountCents <= 99_999_999,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await apiRequest("POST", path!, { amountCents, coverFees, quantity });
      return response.json();
    },
  });
  return {
    ...query,
    checkout: async (checkoutPath: string, payload: Record<string, unknown>) => {
      if (!query.data || query.isFetching || query.isError) throw new Error("Please wait for the total to be calculated.");
      try {
        return await apiRequest("POST", checkoutPath, { ...payload, quoteVersion: query.data.quoteVersion });
      } catch (error: any) {
        if (error.code === "FUNDRAISING_QUOTE_CHANGED" && error.details?.quote) {
          // Replace only this exact quote. Never automatically retry a payment.
          client.setQueryData(queryKey, error.details.quote);
        }
        throw error;
      }
    },
  };
}
