import type { FundraisingFeePolicy } from "@shared/fundraising-fee-policy";

export function FeePolicyField({ value, onChange }: {
  value: FundraisingFeePolicy;
  onChange: (value: FundraisingFeePolicy) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">Who covers the fees?</span>
      <select className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value} onChange={event => onChange(event.target.value as FundraisingFeePolicy)}>
        <option value="rescue">Rescue pays from proceeds</option>
        <option value="optional">Ask customer to cover fees (optional)</option>
        <option value="required">Require customer to cover fees</option>
      </select>
      <span className="block text-xs text-muted-foreground">
        Includes the applicable platform fee and estimated payment processing. Actual processing costs may vary;
        differences come from rescue proceeds. Required coverage is disclosed before checkout.
      </span>
    </label>
  );
}
