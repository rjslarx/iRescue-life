import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MonthlyGivingTier } from "@shared/schema";
import { VIP_ICON_OPTIONS as ICON_OPTIONS, getTierIcon } from "@/lib/vip-tier-icon";

interface DefaultTierTemplate {
  tierName: string;
  amount: number;
  tangibleImpact: string;
  iconName: string;
}

interface DraftTier {
  key: string;
  tierName: string;
  amountDollars: string;
  tangibleImpact: string;
  iconName: string;
}

interface VipClubWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTiers: MonthlyGivingTier[];
}

const FALLBACK_DEFAULTS: DefaultTierTemplate[] = [
  { tierName: "Friend of the Pack", amount: 1000, tangibleImpact: "Provides a full bag of food for one rescue every month.", iconName: "paw" },
  { tierName: "Guardian", amount: 2500, tangibleImpact: "Covers a full vet wellness check and vaccinations for a foster animal.", iconName: "shield" },
  { tierName: "Hero of Hope", amount: 5000, tangibleImpact: "Sponsors a full month of care for one shelter animal in need.", iconName: "heart" },
];

// Older tenants were seeded by scripts/backfill-vip-tiers.ts with slightly
// different impact text. Treat that variant as "still on the seed" too so the
// wizard prompts those tenants to customize.
const BACKFILL_DEFAULTS: DefaultTierTemplate[] = [
  { tierName: "Friend of the Pack", amount: 1000, tangibleImpact: "Helps cover food, beds, and basic care for one foster animal each month.", iconName: "paw" },
  { tierName: "Guardian", amount: 2500, tangibleImpact: "Sponsors monthly vaccinations, parasite prevention, and routine vet care for one animal.", iconName: "shield" },
  { tierName: "Hero of Hope", amount: 5000, tangibleImpact: "Underwrites a complete medical journey — spay/neuter, dental, and emergency care.", iconName: "heart" },
];

function templateMatchesTiers(
  template: DefaultTierTemplate[],
  tiers: MonthlyGivingTier[],
): boolean {
  if (template.length !== tiers.length) return false;
  return template.every(def =>
    tiers.some(t =>
      t.tierName === def.tierName &&
      t.amount === def.amount &&
      t.tangibleImpact === def.tangibleImpact &&
      t.iconName === def.iconName,
    ),
  );
}

let draftCounter = 0;
const newKey = () => `draft-${Date.now()}-${++draftCounter}`;

function templateToDraft(t: DefaultTierTemplate): DraftTier {
  return {
    key: newKey(),
    tierName: t.tierName,
    amountDollars: (t.amount / 100).toString(),
    tangibleImpact: t.tangibleImpact,
    iconName: t.iconName,
  };
}

function tierToDraft(t: MonthlyGivingTier): DraftTier {
  return {
    key: newKey(),
    tierName: t.tierName,
    amountDollars: (t.amount / 100).toString(),
    tangibleImpact: t.tangibleImpact,
    iconName: t.iconName,
  };
}

export function tiersMatchDefaultSeed(
  tiers: MonthlyGivingTier[],
  defaults: DefaultTierTemplate[] = FALLBACK_DEFAULTS,
): boolean {
  // A tenant is still on the seed only if every field (name, amount, impact,
  // icon, count) matches one of the known seed templates exactly. Editing any
  // field — including just the icon or the impact text — flips them to
  // "customized".
  const candidates = [defaults, FALLBACK_DEFAULTS, BACKFILL_DEFAULTS];
  return candidates.some(template => templateMatchesTiers(template, tiers));
}

export function VipClubWizard({ open, onOpenChange, existingTiers }: VipClubWizardProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<DraftTier[]>([]);

  const { data: defaultsData } = useQuery<{ defaults: DefaultTierTemplate[] }>({
    queryKey: ['/api/monthly-tiers/defaults'],
    enabled: open,
  });

  const platformDefaults = defaultsData?.defaults || FALLBACK_DEFAULTS;

  const isSeedState = useMemo(
    () => existingTiers.length === 0 || tiersMatchDefaultSeed(existingTiers, platformDefaults),
    [existingTiers, platformDefaults],
  );

  // Reset drafts whenever the wizard opens
  useEffect(() => {
    if (!open) return;
    if (existingTiers.length === 0) {
      setDrafts(platformDefaults.map(templateToDraft));
    } else {
      setDrafts(
        [...existingTiers]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map(tierToDraft),
      );
    }
  }, [open, existingTiers, platformDefaults]);

  const updateDraft = (key: string, patch: Partial<DraftTier>) => {
    setDrafts(prev => prev.map(d => (d.key === key ? { ...d, ...patch } : d)));
  };

  const addTier = () => {
    setDrafts(prev => [
      ...prev,
      {
        key: newKey(),
        tierName: "",
        amountDollars: "",
        tangibleImpact: "",
        iconName: "heart",
      },
    ]);
  };

  const removeTier = (key: string) => {
    setDrafts(prev => prev.filter(d => d.key !== key));
  };

  const resetToDefaults = () => {
    setDrafts(platformDefaults.map(templateToDraft));
  };

  const handleSave = async () => {
    if (drafts.length === 0) {
      toast({ title: "Add at least one tier", variant: "destructive" });
      return;
    }
    const payload: Array<{ tierName: string; amount: number; tangibleImpact: string; iconName: string; isActive: boolean }> = [];
    for (const d of drafts) {
      const name = d.tierName.trim();
      const impact = d.tangibleImpact.trim();
      const amount = Math.round(parseFloat(d.amountDollars) * 100);
      if (!name) {
        toast({ title: "Every tier needs a name", variant: "destructive" });
        return;
      }
      if (!Number.isFinite(amount) || amount < 100) {
        toast({ title: `${name || 'A tier'} needs an amount of at least $1`, variant: "destructive" });
        return;
      }
      if (!impact) {
        toast({ title: `${name} needs a tangible impact statement`, variant: "destructive" });
        return;
      }
      payload.push({
        tierName: name,
        amount,
        tangibleImpact: impact,
        iconName: d.iconName || "heart",
        isActive: true,
      });
    }

    setBusy(true);
    try {
      await apiRequest('POST', '/api/monthly-tiers/replace', {
        tiers: payload,
        force: !isSeedState,
      });
      toast({ title: "VIP Donor Club configured" });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers/public'] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-vip-wizard">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Customize Your VIP Donor Club
          </DialogTitle>
          <DialogDescription>
            Pick tier names, monthly amounts, and tangible impact statements that fit
            your rescue. We've prefilled the platform starter set — edit anything,
            add a tier, or remove one. Saving replaces your current tiers in one step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3" data-testid="wizard-tier-list">
          {drafts.map((draft, idx) => {
            const Icon = getTierIcon(draft.iconName);
            return (
              <Card key={draft.key} className="p-4 space-y-3" data-testid={`wizard-tier-${idx}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm text-muted-foreground">Tier {idx + 1}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeTier(draft.key)}
                    disabled={drafts.length === 1}
                    aria-label="Remove tier"
                    data-testid={`button-wizard-remove-${idx}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={`wizard-name-${draft.key}`}>Tier Name</Label>
                    <Input
                      id={`wizard-name-${draft.key}`}
                      value={draft.tierName}
                      onChange={(e) => updateDraft(draft.key, { tierName: e.target.value })}
                      placeholder="e.g. Whisker Club"
                      data-testid={`input-wizard-name-${idx}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`wizard-amount-${draft.key}`}>Monthly Amount (USD)</Label>
                    <Input
                      id={`wizard-amount-${draft.key}`}
                      type="number"
                      min="1"
                      step="1"
                      value={draft.amountDollars}
                      onChange={(e) => updateDraft(draft.key, { amountDollars: e.target.value })}
                      placeholder="25"
                      data-testid={`input-wizard-amount-${idx}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`wizard-icon-${draft.key}`}>Icon</Label>
                    <Select
                      value={draft.iconName}
                      onValueChange={(v) => updateDraft(draft.key, { iconName: v })}
                    >
                      <SelectTrigger id={`wizard-icon-${draft.key}`} data-testid={`select-wizard-icon-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map(({ value, label, Icon: OptIcon }) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <OptIcon className="h-4 w-4" />
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={`wizard-impact-${draft.key}`}>Tangible Impact</Label>
                    <Textarea
                      id={`wizard-impact-${draft.key}`}
                      value={draft.tangibleImpact}
                      onChange={(e) => updateDraft(draft.key, { tangibleImpact: e.target.value })}
                      placeholder="What does this monthly amount fund? Be specific."
                      rows={2}
                      data-testid={`input-wizard-impact-${idx}`}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={addTier} data-testid="button-wizard-add-tier">
            <Plus className="h-4 w-4 mr-1" />
            Add Tier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            data-testid="button-wizard-reset"
          >
            Reset to platform defaults
          </Button>
        </div>

        {!isSeedState && (
          <p className="text-xs text-muted-foreground">
            Heads up: your existing tiers will be replaced with the set above when you save.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} data-testid="button-wizard-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy} data-testid="button-wizard-save">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save VIP Club
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
