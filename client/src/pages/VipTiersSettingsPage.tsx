import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Sparkles, ArrowUp, ArrowDown, GripVertical, Wand2, Share2, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MonthlyGivingTier } from "@shared/schema";
import { VIP_ICON_OPTIONS as ICON_OPTIONS, getTierIcon } from "@/lib/vip-tier-icon";
import { VipClubWizard, tiersMatchDefaultSeed } from "@/components/VipClubWizard";
import { useLocation } from "wouter";

export { getTierIcon };

interface TierFormState {
  tierName: string;
  amountDollars: string;
  tangibleImpact: string;
  iconName: string;
  isActive: boolean;
  displayOrder: number;
}

const emptyForm: TierFormState = {
  tierName: "",
  amountDollars: "",
  tangibleImpact: "",
  iconName: "heart",
  isActive: true,
  displayOrder: 0,
};

export default function VipTiersSettingsPage() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<MonthlyGivingTier | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TierFormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [location] = useLocation();
  const [previewKey, setPreviewKey] = useState(0);
  const previewSrc = `/api/og/vip-club/preview.png?v=${previewKey}`;

  const { data, isLoading } = useQuery<{ tiers: MonthlyGivingTier[] }>({
    queryKey: ['/api/monthly-tiers'],
  });

  const tiers = data?.tiers || [];
  const isUntouchedSeed = tiers.length > 0 && tiersMatchDefaultSeed(tiers);

  // Auto-open wizard when launched from onboarding (?wizard=vip)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === 'vip' && !wizardOpen) {
      setWizardOpen(true);
    }
  }, [location]);

  const openCreate = () => {
    setForm({ ...emptyForm, displayOrder: tiers.length });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (tier: MonthlyGivingTier) => {
    setForm({
      tierName: tier.tierName,
      amountDollars: (tier.amount / 100).toString(),
      tangibleImpact: tier.tangibleImpact,
      iconName: tier.iconName,
      isActive: tier.isActive,
      displayOrder: tier.displayOrder,
    });
    setEditing(tier);
    setCreating(false);
  };

  const closeDialog = () => {
    setEditing(null);
    setCreating(false);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    const amount = Math.round(parseFloat(form.amountDollars) * 100);
    if (!form.tierName.trim()) {
      toast({ title: "Tier name required", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amount) || amount < 100) {
      toast({ title: "Amount must be at least $1.00", variant: "destructive" });
      return;
    }
    if (!form.tangibleImpact.trim()) {
      toast({ title: "Tangible impact required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await apiRequest('PATCH', `/api/monthly-tiers/${editing.id}`, {
          tierName: form.tierName.trim(),
          amount,
          tangibleImpact: form.tangibleImpact.trim(),
          iconName: form.iconName,
          isActive: form.isActive,
          displayOrder: form.displayOrder,
        });
        toast({ title: "Tier updated" });
      } else {
        await apiRequest('POST', '/api/monthly-tiers', {
          tierName: form.tierName.trim(),
          amount,
          tangibleImpact: form.tangibleImpact.trim(),
          iconName: form.iconName,
          isActive: form.isActive,
          displayOrder: form.displayOrder,
        });
        toast({ title: "Tier created" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers/public'] });
      closeDialog();
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tier? Existing donor subscriptions will be preserved.")) return;
    try {
      await apiRequest('DELETE', `/api/monthly-tiers/${id}`);
      toast({ title: "Tier deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers/public'] });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (tier: MonthlyGivingTier, isActive: boolean) => {
    try {
      await apiRequest('PATCH', `/api/monthly-tiers/${tier.id}`, { isActive });
      toast({ title: isActive ? "Tier visible to donors" : "Tier hidden" });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers/public'] });
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tiers.length) return;
    const ordered = [...tiers];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(newIndex, 0, moved);
    try {
      await apiRequest('POST', '/api/monthly-tiers/reorder', { order: ordered.map(t => t.id) });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers/public'] });
    } catch (err: any) {
      toast({ title: "Reorder failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleSeed = async () => {
    setBusy(true);
    try {
      await apiRequest('POST', '/api/monthly-tiers/seed-defaults', {});
      toast({ title: "Default tiers added" });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/monthly-tiers/public'] });
    } catch (err: any) {
      toast({ title: "Seeding failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Monthly Giving Tiers
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Configure the recurring monthly giving levels shown on your VIP Donor Club page at <code className="bg-muted px-1 rounded">/vip-club</code>. Donors choose a tier and start a recurring monthly contribution via Stripe.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tiers.length === 0 && (
            <Button variant="outline" onClick={handleSeed} disabled={busy} data-testid="button-seed-default-tiers">
              <Sparkles className="h-4 w-4 mr-2" />
              Add Starter Tiers
            </Button>
          )}
          <Button variant="outline" onClick={() => setWizardOpen(true)} data-testid="button-open-vip-wizard">
            <Wand2 className="h-4 w-4 mr-2" />
            {tiers.length === 0 ? "Configure VIP Club" : "Customize VIP Club"}
          </Button>
          <Button onClick={openCreate} data-testid="button-create-tier">
            <Plus className="h-4 w-4 mr-2" />
            Add Tier
          </Button>
        </div>
      </div>

      {isUntouchedSeed && (
        <Card
          className="p-4 flex items-start gap-3 border-primary/40 bg-primary/5"
          data-testid="banner-customize-vip"
        >
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Wand2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">Make these tiers your own</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              You're using the platform starter tiers. Spend a minute renaming them,
              adjusting amounts, and writing impact statements that match your rescue.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)} data-testid="button-banner-customize-vip">
            <Wand2 className="h-4 w-4 mr-2" />
            Customize
          </Button>
        </Card>
      )}

      <Card className="p-4 space-y-3" data-testid="card-vip-share-preview">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Share2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">Social share preview</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              This is the image Facebook, LinkedIn, and other platforms display when
              someone shares your VIP Club page. The sponsor count updates automatically
              as monthly donors join.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreviewKey((k) => k + 1)}
            data-testid="button-refresh-vip-preview"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        <div className="rounded-md overflow-hidden border bg-muted/20">
          <img
            src={previewSrc}
            alt="VIP Club social share preview"
            width={1200}
            height={630}
            className="w-full h-auto block"
            data-testid="img-vip-share-preview"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tiers.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">No tiers yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first monthly giving tier or use our 3 starter tiers ($10, $25, $50).
          </p>
          <Button onClick={handleSeed} disabled={busy} data-testid="button-seed-empty-state">
            <Sparkles className="h-4 w-4 mr-2" />
            Use Starter Tiers
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <GripVertical className="h-3 w-3" />
            Use the up/down arrows to reorder tiers as they appear on your VIP Club page.
          </p>
          {tiers.map((tier, index) => {
            const Icon = getTierIcon(tier.iconName);
            return (
              <Card key={tier.id} className="p-4 flex items-center gap-4" data-testid={`tier-card-${tier.id}`}>
                <div className="flex flex-col -my-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => handleReorder(index, -1)}
                    data-testid={`button-tier-up-${tier.id}`}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={index === tiers.length - 1}
                    onClick={() => handleReorder(index, 1)}
                    data-testid={`button-tier-down-${tier.id}`}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="h-12 w-12 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate" data-testid={`text-tier-name-${tier.id}`}>{tier.tierName}</h3>
                    <Badge variant="secondary">${(tier.amount / 100).toFixed(0)}/mo</Badge>
                    {!tier.isActive && <Badge variant="outline">Hidden</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{tier.tangibleImpact}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2 mr-1" title={tier.isActive ? "Visible to donors" : "Hidden from donors"}>
                    <Switch
                      checked={tier.isActive}
                      onCheckedChange={(v) => handleToggleActive(tier, v)}
                      data-testid={`switch-tier-active-${tier.id}`}
                      aria-label="Toggle visibility"
                    />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(tier)} data-testid={`button-edit-tier-${tier.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(tier.id)} data-testid={`button-delete-tier-${tier.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tier" : "New Monthly Giving Tier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tier-name">Tier Name</Label>
              <Input
                id="tier-name"
                value={form.tierName}
                onChange={(e) => setForm({ ...form, tierName: e.target.value })}
                placeholder="e.g. Food Sponsor"
                data-testid="input-tier-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tier-amount">Monthly Amount (USD)</Label>
                <Input
                  id="tier-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={form.amountDollars}
                  onChange={(e) => setForm({ ...form, amountDollars: e.target.value })}
                  placeholder="25"
                  data-testid="input-tier-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tier-icon">Icon</Label>
                <Select value={form.iconName} onValueChange={(v) => setForm({ ...form, iconName: v })}>
                  <SelectTrigger id="tier-icon" data-testid="select-tier-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(({ value, label, Icon }) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tier-impact">Tangible Impact</Label>
              <Textarea
                id="tier-impact"
                value={form.tangibleImpact}
                onChange={(e) => setForm({ ...form, tangibleImpact: e.target.value })}
                placeholder="e.g. Covers monthly food for one foster dog"
                rows={2}
                data-testid="input-tier-impact"
              />
              <p className="text-xs text-muted-foreground">Shown on the public tier card. Be specific about what the donation provides.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tier-order">Display Order</Label>
                <Input
                  id="tier-order"
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })}
                  data-testid="input-tier-order"
                />
              </div>
              <div className="space-y-2">
                <Label>Visible to Donors</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                    data-testid="switch-tier-active"
                  />
                  <span className="text-sm text-muted-foreground">{form.isActive ? "Visible" : "Hidden"}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy} data-testid="button-cancel-tier">Cancel</Button>
            <Button onClick={handleSave} disabled={busy} data-testid="button-save-tier">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update Tier" : "Create Tier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VipClubWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        existingTiers={tiers}
      />
    </div>
  );
}
