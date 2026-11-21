import { FeePolicyField } from "./FeePolicyField";
import type { FundraisingFeePolicy } from "@shared/fundraising-fee-policy";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function SavedFeePolicy({ path, value, queryKey }: {
  path: string; value: FundraisingFeePolicy; queryKey: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async (feePolicy: FundraisingFeePolicy) => apiRequest("PATCH", path, { feePolicy }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast({ title: "Fee policy saved" }); },
    onError: () => toast({ title: "Could not save fee policy", variant: "destructive" }),
  });
  return <fieldset disabled={mutation.isPending} className="mt-3 min-w-56"><FeePolicyField value={value} onChange={value => mutation.mutate(value)} /></fieldset>;
}
