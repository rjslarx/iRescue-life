import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface MatchingTier {
  id: string;
  internalSponsorName: string;
  internalSponsorEmail: string;
  publicSponsorName: string | null;
  showSponsorPublicly: boolean;
  pledgedCapCents: number;
}

export interface MatchingTierDraft extends Omit<MatchingTier, "pledgedCapCents"> {
  capDollars: string;
}

export const newMatchingTier = (): MatchingTierDraft => ({
  id: crypto.randomUUID(),
  internalSponsorName: "",
  internalSponsorEmail: "",
  publicSponsorName: "",
  showSponsorPublicly: true,
  capDollars: "",
});

// Reject fractional cents, scientific notation, and non-finite/unsafe amounts.
export function dollarsToCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= 2_000_000_000 ? cents : null;
}

export function tierValidationError(tiers: MatchingTierDraft[]): string | null {
  if (tiers.length < 1 || tiers.length > 20) return "Add between 1 and 20 matching sponsors.";
  for (let index = 0; index < tiers.length; index++) {
    const tier = tiers[index];
    const prefix = `Sponsor ${index + 1}: `;
    if (!tier.internalSponsorName.trim()) return `${prefix}enter an internal name.`;
    if (tier.internalSponsorEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tier.internalSponsorEmail.trim())) {
      return `${prefix}enter a valid email or leave it blank.`;
    }
    if (dollarsToCents(tier.capDollars) === null) return `${prefix}enter a pledge from $1 to $20,000,000 with no more than two decimal places.`;
  }
  const total = tiers.reduce((sum, tier) => sum + (dollarsToCents(tier.capDollars) ?? 0), 0);
  if (!Number.isSafeInteger(total) || total > 2_000_000_000) {
    return "The total matching commitment cannot exceed $20,000,000.";
  }
  return null;
}

export function allocateMatchingTiers<T extends { pledgedCapCents: number }>(tiers: T[], totalMatchedCents: number) {
  let remaining = Math.max(0, totalMatchedCents);
  return tiers.map((tier) => {
    const matchedCents = Math.min(tier.pledgedCapCents, remaining);
    remaining -= matchedCents;
    return { ...tier, matchedCents, remainingCents: tier.pledgedCapCents - matchedCents };
  });
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MatchingTierEditor({ tiers, onChange, disabled }: {
  tiers: MatchingTierDraft[];
  onChange: (tiers: MatchingTierDraft[]) => void;
  disabled: boolean;
}) {
  const update = (id: string, patch: Partial<MatchingTierDraft>) =>
    onChange(tiers.map((tier) => tier.id === id ? { ...tier, ...patch } : tier));
  const move = (index: number, direction: number) => {
    const reordered = [...tiers];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    onChange(reordered);
  };
  let rangeStart = 0;

  return (
    <div className="space-y-3" data-testid="matching-tier-editor">
      <p className="text-sm text-muted-foreground">
        Each eligible donation is matched dollar-for-dollar. Sponsors take turns in this order; a gift can finish one milestone and start the next. There is no per-gift cap.
      </p>
      {tiers.map((tier, index) => {
        const cap = dollarsToCents(tier.capDollars) ?? 0;
        const start = rangeStart;
        rangeStart += cap;
        return (
          <fieldset key={tier.id} disabled={disabled} className="min-w-0 rounded-md border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Milestone {index + 1}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {cap ? index === 0 ? `Matches the first ${usd(cap)} in eligible donations.` : `Matches the next ${usd(cap)}: after ${usd(start)}, through ${usd(start + cap)}.` : "Enter a pledge to define this donation range."}
              </p>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" disabled={disabled || index === 0} aria-label={`Move sponsor ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" disabled={disabled || index === tiers.length - 1} aria-label={`Move sponsor ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" disabled={disabled || tiers.length === 1} aria-label={`Remove sponsor ${index + 1}`} onClick={() => onChange(tiers.filter((item) => item.id !== tier.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label htmlFor={`${tier.id}-name`}>Sponsor name (internal, required)</Label><Input id={`${tier.id}-name`} value={tier.internalSponsorName} onChange={(e) => update(tier.id, { internalSponsorName: e.target.value })} required /></div>
              <div><Label htmlFor={`${tier.id}-email`}>Sponsor email (internal, optional)</Label><Input id={`${tier.id}-email`} type="email" value={tier.internalSponsorEmail} onChange={(e) => update(tier.id, { internalSponsorEmail: e.target.value })} /></div>
              <div><Label htmlFor={`${tier.id}-public`}>Public name (blank = anonymous)</Label><Input id={`${tier.id}-public`} value={tier.publicSponsorName ?? ""} onChange={(e) => update(tier.id, { publicSponsorName: e.target.value })} /></div>
              <div><Label htmlFor={`${tier.id}-cap`}>Pledged match ($, required)</Label><Input id={`${tier.id}-cap`} type="number" min="1" max="20000000" step="0.01" value={tier.capDollars} onChange={(e) => update(tier.id, { capDollars: e.target.value })} required /></div>
            </div>
            <div className="flex items-center gap-2"><Switch id={`${tier.id}-visible`} disabled={disabled} checked={tier.showSponsorPublicly} onCheckedChange={(value) => update(tier.id, { showSponsorPublicly: value })} /><Label htmlFor={`${tier.id}-visible`}>Show public sponsor name</Label></div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={disabled || tiers.length >= 20} onClick={() => onChange([...tiers, newMatchingTier()])}><Plus className="h-4 w-4 mr-2" />Add sponsor</Button>
        <p className="text-sm font-medium">Total matched commitment: {usd(rangeStart)}</p>
      </div>
      <p className="text-xs text-muted-foreground">Up to 20 sponsors. Internal names and emails are staff-only; hidden or blank public names appear as anonymous.</p>
    </div>
  );
}
