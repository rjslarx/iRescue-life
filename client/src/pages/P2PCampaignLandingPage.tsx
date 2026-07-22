import { useState, useEffect, lazy, Suspense, type CSSProperties } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { getThemeBackgroundStyle } from "@/lib/campaignThemes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Heart,
  Users,
  Clock,
  Share2,
  Copy,
  Loader2,
  TrendingUp,
  Target,
  Calendar,
  QrCode,
  X,
  Building2,
} from "lucide-react";
import { SiFacebook } from "react-icons/si";
import type { Tenant, PeerCampaign, PeerCampaignDonation, PeerCampaignUpdate, CampaignParticipant } from "@shared/schema";
import { getAvatarIcon, getAvatarColor } from "@/lib/participant-avatars";
import { Trophy } from "lucide-react";
import { isAchEligible, achNudgeCopy } from "@shared/ach-eligibility";

const PublicCampaignPage = lazy(() => import("@/pages/PublicCampaignPage"));

interface EnrichedParticipant extends CampaignParticipant {
  totalRaised: number;
  donationCount: number;
}

interface CampaignPublicData {
  campaign: PeerCampaign;
  donations: (Pick<PeerCampaignDonation, "donorName" | "amount" | "message" | "isAnonymous" | "pledgeType" | "pledgePerUnit" | "createdAt">)[];
  updates: PeerCampaignUpdate[];
  animal: { id: string; name: string; species: string; breed: string | null; photoUrls: string[] | null } | null;
  participants?: EnrichedParticipant[];
}

const PRESET_AMOUNTS = [2000, 5000, 10000, 25000];

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

function formatDonorDisplay(d: { donorName: string; isAnonymous: boolean; pledgeType: string; pledgePerUnit: number | null; amount: number }, unitLabel?: string | null): string {
  const name = d.isAnonymous ? "Anonymous" : d.donorName;
  if (d.pledgeType === "per_unit" && d.pledgePerUnit) {
    return `${name} pledged $${(d.pledgePerUnit / 100).toFixed(0)}/${unitLabel || "unit"}`;
  }
  return `${name} donated $${(d.amount / 100).toLocaleString()}`;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|ogg|m4v)(\?.*)?$/i.test(url);
}

function useCampaignTheme(campaign: PeerCampaign | null | undefined) {
  const pc = campaign?.primaryColor;
  const ac = campaign?.accentColor;
  const hasTheme = !!(pc || ac);
  const themeStyle: CSSProperties = {};
  if (pc) (themeStyle as Record<string, string>)["--campaign-primary"] = pc;
  if (ac) (themeStyle as Record<string, string>)["--campaign-accent"] = ac;
  return { hasTheme, themeStyle, primaryColor: pc, accentColor: ac };
}

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const end = new Date(endsAt);
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-campaign-ended">
        <Clock className="h-4 w-4" />
        <span>This campaign has ended</span>
      </div>
    );
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-countdown">
      <Clock className="h-4 w-4" />
      <span>{days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`}</span>
    </div>
  );
}

function ShareSection({ campaignUrl, compact }: { campaignUrl: string; compact?: boolean }) {
  const { toast } = useToast();
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const socialUrl = campaignUrl.includes("?") ? `${campaignUrl}&source=social` : `${campaignUrl}?source=social`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(socialUrl).then(() => {
      toast({ title: "Link copied", description: "Campaign link copied with social tracking." });
    });
  };

  const handleShareFacebook = () => {
    if (navigator.share) {
      navigator.share({ url: socialUrl }).catch(() => {});
      return;
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(socialUrl)}`, "_blank", "width=600,height=400");
  };

  const handleGenerateQr = async () => {
    if (qrData) {
      setShowQr(!showQr);
      return;
    }
    setQrLoading(true);
    try {
      const res = await fetch(`/api/qr-code?url=${encodeURIComponent(socialUrl)}`);
      const data = await res.json();
      if (data.qrCode) {
        setQrData(data.qrCode);
        setShowQr(true);
      }
    } catch {
      toast({ title: "Could not generate QR code", variant: "destructive" });
    } finally {
      setQrLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-3" data-testid="section-share-compact">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          Share this Campaign
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopyLink} data-testid="button-copy-link-social">
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button variant="outline" onClick={handleShareFacebook} data-testid="button-share-facebook-social">
            <SiFacebook className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" onClick={handleGenerateQr} disabled={qrLoading} data-testid="button-generate-qr">
            {qrLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
            QR Code
          </Button>
        </div>
        {showQr && qrData && (
          <div className="flex justify-center p-4 bg-white rounded-md" data-testid="qr-code-display">
            <img src={qrData} alt="Campaign QR Code" className="w-48 h-48" />
          </div>
        )}
      </div>
    );
  }

  return (
    <Card data-testid="card-share">
      <CardContent className="pt-6 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          Share this campaign
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleShareFacebook} data-testid="button-share-facebook">
            <SiFacebook className="h-4 w-4 mr-2" />
            Facebook
          </Button>
          <Button variant="outline" onClick={handleCopyLink} data-testid="button-copy-link">
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button variant="outline" onClick={handleGenerateQr} disabled={qrLoading} data-testid="button-generate-qr">
            {qrLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
            QR Code
          </Button>
        </div>
        {showQr && qrData && (
          <div className="flex justify-center p-4 bg-white rounded-md" data-testid="qr-code-display">
            <img src={qrData} alt="Campaign QR Code" className="w-48 h-48" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignLeaderboard({
  participants,
  campaign,
  slug,
}: {
  participants: EnrichedParticipant[];
  campaign: PeerCampaign;
  slug: string;
}) {
  const [rankBy, setRankBy] = useState<"funds" | "activity">("funds");
  const [showAll, setShowAll] = useState(false);

  if (participants.length === 0) return null;

  const isUnitBased = campaign.goalType === "units";
  const unitLabel = campaign.goalUnitLabel || "units";

  const sorted = [...participants].sort((a, b) => {
    if (rankBy === "activity" && isUnitBased) {
      return b.currentUnits - a.currentUnits;
    }
    return b.totalRaised - a.totalRaised;
  });

  const podium = sorted.slice(0, 3);
  const contenders = sorted.slice(3);
  const displayContenders = showAll ? contenders : contenders.slice(0, 10);
  const leaderMax = sorted[0]
    ? (rankBy === "activity" && isUnitBased ? sorted[0].currentUnits : sorted[0].totalRaised)
    : 1;

  const basePath = window.location.pathname;
  const getParticipantUrl = (pid: string) => `${basePath}/p/${pid}`;

  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const podiumHeights = podium.length === 3 ? ["h-20", "h-28", "h-16"] : podium.length === 2 ? ["h-28", "h-20"] : ["h-28"];
  const podiumAccents = ["bg-slate-400/20", "bg-yellow-400/20", "bg-amber-700/20"];
  const podiumRanks = podium.length === 3 ? [2, 1, 3] : podium.length === 2 ? [1, 2] : [1];

  return (
    <section className="space-y-4" data-testid="section-leaderboard">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-leaderboard-heading">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </h2>
        {isUnitBased && (
          <div className="flex rounded-md border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${rankBy === "funds" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
              onClick={() => setRankBy("funds")}
              data-testid="button-rank-funds"
            >
              By Funds
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${rankBy === "activity" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
              onClick={() => setRankBy("activity")}
              data-testid="button-rank-activity"
            >
              By {unitLabel}
            </button>
          </div>
        )}
      </div>

      <div className={`grid gap-3 items-end ${podium.length >= 3 ? "grid-cols-3" : podium.length === 2 ? "grid-cols-2" : "grid-cols-1 max-w-xs mx-auto"}`} data-testid="podium-view">
        {podiumOrder.map((p, idx) => {
          const AIcon = getAvatarIcon(p.avatarType);
          const aColor = getAvatarColor(p.avatarType);
          const rank = podiumRanks[idx];
          const metric = rankBy === "activity" && isUnitBased
            ? `${p.currentUnits} ${unitLabel}`
            : `$${(p.totalRaised / 100).toLocaleString()}`;

          return (
            <div key={p.id} className="flex flex-col items-center" data-testid={`podium-participant-${p.id}`}>
              <Card className={`w-full text-center p-3 space-y-2 ${podiumAccents[idx] || ""}`}>
                <div className="flex justify-center">
                  {rank === 1 && <Trophy className="h-5 w-5 text-yellow-500 mb-1" />}
                </div>
                <div className={`w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto ${rank === 1 ? "w-16 h-16 ring-2 ring-yellow-400" : ""}`}>
                  <AIcon className={`${rank === 1 ? "h-8 w-8" : "h-6 w-6"} ${aColor}`} />
                </div>
                <p className="text-sm font-semibold truncate" data-testid={`text-podium-name-${p.id}`}>{p.displayName}</p>
                <p className="text-xs text-muted-foreground font-medium" data-testid={`text-podium-metric-${p.id}`}>{metric}</p>
                <Button size="sm" variant="outline" className="w-full" asChild data-testid={`button-sponsor-${p.id}`}>
                  <a href={getParticipantUrl(p.id)}>Sponsor</a>
                </Button>
              </Card>
              <div className={`w-full rounded-b-md ${rank === 1 ? "bg-yellow-400/30" : rank === 2 ? "bg-slate-300/30" : "bg-amber-600/20"} ${podiumHeights[idx]}`} />
            </div>
          );
        })}
      </div>

      {contenders.length > 0 && (
        <Card data-testid="contenders-list">
          <CardContent className="pt-4 space-y-1">
            {displayContenders.map((p, idx) => {
              const AIcon = getAvatarIcon(p.avatarType);
              const aColor = getAvatarColor(p.avatarType);
              const rank = idx + 4;
              const metric = rankBy === "activity" && isUnitBased ? p.currentUnits : p.totalRaised;
              const progressPct = leaderMax > 0 ? Math.min((metric / leaderMax) * 100, 100) : 0;

              return (
                <div key={p.id} className="flex items-center gap-3 py-2" data-testid={`contender-${p.id}`}>
                  <span className="text-xs text-muted-foreground w-6 text-right font-mono">{rank}</span>
                  <div className={`w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0`}>
                    <AIcon className={`h-4 w-4 ${aColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.displayName}</p>
                    <div className="w-full h-1.5 rounded-full bg-muted mt-1">
                      <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {rankBy === "activity" && isUnitBased
                      ? `${p.currentUnits} ${unitLabel}`
                      : `$${(p.totalRaised / 100).toLocaleString()}`}
                  </span>
                  <a href={getParticipantUrl(p.id)} className="text-xs text-primary hover:underline shrink-0" data-testid={`link-sponsor-${p.id}`}>
                    Sponsor
                  </a>
                </div>
              );
            })}
            {contenders.length > 10 && !showAll && (
              <Button variant="ghost" className="w-full mt-2" onClick={() => setShowAll(true)} data-testid="button-view-all-contenders">
                View All ({contenders.length} more)
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function QuickPledgeLayout({
  campaign,
  animal,
  donations,
  updates,
  rescueName,
  tenant,
  participants,
}: {
  campaign: PeerCampaign;
  animal: CampaignPublicData["animal"];
  donations: CampaignPublicData["donations"];
  updates: PeerCampaignUpdate[];
  rescueName: string;
  tenant: Tenant | undefined;
  participants?: EnrichedParticipant[];
}) {
  const { toast } = useToast();
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [coverFees, setCoverFees] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(2000);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pledgePerUnit, setPledgePerUnit] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const isUnitBased = campaign.goalType === "units";
  const unitLabel = campaign.goalUnitLabel || "units";
  const goalTarget = campaign.goalTarget || 0;
  const currentProgress = campaign.currentProgress || 0;
  const raisedCents = campaign.amountRaised || 0;
  const goalCents = campaign.goalAmount || 0;
  const raisedDollars = raisedCents / 100;
  const goalDollars = goalCents / 100;

  const progressPercentage = isUnitBased
    ? (goalTarget > 0 ? Math.min((currentProgress / goalTarget) * 100, 100) : 0)
    : (goalCents > 0 ? Math.min((raisedCents / goalCents) * 100, 100) : 0);

  const campaignEnded = campaign.endsAt && new Date(campaign.endsAt as unknown as string).getTime() < Date.now();
  const canDonate = campaign.isActive && !campaignEnded && campaign.status !== "completed";

  const firstVideoUpdate = updates.find((u) => u.videoUrl);
  const heroMedia = firstVideoUpdate?.videoUrl || campaign.coverImageUrl;
  const heroIsVideo = firstVideoUpdate?.videoUrl ? true : false;
  const { hasTheme, themeStyle, primaryColor: themePrimary, accentColor: themeAccent } = useCampaignTheme(campaign);

  const checkoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const slug = campaign.slug || campaign.id;
      const res = await apiRequest("POST", `/api/peer-campaigns/${slug}/checkout`, {
        amount,
        donorName: donorName.trim() || "Anonymous",
        donorEmail: donorEmail.trim() || undefined,
        isAnonymous,
        donorCoversFees: coverFees,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.url) window.location.href = result.url;
    },
    onError: () => {
      toast({ title: "Error", description: "Could not create checkout session.", variant: "destructive" });
    },
  });

  const pledgeMutation = useMutation({
    mutationFn: async (pledgeAmountCents: number) => {
      const slug = campaign.slug || campaign.id;
      const res = await apiRequest("POST", `/api/peer-campaigns/${slug}/pledge`, {
        donorName: donorName.trim() || "Anonymous",
        donorEmail: donorEmail.trim() || undefined,
        pledgePerUnit: pledgeAmountCents,
        isAnonymous,
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

  const campaignUrl = window.location.origin + window.location.pathname;

  return (
    <div className="min-h-screen bg-background flex flex-col relative" style={hasTheme ? themeStyle : undefined} data-testid="quick-pledge-layout">
      {(() => { const bg = getThemeBackgroundStyle((campaign as any).themeBackground, themePrimary || null); return bg ? (
        <div className="absolute inset-0 pointer-events-none opacity-[0.22] dark:opacity-[0.28]" style={bg} aria-hidden="true" data-testid="theme-background-pattern-quick" />
      ) : null; })()}
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
        {heroMedia && (
          <div className="relative w-full" style={{ aspectRatio: "9/16", maxHeight: "60vh" }}>
            {heroIsVideo ? (
              <video
                src={heroMedia}
                controls
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover rounded-b-xl"
                data-testid="quick-pledge-hero-video"
              />
            ) : (
              <img
                src={heroMedia}
                alt={campaign.campaignTitle}
                className="w-full h-full object-cover rounded-b-xl"
                data-testid="quick-pledge-hero-image"
              />
            )}
            <div className="absolute inset-0 rounded-b-xl" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent, transparent)" }} />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              {isUnitBased && (
                <Badge variant="secondary" className="mb-2" data-testid="badge-quick-unit">
                  <Target className="h-3 w-3 mr-1" />
                  {unitLabel} Challenge
                </Badge>
              )}
              <h1 className="text-xl font-bold text-white leading-tight" data-testid="quick-pledge-title">
                {campaign.campaignTitle}
              </h1>
              <p className="text-white/80 text-sm mt-1">
                by {campaign.creatorName}
                {animal && <span> for {animal.name}</span>}
              </p>
            </div>
          </div>
        )}

        {!heroMedia && (
          <div className="p-4 pt-6">
            <h1 className="text-xl font-bold" data-testid="quick-pledge-title">{campaign.campaignTitle}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              by {campaign.creatorName}
              {animal && <span> for {animal.name}</span>}
            </p>
          </div>
        )}

        <div className="px-4 py-3 space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-2 justify-between">
              {isUnitBased ? (
                <>
                  <span className="text-lg font-bold" data-testid="quick-progress-current">
                    {animal?.name || "Progress"}: {currentProgress} of {goalTarget} {unitLabel}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-bold" data-testid="quick-raised">${raisedDollars.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground" data-testid="quick-goal">of ${goalDollars.toLocaleString()} goal</span>
                </>
              )}
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20" data-testid="quick-progress-bar">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progressPercentage)}%`, backgroundColor: themePrimary || "hsl(var(--primary))" }} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {progressPercentage.toFixed(0)}% {isUnitBased ? "complete" : "funded"}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {donations.length} {donations.length === 1 ? "backer" : "backers"}
              </span>
              {campaign.endsAt && <CountdownTimer endsAt={campaign.endsAt as unknown as string} />}
            </div>
          </div>

          <ShareSection campaignUrl={campaignUrl} compact />

          {participants && participants.length > 0 && (
            <CampaignLeaderboard participants={participants} campaign={campaign} slug={campaign.slug || ""} />
          )}
        </div>
      </div>

      {canDonate && (
        <>
          {showCheckout && (
            <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={(e) => { if (e.target === e.currentTarget) setShowCheckout(false); }}>
              <div className="w-full max-w-lg mx-auto bg-background rounded-t-2xl p-5 pb-8 space-y-4 animate-in slide-in-from-bottom" data-testid="quick-checkout-sheet">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Back this Campaign</h3>
                  <Button size="icon" variant="ghost" onClick={() => setShowCheckout(false)} data-testid="button-close-checkout">
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="space-y-3">
                  <Input placeholder="Your name" value={donorName} onChange={(e) => setDonorName(e.target.value)} data-testid="quick-input-name" />
                  <Input type="email" placeholder="Email (optional)" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} data-testid="quick-input-email" />
                  <div className="flex items-center gap-2">
                    <Checkbox id="quick-anon" checked={isAnonymous} onCheckedChange={(c) => setIsAnonymous(c === true)} data-testid="quick-checkbox-anon" />
                    <label htmlFor="quick-anon" className="text-sm text-muted-foreground cursor-pointer">Donate anonymously</label>
                  </div>
                </div>

                {isUnitBased ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input type="number" min="1" step="1" placeholder={`Amount per ${unitLabel}`} value={pledgePerUnit} onChange={(e) => setPledgePerUnit(e.target.value)} className="pl-7 text-lg h-12" data-testid="quick-input-pledge" />
                    </div>
                    <Button size="lg" className="w-full gap-2 h-14 text-lg" style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined} onClick={handlePledge} disabled={pledgeMutation.isPending || !pledgePerUnit || parseFloat(pledgePerUnit) < 1} data-testid="quick-button-pledge">
                      {pledgeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Target className="h-5 w-5" />}
                      {pledgeMutation.isPending ? "Submitting..." : `Pledge per ${unitLabel}`}
                    </Button>
                    <div className="relative flex items-center">
                      <div className="flex-grow border-t border-muted" />
                      <span className="px-3 text-xs text-muted-foreground">or one-time donation</span>
                      <div className="flex-grow border-t border-muted" />
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_AMOUNTS.map((amt) => (
                      <Button key={amt} variant={!showCustom && selectedAmount === amt ? "default" : "outline"} onClick={() => { setSelectedAmount(amt); setShowCustom(false); }} data-testid={`quick-amount-${amt}`}>
                        ${amt / 100}
                      </Button>
                    ))}
                  </div>
                  <Button variant={showCustom ? "default" : "outline"} className="w-full" onClick={() => setShowCustom(true)} data-testid="quick-custom-amount">Custom</Button>
                  {showCustom && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input type="number" min="1" step="0.01" placeholder="Enter amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="pl-7 text-lg h-12" data-testid="quick-input-custom" />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox id="quick-fees" checked={coverFees} onCheckedChange={(c) => setCoverFees(c === true)} data-testid="quick-checkbox-fees" />
                    <label htmlFor="quick-fees" className="text-sm text-muted-foreground cursor-pointer">Cover processing fees</label>
                  </div>
                  {isAchEligible({
                    amountCents: showCustom
                      ? (customAmount ? Math.round(parseFloat(customAmount) * 100) : 0)
                      : (selectedAmount ?? 0),
                    surface: 'p2p',
                    isRecurring: false,
                  }) && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm" data-testid="ach-nudge-p2p-quick">
                      <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">{achNudgeCopy('p2p')}</p>
                    </div>
                  )}
                  <Button size="lg" className="w-full gap-2 h-14 text-lg" style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined} onClick={handleDonate} disabled={checkoutMutation.isPending || (!showCustom && !selectedAmount) || (showCustom && (!customAmount || parseFloat(customAmount) < 1))} data-testid="quick-button-donate">
                    {checkoutMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className="h-5 w-5" />}
                    {checkoutMutation.isPending ? "Processing..." : "Donate Now"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 z-30" data-testid="quick-sticky-bar">
            <div className="max-w-lg mx-auto">
              <Button size="lg" className="w-full gap-2 h-14 text-lg" style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined} onClick={() => setShowCheckout(true)} data-testid="quick-button-open-checkout">
                <Heart className="h-6 w-6" />
                Back This Campaign
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function P2PCampaignLandingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { toast } = useToast();

  const [donateTab, setDonateTab] = useState<string>("one-time");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(5000);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [coverFees, setCoverFees] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorMessage, setDonorMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [pledgePerUnit, setPledgePerUnit] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const isSocialSource = urlParams.get("source") === "social" || urlParams.get("source") === "reels";

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant"],
  });

  const { data, isLoading } = useQuery<CampaignPublicData>({
    queryKey: ["/api/peer-campaigns", slug],
    enabled: !!slug,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", `/api/peer-campaigns/${slug}/checkout`, {
        amount,
        donorName: donorName.trim() || "Anonymous",
        donorEmail: donorEmail.trim() || undefined,
        message: donorMessage.trim() || undefined,
        isAnonymous,
        donorCoversFees: coverFees,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.url) {
        window.location.href = result.url;
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not create checkout session. Please try again.", variant: "destructive" });
    },
  });

  const pledgeMutation = useMutation({
    mutationFn: async (pledgeAmountCents: number) => {
      const res = await apiRequest("POST", `/api/peer-campaigns/${slug}/pledge`, {
        donorName: donorName.trim() || "Anonymous",
        donorEmail: donorEmail.trim() || undefined,
        pledgePerUnit: pledgeAmountCents,
        message: donorMessage.trim() || undefined,
        isAnonymous,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pledge recorded!", description: "Thank you for your pledge. You'll be contacted when the campaign ends." });
      setPledgePerUnit("");
      setDonorName("");
      setDonorEmail("");
      setDonorMessage("");
    },
    onError: () => {
      toast({ title: "Error", description: "Could not submit pledge. Please try again.", variant: "destructive" });
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

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const campaign = data?.campaign;
  const donations = data?.donations || [];
  const updates = data?.updates || [];
  const animal = data?.animal;
  const participants = data?.participants || [];

  const isUnitBased = campaign?.goalType === "units";
  const unitLabel = campaign?.goalUnitLabel || "units";
  const goalTarget = campaign?.goalTarget || 0;
  const currentProgress = campaign?.currentProgress || 0;

  const raisedCents = campaign?.amountRaised || 0;
  const goalCents = campaign?.goalAmount || 0;
  const raisedDollars = raisedCents / 100;
  const goalDollars = goalCents / 100;

  const progressPercentage = isUnitBased
    ? (goalTarget > 0 ? Math.min((currentProgress / goalTarget) * 100, 100) : 0)
    : (goalCents > 0 ? Math.min((raisedCents / goalCents) * 100, 100) : 0);

  const pledgeAmountCents = pledgePerUnit ? Math.round(parseFloat(pledgePerUnit) * 100) : 0;
  const maxPledge = pledgeAmountCents > 0 && goalTarget > 0 ? (pledgeAmountCents * goalTarget) / 100 : 0;

  const pageTitle = campaign ? campaign.campaignTitle : "Community Campaign";
  const pageDescription = campaign?.campaignStory
    ? campaign.campaignStory.slice(0, 200)
    : `Support ${rescueName} through this community campaign.`;

  useSEO({
    title: `${pageTitle} | ${rescueName}`,
    description: pageDescription,
    siteName: rescueName,
    image: campaign?.coverImageUrl || undefined,
    type: "website",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-[40vh] w-full rounded-xl mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!campaign) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug || "");
    if (isUuid) {
      return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <PublicCampaignPage />
        </Suspense>
      );
    }
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="max-w-lg mx-auto px-4 py-16 text-center">
          <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2" data-testid="text-not-found">Campaign Not Found</h2>
          <p className="text-muted-foreground mb-6">This campaign may no longer be active or the link may be incorrect.</p>
          <Button variant="outline" asChild>
            <a href="/donate" data-testid="link-donate-fallback">View Other Ways to Help</a>
          </Button>
        </main>
      </div>
    );
  }

  if (isSocialSource) {
    return (
      <QuickPledgeLayout
        campaign={campaign}
        animal={animal ?? null}
        donations={donations}
        updates={updates}
        rescueName={rescueName}
        tenant={tenant}
        participants={participants}
      />
    );
  }

  const campaignEnded = campaign.endsAt && new Date(campaign.endsAt as unknown as string).getTime() < Date.now();
  const canDonate = campaign.isActive && !campaignEnded && campaign.status !== "completed";

  const campaignUrl = window.location.origin + window.location.pathname;

  const { hasTheme, themeStyle, primaryColor: themePrimary, accentColor: themeAccent } = useCampaignTheme(campaign);
  const themeBackgroundStyle = getThemeBackgroundStyle((campaign as any).themeBackground, themePrimary || null);

  return (
    <div className="min-h-screen bg-background relative" style={hasTheme ? themeStyle : undefined}>
      {themeBackgroundStyle && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.22] dark:opacity-[0.28]" style={themeBackgroundStyle} aria-hidden="true" data-testid="theme-background-pattern" />
      )}
      <div className="relative">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {campaign.coverImageUrl && (
        <div className="w-full max-w-4xl mx-auto md:px-4 md:pt-6">
          <div className="relative overflow-hidden md:rounded-md">
          <img
            src={campaign.coverImageUrl}
            alt={campaign.campaignTitle}
            className="w-full h-auto"
            data-testid="img-campaign-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="max-w-4xl mx-auto">
              {isUnitBased && (
                <Badge variant="secondary" className="mb-3" data-testid="badge-unit-campaign">
                  <Target className="h-3 w-3 mr-1" />
                  {unitLabel} Challenge
                </Badge>
              )}
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
                data-testid="text-campaign-title"
              >
                {campaign.campaignTitle}
              </h1>
              <p className="text-white/80 mt-2 text-lg" data-testid="text-creator-name">
                by {campaign.creatorName}
                {animal && <span> for {animal.name}</span>}
              </p>
            </div>
          </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!campaign.coverImageUrl && (
          <div className="mb-8">
            {isUnitBased && (
              <Badge variant="secondary" className="mb-3" data-testid="badge-unit-campaign">
                <Target className="h-3 w-3 mr-1" />
                {unitLabel} Challenge
              </Badge>
            )}
            <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-campaign-title">
              {campaign.campaignTitle}
            </h1>
            <p className="text-muted-foreground mt-2 text-lg" data-testid="text-creator-name">
              by {campaign.creatorName}
              {animal && <span> for {animal.name}</span>}
            </p>
          </div>
        )}

        <Card className="mb-8" data-testid="card-progress-hero">
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-baseline gap-2 justify-between">
              {isUnitBased ? (
                <>
                  <span className="text-2xl font-bold" data-testid="text-progress-current">
                    {currentProgress} {unitLabel}
                  </span>
                  <span className="text-muted-foreground" data-testid="text-progress-goal">
                    of {goalTarget} {unitLabel} goal
                  </span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold" data-testid="text-raised-amount">
                    ${raisedDollars.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground" data-testid="text-goal-amount">
                    raised of ${goalDollars.toLocaleString()} goal
                  </span>
                </>
              )}
            </div>
            <div className="relative h-4 w-full overflow-hidden rounded-full bg-primary/20" data-testid="progress-bar">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, progressPercentage)}%`,
                  backgroundColor: themePrimary || "hsl(var(--primary))",
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1" data-testid="text-progress-pct">
                <TrendingUp className="h-3.5 w-3.5" />
                {progressPercentage.toFixed(0)}% {isUnitBased ? "complete" : "funded"}
              </span>
              <span className="flex items-center gap-1" data-testid="text-donor-count">
                <Users className="h-3.5 w-3.5" />
                {donations.length} {donations.length === 1 ? "backer" : "backers"}
              </span>
              {isUnitBased && (
                <span className="flex items-center gap-1" data-testid="text-raised-total">
                  <Heart className="h-3.5 w-3.5" />
                  ${raisedDollars.toLocaleString()} raised
                </span>
              )}
              {campaign.endsAt && <CountdownTimer endsAt={campaign.endsAt as unknown as string} />}
            </div>
          </CardContent>
        </Card>

        {participants.length > 0 && (
          <CampaignLeaderboard participants={participants} campaign={campaign} slug={slug || ""} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {campaign.campaignStory && (
              <section>
                <h2 className="text-xl font-semibold mb-4" data-testid="text-story-heading">
                  {animal ? `About ${animal.name}'s Journey` : "About This Campaign"}
                </h2>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/80 leading-relaxed"
                  data-testid="text-campaign-story"
                >
                  {campaign.campaignStory}
                </div>
              </section>
            )}

            {updates.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" data-testid="text-updates-heading">
                  <Calendar className="h-5 w-5" />
                  Campaign Updates ({updates.length})
                </h2>
                <div className="space-y-6">
                  {updates.map((update) => (
                    <div key={update.id} className="relative pl-6 border-l-2 border-primary/30" data-testid={`update-${update.id}`}>
                      <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-primary" />
                      <div className="space-y-2">
                        <span className="text-sm text-muted-foreground">
                          {new Date(update.createdAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                            hour: "numeric", minute: "2-digit",
                          })}
                        </span>
                        <p className="text-foreground/80 whitespace-pre-wrap" data-testid={`update-text-${update.id}`}>
                          {update.updateText}
                        </p>
                        {(update.videoUrl || (update.imageUrl && isVideoUrl(update.imageUrl))) && (
                          <div className="mt-2" style={{ aspectRatio: "9/16", maxWidth: "320px" }}>
                            <video
                              src={update.videoUrl || update.imageUrl!}
                              controls
                              playsInline
                              muted
                              autoPlay
                              className="w-full h-full object-cover rounded-md"
                              data-testid={`update-video-${update.id}`}
                            >
                              Your browser does not support the video tag.
                            </video>
                          </div>
                        )}
                        {update.imageUrl && !update.videoUrl && !isVideoUrl(update.imageUrl) && (
                          <img
                            src={update.imageUrl}
                            alt="Campaign update"
                            className="rounded-md max-w-sm w-full mt-2"
                            data-testid={`update-image-${update.id}`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {donations.length > 0 && (
              <section className="md:hidden">
                <DonorWall donors={donations} unitLabel={unitLabel} />
              </section>
            )}
          </div>

          <div className="space-y-6">
            <div className="md:sticky md:top-4 space-y-6">
              {canDonate ? (
                <Card data-testid="card-checkout">
                  <CardContent className="pt-6 space-y-5">
                    <div className="space-y-3">
                      <Input
                        placeholder="Your name"
                        value={donorName}
                        onChange={(e) => setDonorName(e.target.value)}
                        data-testid="input-donor-name"
                      />
                      <Input
                        type="email"
                        placeholder="Email (optional)"
                        value={donorEmail}
                        onChange={(e) => setDonorEmail(e.target.value)}
                        data-testid="input-donor-email"
                      />
                      <Input
                        placeholder="Leave a message (optional)"
                        value={donorMessage}
                        onChange={(e) => setDonorMessage(e.target.value)}
                        data-testid="input-donor-message"
                      />
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="anonymous"
                          checked={isAnonymous}
                          onCheckedChange={(checked) => setIsAnonymous(checked === true)}
                          data-testid="checkbox-anonymous"
                        />
                        <label htmlFor="anonymous" className="text-sm text-muted-foreground cursor-pointer">
                          Donate anonymously
                        </label>
                      </div>
                    </div>

                    {isUnitBased ? (
                      <Tabs value={donateTab} onValueChange={setDonateTab}>
                        <TabsList className="w-full">
                          <TabsTrigger value="pledge" className="flex-1" data-testid="tab-pledge">
                            Pledge Per {unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}
                          </TabsTrigger>
                          <TabsTrigger value="one-time" className="flex-1" data-testid="tab-one-time">
                            One-Time
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="pledge" className="space-y-3 mt-3">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              placeholder={`Amount per ${unitLabel}`}
                              value={pledgePerUnit}
                              onChange={(e) => setPledgePerUnit(e.target.value)}
                              className="pl-7"
                              data-testid="input-pledge-per-unit"
                            />
                          </div>
                          {pledgeAmountCents > 0 && goalTarget > 0 && (
                            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="text-max-pledge">
                              At ${(pledgeAmountCents / 100).toFixed(0)}/{unitLabel}, your maximum pledge is{" "}
                              <strong>${maxPledge.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong>
                            </p>
                          )}
                          <Button
                            size="lg"
                            className="w-full gap-2"
                            style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined}
                            onClick={handlePledge}
                            disabled={pledgeMutation.isPending || !pledgePerUnit || parseFloat(pledgePerUnit) < 1}
                            data-testid="button-pledge"
                          >
                            {pledgeMutation.isPending ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Target className="h-5 w-5" />
                            )}
                            {pledgeMutation.isPending ? "Submitting..." : "Back This Campaign"}
                          </Button>
                        </TabsContent>

                        <TabsContent value="one-time" className="space-y-3 mt-3">
                          <OneTimeDonationForm
                            selectedAmount={selectedAmount}
                            setSelectedAmount={setSelectedAmount}
                            customAmount={customAmount}
                            setCustomAmount={setCustomAmount}
                            showCustom={showCustom}
                            setShowCustom={setShowCustom}
                            coverFees={coverFees}
                            setCoverFees={setCoverFees}
                            onDonate={handleDonate}
                            isPending={checkoutMutation.isPending}
                            themeAccent={themeAccent}
                          />
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <OneTimeDonationForm
                        selectedAmount={selectedAmount}
                        setSelectedAmount={setSelectedAmount}
                        customAmount={customAmount}
                        setCustomAmount={setCustomAmount}
                        showCustom={showCustom}
                        setShowCustom={setShowCustom}
                        coverFees={coverFees}
                        setCoverFees={setCoverFees}
                        onDonate={handleDonate}
                        isPending={checkoutMutation.isPending}
                        themeAccent={themeAccent}
                      />
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card data-testid="card-checkout-closed">
                  <CardContent className="pt-6 text-center py-8">
                    <p className="text-muted-foreground text-sm" data-testid="text-campaign-inactive">
                      {campaignEnded ? "This campaign has ended." : campaign.status === "completed" ? "This campaign has reached its goal!" : "This campaign is no longer accepting donations."}
                    </p>
                  </CardContent>
                </Card>
              )}

              <ShareSection campaignUrl={campaignUrl} />

              <div className="hidden md:block">
                {donations.length > 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <DonorWall donors={donations} unitLabel={unitLabel} />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {canDonate && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 z-50"
          data-testid="sticky-donate-bar"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {isUnitBased ? (
                <p className="font-bold text-lg truncate" data-testid="sticky-progress">
                  {currentProgress}/{goalTarget} {unitLabel}
                </p>
              ) : (
                <p className="font-bold text-lg truncate" data-testid="sticky-raised">
                  ${raisedDollars.toLocaleString()} raised
                </p>
              )}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20 mt-1">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progressPercentage)}%`, backgroundColor: themePrimary || "hsl(var(--primary))" }} />
              </div>
            </div>
            <Button
              size="lg"
              className="gap-2 shrink-0"
              style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined}
              onClick={() => {
                const el = document.querySelector('[data-testid="card-checkout"]');
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              data-testid="sticky-donate-button"
            >
              <Heart className="h-5 w-5" />
              Donate
            </Button>
          </div>
        </div>
      )}

      {canDonate && <div className="md:hidden h-20" />}

      <div className="mt-12 text-center text-sm text-muted-foreground pb-8">
        <p>
          This campaign is hosted by <strong>{campaign.creatorName}</strong> in support of{" "}
          <strong>{rescueName}</strong>
        </p>
        <p className="mt-1">Donations are processed securely through Stripe.</p>
      </div>
      </div>
    </div>
  );
}

function OneTimeDonationForm({
  selectedAmount,
  setSelectedAmount,
  customAmount,
  setCustomAmount,
  showCustom,
  setShowCustom,
  coverFees,
  setCoverFees,
  onDonate,
  isPending,
  themeAccent,
}: {
  selectedAmount: number | null;
  setSelectedAmount: (a: number | null) => void;
  customAmount: string;
  setCustomAmount: (s: string) => void;
  showCustom: boolean;
  setShowCustom: (b: boolean) => void;
  coverFees: boolean;
  setCoverFees: (b: boolean) => void;
  onDonate: () => void;
  isPending: boolean;
  themeAccent?: string | null;
}) {
  const effectiveAmountCents = showCustom
    ? (customAmount ? Math.round(parseFloat(customAmount) * 100) : 0)
    : (selectedAmount ?? 0);
  const showAchNudge = isAchEligible({ amountCents: effectiveAmountCents, surface: 'p2p', isRecurring: false });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {PRESET_AMOUNTS.map((amount) => (
          <Button
            key={amount}
            variant={!showCustom && selectedAmount === amount ? "default" : "outline"}
            onClick={() => { setSelectedAmount(amount); setShowCustom(false); }}
            data-testid={`button-amount-${amount}`}
          >
            ${(amount / 100).toLocaleString()}
          </Button>
        ))}
      </div>
      <Button
        variant={showCustom ? "default" : "outline"}
        className="w-full"
        onClick={() => setShowCustom(true)}
        data-testid="button-custom-amount"
      >
        Custom Amount
      </Button>
      {showCustom && (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            type="number"
            min="1"
            step="0.01"
            placeholder="Enter amount"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="pl-7"
            data-testid="input-custom-amount"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          id="cover-fees"
          checked={coverFees}
          onCheckedChange={(checked) => setCoverFees(checked === true)}
          data-testid="checkbox-cover-fees"
        />
        <label htmlFor="cover-fees" className="text-sm text-muted-foreground cursor-pointer">
          Cover processing fees so 100% goes to the rescue
        </label>
      </div>
      {showAchNudge && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm"
          data-testid="ach-nudge-p2p"
        >
          <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-muted-foreground">{achNudgeCopy('p2p')}</p>
        </div>
      )}
      <Button
        size="lg"
        className="w-full gap-2"
        style={themeAccent ? { backgroundColor: themeAccent, borderColor: themeAccent, color: "#fff" } : undefined}
        onClick={onDonate}
        disabled={isPending || (!showCustom && !selectedAmount) || (showCustom && (!customAmount || parseFloat(customAmount) < 1))}
        data-testid="button-donate-now"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className="h-5 w-5" />}
        {isPending ? "Processing..." : "Back This Campaign"}
      </Button>
    </>
  );
}

function DonorWall({
  donors,
  unitLabel,
}: {
  donors: { donorName: string; amount: number; message: string | null; isAnonymous: boolean; pledgeType: string; pledgePerUnit: number | null; createdAt: string | Date }[];
  unitLabel: string;
}) {
  return (
    <div data-testid="section-donor-wall">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Users className="h-4 w-4" />
        Recent Backers ({donors.length})
      </h3>
      <div className="space-y-3 max-h-[320px] overflow-y-auto">
        {donors.map((d, i) => (
          <div key={i} className="flex items-start justify-between gap-2" data-testid={`donor-${i}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {formatDonorDisplay(d, unitLabel)}
              </p>
              {d.message && (
                <p className="text-xs text-muted-foreground mt-0.5 italic truncate">"{d.message}"</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {timeAgo(typeof d.createdAt === "string" ? d.createdAt : new Date(d.createdAt).toISOString())}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
