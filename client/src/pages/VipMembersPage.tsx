import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Download,
  Sparkles,
  Search,
  ExternalLink,
  XCircle,
  RotateCcw,
  TrendingUp,
  Users,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Member {
  subscriptionId: string;
  stripeSubscriptionId: string;
  tierName: string | null;
  tierIdSnapshot: string | null;
  amount: number;
  status: string;
  memberSince: string;
  canceledAt: string | null;
  currentPeriodEnd: string | null;
  displayOnWallOfHeroes: boolean;
  firstNameDisplay: string | null;
  donorId: string;
  donorName: string;
  donorEmail: string;
  donorPhone: string | null;
  totalDonated: number;
}

interface TierStat {
  tierId: string | null;
  tierName: string;
  monthlyAmount: number | null;
  isActive: boolean;
  isDeleted: boolean;
  activeMembers: number;
  canceledMembers: number;
  pastDueMembers: number;
  totalMembers: number;
  mrrCents: number;
  lifetimeRevenueCents: number;
  churnRate: number;
  avgLifespanMonths: number;
  sharePct: number;
  arpuCents: number;
}

interface TierStatsResponse {
  stats: TierStat[];
  totals: {
    activeMembers: number;
    totalMembers: number;
    mrrCents: number;
    lifetimeRevenueCents: number;
  };
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function VipMembersPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"members" | "performance">("members");
  const [cancelTarget, setCancelTarget] = useState<Member | null>(null);
  const [refundTarget, setRefundTarget] = useState<Member | null>(null);
  const [cancelMode, setCancelMode] = useState<"period_end" | "immediate">("period_end");
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState<"requested_by_customer" | "duplicate" | "fraudulent">("requested_by_customer");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ["/api/vip-club/members"],
  });
  const { data: statsData, isLoading: statsLoading } = useQuery<TierStatsResponse>({
    queryKey: ["/api/vip-club/tier-stats"],
  });

  const members = data?.members || [];
  const stats = statsData?.stats || [];
  const totals = statsData?.totals;

  const cancelMutation = useMutation({
    mutationFn: async ({ subscriptionId, immediate, reason }: { subscriptionId: string; immediate: boolean; reason?: string }) => {
      // apiRequest already throws on non-ok via throwIfResNotOk; only parse JSON on success.
      const res = await apiRequest("POST", `/api/vip-club/members/${subscriptionId}/cancel`, { immediate, reason });
      return res.json() as Promise<{ success: boolean; immediate: boolean; cancelAtPeriodEnd: boolean; status: string; currentPeriodEnd: string | null }>;
    },
    onSuccess: (_, vars) => {
      toast({
        title: vars.immediate ? "Subscription canceled" : "Cancellation scheduled",
        description: vars.immediate
          ? "The donor's gift was canceled immediately."
          : "The donor's gift will end at the end of the current billing period.",
      });
      setCancelTarget(null);
      setCancelReason("");
      setCancelMode("period_end");
      queryClient.invalidateQueries({ queryKey: ["/api/vip-club/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vip-club/tier-stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not cancel subscription",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async ({ subscriptionId, amount, reason }: { subscriptionId: string; amount?: number; reason: string }) => {
      // apiRequest already throws on non-ok via throwIfResNotOk; only parse JSON on success.
      const res = await apiRequest("POST", `/api/vip-club/members/${subscriptionId}/refund`, {
        ...(amount ? { amount } : {}),
        reason,
      });
      return res.json() as Promise<{ success: boolean; refundId: string; refundedAmount: number; fullRefund: boolean }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Refund issued",
        description: `Refunded ${fmtMoney(data?.refundedAmount || 0)} to the donor.`,
      });
      setRefundTarget(null);
      setRefundAmount("");
      setRefundReason("requested_by_customer");
      queryClient.invalidateQueries({ queryKey: ["/api/vip-club/members"] });
    },
    onError: (err: any) => {
      toast({
        title: "Refund failed",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m) =>
      m.donorName?.toLowerCase().includes(q) ||
      m.donorEmail?.toLowerCase().includes(q) ||
      m.tierName?.toLowerCase().includes(q),
    );
  }, [members, search]);

  const headlineStats = useMemo(() => {
    const active = members.filter((m) => m.status === "active");
    const monthlyMrr = active.reduce((sum, m) => sum + m.amount, 0);
    return {
      totalMembers: members.length,
      activeMembers: active.length,
      mrr: monthlyMrr,
    };
  }, [members]);

  const groupedByTier = useMemo(() => {
    const groups = new Map<string, { tierName: string; members: Member[]; activeCount: number; mrr: number }>();
    for (const m of filtered) {
      const key = m.tierName || "Unassigned tier";
      if (!groups.has(key)) {
        groups.set(key, { tierName: key, members: [], activeCount: 0, mrr: 0 });
      }
      const g = groups.get(key)!;
      g.members.push(m);
      if (m.status === "active") {
        g.activeCount += 1;
        g.mrr += m.amount;
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.mrr - a.mrr);
  }, [filtered]);

  const exportCsv = () => {
    const headers = [
      "Donor Name",
      "Email",
      "Phone",
      "Tier",
      "Monthly Amount",
      "Status",
      "Member Since",
      "Canceled At",
      "Wall of Heroes Display Name",
    ];
    const rows = filtered.map((m) => [
      m.donorName || "",
      m.donorEmail || "",
      m.donorPhone || "",
      m.tierName || "",
      `$${(m.amount / 100).toFixed(2)}`,
      m.status,
      m.memberSince ? new Date(m.memberSince).toLocaleDateString() : "",
      m.canceledAt ? new Date(m.canceledAt).toLocaleDateString() : "",
      m.displayOnWallOfHeroes ? (m.firstNameDisplay || m.donorName.split(" ")[0]) : "Opted out",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vip-members-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const topTier = useMemo(() => {
    if (!stats.length) return null;
    return [...stats].sort((a, b) => b.mrrCents - a.mrrCents)[0];
  }, [stats]);

  const lowestChurnTier = useMemo(() => {
    const eligible = stats.filter((s) => s.totalMembers >= 2);
    if (!eligible.length) return null;
    return [...eligible].sort((a, b) => a.churnRate - b.churnRate)[0];
  }, [stats]);

  return (
    <DashboardLayout
      title="VIP Donor Club Members"
      description="Sustaining monthly donors who joined via your VIP Club page"
    >
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Members</div>
            <div className="text-3xl font-bold mt-1" data-testid="stat-total-members">{headlineStats.totalMembers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Active Members</div>
            <div className="text-3xl font-bold mt-1" data-testid="stat-active-members">{headlineStats.activeMembers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Monthly Recurring</div>
            <div className="text-3xl font-bold mt-1" data-testid="stat-mrr">${(headlineStats.mrr / 100).toFixed(0)}</div>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "members" | "performance")}>
          <TabsList>
            <TabsTrigger value="members" data-testid="tab-members">Members Roster</TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">
              <TrendingUp className="h-4 w-4 mr-2" />
              Tier Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-6 mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, or tier..."
                  className="pl-9"
                  data-testid="input-vip-search"
                />
              </div>
              <Button variant="outline" asChild data-testid="button-customize-tiers">
                <Link href="/dashboard/website-builder?tab=vip-tiers">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Customize tiers
                </Link>
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0} data-testid="button-export-vip">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {isLoading ? (
              <Card>
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </Card>
            ) : filtered.length === 0 ? (
              <Card>
                <div className="p-12 text-center">
                  <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-1">No VIP members yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Once donors join via your VIP Club page, they'll appear here.
                  </p>
                  <Button className="mt-4" variant="outline" onClick={() => window.open("/vip-club", "_blank")} data-testid="button-preview-vip-page">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Preview VIP Club Page
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {groupedByTier.map((group) => (
                  <div key={group.tierName} data-testid={`group-tier-${group.tierName.toLowerCase().replace(/\s+/g, "-")}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold" data-testid={`text-tier-group-name-${group.tierName.toLowerCase().replace(/\s+/g, "-")}`}>
                          {group.tierName}
                        </h3>
                        <Badge variant="secondary" data-testid={`badge-tier-count-${group.tierName.toLowerCase().replace(/\s+/g, "-")}`}>
                          {group.activeCount} active / {group.members.length} total
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-tier-mrr-${group.tierName.toLowerCase().replace(/\s+/g, "-")}`}>
                        <span className="font-semibold text-foreground">${(group.mrr / 100).toFixed(0)}</span>/mo from this tier
                      </div>
                    </div>
                    <Card>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Donor</TableHead>
                            <TableHead>Monthly</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Member Since</TableHead>
                            <TableHead>Wall</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.members.map((m) => {
                            const isActive = m.status === "active";
                            const isPastDue = m.status === "past_due";
                            const cancelable = isActive || isPastDue;
                            return (
                              <TableRow key={m.subscriptionId} data-testid={`row-vip-member-${m.subscriptionId}`}>
                                <TableCell>
                                  <div className="font-medium" data-testid={`text-vip-donor-name-${m.subscriptionId}`}>{m.donorName}</div>
                                  <div className="text-xs text-muted-foreground">{m.donorEmail}</div>
                                </TableCell>
                                <TableCell className="font-medium">${(m.amount / 100).toFixed(0)}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={isActive ? "default" : isPastDue ? "destructive" : "outline"}
                                    data-testid={`badge-vip-status-${m.subscriptionId}`}
                                  >
                                    {m.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {new Date(m.memberSince).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  {m.displayOnWallOfHeroes ? (
                                    <Badge variant="outline" className="text-xs">
                                      {m.firstNameDisplay || m.donorName.split(" ")[0]}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Opted out</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setRefundTarget(m)}
                                      data-testid={`button-refund-${m.subscriptionId}`}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                      Refund
                                    </Button>
                                    {cancelable ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setCancelTarget(m)}
                                        data-testid={`button-cancel-${m.subscriptionId}`}
                                      >
                                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                                        Cancel
                                      </Button>
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="performance" className="space-y-6 mt-4">
            {statsLoading ? (
              <Card>
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </Card>
            ) : !stats.length ? (
              <Card>
                <div className="p-12 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-1">No tier performance data yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Once donors subscribe to your tiers, you'll see per-tier metrics here.
                  </p>
                </div>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      Lifetime VIP Revenue
                    </div>
                    <div className="text-2xl font-bold mt-1" data-testid="stat-lifetime-revenue">
                      {fmtMoney(totals?.lifetimeRevenueCents || 0)}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Active VIP Donors
                    </div>
                    <div className="text-2xl font-bold mt-1" data-testid="stat-active-donors">
                      {totals?.activeMembers || 0}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      Top Tier by MRR
                    </div>
                    <div className="text-base font-semibold mt-1 truncate" data-testid="stat-top-tier" title={topTier?.tierName || ""}>
                      {topTier?.tierName || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {topTier ? `${fmtMoney(topTier.mrrCents)}/mo` : ""}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                      Stickiest Tier
                    </div>
                    <div className="text-base font-semibold mt-1 truncate" data-testid="stat-stickiest-tier" title={lowestChurnTier?.tierName || ""}>
                      {lowestChurnTier?.tierName || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {lowestChurnTier ? `${fmtPct(lowestChurnTier.churnRate)} churn` : "Need 2+ members"}
                    </div>
                  </Card>
                </div>

                <Card>
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Per-Tier Breakdown</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Compare conversion, retention, and lifetime value to find your sweet spot.
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                        <TableHead className="text-right">MRR</TableHead>
                        <TableHead className="text-right">
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">Churn</TooltipTrigger>
                            <TooltipContent>Canceled members ÷ all-time members</TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="text-right">
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">Avg life</TooltipTrigger>
                            <TooltipContent>Average months a member has been (or was) subscribed</TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="text-right">Lifetime $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.map((s) => (
                        <TableRow key={s.tierId || `deleted-${s.tierName}`} data-testid={`row-tier-stat-${(s.tierId || s.tierName).toString().toLowerCase().replace(/\s+/g, "-")}`}>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{s.tierName}</span>
                              {!s.isActive && !s.isDeleted ? (
                                <Badge variant="outline" className="text-xs">Inactive</Badge>
                              ) : null}
                              {s.isDeleted ? (
                                <Badge variant="outline" className="text-xs">Deleted</Badge>
                              ) : null}
                              {s.pastDueMembers > 0 ? (
                                <Badge variant="destructive" className="text-xs gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {s.pastDueMembers} past due
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {s.monthlyAmount != null ? `${fmtMoney(s.monthlyAmount)}/mo` : "—"}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-tier-active-${(s.tierId || s.tierName).toString().toLowerCase().replace(/\s+/g, "-")}`}>
                            {s.activeMembers}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{s.totalMembers}</TableCell>
                          <TableCell className="text-right">{fmtPct(s.sharePct)}</TableCell>
                          <TableCell className="text-right font-medium" data-testid={`text-tier-mrr-${(s.tierId || s.tierName).toString().toLowerCase().replace(/\s+/g, "-")}`}>
                            {fmtMoney(s.mrrCents)}
                          </TableCell>
                          <TableCell className="text-right">{fmtPct(s.churnRate)}</TableCell>
                          <TableCell className="text-right">
                            {s.avgLifespanMonths > 0 ? `${s.avgLifespanMonths.toFixed(1)} mo` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmtMoney(s.lifetimeRevenueCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent data-testid="dialog-cancel-vip">
          <DialogHeader>
            <DialogTitle>Cancel VIP subscription</DialogTitle>
            <DialogDescription>
              {cancelTarget ? (
                <>
                  Cancel <strong>{cancelTarget.donorName}</strong>'s {fmtMoney(cancelTarget.amount)}/mo
                  {cancelTarget.tierName ? ` ${cancelTarget.tierName}` : ""} gift?
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={cancelMode} onValueChange={(v) => setCancelMode(v as "period_end" | "immediate")}>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover-elevate" data-testid="radio-cancel-period-end">
                <RadioGroupItem value="period_end" className="mt-0.5" />
                <div>
                  <div className="font-medium">At end of current billing period</div>
                  <div className="text-sm text-muted-foreground">
                    Donor keeps access through {cancelTarget?.currentPeriodEnd ? new Date(cancelTarget.currentPeriodEnd).toLocaleDateString() : "the end of this period"}, then nothing further is charged. Recommended.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover-elevate" data-testid="radio-cancel-immediate">
                <RadioGroupItem value="immediate" className="mt-0.5" />
                <div>
                  <div className="font-medium">Immediately</div>
                  <div className="text-sm text-muted-foreground">
                    Cancels right away. Does not refund the most recent payment — issue a refund separately if needed.
                  </div>
                </div>
              </label>
            </RadioGroup>
            <div>
              <Label htmlFor="cancel-reason">Internal note (optional)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Donor requested via phone — moving out of state"
                maxLength={500}
                className="mt-1"
                data-testid="textarea-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} data-testid="button-cancel-dialog-close">
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                cancelMutation.mutate({
                  subscriptionId: cancelTarget.subscriptionId,
                  immediate: cancelMode === "immediate",
                  reason: cancelReason.trim() || undefined,
                });
              }}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {cancelMode === "immediate" ? "Cancel now" : "Schedule cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent data-testid="dialog-refund-vip">
          <DialogHeader>
            <DialogTitle>Refund most recent payment</DialogTitle>
            <DialogDescription>
              {refundTarget ? (
                <>
                  Refund the most recent successful payment from <strong>{refundTarget.donorName}</strong>. Leave the amount blank to refund in full.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="refund-amount">Refund amount (USD)</Label>
              <Input
                id="refund-amount"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={refundTarget ? `Full refund: ${(refundTarget.amount / 100).toFixed(2)}` : ""}
                inputMode="decimal"
                className="mt-1"
                data-testid="input-refund-amount"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank for a full refund. Partial refunds keep the subscription active.
              </p>
            </div>
            <div>
              <Label>Reason</Label>
              <RadioGroup
                value={refundReason}
                onValueChange={(v) => setRefundReason(v as "requested_by_customer" | "duplicate" | "fraudulent")}
                className="mt-1"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="requested_by_customer" />
                  <span className="text-sm">Requested by donor</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="duplicate" />
                  <span className="text-sm">Duplicate charge</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="fraudulent" />
                  <span className="text-sm">Fraudulent</span>
                </label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)} data-testid="button-refund-dialog-close">
              Close
            </Button>
            <Button
              disabled={refundMutation.isPending}
              onClick={() => {
                if (!refundTarget) return;
                const amountNum = refundAmount.trim() ? Math.round(parseFloat(refundAmount) * 100) : undefined;
                if (refundAmount.trim() && (!Number.isFinite(amountNum) || (amountNum as number) <= 0)) {
                  toast({ title: "Invalid amount", description: "Enter a positive dollar amount", variant: "destructive" });
                  return;
                }
                refundMutation.mutate({
                  subscriptionId: refundTarget.subscriptionId,
                  amount: amountNum,
                  reason: refundReason,
                });
              }}
              data-testid="button-confirm-refund"
            >
              {refundMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Issue refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
