import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, FileDown, DollarSign, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MatchPool {
  id?: string;
  publicSponsorName: string | null;
  showSponsorPublicly: boolean;
  internalSponsorName: string;
  internalSponsorEmail: string;
  pledgedCapCents: number;
  ratioNumerator: number;
  ratioDenominator: number;
  perGiftCapCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  totalMatchedCents?: number;
  status?: "active" | "exhausted" | "ended";
}

interface ExpenseCampaign {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  longDescription: string | null;
  heroImageUrl: string | null;
  goalAmountCents: number;
  raisedAmountCents: number;
  endDate: string | null;
  status: "active" | "ended" | "archived";
  matchPool: MatchPool | null;
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = {
  title: "",
  slug: "",
  shortDescription: "",
  longDescription: "",
  heroImageUrl: "",
  goalDollars: "",
  endDate: "",
  status: "active" as "active" | "ended" | "archived",
  hasMatch: false,
  publicSponsorName: "",
  showSponsorPublicly: true,
  internalSponsorName: "",
  internalSponsorEmail: "",
  pledgedCapDollars: "",
  ratioNumerator: 1,
  ratioDenominator: 1,
  perGiftCapDollars: "",
  matchStartsAt: "",
  matchEndsAt: "",
};

export function ExpenseCampaignsTab({ tenantSubdomain }: { tenantSubdomain?: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reconCampaignId, setReconCampaignId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseCampaign | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<{ campaigns: ExpenseCampaign[] }>({
    queryKey: ["/api/expense-campaigns"],
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title,
        shortDescription: form.shortDescription || null,
        longDescription: form.longDescription || null,
        heroImageUrl: form.heroImageUrl || null,
        goalAmountCents: Math.round(parseFloat(form.goalDollars || "0") * 100),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        status: form.status,
      };
      if (form.slug && form.slug.trim()) payload.slug = form.slug.trim();
      if (form.hasMatch) {
        payload.matchPool = {
          publicSponsorName: form.publicSponsorName || null,
          showSponsorPublicly: form.showSponsorPublicly,
          internalSponsorName: form.internalSponsorName,
          internalSponsorEmail: form.internalSponsorEmail,
          pledgedCapCents: Math.round(parseFloat(form.pledgedCapDollars || "0") * 100),
          ratioNumerator: form.ratioNumerator,
          ratioDenominator: form.ratioDenominator,
          perGiftCapCents: form.perGiftCapDollars
            ? Math.round(parseFloat(form.perGiftCapDollars) * 100)
            : null,
          startsAt: form.matchStartsAt ? new Date(form.matchStartsAt).toISOString() : null,
          endsAt: form.matchEndsAt ? new Date(form.matchEndsAt).toISOString() : null,
        };
      } else {
        payload.matchPool = null;
      }
      const url = editing ? `/api/expense-campaigns/${editing.id}` : "/api/expense-campaigns";
      const method = editing ? "PATCH" : "POST";
      const res = await apiRequest(method, url, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-campaigns"] });
      toast({ title: editing ? "Campaign updated" : "Campaign created" });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/expense-campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const startEdit = (c: ExpenseCampaign) => {
    setEditing(c);
    const toDtLocal = (iso: string | null | undefined) =>
      iso ? new Date(iso).toISOString().slice(0, 16) : "";
    setForm({
      title: c.title,
      slug: c.slug,
      shortDescription: c.shortDescription ?? "",
      longDescription: c.longDescription ?? "",
      heroImageUrl: c.heroImageUrl ?? "",
      goalDollars: (c.goalAmountCents / 100).toFixed(2),
      endDate: c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : "",
      status: c.status,
      hasMatch: !!c.matchPool,
      publicSponsorName: c.matchPool?.publicSponsorName ?? "",
      showSponsorPublicly: c.matchPool?.showSponsorPublicly ?? true,
      internalSponsorName: c.matchPool?.internalSponsorName ?? "",
      internalSponsorEmail: c.matchPool?.internalSponsorEmail ?? "",
      pledgedCapDollars: c.matchPool ? (c.matchPool.pledgedCapCents / 100).toFixed(2) : "",
      ratioNumerator: c.matchPool?.ratioNumerator ?? 1,
      ratioDenominator: c.matchPool?.ratioDenominator ?? 1,
      perGiftCapDollars:
        c.matchPool?.perGiftCapCents != null ? (c.matchPool.perGiftCapCents / 100).toFixed(2) : "",
      matchStartsAt: toDtLocal(c.matchPool?.startsAt),
      matchEndsAt: toDtLocal(c.matchPool?.endsAt),
    });
    setDialogOpen(true);
  };

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const publicUrl = (slug: string) => {
    const base = window.location.origin;
    return tenantSubdomain && !window.location.hostname.includes(tenantSubdomain)
      ? `${base}/${tenantSubdomain}/expense-campaign/${slug}`
      : `${base}/expense-campaign/${slug}`;
  };

  const campaigns = data?.campaigns ?? [];

  return (
    <div className="space-y-4" data-testid="tab-expense-campaigns">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Expense Campaigns</h3>
          <p className="text-sm text-muted-foreground">
            Standalone fundraisers for organizational expenses — like a new A/C unit, electrical
            upgrade, or replacement van. Optionally pair with a matching donor.
          </p>
        </div>
        <Button onClick={startNew} data-testid="button-new-expense-campaign">
          <Plus className="h-4 w-4 mr-2" />
          New campaign
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && campaigns.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No expense campaigns yet. Create one to start raising funds for a specific organizational need.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {campaigns.map((c) => {
          const pct = Math.min(100, Math.round((c.raisedAmountCents / Math.max(1, c.goalAmountCents)) * 100));
          return (
            <Card key={c.id} data-testid={`card-expense-campaign-${c.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle data-testid={`text-campaign-title-${c.id}`}>{c.title}</CardTitle>
                    <CardDescription>{c.shortDescription || "—"}</CardDescription>
                  </div>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{usd(c.raisedAmountCents)}</span>
                    <span className="text-muted-foreground">of {usd(c.goalAmountCents)}</span>
                  </div>
                  <Progress value={pct} />
                </div>
                {c.matchPool && (
                  <div className="rounded-md border p-3 text-sm">
                    <div className="font-medium mb-1">Matching donor</div>
                    <div className="text-muted-foreground">
                      {c.matchPool.showSponsorPublicly && c.matchPool.publicSponsorName
                        ? c.matchPool.publicSponsorName
                        : "an anonymous donor"}{" "}
                      · {c.matchPool.ratioNumerator}:{c.matchPool.ratioDenominator} match up to{" "}
                      {usd(c.matchPool.pledgedCapCents)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Matched: {usd(c.matchPool.totalMatchedCents ?? 0)} · Status: {c.matchPool.status}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(c)} data-testid={`button-edit-${c.id}`}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReconCampaignId(c.id)}
                    data-testid={`button-reconciliation-${c.id}`}
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Reconciliation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrl(c.slug));
                      toast({ title: "Public link copied" });
                    }}
                    data-testid={`button-copy-link-${c.id}`}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    data-testid={`button-view-public-${c.id}`}
                  >
                    <a href={publicUrl(c.slug)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Delete "${c.title}"? This cannot be undone.`)) {
                        deleteMutation.mutate(c.id);
                      }
                    }}
                    data-testid={`button-delete-${c.id}`}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit campaign" : "New expense campaign"}</DialogTitle>
            <DialogDescription>
              Raise funds for a specific organizational expense. Add a matching donor to multiply gifts up to a cap.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="ec-title">Title</Label>
              <Input
                id="ec-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="New A/C unit for the shelter"
                data-testid="input-campaign-title"
              />
            </div>
            <div>
              <Label htmlFor="ec-slug">Public link slug (optional — auto-generated from title)</Label>
              <Input
                id="ec-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="new-ac-unit"
                data-testid="input-slug"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Appears in the public URL: /expense-campaign/<strong>{form.slug || "your-slug"}</strong>
              </p>
            </div>
            <div>
              <Label htmlFor="ec-short">Short description</Label>
              <Input
                id="ec-short"
                value={form.shortDescription}
                onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                placeholder="One sentence shown on the listing card."
                data-testid="input-short-description"
              />
            </div>
            <div>
              <Label htmlFor="ec-long">Long description (Markdown supported)</Label>
              <RichTextEditor
                value={form.longDescription}
                onChange={(value) => setForm({ ...form, longDescription: value })}
                placeholder="Tell the full story. Why does the rescue need this? How will it help the animals?"
                minHeight="180px"
                data-testid="input-long-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ec-goal">Goal ($)</Label>
                <Input
                  id="ec-goal"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.goalDollars}
                  onChange={(e) => setForm({ ...form, goalDollars: e.target.value })}
                  data-testid="input-goal-dollars"
                />
              </div>
              <div>
                <Label htmlFor="ec-end">End date (optional)</Label>
                <Input
                  id="ec-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  data-testid="input-end-date"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ec-hero">Hero image URL (optional)</Label>
              <Input
                id="ec-hero"
                value={form.heroImageUrl}
                onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })}
                placeholder="https://..."
                data-testid="input-hero-url"
              />
            </div>
            <div>
              <Label htmlFor="ec-status">Status</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger id="ec-status" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Matching donor pledge</div>
                  <div className="text-xs text-muted-foreground">
                    Optional. Multiplies every gift up to a pledged cap.
                  </div>
                </div>
                <Switch
                  checked={form.hasMatch}
                  onCheckedChange={(v) => setForm({ ...form, hasMatch: v })}
                  data-testid="switch-has-match"
                />
              </div>

              {form.hasMatch && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="mp-internal-name">Sponsor name (internal)</Label>
                      <Input
                        id="mp-internal-name"
                        value={form.internalSponsorName}
                        onChange={(e) => setForm({ ...form, internalSponsorName: e.target.value })}
                        data-testid="input-internal-sponsor-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mp-internal-email">Sponsor email (internal)</Label>
                      <Input
                        id="mp-internal-email"
                        type="email"
                        value={form.internalSponsorEmail}
                        onChange={(e) => setForm({ ...form, internalSponsorEmail: e.target.value })}
                        data-testid="input-internal-sponsor-email"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="mp-public-name">Public sponsor name (blank = anonymous)</Label>
                    <Input
                      id="mp-public-name"
                      value={form.publicSponsorName}
                      onChange={(e) => setForm({ ...form, publicSponsorName: e.target.value })}
                      placeholder="The Smith Family Foundation"
                      data-testid="input-public-sponsor-name"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="mp-show-public"
                      checked={form.showSponsorPublicly}
                      onCheckedChange={(v) => setForm({ ...form, showSponsorPublicly: v })}
                      data-testid="switch-show-sponsor-publicly"
                    />
                    <Label htmlFor="mp-show-public" className="text-sm">
                      Show sponsor name publicly
                    </Label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="mp-cap">Pledged cap ($)</Label>
                      <Input
                        id="mp-cap"
                        type="number"
                        min="1"
                        step="0.01"
                        value={form.pledgedCapDollars}
                        onChange={(e) => setForm({ ...form, pledgedCapDollars: e.target.value })}
                        data-testid="input-pledged-cap"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mp-num">Match ratio</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          id="mp-num"
                          type="number"
                          min="1"
                          value={form.ratioNumerator}
                          onChange={(e) => setForm({ ...form, ratioNumerator: parseInt(e.target.value || "1", 10) })}
                          data-testid="input-ratio-num"
                        />
                        <span>:</span>
                        <Input
                          type="number"
                          min="1"
                          value={form.ratioDenominator}
                          onChange={(e) => setForm({ ...form, ratioDenominator: parseInt(e.target.value || "1", 10) })}
                          data-testid="input-ratio-denom"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="mp-per-gift">Per-gift cap ($, optional)</Label>
                      <Input
                        id="mp-per-gift"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.perGiftCapDollars}
                        onChange={(e) => setForm({ ...form, perGiftCapDollars: e.target.value })}
                        data-testid="input-per-gift-cap"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="mp-starts">Match window starts (optional)</Label>
                      <Input
                        id="mp-starts"
                        type="datetime-local"
                        value={form.matchStartsAt}
                        onChange={(e) => setForm({ ...form, matchStartsAt: e.target.value })}
                        data-testid="input-match-starts-at"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mp-ends">Match window ends (optional)</Label>
                      <Input
                        id="mp-ends"
                        type="datetime-local"
                        value={form.matchEndsAt}
                        onChange={(e) => setForm({ ...form, matchEndsAt: e.target.value })}
                        data-testid="input-match-ends-at"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave blank for "starts immediately" / "no end date." Outside the window, donations still count but the matching donor stops matching.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => upsertMutation.mutate()}
              disabled={upsertMutation.isPending || !form.title || !form.goalDollars}
              data-testid="button-save-campaign"
            >
              {upsertMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReconciliationDialog
        campaignId={reconCampaignId}
        onClose={() => setReconCampaignId(null)}
      />
    </div>
  );
}

function ReconciliationDialog({
  campaignId,
  onClose,
}: {
  campaignId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{
    campaign: ExpenseCampaign;
    matchPool: MatchPool | null;
    donations: Array<{
      id: string;
      date: string | null;
      donorName: string;
      donorEmail: string | null;
      amount: number;
      matchedAmountCents: number;
    }>;
    summary: {
      totalDonations: number;
      totalRaisedCents: number;
      totalMatchedCents: number;
      remainingPoolCents: number;
    };
  }>({
    queryKey: ["/api/expense-campaigns", campaignId, "reconciliation"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/expense-campaigns/${campaignId}/reconciliation`);
      return res.json();
    },
    enabled: !!campaignId,
  });

  return (
    <Dialog open={!!campaignId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconciliation: {data?.campaign?.title ?? "…"}</DialogTitle>
          <DialogDescription>Donations credited to this campaign and matching-pool status.</DialogDescription>
        </DialogHeader>

        {isLoading && <p>Loading…</p>}
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Donations" value={String(data.summary.totalDonations)} />
              <Stat label="Raised" value={usd(data.summary.totalRaisedCents)} />
              <Stat label="Matched" value={usd(data.summary.totalMatchedCents)} />
              <Stat label="Remaining pool" value={usd(data.summary.remainingPoolCents)} />
            </div>

            {data.matchPool && (
              <Button asChild data-testid="button-download-sponsor-invoice">
                <a href={`/api/expense-campaigns/${campaignId}/sponsor-invoice.pdf`} download>
                  <FileDown className="h-4 w-4 mr-2" />
                  Download sponsor invoice (PDF)
                </a>
              </Button>
            )}

            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Donor</th>
                    <th className="text-right p-2">Gift</th>
                    <th className="text-right p-2">Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donations.map((d) => (
                    <tr key={d.id} className="border-t" data-testid={`row-donation-${d.id}`}>
                      <td className="p-2">{d.date ? new Date(d.date).toLocaleDateString() : "—"}</td>
                      <td className="p-2">{d.donorName || "Anonymous"}</td>
                      <td className="p-2 text-right">{usd(d.amount)}</td>
                      <td className="p-2 text-right">{usd(d.matchedAmountCents ?? 0)}</td>
                    </tr>
                  ))}
                  {data.donations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        No donations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
