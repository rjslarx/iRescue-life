import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles, CheckCircle2, Download, FileText, Mail, History, CreditCard, AlertCircle } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { getTierIcon } from "@/pages/VipTiersSettingsPage";

interface PublicTier {
  id: string;
  tierName: string;
  amount: number;
  tangibleImpact: string;
  iconName: string;
  displayOrder: number;
}

interface Hero {
  firstName: string;
  tierName: string | null;
  since: string;
}

interface TenantResponse {
  tenant: {
    id: string;
    name: string;
    logoUrl: string | null;
    stripeEnabled?: boolean;
  } | null;
}

interface VipHistoryDonation {
  id: string;
  date: string;
  amount: number | null;
  donationType: string;
  description: string | null;
  receiptNumber: string | null;
  receiptSentAt: string | null;
  isRecurring: boolean;
  externalSubscriptionId: string | null;
}

interface VipHistorySubscription {
  id: string;
  amount: number;
  interval: string;
  status: string;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  memberSince: string;
  tierName: string | null;
  stripeSubscriptionId: string;
  cardBrand: string | null;
  cardLast4: string | null;
  cardUpdatedAt: string | null;
  displayOnWallOfHeroes: boolean;
  firstNameDisplay: string | null;
}

interface VipHistoryResponse {
  donor: { name: string; email: string; totalDonated: number };
  subscriptions: VipHistorySubscription[];
  donations: VipHistoryDonation[];
  availableYears: number[];
}

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDateShort(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function WallOfHeroesToggle({
  sub,
  donorName,
  isPending,
  onChange,
}: {
  sub: VipHistorySubscription;
  donorName: string;
  isPending: boolean;
  onChange: (displayOnWallOfHeroes: boolean, firstNameDisplay: string | null) => void;
}) {
  const fallbackName = donorName?.split(' ')[0] || '';
  const [draftName, setDraftName] = useState<string>(sub.firstNameDisplay || '');
  const [editing, setEditing] = useState(false);

  // Keep local draft in sync if the upstream record changes (e.g. after a successful save)
  useEffect(() => {
    setDraftName(sub.firstNameDisplay || '');
  }, [sub.firstNameDisplay]);

  const currentDisplay = sub.firstNameDisplay || fallbackName || 'Anonymous';

  const saveName = () => {
    const trimmed = draftName.trim();
    onChange(true, trimmed.length === 0 ? null : trimmed);
    setEditing(false);
  };

  return (
    <div
      className="rounded-md border bg-muted/30 p-3 space-y-2"
      data-testid={`wall-optin-${sub.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Checkbox
            id={`wall-optin-${sub.id}`}
            checked={sub.displayOnWallOfHeroes}
            disabled={isPending}
            onCheckedChange={(v) => {
              const next = !!v;
              onChange(next, next ? (sub.firstNameDisplay || null) : null);
            }}
            data-testid={`checkbox-wall-optin-${sub.id}`}
          />
          <Label
            htmlFor={`wall-optin-${sub.id}`}
            className="text-sm leading-snug font-normal cursor-pointer"
          >
            Show my first name on our public Wall of Heroes
          </Label>
        </div>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {sub.displayOnWallOfHeroes && (
        <div className="pl-6 text-xs text-muted-foreground space-y-2">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={fallbackName || 'First name'}
                maxLength={40}
                className="max-w-xs"
                data-testid={`input-wall-firstname-${sub.id}`}
              />
              <Button
                onClick={saveName}
                disabled={isPending}
                data-testid={`button-save-wall-firstname-${sub.id}`}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setDraftName(sub.firstNameDisplay || ''); setEditing(false); }}
                data-testid={`button-cancel-wall-firstname-${sub.id}`}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid={`text-wall-firstname-${sub.id}`}>
                Displayed as <span className="font-medium text-foreground">{currentDisplay}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={isPending}
                data-testid={`button-edit-wall-firstname-${sub.id}`}
              >
                Change
              </Button>
            </div>
          )}
          <p>Only your first name and tier appear publicly. You can opt out anytime.</p>
        </div>
      )}
    </div>
  );
}

export default function VipClubPage() {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PublicTier | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [optInWall, setOptInWall] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [historyToken, setHistoryToken] = useState<string | null>(null);
  const [historyEmail, setHistoryEmail] = useState("");
  const [requestingLink, setRequestingLink] = useState(false);
  const [linkRequestSent, setLinkRequestSent] = useState(false);
  const [openingPortalFor, setOpeningPortalFor] = useState<string | null>(null);
  const [returningFromPortal, setReturningFromPortal] = useState(false);
  // Snapshot of the subscriptions list captured right before redirecting to
  // Stripe's billing portal. We use it on return to detect *changes* (rather
  // than the mere presence of any canceled sub), so a donor who already had a
  // historical canceled subscription doesn't immediately short-circuit the
  // post-return polling for their newly opened portal action.
  const [preReturnSnapshot, setPreReturnSnapshot] = useState<string | null>(null);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setWelcomeOpen(true);
    }
    const token = params.get("vipToken");
    if (token) {
      setHistoryToken(token);
    }
    if (typeof window !== 'undefined' && window.sessionStorage.getItem('vip-returning-from-portal') === '1') {
      setReturningFromPortal(true);
      setPreReturnSnapshot(window.sessionStorage.getItem('vip-pre-portal-snapshot'));
    }
  }, [location]);

  const { data: tenantData } = useQuery<TenantResponse>({ queryKey: ['/api/tenant'] });
  const { data: tiersData, isLoading: tiersLoading } = useQuery<{ tiers: PublicTier[] }>({
    queryKey: ['/api/monthly-tiers/public'],
  });
  const { data: heroesData } = useQuery<{ heroes: Hero[]; count: number }>({
    queryKey: ['/api/vip-club/wall-of-heroes'],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const tiers = tiersData?.tiers || [];
  const heroes = heroesData?.heroes || [];

  useSEO({
    title: `VIP Donor Club | ${rescueName}`,
    description: `Join ${rescueName}'s VIP Monthly Donor Club. Sustaining monthly gifts power our mission to rescue, rehabilitate, and rehome animals in need.`,
    siteName: rescueName,
  });

  const { data: historyData, isLoading: historyLoading, error: historyError } = useQuery<VipHistoryResponse>({
    queryKey: ['/api/vip-portal/history', historyToken],
    enabled: !!historyToken,
    queryFn: async () => {
      const url = buildTenantUrl(`/api/vip-portal/history?token=${encodeURIComponent(historyToken!)}`);
      const res = await fetch(url, { headers: getTenantHeaders(), credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        let msg = `${res.status}: ${text}`;
        try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    retry: false,
    // While we're waiting for Stripe's webhook to land after a return from the
    // billing portal, poll the history endpoint so the donor sees their
    // cancellation reflected without a manual refresh.
    refetchInterval: returningFromPortal ? 2000 : false,
  });

  // Build a stable signature of what we care about per-subscription so we can
  // tell when Stripe's webhook has actually moved the row to a new state.
  const subscriptionStateSignature = (subs: VipHistorySubscription[]): string =>
    subs
      .map((s) => `${s.id}:${s.status}:${s.cancelAtPeriodEnd ? 1 : 0}:${s.currentPeriodEnd ?? ''}:${s.cardUpdatedAt ?? ''}`)
      .sort()
      .join('|');

  // Stop polling once the subscriptions payload differs from the snapshot we
  // took before redirecting to the portal — i.e., the webhook has landed for
  // *this* portal session, not just an older canceled row that was already
  // present.
  useEffect(() => {
    if (!returningFromPortal || !historyData) return;
    if (!preReturnSnapshot) {
      // No snapshot to compare against (e.g. a fresh tab). Fall back to the
      // simple "any cancellation visible" heuristic.
      const reflected = historyData.subscriptions.some(
        (s) => s.cancelAtPeriodEnd || s.status === 'canceled'
      );
      if (!reflected) return;
    } else {
      const current = subscriptionStateSignature(historyData.subscriptions);
      if (current === preReturnSnapshot) return;
    }
    setReturningFromPortal(false);
    setPreReturnSnapshot(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('vip-returning-from-portal');
      window.sessionStorage.removeItem('vip-pre-portal-snapshot');
    }
  }, [returningFromPortal, historyData, preReturnSnapshot]);

  // Safety net: stop polling after ~20s even if no change shows up, so we
  // don't loop forever if the donor only updated their card (no subscription
  // change) or simply closed the portal.
  useEffect(() => {
    if (!returningFromPortal) return;
    const t = setTimeout(() => {
      setReturningFromPortal(false);
      setPreReturnSnapshot(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('vip-returning-from-portal');
        window.sessionStorage.removeItem('vip-pre-portal-snapshot');
      }
    }, 20_000);
    return () => clearTimeout(t);
  }, [returningFromPortal]);

  const requestHistoryLink = async () => {
    if (!historyEmail.trim()) {
      toast({ title: "Email required", description: "Please enter the email address you used to donate.", variant: "destructive" });
      return;
    }
    setRequestingLink(true);
    try {
      await apiRequest('POST', '/api/vip-portal/request-link', { email: historyEmail.trim() });
      setLinkRequestSent(true);
      toast({ title: "Check your email", description: "If a VIP donor account exists for this email, a secure link is on its way." });
    } catch (err: any) {
      toast({ title: "Request failed", description: err?.message, variant: "destructive" });
    } finally {
      setRequestingLink(false);
    }
  };

  const downloadReceipt = (donationId: string) => {
    const url = buildTenantUrl(`/api/vip-portal/receipt/${donationId}?token=${encodeURIComponent(historyToken!)}`);
    window.open(url, '_blank');
  };

  const openBillingPortal = async (subscriptionId: string) => {
    if (!historyToken) return;
    setOpeningPortalFor(subscriptionId);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('vip-returning-from-portal', '1');
      // Snapshot the current subscriptions state so on return we can detect
      // when the row for this portal session actually changes.
      if (historyData?.subscriptions) {
        window.sessionStorage.setItem(
          'vip-pre-portal-snapshot',
          subscriptionStateSignature(historyData.subscriptions),
        );
      }
    }
    try {
      const res = await fetch(
        buildTenantUrl(`/api/vip-portal/billing-portal?token=${encodeURIComponent(historyToken)}`),
        {
          method: 'POST',
          headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            subscriptionId,
            returnUrl: window.location.href,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error(json.error || `Failed to open billing portal (${res.status})`);
      }
      window.location.href = json.url;
    } catch (err: any) {
      toast({ title: "Could not open billing portal", description: err?.message, variant: "destructive" });
      setOpeningPortalFor(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('vip-returning-from-portal');
        window.sessionStorage.removeItem('vip-pre-portal-snapshot');
      }
    }
  };

  // Wall of Heroes opt-in: derive current state from the donor's active
  // subscriptions. If any active sub is opted in, treat the donor as opted in.
  // The `firstNameDisplay` is taken from whichever active sub has one set.
  const activeSubsForWall = useMemo(
    () => (historyData?.subscriptions || []).filter((s) => s.status === 'active'),
    [historyData?.subscriptions],
  );
  const serverOptedIn = activeSubsForWall.some((s) => s.displayOnWallOfHeroes);
  const serverDisplayName =
    activeSubsForWall.find((s) => s.firstNameDisplay)?.firstNameDisplay || '';

  const [wallOptInDraft, setWallOptInDraft] = useState<boolean | null>(null);
  const [wallNameDraft, setWallNameDraft] = useState<string | null>(null);

  // Reset local edits whenever fresh server data lands.
  useEffect(() => {
    setWallOptInDraft(null);
    setWallNameDraft(null);
  }, [serverOptedIn, serverDisplayName]);

  const effectiveWallOptIn = wallOptInDraft ?? serverOptedIn;
  const effectiveWallName = wallNameDraft ?? serverDisplayName;
  const wallDirty =
    effectiveWallOptIn !== serverOptedIn ||
    (effectiveWallOptIn && effectiveWallName.trim() !== serverDisplayName.trim());

  const wallMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        buildTenantUrl(`/api/vip-portal/wall-preferences?token=${encodeURIComponent(historyToken!)}`),
        {
          method: 'POST',
          headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            optIn: effectiveWallOptIn,
            firstNameDisplay: effectiveWallOptIn ? effectiveWallName.trim() : null,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Update failed (${res.status})`);
      return json;
    },
    onSuccess: () => {
      toast({
        title: effectiveWallOptIn ? "You're on the Wall of Heroes" : 'Removed from the Wall',
        description: effectiveWallOptIn
          ? 'Thank you for letting us celebrate your support publicly.'
          : 'Your name will no longer appear on the public Wall of Heroes.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vip-portal/history', historyToken] });
      queryClient.invalidateQueries({ queryKey: ['/api/vip-club/wall-of-heroes'] });
    },
    onError: (err: any) => {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
    },
  });

  const wallOptInMutation = useMutation({
    mutationFn: async (vars: { subscriptionId: string; displayOnWallOfHeroes: boolean; firstNameDisplay: string | null }) => {
      const url = buildTenantUrl(`/api/vip-portal/subscriptions/${vars.subscriptionId}/wall-of-heroes?token=${encodeURIComponent(historyToken!)}`);
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayOnWallOfHeroes: vars.displayOnWallOfHeroes,
          firstNameDisplay: vars.firstNameDisplay,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Failed to update (${res.status})`;
        try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ subscription: { id: string; displayOnWallOfHeroes: boolean; firstNameDisplay: string | null } }>;
    },
    onMutate: async (vars) => {
      const queryKey = ['/api/vip-portal/history', historyToken];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VipHistoryResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<VipHistoryResponse>(queryKey, {
          ...previous,
          subscriptions: previous.subscriptions.map((s) =>
            s.id === vars.subscriptionId
              ? { ...s, displayOnWallOfHeroes: vars.displayOnWallOfHeroes, firstNameDisplay: vars.displayOnWallOfHeroes ? vars.firstNameDisplay : null }
              : s,
          ),
        });
      }
      return { previous };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['/api/vip-portal/history', historyToken], ctx.previous);
      }
      toast({ title: 'Could not update Wall of Heroes', description: err?.message, variant: 'destructive' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vip-club/wall-of-heroes'] });
    },
  });

  const downloadAnnualSummary = (year: number) => {
    const url = buildTenantUrl(`/api/vip-portal/annual-summary/${year}?token=${encodeURIComponent(historyToken!)}`);
    window.open(url, '_blank');
  };

  const startCheckout = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/api/monthly-tiers/${selected.id}/checkout`, {
        customerEmail: email || undefined,
        firstNameDisplay: optInWall ? (firstName || undefined) : undefined,
        displayOnWallOfHeroes: optInWall,
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err?.message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-background to-background border-b">
        <div className="container max-w-4xl mx-auto py-12 sm:py-16 px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            VIP MONTHLY DONOR CLUB
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold mb-4" data-testid="text-vip-hero-title">
            Be the steady heartbeat of {rescueName}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-vip-hero-subtitle">
            Sustaining monthly gifts give us the predictable funding we need to say "yes" the next time an animal arrives in crisis. Pick the tier that's right for you.
          </p>
        </div>
      </div>

      {/* Tier Grid */}
      <div className="container max-w-6xl mx-auto py-12 px-4 sm:px-6">
        {tiersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-72 w-full" />)}
          </div>
        ) : tiers.length === 0 ? (
          <Card className="p-10 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">VIP Club is being prepared</h3>
            <p className="text-sm text-muted-foreground">
              Our monthly giving tiers will be available soon. In the meantime, you can support us with a one-time gift.
            </p>
            <Button className="mt-4" onClick={() => window.location.href = "/donate"} data-testid="button-go-to-donate">
              Make a One-Time Gift
            </Button>
          </Card>
        ) : (
          <div className={`grid grid-cols-1 ${tiers.length === 2 ? 'md:grid-cols-2' : tiers.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : ''} gap-4 max-w-4xl mx-auto`}>
            {tiers.map((tier, i) => {
              const Icon = getTierIcon(tier.iconName);
              const isFeatured = i === 1 && tiers.length >= 3;
              return (
                <Card
                  key={tier.id}
                  className={`p-6 flex flex-col relative ${isFeatured ? 'border-primary border-2 shadow-md' : ''}`}
                  data-testid={`tier-public-${tier.id}`}
                >
                  {isFeatured && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">Most Popular</Badge>
                  )}
                  <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-xl font-bold" data-testid={`text-public-tier-name-${tier.id}`}>
                    {tier.tierName}
                  </h3>
                  <div className="mt-2 mb-3">
                    <span className="text-4xl font-bold">${(tier.amount / 100).toFixed(0)}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground flex-1" data-testid={`text-public-tier-impact-${tier.id}`}>
                    {tier.tangibleImpact}
                  </p>
                  <Button
                    className="mt-6 w-full"
                    variant={isFeatured ? "default" : "outline"}
                    onClick={() => { setSelected(tier); setOptInWall(true); }}
                    data-testid={`button-join-tier-${tier.id}`}
                  >
                    Become a {tier.tierName}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        {/* Cross-link to one-time donate */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Prefer a one-time gift?{" "}
            <a href="/donate" className="text-primary underline-offset-4 hover:underline font-medium" data-testid="link-onetime-donate">
              Make a single donation instead
            </a>
            .
          </p>
        </div>
      </div>

      {/* My Giving History */}
      <div className="border-t bg-muted/20" id="giving-history">
        <div className="container max-w-4xl mx-auto py-12 px-4 sm:px-6">
          <div className="text-center mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <History className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2" data-testid="text-history-heading">
              My Giving History
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Already a VIP donor? Re-download past tax receipts or your year-end giving summary anytime.
            </p>
          </div>

          {!historyToken && (
            <Card className="p-6 max-w-md mx-auto" data-testid="card-history-request">
              {linkRequestSent ? (
                <div className="text-center space-y-3">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
                  <h3 className="font-semibold">Check your inbox</h3>
                  <p className="text-sm text-muted-foreground">
                    If a VIP donor account exists for <span className="font-medium">{historyEmail}</span>, we just sent a secure link that lets you view and download your giving history.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="vip-history-email">Email used for your monthly donation</Label>
                  <Input
                    id="vip-history-email"
                    type="email"
                    value={historyEmail}
                    onChange={(e) => setHistoryEmail(e.target.value)}
                    placeholder="you@example.com"
                    data-testid="input-history-email"
                  />
                  <Button
                    className="w-full"
                    onClick={requestHistoryLink}
                    disabled={requestingLink}
                    data-testid="button-request-history-link"
                  >
                    {requestingLink ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    Email me a secure link
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    For your privacy, we'll send a secure link valid for 24 hours. We never share your email.
                  </p>
                </div>
              )}
            </Card>
          )}

          {historyToken && historyLoading && (
            <Card className="p-6 max-w-3xl mx-auto space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          )}

          {historyToken && historyError && (
            <Card className="p-6 max-w-md mx-auto text-center" data-testid="card-history-error">
              <p className="text-sm text-destructive mb-3">
                {(historyError as Error).message || 'This link is invalid or has expired.'}
              </p>
              <Button
                variant="outline"
                onClick={() => { setHistoryToken(null); setLinkRequestSent(false); }}
                data-testid="button-history-request-new"
              >
                Request a new link
              </Button>
            </Card>
          )}

          {historyToken && historyData && (
            <div className="max-w-3xl mx-auto space-y-6" data-testid="section-history-loaded">
              <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Welcome back</p>
                    <p className="font-display text-xl font-bold" data-testid="text-history-donor-name">
                      {historyData.donor.name}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid="text-history-donor-email">
                      {historyData.donor.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Lifetime giving</p>
                    <p className="font-display text-2xl font-bold text-primary" data-testid="text-history-lifetime">
                      {formatMoney(historyData.donor.totalDonated)}
                    </p>
                  </div>
                </div>
                {returningFromPortal && (
                  <div
                    className="mt-4 flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm"
                    data-testid="banner-portal-syncing"
                  >
                    <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-muted-foreground" />
                    <div>
                      <p className="font-medium">Syncing your changes from Stripe…</p>
                      <p className="text-muted-foreground">
                        If you just updated your card or canceled, your subscription details below will refresh automatically in a few seconds.
                      </p>
                    </div>
                  </div>
                )}
                {historyData.subscriptions.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    {historyData.subscriptions.map((sub) => {
                      const isManageable = sub.status === 'active' || sub.status === 'past_due' || sub.status === 'trialing' || sub.status === 'unpaid';
                      const showCanceledBanner =
                        sub.status === 'canceled' && !dismissedBanners.has(`canceled-${sub.id}`);
                      const showScheduledBanner =
                        sub.cancelAtPeriodEnd &&
                        sub.status !== 'canceled' &&
                        !dismissedBanners.has(`scheduled-${sub.id}`);
                      // Surface a "Card on file updated" banner for ~24h after a
                      // payment-method change webhook lands. The dismiss key
                      // includes the cardUpdatedAt timestamp so a *future*
                      // update re-shows the banner instead of staying dismissed
                      // forever.
                      const cardUpdatedRecently =
                        !!sub.cardUpdatedAt &&
                        Date.now() - new Date(sub.cardUpdatedAt).getTime() < 24 * 60 * 60 * 1000;
                      const showCardUpdatedBanner =
                        cardUpdatedRecently &&
                        sub.status !== 'canceled' &&
                        !dismissedBanners.has(`card-${sub.id}-${sub.cardUpdatedAt}`);
                      const dismissBanner = (key: string) =>
                        setDismissedBanners((prev) => {
                          const next = new Set(prev);
                          next.add(key);
                          return next;
                        });
                      return (
                        <div key={sub.id} className="space-y-2" data-testid={`row-subscription-${sub.id}`}>
                          {showCardUpdatedBanner && (
                            <div
                              className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
                              data-testid={`banner-card-updated-${sub.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                              <div className="flex-1">
                                <p className="font-medium">Card on file updated</p>
                                <p className="text-muted-foreground" data-testid={`text-card-updated-${sub.id}`}>
                                  {sub.cardBrand && sub.cardLast4
                                    ? `Future monthly gifts will be charged to your ${sub.cardBrand} ending in ${sub.cardLast4}.`
                                    : 'Your new card is now on file. Future monthly gifts will be charged to it.'}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => dismissBanner(`card-${sub.id}-${sub.cardUpdatedAt}`)}
                                data-testid={`button-dismiss-card-updated-${sub.id}`}
                              >
                                Dismiss
                              </Button>
                            </div>
                          )}
                          {showScheduledBanner && (
                            <div
                              className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
                              data-testid={`banner-cancel-scheduled-${sub.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                              <div className="flex-1">
                                <p className="font-medium">Cancellation scheduled</p>
                                <p className="text-muted-foreground" data-testid={`text-cancel-end-${sub.id}`}>
                                  Your monthly gift will end on {sub.currentPeriodEnd ? formatDateShort(sub.currentPeriodEnd) : 'your next billing date'}. You won't be charged again after that.
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => dismissBanner(`scheduled-${sub.id}`)}
                                data-testid={`button-dismiss-scheduled-${sub.id}`}
                              >
                                Dismiss
                              </Button>
                            </div>
                          )}
                          {showCanceledBanner && (
                            <div
                              className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm"
                              data-testid={`banner-canceled-${sub.id}`}
                            >
                              <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="font-medium">Your monthly gift was canceled</p>
                                <p className="text-muted-foreground" data-testid={`text-canceled-on-${sub.id}`}>
                                  {sub.canceledAt
                                    ? `Canceled on ${formatDateShort(sub.canceledAt)}. `
                                    : ''}
                                  Thank you for your past support — you can rejoin anytime by picking a tier above.
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => dismissBanner(`canceled-${sub.id}`)}
                                data-testid={`button-dismiss-canceled-${sub.id}`}
                              >
                                Dismiss
                              </Button>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <span className="font-medium">{sub.tierName || 'Monthly Donor'}</span>
                            <span className="text-muted-foreground"> · {formatMoney(sub.amount)}/{sub.interval}</span>
                            <span className="text-muted-foreground"> · since {formatDateShort(sub.memberSince)}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={sub.status === 'active' && !sub.cancelAtPeriodEnd ? 'default' : 'secondary'}
                              data-testid={`badge-subscription-status-${sub.id}`}
                            >
                              {sub.status === 'canceled'
                                ? 'canceled'
                                : sub.cancelAtPeriodEnd
                                  ? 'ending soon'
                                  : sub.status}
                            </Badge>
                            {isManageable && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openBillingPortal(sub.id)}
                                disabled={openingPortalFor === sub.id}
                                data-testid={`button-manage-subscription-${sub.id}`}
                              >
                                {openingPortalFor === sub.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <CreditCard className="h-4 w-4 mr-2" />
                                )}
                                Update card or cancel
                              </Button>
                            )}
                          </div>
                          </div>
                          {(sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') && (
                            <WallOfHeroesToggle
                              sub={sub}
                              donorName={historyData.donor.name}
                              isPending={wallOptInMutation.isPending && wallOptInMutation.variables?.subscriptionId === sub.id}
                              onChange={(displayOnWallOfHeroes, firstNameDisplay) =>
                                wallOptInMutation.mutate({ subscriptionId: sub.id, displayOnWallOfHeroes, firstNameDisplay })
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {activeSubsForWall.length > 0 && (
                <Card className="p-6" data-testid="card-wall-opt-in">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold mb-1">Wall of Heroes</h3>
                      <p className="text-sm text-muted-foreground">
                        Let {rescueName} celebrate your support publicly. Only your first name and tier appear — never your email or amount.
                      </p>
                    </div>
                    <Badge variant={serverOptedIn ? 'default' : 'secondary'} data-testid="badge-wall-current-status">
                      {serverOptedIn ? 'On the Wall' : 'Not on the Wall'}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="wall-opt-in-toggle"
                        checked={effectiveWallOptIn}
                        onCheckedChange={(v) => setWallOptInDraft(v === true)}
                        data-testid="checkbox-wall-opt-in"
                      />
                      <Label htmlFor="wall-opt-in-toggle" className="text-sm font-normal leading-snug cursor-pointer">
                        Yes, show my first name on the public Wall of Heroes for {rescueName}.
                      </Label>
                    </div>

                    {effectiveWallOptIn && (
                      <div className="space-y-1.5 pl-6">
                        <Label htmlFor="wall-display-name" className="text-sm">
                          Name to display (optional)
                        </Label>
                        <Input
                          id="wall-display-name"
                          value={effectiveWallName}
                          onChange={(e) => setWallNameDraft(e.target.value)}
                          placeholder={historyData.donor.name?.split(' ')[0] || 'Your first name'}
                          maxLength={60}
                          data-testid="input-wall-display-name"
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave blank to use your first name from our records.
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        onClick={() => wallMutation.mutate()}
                        disabled={!wallDirty || wallMutation.isPending}
                        data-testid="button-save-wall-preference"
                      >
                        {wallMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save preference
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {historyData.availableYears.length > 0 && (
                <Card className="p-6">
                  <h3 className="font-display text-lg font-semibold mb-1">Year-end giving summaries</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    A single statement of all your monetary contributions for the year, ready for your tax records.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {historyData.availableYears.map((year) => (
                      <Button
                        key={year}
                        variant="outline"
                        onClick={() => downloadAnnualSummary(year)}
                        data-testid={`button-annual-summary-${year}`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download {year} summary
                      </Button>
                    ))}
                  </div>
                </Card>
              )}

              <Card className="p-6">
                <h3 className="font-display text-lg font-semibold mb-1">Past donations</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Download a tax-deductible receipt for any donation below.
                </p>
                {historyData.donations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-donations">
                    No donations on record yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {historyData.donations.map((d) => (
                      <div
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                        data-testid={`row-donation-${d.id}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium" data-testid={`text-donation-date-${d.id}`}>
                              {formatDateShort(d.date)}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="font-semibold" data-testid={`text-donation-amount-${d.id}`}>
                              {formatMoney(d.amount)}
                            </span>
                            {d.isRecurring && (
                              <Badge variant="secondary" data-testid={`badge-recurring-${d.id}`}>Monthly</Badge>
                            )}
                          </div>
                          {d.receiptNumber && (
                            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-receipt-number-${d.id}`}>
                              Receipt #{d.receiptNumber}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadReceipt(d.id)}
                          data-testid={`button-download-receipt-${d.id}`}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Receipt
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Wall of Heroes */}
      {heroes.length > 0 && (
        <div className="border-t bg-muted/30">
          <div className="container max-w-5xl mx-auto py-12 px-4 sm:px-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2">Our Wall of Heroes</h2>
              <p className="text-sm text-muted-foreground">
                {heroes.length} sustaining {heroes.length === 1 ? 'donor is' : 'donors are'} powering our mission every month. Thank you.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2" data-testid="wall-of-heroes">
              {heroes.map((hero, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-sm py-1.5 px-3"
                  data-testid={`hero-badge-${i}`}
                >
                  {hero.firstName}
                  {hero.tierName && <span className="ml-1.5 opacity-70">· {hero.tierName}</span>}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setSubmitting(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Join the {selected?.tierName} Tier</DialogTitle>
            <DialogDescription>
              You'll be charged ${selected ? (selected.amount / 100).toFixed(0) : ''}/month and can cancel anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vip-email">Email (optional)</Label>
              <Input
                id="vip-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="input-vip-email"
              />
              <p className="text-xs text-muted-foreground">We'll pre-fill this on the secure Stripe checkout page.</p>
            </div>
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="vip-wall-optin"
                  checked={optInWall}
                  onCheckedChange={(v) => setOptInWall(!!v)}
                  data-testid="checkbox-wall-optin"
                />
                <Label htmlFor="vip-wall-optin" className="text-sm leading-snug font-normal cursor-pointer">
                  Show my first name on the public Wall of Heroes
                </Label>
              </div>
              {optInWall && (
                <div className="space-y-1 pl-6">
                  <Label htmlFor="vip-first-name" className="text-xs">First name (or display name)</Label>
                  <Input
                    id="vip-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Optional - leave blank to use your billing name"
                    maxLength={40}
                    data-testid="input-vip-first-name"
                  />
                </div>
              )}
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={startCheckout}
              disabled={submitting || !tenant?.stripeEnabled}
              data-testid="button-vip-checkout"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Continue to Secure Checkout
            </Button>
            {!tenant?.stripeEnabled && (
              <p className="text-xs text-destructive text-center">Online giving is not yet configured for this rescue.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Welcome Dialog */}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Welcome to the VIP Club!
            </DialogTitle>
            <DialogDescription>
              Thank you for becoming a sustaining monthly donor. A confirmation email and tax receipt will arrive shortly. Your generosity changes lives every single month.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setWelcomeOpen(false)} className="w-full" data-testid="button-welcome-close">
            Continue
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
