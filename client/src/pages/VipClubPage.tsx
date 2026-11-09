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
import { Loader2, Sparkles, CheckCircle2, Download, FileText, Mail, History, CreditCard, AlertCircle, Building2, Gift, Send, Pencil } from "lucide-react";
import { isAchEligible, achNudgeCopy } from "@shared/ach-eligibility";
import PublicHeader from "@/components/PublicHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { getTierIcon } from "@/pages/VipTiersSettingsPage";
import { DonationHistoryRow } from "@/components/DonationHistoryRow";
import { MemorialPhotoEditor } from "@/components/vip/MemorialPhotoEditor";
import { VipGamePerk } from "@/components/vip/VipGamePerk";

interface PublicTier {
  id: string;
  tierName: string;
  amount: number;
  tangibleImpact: string;
  iconName: string;
  displayOrder: number;
}

interface Hero {
  displayName: string;
  // Legacy alias for older cached responses; prefer `displayName`.
  firstName?: string;
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
  paymentMethod: string | null;
  description: string | null;
  receiptNumber: string | null;
  receiptSentAt: string | null;
  isRecurring: boolean;
  externalSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  isPendingBankTransfer: boolean;
  expectedClearDate: string | null;
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
  displayName: string | null;
  memorialShowDonorName?: boolean;
  memorialPhotoUrl?: string | null;
  memorialFrameStyle?: 'heart' | 'paw' | null;
  foreverHero?: boolean;
  // Task #197 — present when this subscription was paid as a gift.
  giftId?: string | null;
  giftHonoreeName?: string | null;
  giftHonoreeEmail?: string | null;
  giftMessage?: string | null;
  giftAnnouncementDate?: string | null;
  giftAnnouncementSentAt?: string | null;
}

interface VipHistoryPendingPayment {
  id: string;
  date: string;
  amount: number;
  status: 'pending' | 'failed' | 'succeeded' | 'refunded';
  isRecurring: boolean;
  stripeCheckoutSessionId: string | null;
  expectedClearDate: string | null;
}

interface VipHistoryResponse {
  donor: { name: string; email: string; totalDonated: number };
  subscriptions: VipHistorySubscription[];
  donations: VipHistoryDonation[];
  pendingPayments?: VipHistoryPendingPayment[];
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
  vipToken,
  onMemorialChanged,
}: {
  sub: VipHistorySubscription;
  donorName: string;
  isPending: boolean;
  onChange: (
    displayOnWallOfHeroes: boolean,
    displayName: string | null,
    opts?: { memorialShowDonorName?: boolean },
  ) => void;
  vipToken: string | null;
  onMemorialChanged: () => void;
}) {
  const fallbackName = donorName?.split(' ')[0] || '';
  const [draftName, setDraftName] = useState<string>(sub.displayName || '');
  const [editing, setEditing] = useState(false);

  // Keep local draft in sync if the upstream record changes (e.g. after a successful save)
  useEffect(() => {
    setDraftName(sub.displayName || '');
  }, [sub.displayName]);

  const currentDisplay = sub.displayName || fallbackName || 'Anonymous';

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
              onChange(next, next ? (sub.displayName || null) : null);
            }}
            data-testid={`checkbox-wall-optin-${sub.id}`}
          />
          <Label
            htmlFor={`wall-optin-${sub.id}`}
            className="text-sm leading-snug font-normal cursor-pointer"
          >
            Show my name on our public Wall of Heroes
          </Label>
        </div>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {sub.displayOnWallOfHeroes && (
        <div className="pl-6 text-xs text-muted-foreground space-y-3">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={fallbackName || 'Your display name'}
                maxLength={60}
                className="max-w-xs"
                data-testid={`input-wall-displayname-${sub.id}`}
              />
              <Button
                onClick={saveName}
                disabled={isPending}
                data-testid={`button-save-wall-displayname-${sub.id}`}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setDraftName(sub.displayName || ''); setEditing(false); }}
                data-testid={`button-cancel-wall-displayname-${sub.id}`}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid={`text-wall-displayname-${sub.id}`}>
                Displayed as <span className="font-medium text-foreground">{currentDisplay}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={isPending}
                data-testid={`button-edit-wall-displayname-${sub.id}`}
              >
                Change
              </Button>
            </div>
          )}
          <p>Only the name you choose and your tier appear publicly. You can opt out anytime.</p>
          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id={`wall-show-donor-${sub.id}`}
              checked={!!sub.memorialShowDonorName}
              disabled={isPending}
              onCheckedChange={(v) => {
                onChange(true, sub.displayName || null, { memorialShowDonorName: !!v });
              }}
              data-testid={`checkbox-wall-show-donor-${sub.id}`}
            />
            <Label
              htmlFor={`wall-show-donor-${sub.id}`}
              className="text-xs leading-snug font-normal cursor-pointer text-muted-foreground"
            >
              Also show "From {(donorName?.split(/\s+/)[0]) || 'me'}" on the public tile.
              We'll only show your first name and last initial — never your full name, email, or amount.
            </Label>
          </div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-medium text-foreground mb-2">
              Memorial photo (optional)
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              If this gift honors someone, add their photo. It will appear in our
              "In Memory" section of the Wall.
            </p>
            <MemorialPhotoEditor
              subscriptionId={sub.id}
              donorName={donorName}
              displayName={sub.displayName}
              memorialPhotoUrl={sub.memorialPhotoUrl ?? null}
              endpointBase={buildTenantUrl(`/api/vip-portal/subscriptions/${sub.id}`)}
              querySuffix={vipToken ? `?token=${encodeURIComponent(vipToken)}` : ''}
              buildHeaders={() => getTenantHeaders()}
              onChanged={onMemorialChanged}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function VipClubPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PublicTier | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [optInWall, setOptInWall] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Task #197 — gift-this-membership flow. When `giftMode` is true the
  // checkout dialog collects honoree details and forwards them to the server
  // checkout endpoint, which forces Wall opt-in default=true and writes the
  // gift metadata Stripe will hand back via the webhook.
  const [giftMode, setGiftMode] = useState(false);
  const [giftHonoreeName, setGiftHonoreeName] = useState("");
  const [giftHonoreeEmail, setGiftHonoreeEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftAnnouncementDate, setGiftAnnouncementDate] = useState("");
  // Gifters can choose whether the honoree appears on the public Wall of
  // Heroes as "In honor of {Honoree}". Defaults ON per Task #197.
  const [giftDisplayOnWall, setGiftDisplayOnWall] = useState(true);
  // Edit-existing-gift dialog state (donor portal section).
  const [editGift, setEditGift] = useState<VipHistorySubscription | null>(null);
  const [editGiftHonoree, setEditGiftHonoree] = useState("");
  const [editGiftEmail, setEditGiftEmail] = useState("");
  const [editGiftMessage, setEditGiftMessage] = useState("");
  const [editGiftDate, setEditGiftDate] = useState("");
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
    title: `Rescue Pack | ${rescueName}`,
    description: `Join ${rescueName}'s Rescue Pack. Sustaining monthly gifts power our mission to rescue, rehabilitate, and rehome animals in need.`,
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
      toast({ title: "Check your email", description: "If a Rescue Pack donor account exists for this email, a secure link is on its way." });
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
  // The `displayName` is taken from whichever active sub has one set.
  const activeSubsForWall = useMemo(
    () => (historyData?.subscriptions || []).filter((s) => s.status === 'active'),
    [historyData?.subscriptions],
  );
  const serverOptedIn = activeSubsForWall.some((s) => s.displayOnWallOfHeroes);
  const serverDisplayName =
    activeSubsForWall.find((s) => s.displayName)?.displayName || '';

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
            displayName: effectiveWallOptIn ? effectiveWallName.trim() : null,
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

  // Task #197 — donor-portal mutations to edit honoree details on an
  // existing gift sub and to re-queue the announcement email after a typo.
  const giftEditMutation = useMutation({
    mutationFn: async (vars: { subscriptionId: string; honoreeName: string; honoreeEmail: string; message: string; announcementDate: string }) => {
      const url = buildTenantUrl(`/api/vip-portal/subscriptions/${vars.subscriptionId}/gift?token=${encodeURIComponent(historyToken!)}`);
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          honoreeName: vars.honoreeName,
          honoreeEmail: vars.honoreeEmail || null,
          message: vars.message || null,
          announcementDate: vars.announcementDate || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Update failed (${res.status})`);
      return json;
    },
    onSuccess: () => {
      toast({ title: 'Gift updated', description: 'The honoree details have been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/vip-portal/history', historyToken] });
      queryClient.invalidateQueries({ queryKey: ['/api/vip-club/wall-of-heroes'] });
      setEditGift(null);
    },
    onError: (err: any) => toast({ title: 'Could not update gift', description: err?.message, variant: 'destructive' }),
  });

  const giftResendMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const url = buildTenantUrl(`/api/vip-portal/subscriptions/${subscriptionId}/gift/resend?token=${encodeURIComponent(historyToken!)}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Resend failed (${res.status})`);
      return json;
    },
    onSuccess: () => {
      toast({ title: 'Announcement re-queued', description: "We'll send the honoree another note within a day." });
      queryClient.invalidateQueries({ queryKey: ['/api/vip-portal/history', historyToken] });
    },
    onError: (err: any) => toast({ title: 'Could not re-send', description: err?.message, variant: 'destructive' }),
  });

  const wallOptInMutation = useMutation({
    mutationFn: async (vars: { subscriptionId: string; displayOnWallOfHeroes: boolean; displayName: string | null; memorialShowDonorName?: boolean }) => {
      const url = buildTenantUrl(`/api/vip-portal/subscriptions/${vars.subscriptionId}/wall-of-heroes?token=${encodeURIComponent(historyToken!)}`);
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayOnWallOfHeroes: vars.displayOnWallOfHeroes,
          displayName: vars.displayName,
          ...(vars.memorialShowDonorName !== undefined ? { memorialShowDonorName: vars.memorialShowDonorName } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Failed to update (${res.status})`;
        try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ subscription: { id: string; displayOnWallOfHeroes: boolean; displayName: string | null; memorialShowDonorName?: boolean } }>;
    },
    onSuccess: (data) => {
      // Reconcile the optimistic cache with the authoritative server state for
      // memorialShowDonorName so the donor portal toggle never drifts. Falls
      // back to a full history refetch if the server didn't echo the field.
      const queryKey = ['/api/vip-portal/history', historyToken];
      const cached = queryClient.getQueryData<VipHistoryResponse>(queryKey);
      const echoed = data?.subscription;
      if (cached && echoed && echoed.id) {
        queryClient.setQueryData<VipHistoryResponse>(queryKey, {
          ...cached,
          subscriptions: cached.subscriptions.map((s) =>
            s.id === echoed.id
              ? {
                  ...s,
                  displayOnWallOfHeroes: echoed.displayOnWallOfHeroes,
                  displayName: echoed.displayName,
                  memorialShowDonorName:
                    echoed.memorialShowDonorName !== undefined
                      ? echoed.memorialShowDonorName
                      : s.memorialShowDonorName,
                }
              : s,
          ),
        });
      } else {
        queryClient.invalidateQueries({ queryKey });
      }
      // Refresh the public Wall query so the new "From {donor}" attribution
      // (or its removal) shows up immediately in any embedded preview.
      queryClient.invalidateQueries({ queryKey: ['/api/vip-club/wall-of-heroes'] });
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
              ? {
                  ...s,
                  displayOnWallOfHeroes: vars.displayOnWallOfHeroes,
                  displayName: vars.displayOnWallOfHeroes ? vars.displayName : null,
                  memorialShowDonorName: vars.displayOnWallOfHeroes
                    ? (vars.memorialShowDonorName ?? s.memorialShowDonorName ?? false)
                    : false,
                }
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
  });

  const downloadAnnualSummary = (year: number) => {
    const url = buildTenantUrl(`/api/vip-portal/annual-summary/${year}?token=${encodeURIComponent(historyToken!)}`);
    window.open(url, '_blank');
  };

  const startCheckout = async () => {
    if (!selected) return;
    if (giftMode && !giftHonoreeName.trim()) {
      toast({ title: 'Honoree name required', description: 'Tell us who this gift is for.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const giftPayload = giftMode
        ? {
            honoreeName: giftHonoreeName.trim(),
            honoreeEmail: giftHonoreeEmail.trim() || undefined,
            message: giftMessage.trim() || undefined,
            announcementDate: giftAnnouncementDate || undefined,
            displayOnWall: giftDisplayOnWall,
          }
        : undefined;
      const res = await apiRequest('POST', `/api/monthly-tiers/${selected.id}/checkout`, {
        customerEmail: email || undefined,
        displayName: !giftMode && optInWall ? (displayName || undefined) : undefined,
        displayOnWallOfHeroes: giftMode ? giftDisplayOnWall : optInWall,
        ...(giftPayload ? { gift: giftPayload } : {}),
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
            RESCUE PACK
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
            <h3 className="font-semibold mb-1">Rescue Pack is being prepared</h3>
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
                    onClick={() => {
                      setSelected(tier);
                      setOptInWall(true);
                      setGiftMode(false);
                      setGiftHonoreeName("");
                      setGiftHonoreeEmail("");
                      setGiftMessage("");
                      setGiftAnnouncementDate("");
                    }}
                    data-testid={`button-join-tier-${tier.id}`}
                  >
                    Become a {tier.tierName}
                  </Button>
                  <Button
                    className="mt-2 w-full"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelected(tier);
                      setOptInWall(true);
                      setGiftMode(true);
                      setGiftHonoreeName("");
                      setGiftHonoreeEmail("");
                      setGiftMessage("");
                      setGiftAnnouncementDate("");
                    }}
                    data-testid={`button-gift-tier-${tier.id}`}
                  >
                    <Gift className="h-4 w-4 mr-2" />
                    Gift this membership
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
              Already a Rescue Pack donor? Re-download past tax receipts or your year-end giving summary anytime.
            </p>
          </div>

          {!historyToken && (
            <Card className="p-6 max-w-md mx-auto" data-testid="card-history-request">
              {linkRequestSent ? (
                <div className="text-center space-y-3">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
                  <h3 className="font-semibold">Check your inbox</h3>
                  <p className="text-sm text-muted-foreground">
                    If a Rescue Pack donor account exists for <span className="font-medium">{historyEmail}</span>, we just sent a secure link that lets you view and download your giving history.
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
              <VipGamePerk token={historyToken} />
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
                            {sub.giftHonoreeName && (
                              <div className="mt-1 flex items-center gap-2 flex-wrap" data-testid={`gift-label-${sub.id}`}>
                                <Badge variant="outline" className="gap-1">
                                  <Gift className="h-3 w-3" />
                                  Gift in honor of {sub.giftHonoreeName}
                                </Badge>
                                {sub.giftAnnouncementSentAt ? (
                                  <span className="text-xs text-muted-foreground">Announced {formatDateShort(sub.giftAnnouncementSentAt)}</span>
                                ) : sub.giftAnnouncementDate ? (
                                  <span className="text-xs text-muted-foreground">Announces {formatDateShort(sub.giftAnnouncementDate)}</span>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditGift(sub);
                                    setEditGiftHonoree(sub.giftHonoreeName || '');
                                    setEditGiftEmail(sub.giftHonoreeEmail || '');
                                    setEditGiftMessage(sub.giftMessage || '');
                                    setEditGiftDate(sub.giftAnnouncementDate ? new Date(sub.giftAnnouncementDate).toISOString().slice(0, 10) : '');
                                  }}
                                  data-testid={`button-edit-gift-${sub.id}`}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                {sub.giftHonoreeEmail && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={giftResendMutation.isPending && giftResendMutation.variables === sub.id}
                                    onClick={() => giftResendMutation.mutate(sub.id)}
                                    data-testid={`button-resend-gift-${sub.id}`}
                                  >
                                    {giftResendMutation.isPending && giftResendMutation.variables === sub.id
                                      ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      : <Send className="h-3 w-3 mr-1" />}
                                    Re-send announcement
                                  </Button>
                                )}
                              </div>
                            )}
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
                              onChange={(displayOnWallOfHeroes, displayName, opts) =>
                                wallOptInMutation.mutate({ subscriptionId: sub.id, displayOnWallOfHeroes, displayName, memorialShowDonorName: opts?.memorialShowDonorName })
                              }
                              vipToken={historyToken}
                              onMemorialChanged={() => {
                                queryClient.invalidateQueries({ queryKey: ['/api/vip-portal/history', historyToken] });
                                queryClient.invalidateQueries({ queryKey: ['/api/vip-club/wall-of-heroes'] });
                              }}
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
                        Let {rescueName} celebrate your support publicly. Only the name you choose and your tier appear — never your email or amount.
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
                        Yes, show my name on the public Wall of Heroes for {rescueName}.
                      </Label>
                    </div>

                    {effectiveWallOptIn && (
                      <div className="space-y-1.5 pl-6">
                        <Label htmlFor="wall-display-name" className="text-sm">
                          Name to display on our public Wall of Heroes
                        </Label>
                        <Input
                          id="wall-display-name"
                          value={effectiveWallName}
                          onChange={(e) => setWallNameDraft(e.target.value)}
                          placeholder={historyData.donor.name?.split(' ')[0] || 'How you want to be recognized'}
                          maxLength={60}
                          data-testid="input-wall-display-name"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use your first name, your family name, a business name, or a memorial — for example, "The Smith Family" or "In memory of Jojo". If you leave this blank, the public Wall will show your first name plus your last initial (for example, "Sarah J.").
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

              {/* Bounced ACH bank transfers — split out of the in-progress
                  list into a high-visibility "please try again" callout. The
                  webhook silently deletes the optimistically-credited donation
                  row on bounce, so without this callout the donor sees their
                  gift disappear with no explanation. The "Try again" button
                  routes them back to the right surface (campaign / vip /
                  general donate) for a card or different-bank retry. */}
              {(() => {
                const bouncedPayments = (historyData.pendingPayments || []).filter(
                  (p) => p.status === 'failed'
                );
                const inflightPayments = (historyData.pendingPayments || []).filter(
                  (p) => p.status !== 'failed'
                );
                const retryPathFor = (p: VipHistoryPendingPayment) =>
                  p.isRecurring ? '/vip-club' : '/donate';
                return (
                  <>
                    {bouncedPayments.length > 0 && (
                      <Card
                        className="p-6 border-destructive/40 bg-destructive/5"
                        data-testid="card-bounced-bank-transfers"
                      >
                        <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          Bank transfer bounced — please try again
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Your bank wasn't able to complete the transfer below, so the gift didn't go through. This can happen when there aren't enough funds, the account was closed, or the bank details were entered incorrectly. You can retry with a card or a different bank account in just a moment.
                        </p>
                        <div className="divide-y">
                          {bouncedPayments.map((p) => (
                            <div
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-3 py-3"
                              data-testid={`row-bounced-payment-${p.id}`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium" data-testid={`text-bounced-date-${p.id}`}>
                                    {formatDateShort(p.date)}
                                  </span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-semibold" data-testid={`text-bounced-amount-${p.id}`}>
                                    {formatMoney(p.amount)}
                                  </span>
                                  {p.isRecurring && (
                                    <Badge variant="secondary" data-testid={`badge-bounced-recurring-${p.id}`}>
                                      Monthly
                                    </Badge>
                                  )}
                                  <Badge variant="destructive" data-testid={`badge-bounced-status-${p.id}`}>
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Bank declined
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => setLocation(retryPathFor(p))}
                                data-testid={`button-retry-bounced-${p.id}`}
                              >
                                Try again
                              </Button>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Bank-transfer (ACH) payments waiting on bank clearance.
                        These don't move into "Past donations" until the transfer
                        has actually settled (4–5 business days). Surfaced here so
                        donors can see we received their gift even though Stripe
                        hasn't finalised it yet. */}
                    {inflightPayments.length > 0 && (
                      <Card className="p-6 border-amber-500/40">
                        <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                          Bank transfers in progress
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          These gifts were initiated and are waiting on your bank to clear (typically 4–5 business days). They'll move into your past donations and be eligible for a tax receipt as soon as they settle.
                        </p>
                        <div className="divide-y">
                          {inflightPayments.map((p) => (
                            <div
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-3 py-3"
                              data-testid={`row-pending-payment-${p.id}`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium" data-testid={`text-pending-date-${p.id}`}>
                                    {formatDateShort(p.date)}
                                  </span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-semibold" data-testid={`text-pending-amount-${p.id}`}>
                                    {formatMoney(p.amount)}
                                  </span>
                                  {p.isRecurring && (
                                    <Badge variant="secondary" data-testid={`badge-pending-recurring-${p.id}`}>Monthly</Badge>
                                  )}
                                </div>
                                {p.status === 'pending' && p.expectedClearDate && (
                                  <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-pending-clear-date-${p.id}`}>
                                    Expected to clear by {formatDateShort(p.expectedClearDate)}
                                  </p>
                                )}
                              </div>
                              <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-500" data-testid={`badge-pending-status-${p.id}`}>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Awaiting bank clearance
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </>
                );
              })()}

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
                      <DonationHistoryRow
                        key={d.id}
                        donation={d}
                        onDownloadReceipt={downloadReceipt}
                        formatMoney={formatMoney}
                        formatDateShort={formatDateShort}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Wall of Heroes — featured strip (links to full /wall-of-heroes page) */}
      {heroes.length > 0 && (
        <div className="border-t bg-muted/30">
          <div className="container max-w-5xl mx-auto py-12 px-4 sm:px-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl sm:text-3xl font-bold mb-2">Our Wall of Heroes</h2>
              <p className="text-sm text-muted-foreground">
                {heroes.length} sustaining {heroes.length === 1 ? 'donor is' : 'donors are'} powering our mission every month. Thank you.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mb-6" data-testid="wall-of-heroes">
              {heroes.slice(0, 18).map((hero, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-sm py-1.5 px-3"
                  data-testid={`hero-badge-${i}`}
                >
                  {hero.displayName || hero.firstName || "Anonymous"}
                  {hero.tierName && <span className="ml-1.5 opacity-70">· {hero.tierName}</span>}
                </Badge>
              ))}
            </div>
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => setLocation('/wall-of-heroes')}
                data-testid="link-see-all-heroes"
              >
                See all {heroes.length} heroes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setSubmitting(false); setGiftMode(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {giftMode ? <>Gift the {selected?.tierName} Tier</> : <>Join the {selected?.tierName} Tier</>}
            </DialogTitle>
            <DialogDescription>
              {giftMode
                ? <>You'll be charged ${selected ? (selected.amount / 100).toFixed(0) : ''}/month in honor of someone special. Cancel anytime.</>
                : <>You'll be charged ${selected ? (selected.amount / 100).toFixed(0) : ''}/month and can cancel anytime.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* ACH bank-transfer nudge — appears for tiers at or above the
                monthly ACH threshold ($50/mo). The actual payment-method
                enablement happens server-side; this is just a heads-up so
                higher-tier donors know they can use their bank account and
                the rescue keeps more of every recurring gift. */}
            {selected && isAchEligible({
              surface: 'vip',
              amountCents: selected.amount,
              isRecurring: true,
            }) && (
              <div
                className="flex items-start gap-3 p-3 rounded-md border bg-muted/40"
                data-testid="ach-nudge-vip"
              >
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {achNudgeCopy('vip', true)}
                </p>
              </div>
            )}
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
            {giftMode ? (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Gift className="h-4 w-4 text-primary" />
                  Honoree details
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gift-honoree-name" className="text-xs">Honoree name <span className="text-destructive">*</span></Label>
                  <Input
                    id="gift-honoree-name"
                    value={giftHonoreeName}
                    onChange={(e) => setGiftHonoreeName(e.target.value)}
                    placeholder="e.g. Aunt Margaret"
                    maxLength={120}
                    data-testid="input-gift-honoree-name"
                  />
                  <p className="text-xs text-muted-foreground">Will appear on the Wall of Heroes as "In honor of {giftHonoreeName.trim() || '[Name]'}".</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gift-honoree-email" className="text-xs">Honoree email (optional)</Label>
                  <Input
                    id="gift-honoree-email"
                    type="email"
                    value={giftHonoreeEmail}
                    onChange={(e) => setGiftHonoreeEmail(e.target.value)}
                    placeholder="honoree@example.com"
                    data-testid="input-gift-honoree-email"
                  />
                  <p className="text-xs text-muted-foreground">If you provide an email, we'll quietly let them know you've honored them — we never reveal the amount.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gift-message" className="text-xs">Personal note (optional)</Label>
                  <textarea
                    id="gift-message"
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    placeholder="Add a few words to share with them"
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    data-testid="input-gift-message"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gift-announcement-date" className="text-xs">Announcement date (optional)</Label>
                  <Input
                    id="gift-announcement-date"
                    type="date"
                    value={giftAnnouncementDate}
                    onChange={(e) => setGiftAnnouncementDate(e.target.value)}
                    data-testid="input-gift-announcement-date"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to send right away. Pick a future date for birthdays, anniversaries, or holidays.</p>
                </div>
                <div className="flex items-start gap-2 pt-1 border-t">
                  <Checkbox
                    id="gift-wall-optin"
                    checked={giftDisplayOnWall}
                    onCheckedChange={(v) => setGiftDisplayOnWall(!!v)}
                    data-testid="checkbox-gift-wall-optin"
                  />
                  <Label htmlFor="gift-wall-optin" className="text-sm leading-snug font-normal cursor-pointer">
                    Show "In honor of {giftHonoreeName.trim() || '[Name]'}" on the public Wall of Heroes
                  </Label>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="vip-wall-optin"
                    checked={optInWall}
                    onCheckedChange={(v) => setOptInWall(!!v)}
                    data-testid="checkbox-wall-optin"
                  />
                  <Label htmlFor="vip-wall-optin" className="text-sm leading-snug font-normal cursor-pointer">
                    Show my name on the public Wall of Heroes
                  </Label>
                </div>
                {optInWall && (
                  <div className="space-y-1 pl-6">
                    <Label htmlFor="vip-display-name" className="text-xs">
                      Name to display on our public Wall of Heroes
                    </Label>
                    <Input
                      id="vip-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Sarah, The Smith Family, In memory of Jojo"
                      maxLength={60}
                      data-testid="input-vip-display-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use your first name, your family name, a business name, or a memorial — for example, "The Smith Family" or "In memory of Jojo". If you leave this blank, the public Wall will show your first name plus your last initial (for example, "Sarah J.").
                    </p>
                  </div>
                )}
              </div>
            )}
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

      {/* Edit gift details dialog (Task #197) */}
      <Dialog open={!!editGift} onOpenChange={(o) => { if (!o) setEditGift(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit gift details</DialogTitle>
            <DialogDescription>
              Update who this monthly gift honors. Wall of Heroes recognition will update automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-gift-honoree" className="text-xs">Honoree name</Label>
              <Input
                id="edit-gift-honoree"
                value={editGiftHonoree}
                onChange={(e) => setEditGiftHonoree(e.target.value)}
                maxLength={120}
                data-testid="input-edit-gift-honoree"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-gift-email" className="text-xs">Honoree email (optional)</Label>
              <Input
                id="edit-gift-email"
                type="email"
                value={editGiftEmail}
                onChange={(e) => setEditGiftEmail(e.target.value)}
                data-testid="input-edit-gift-email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-gift-message" className="text-xs">Personal note (optional)</Label>
              <textarea
                id="edit-gift-message"
                value={editGiftMessage}
                onChange={(e) => setEditGiftMessage(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-md border bg-background p-2 text-sm"
                data-testid="input-edit-gift-message"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-gift-date" className="text-xs">Announcement date (optional)</Label>
              <Input
                id="edit-gift-date"
                type="date"
                value={editGiftDate}
                onChange={(e) => setEditGiftDate(e.target.value)}
                data-testid="input-edit-gift-date"
              />
            </div>
            <Button
              className="w-full"
              disabled={giftEditMutation.isPending || !editGiftHonoree.trim()}
              onClick={() => editGift && giftEditMutation.mutate({
                subscriptionId: editGift.id,
                honoreeName: editGiftHonoree.trim(),
                honoreeEmail: editGiftEmail.trim(),
                message: editGiftMessage.trim(),
                announcementDate: editGiftDate,
              })}
              data-testid="button-save-edit-gift"
            >
              {giftEditMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Welcome Dialog */}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Welcome to the Rescue Pack!
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
