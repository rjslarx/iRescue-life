import { useState, useEffect, type CSSProperties } from "react";
import { useFundraisingFeeQuote } from "@/hooks/use-fundraising-fee-quote";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Heart,
  Users,
  Clock,
  Loader2,
  TrendingUp,
  Target,
  ArrowLeft,
  Share2,
  X,
} from "lucide-react";
import type { Tenant, PeerCampaign, CampaignParticipant } from "@shared/schema";
import { getAvatarIcon } from "@/lib/participant-avatars";

const PRESET_AMOUNTS = [1000, 2500, 5000, 10000];

function useCampaignTheme(campaign: PeerCampaign | null | undefined) {
  const pc = campaign?.primaryColor;
  const ac = campaign?.accentColor;
  const hasTheme = !!(pc || ac);
  const themeStyle: CSSProperties = {};
  if (pc) (themeStyle as Record<string, string>)["--campaign-primary"] = pc;
  if (ac) (themeStyle as Record<string, string>)["--campaign-accent"] = ac;
  return { hasTheme, themeStyle, primaryColor: pc, accentColor: ac };
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface ParticipantPageData {
  participant: CampaignParticipant & { totalRaised: number; donationCount: number };
  campaign: PeerCampaign;
  donations: { donorName: string; amount: number; message: string | null; isAnonymous: boolean; pledgeType: string; pledgePerUnit: number | null; createdAt: string }[];
}

export default function ParticipantSubPage() {
  const params = useParams<{ slug: string; participantId: string }>();
  const { slug, participantId } = params;
  const { toast } = useToast();

  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [coverFees, setCoverFees] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(2500);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pledgePerUnit, setPledgePerUnit] = useState("");
  const urlParams = new URLSearchParams(window.location.search);
  const isSocialSource = urlParams.get("source") === "social";
  const [showCheckout, setShowCheckout] = useState(isSocialSource);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant"],
  });

  const { data, isLoading } = useQuery<ParticipantPageData>({
    queryKey: ["/api/peer-campaigns", slug, "participant", participantId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/peer-campaigns/${slug}/participant/${participantId}`);
      if (!res.ok) throw new Error("Failed to fetch participant");
      return res.json();
    },
    enabled: !!slug && !!participantId,
  });

  useSEO({
    title: data ? `Sponsor ${data.participant.displayName} — ${data.campaign.campaignTitle}` : "Loading...",
    description: data ? `Support ${data.participant.displayName} in ${data.campaign.campaignTitle}` : "",
  });

  const feeQuote = useFundraisingFeeQuote(data?.campaign ? `/api/peer-campaigns/${slug}/fee-quote` : undefined,
    showCustom ? Math.round(Number(customAmount) * 100) : (selectedAmount ?? 0), coverFees);

  const checkoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await feeQuote.checkout(`/api/peer-campaigns/${slug}/checkout`, {
        amount,
        donorName: donorName.trim() || "Anonymous",
        donorEmail: donorEmail.trim() || undefined,
        isAnonymous,
        donorCoversFees: coverFees,
        participantId,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.url) window.location.href = result.url;
    },
    onError: (error: Error) => {
      toast({ title: "Review checkout", description: error.message, variant: "destructive" });
    },
  });

  const pledgeMutation = useMutation({
    mutationFn: async (pledgeAmountCents: number) => {
      const res = await apiRequest("POST", `/api/peer-campaigns/${slug}/pledge`, {
        donorName: donorName.trim() || "Anonymous",
        donorEmail: donorEmail.trim() || undefined,
        pledgePerUnit: pledgeAmountCents,
        isAnonymous,
        participantId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pledge recorded!", description: "Thank you for your pledge." });
      setShowCheckout(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not submit pledge.", variant: "destructive" });
    },
  });

  const handleDonate = () => {
    const amountCents = showCustom ? Math.round(parseFloat(customAmount) * 100) : selectedAmount;
    if (!amountCents || amountCents < 100) return;
    checkoutMutation.mutate(amountCents);
  };

  const handlePledge = () => {
    const perUnitCents = Math.round(parseFloat(pledgePerUnit) * 100);
    if (!perUnitCents || perUnitCents < 100) return;
    pledgeMutation.mutate(perUnitCents);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader tenant={tenantData?.tenant} />
        <div className="max-w-lg mx-auto p-6 space-y-4">
          <Skeleton className="h-32 w-32 rounded-full mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader tenant={tenantData?.tenant} />
        <div className="max-w-lg mx-auto p-6 text-center space-y-4">
          <h1 className="text-xl font-bold" data-testid="text-participant-not-found">Participant not found</h1>
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-go-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const { participant, campaign, donations } = data;
  const isUnitBased = campaign.goalType === "units";
  const unitLabel = campaign.goalUnitLabel || "units";
  const campaignEnded = campaign.endsAt && new Date(campaign.endsAt as unknown as string).getTime() < Date.now();
  const canDonate = campaign.isActive && !campaignEnded && campaign.status !== "completed";
  const AvatarIcon = getAvatarIcon(participant.avatarType);
  const masterUrl = window.location.pathname.replace(`/p/${participantId}`, "");
  const { hasTheme, themeStyle, primaryColor: themePrimary, accentColor: themeAccent } = useCampaignTheme(campaign);

  const goalTarget = campaign.goalTarget || 0;
  const progressPercent = isUnitBased
    ? (goalTarget > 0 ? Math.min(100, (participant.currentUnits / goalTarget) * 100) : 0)
    : (goalTarget > 0 ? Math.min(100, (participant.totalRaised / goalTarget) * 100) : 0);

  const handleShare = () => {
    const shareUrl = window.location.href.replace(/[?&]source=social/, "");
    if (navigator.share) {
      navigator.share({ title: `Sponsor ${participant.displayName}`, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast({ title: "Link copied!" });
      });
    }
  };

  const CheckoutForm = ({ inline }: { inline?: boolean }) => (
    <div className={`space-y-4 ${inline ? "" : "animate-in slide-in-from-bottom"}`} data-testid="participant-checkout-form">
      {!inline && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Sponsor {participant.displayName}</h3>
          <Button size="icon" variant="ghost" onClick={() => setShowCheckout(false)} data-testid="button-close-checkout">
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}
      <div className="space-y-3">
        <Input placeholder="Your name" value={donorName} onChange={(e) => setDonorName(e.target.value)} data-testid="participant-input-name" />
        <Input type="email" placeholder="Email (optional)" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} data-testid="participant-input-email" />
        <div className="flex items-center gap-2">
          <Checkbox id="p-anon" checked={isAnonymous} onCheckedChange={(c) => setIsAnonymous(c === true)} data-testid="participant-checkbox-anon" />
          <label htmlFor="p-anon" className="text-sm text-muted-foreground cursor-pointer">Donate anonymously</label>
        </div>
      </div>

      {isUnitBased && (
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input type="number" min="1" step="1" placeholder={`Amount per ${unitLabel}`} value={pledgePerUnit} onChange={(e) => setPledgePerUnit(e.target.value)} className="pl-7 text-lg" data-testid="participant-input-pledge" />
          </div>
          <Button size="lg" className="w-full gap-2" style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined} onClick={handlePledge} disabled={pledgeMutation.isPending || !pledgePerUnit || parseFloat(pledgePerUnit) < 1} data-testid="participant-button-pledge">
            {pledgeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Target className="h-5 w-5" />}
            {pledgeMutation.isPending ? "Submitting..." : `Pledge per ${unitLabel}`}
          </Button>
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-muted" />
            <span className="px-3 text-xs text-muted-foreground">or one-time donation</span>
            <div className="flex-grow border-t border-muted" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {PRESET_AMOUNTS.map((amt) => (
            <Button key={amt} variant={!showCustom && selectedAmount === amt ? "default" : "outline"} onClick={() => { setSelectedAmount(amt); setShowCustom(false); }} data-testid={`participant-amount-${amt}`}>
              ${amt / 100}
            </Button>
          ))}
        </div>
        <Button variant={showCustom ? "default" : "outline"} className="w-full" onClick={() => setShowCustom(true)} data-testid="participant-custom-amount">Custom</Button>
        {showCustom && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input type="number" min="1" step="0.01" placeholder="Enter amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="pl-7 text-lg" data-testid="participant-input-custom" />
          </div>
        )}
        {(feeQuote.data?.policy ?? campaign.feePolicy) === "optional" && <div className="flex items-center gap-2">
          <Checkbox id="p-fees" checked={coverFees} onCheckedChange={(c) => setCoverFees(c === true)} data-testid="participant-checkbox-fees" />
          <label htmlFor="p-fees" className="text-sm text-muted-foreground cursor-pointer">Cover platform and estimated processing fees</label>
        </div>}
        <p>Total: {feeQuote.data ? `$${(feeQuote.data.totalCents / 100).toFixed(2)}` : "Calculating…"}</p>
        {feeQuote.data?.covered && <p className="text-sm">Includes ${(feeQuote.data.feeContributionCents / 100).toFixed(2)} in fee coverage.</p>}
        {(feeQuote.data?.policy ?? campaign.feePolicy) === "required" && <p className="text-sm">Fee coverage is required and included above.</p>}
        <p className="text-xs text-muted-foreground">Processing is an estimate; actual costs may vary.</p>
        {feeQuote.isError && <button type="button" onClick={() => feeQuote.refetch()}>Could not calculate fees. Try again</button>}
        <Button size="lg" className="w-full gap-2" style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined} onClick={handleDonate} disabled={!feeQuote.data || feeQuote.isFetching || feeQuote.isError || checkoutMutation.isPending || (!showCustom && !selectedAmount) || (showCustom && (!customAmount || parseFloat(customAmount) < 1))} data-testid="participant-button-donate">
          {checkoutMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className="h-5 w-5" />}
          {checkoutMutation.isPending ? "Processing..." : "Donate Now"}
        </Button>
      </div>
    </div>
  );

  if (isSocialSource) {
    return (
      <div className="min-h-screen bg-background flex flex-col" style={hasTheme ? themeStyle : undefined} data-testid="participant-sub-page-social">
        <div className="relative aspect-[9/16] max-h-[45vh] w-full flex flex-col items-center justify-center overflow-hidden" style={themePrimary ? { backgroundColor: `${themePrimary}1a` } : { backgroundColor: "hsl(var(--primary) / 0.1)" }}>
          <div className="absolute inset-0" style={themePrimary ? { background: `linear-gradient(to bottom, transparent, ${themePrimary}33)` } : { background: "linear-gradient(to bottom, transparent, hsl(var(--background) / 0.8))" }} />
          <div className="relative z-10 text-center space-y-3 px-4">
            <div className="w-20 h-20 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center mx-auto">
              <AvatarIcon className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold" data-testid="text-participant-name">{participant.displayName}</h1>
            <p className="text-sm text-muted-foreground">{campaign.campaignTitle}</p>
            <div className="flex items-center justify-center gap-3 text-sm">
              <span className="font-bold">${(participant.totalRaised / 100).toLocaleString()} raised</span>
              <span className="text-muted-foreground">{participant.donationCount} sponsors</span>
            </div>
            {goalTarget > 0 && (
              <div className="w-48 mx-auto space-y-1" data-testid="social-participant-progress-bar">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progressPercent)}%`, backgroundColor: themePrimary || "hsl(var(--primary))" }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">{Math.round(progressPercent)}% of goal</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-4">
          {canDonate && <CheckoutForm inline />}
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={handleShare} data-testid="button-share-participant">
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" asChild>
              <a href={masterUrl} data-testid="link-back-campaign">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Full Campaign
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" style={hasTheme ? themeStyle : undefined} data-testid="participant-sub-page">
      <PublicHeader tenant={tenantData?.tenant} />

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-6">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto" style={themePrimary ? { backgroundColor: `${themePrimary}1a` } : { backgroundColor: "hsl(var(--primary) / 0.1)" }} data-testid="participant-avatar">
            <AvatarIcon className="h-12 w-12" style={themePrimary ? { color: themePrimary } : { color: "hsl(var(--primary))" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-participant-name">{participant.displayName}</h1>
            <a href={masterUrl} className="text-sm text-primary hover:underline" data-testid="link-back-campaign">
              <ArrowLeft className="h-3 w-3 inline mr-1" />
              {campaign.campaignTitle}
            </a>
          </div>
        </div>

        <Card data-testid="card-participant-progress">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              {isUnitBased ? (
                <>
                  <span className="text-lg font-bold" data-testid="text-participant-units">
                    {participant.currentUnits} {unitLabel}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ${(participant.totalRaised / 100).toLocaleString()} pledged
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-bold" data-testid="text-participant-raised">
                    ${(participant.totalRaised / 100).toLocaleString()} raised
                  </span>
                </>
              )}
            </div>
            {goalTarget > 0 && (
              <div className="space-y-1" data-testid="participant-progress-bar">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progressPercent)}%`, backgroundColor: themePrimary || "hsl(var(--primary))" }} />
                </div>
                <p className="text-xs text-muted-foreground text-right">{Math.round(progressPercent)}% of goal</p>
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {participant.donationCount} {participant.donationCount === 1 ? "sponsor" : "sponsors"}
              </span>
              {isUnitBased && (
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {participant.currentUnits} {unitLabel}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {donations.length > 0 && (
          <Card data-testid="card-participant-donations">
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold text-sm">Recent Sponsors</h3>
              <div className="space-y-2">
                {donations.slice(0, 10).map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0" data-testid={`donation-row-${i}`}>
                    <div>
                      <span className="text-sm font-medium">{d.isAnonymous ? "Anonymous" : d.donorName}</span>
                      {d.message && <p className="text-xs text-muted-foreground italic">"{d.message}"</p>}
                    </div>
                    <span className="text-sm font-bold shrink-0">
                      {d.pledgeType === "per_unit" && d.pledgePerUnit
                        ? `$${(d.pledgePerUnit / 100).toFixed(0)}/${unitLabel}`
                        : `$${(d.amount / 100).toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {canDonate && (
        <>
          {showCheckout && (
            <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={(e) => { if (e.target === e.currentTarget) setShowCheckout(false); }}>
              <div className="w-full max-w-lg mx-auto bg-background rounded-t-2xl p-5 pb-8" data-testid="participant-checkout-sheet">
                <CheckoutForm />
              </div>
            </div>
          )}

          <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 z-30" data-testid="participant-sticky-bar">
            <div className="max-w-lg mx-auto">
              <Button size="lg" className="w-full gap-2 h-14 text-lg" style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined} onClick={() => setShowCheckout(true)} data-testid="participant-button-sponsor">
                <Heart className="h-6 w-6" />
                Sponsor {participant.displayName}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
