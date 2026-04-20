import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles, CheckCircle2, Download, FileText, Mail, History, CreditCard } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { apiRequest } from "@/lib/queryClient";
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
  memberSince: string;
  tierName: string | null;
  stripeSubscriptionId: string;
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

export default function VipClubPage() {
  const [location] = useLocation();
  const { toast } = useToast();
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setWelcomeOpen(true);
    }
    const token = params.get("vipToken");
    if (token) {
      setHistoryToken(token);
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
  });

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
    }
  };

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
                {historyData.subscriptions.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    {historyData.subscriptions.map((sub) => {
                      const isManageable = sub.status === 'active' || sub.status === 'past_due' || sub.status === 'trialing' || sub.status === 'unpaid';
                      return (
                        <div key={sub.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`row-subscription-${sub.id}`}>
                          <div>
                            <span className="font-medium">{sub.tierName || 'Monthly Donor'}</span>
                            <span className="text-muted-foreground"> · {formatMoney(sub.amount)}/{sub.interval}</span>
                            <span className="text-muted-foreground"> · since {formatDateShort(sub.memberSince)}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={sub.status === 'active' ? 'default' : 'secondary'} data-testid={`badge-subscription-status-${sub.id}`}>
                              {sub.status}
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
                      );
                    })}
                  </div>
                )}
              </Card>

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
