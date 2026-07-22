import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Heart, Users, Clock, Share2, Copy, Loader2 } from "lucide-react";
import type { Tenant, PeerCampaign, PeerCampaignDonation } from "@shared/schema";
import { getThemeBackgroundStyle } from "@/lib/campaignThemes";

interface PeerCampaignPublicData {
  campaign: PeerCampaign;
  donations: Pick<PeerCampaignDonation, "donorName" | "amount" | "message" | "isAnonymous" | "createdAt">[];
}

const PRESET_AMOUNTS = [1000, 2500, 5000, 10000];

function formatDonorName(name: string, isAnonymous: boolean): string {
  if (isAnonymous) return "Anonymous";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
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

function pickContrastText(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "#fff";
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#fff";
}

function ThemedProgress({ value, heightClass, themePrimary, testId }: { value: number; heightClass: string; themePrimary?: string | null; testId?: string }) {
  if (!themePrimary) {
    return <Progress value={value} className={heightClass} data-testid={testId} />;
  }
  return (
    <div className={`${heightClass} w-full rounded-full bg-primary/20 overflow-hidden`} data-testid={testId}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: themePrimary }}
      />
    </div>
  );
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
      <span>
        {days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`}
      </span>
    </div>
  );
}

export default function PeerCampaignPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { toast } = useToast();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(2500);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [coverFees, setCoverFees] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [donorMessage, setDonorMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ["/api/tenant"],
  });

  const { data, isLoading } = useQuery<PeerCampaignPublicData>({
    queryKey: ["/api/peer-campaigns", slug],
    enabled: !!slug,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", `/api/peer-campaigns/${slug}/checkout`, {
        amount,
        donorName: donorName.trim() || "Anonymous",
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
      toast({
        title: "Error",
        description: "Could not create checkout session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDonate = () => {
    const amountCents = showCustom
      ? Math.round(parseFloat(customAmount) * 100)
      : selectedAmount;
    if (!amountCents || amountCents < 100) return;
    checkoutMutation.mutate(amountCents);
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link copied",
        description: "Campaign link has been copied to your clipboard.",
      });
    });
  };

  const handleShareFacebook = () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      navigator.share({ url: shareUrl }).catch(() => {});
      return;
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "width=600,height=400");
  };

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const campaign = data?.campaign;
  const donations = (data?.donations || []).filter(
    (d: any) => d.paymentStatus === "paid" || !("paymentStatus" in d)
  );

  const raisedCents = campaign?.amountRaised || 0;
  const goalCents = campaign?.goalAmount || 0;
  const raisedDollars = raisedCents / 100;
  const goalDollars = goalCents / 100;
  const progressPercentage = goalCents > 0 ? Math.min((raisedCents / goalCents) * 100, 100) : 0;

  const pageTitle = campaign ? campaign.campaignTitle : "Community Fundraiser";
  const pageDescription = campaign?.campaignStory
    ? campaign.campaignStory.slice(0, 200)
    : `Support ${rescueName} through this community fundraiser.`;

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
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="max-w-lg mx-auto px-4 py-16 text-center">
          <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2" data-testid="text-not-found">Campaign Not Found</h2>
          <p className="text-muted-foreground mb-6">
            This fundraiser may no longer be active or the link may be incorrect.
          </p>
          <Button variant="outline" asChild>
            <a href="/donate" data-testid="link-donate-fallback">View Other Ways to Help</a>
          </Button>
        </main>
      </div>
    );
  }

  const campaignEnded = campaign.endsAt && new Date(campaign.endsAt).getTime() < Date.now();
  const canDonate = campaign.isActive && !campaignEnded;

  const themePrimary = campaign.primaryColor || null;
  const themeAccent = campaign.accentColor || null;
  const accentButtonStyle = themeAccent
    ? { backgroundColor: themeAccent, borderColor: themeAccent, color: pickContrastText(themeAccent) }
    : undefined;
  const themeBackgroundStyle = getThemeBackgroundStyle((campaign as any).themeBackground, themePrimary);

  return (
    <div className="min-h-screen bg-background relative">
      {themeBackgroundStyle && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.22] dark:opacity-[0.28]"
          style={themeBackgroundStyle}
          aria-hidden="true"
          data-testid="theme-background-pattern"
        />
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
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
                data-testid="text-campaign-title"
              >
                {campaign.campaignTitle}
              </h1>
              <p className="text-white/80 mt-2 text-lg" data-testid="text-creator-name">
                by {campaign.creatorName}
              </p>
            </div>
          </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!campaign.coverImageUrl && (
          <div className="mb-8">
            <h1
              className="text-3xl md:text-4xl font-bold"
              data-testid="text-campaign-title"
            >
              {campaign.campaignTitle}
            </h1>
            <p className="text-muted-foreground mt-2 text-lg" data-testid="text-creator-name">
              by {campaign.creatorName}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {campaign.campaignStory && (
              <section>
                <h2 className="text-xl font-semibold mb-4" data-testid="text-story-heading">
                  About This Fundraiser
                </h2>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/80 leading-relaxed"
                  data-testid="text-campaign-story"
                >
                  {campaign.campaignStory}
                </div>
              </section>
            )}

            {campaign.endsAt && (
              <CountdownTimer endsAt={campaign.endsAt as unknown as string} />
            )}

            {donations.length > 0 && (
              <section className="md:hidden">
                <RecentDonorsSection donors={donations} />
              </section>
            )}
          </div>

          <div className="space-y-6">
            <div className="md:sticky md:top-4 space-y-6">
              <Card data-testid="card-donate-action">
                <CardContent className="pt-6 space-y-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-baseline gap-1 justify-between">
                      <span className="text-2xl font-bold" data-testid="text-raised-amount">
                        ${raisedDollars.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground" data-testid="text-goal-amount">
                        raised of ${goalDollars.toLocaleString()} goal
                      </span>
                    </div>
                    <ThemedProgress value={progressPercentage} heightClass="h-3" themePrimary={themePrimary} testId="progress-bar" />
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>{progressPercentage.toFixed(0)}% funded</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {donations.length} {donations.length === 1 ? "donor" : "donors"}
                      </span>
                    </div>
                  </div>

                  {canDonate ? (
                    <>
                      <div className="space-y-3">
                        <Input
                          placeholder="Your name"
                          value={donorName}
                          onChange={(e) => setDonorName(e.target.value)}
                          data-testid="input-donor-name"
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

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {PRESET_AMOUNTS.map((amount) => (
                            <Button
                              key={amount}
                              variant={!showCustom && selectedAmount === amount ? "default" : "outline"}
                              onClick={() => {
                                setSelectedAmount(amount);
                                setShowCustom(false);
                              }}
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
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="cover-fees"
                          checked={coverFees}
                          onCheckedChange={(checked) => setCoverFees(checked === true)}
                          data-testid="checkbox-cover-fees"
                        />
                        <label htmlFor="cover-fees" className="text-sm text-muted-foreground cursor-pointer">
                          I'll cover the processing fees so 100% goes to the rescue
                        </label>
                      </div>

                      <Button
                        size="lg"
                        className="w-full gap-2"
                        style={accentButtonStyle}
                        onClick={handleDonate}
                        disabled={
                          checkoutMutation.isPending ||
                          (!showCustom && !selectedAmount) ||
                          (showCustom && (!customAmount || parseFloat(customAmount) < 1))
                        }
                        data-testid="button-donate-now"
                      >
                        {checkoutMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Heart className="h-5 w-5" />
                        )}
                        {checkoutMutation.isPending ? "Processing..." : "Donate Now"}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground text-sm" data-testid="text-campaign-inactive">
                        {campaignEnded ? "This campaign has ended." : "This campaign is no longer accepting donations."}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Share this fundraiser
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleShareFacebook} data-testid="button-share-facebook">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                    <Button variant="outline" onClick={handleCopyLink} data-testid="button-copy-link">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="hidden md:block">
                {donations.length > 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <RecentDonorsSection donors={donations} />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            This fundraiser is hosted by <strong>{campaign.creatorName}</strong> in support of{" "}
            <strong>{rescueName}</strong>
          </p>
          <p className="mt-1">Donations are processed securely through Stripe.</p>
        </div>
      </main>

      {canDonate && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 z-50"
          data-testid="sticky-donate-bar"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg truncate" data-testid="sticky-raised">
                ${raisedDollars.toLocaleString()} raised
              </p>
              <div className="mt-1">
                <ThemedProgress value={progressPercentage} heightClass="h-2" themePrimary={themePrimary} />
              </div>
            </div>
            <Button
              size="lg"
              className="gap-2 shrink-0"
              style={accentButtonStyle}
              onClick={() => {
                const el = document.querySelector('[data-testid="card-donate-action"]');
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
      </div>
    </div>
  );
}

function RecentDonorsSection({
  donors,
}: {
  donors: Pick<PeerCampaignDonation, "donorName" | "amount" | "message" | "isAnonymous" | "createdAt">[];
}) {
  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2" data-testid="text-donors-heading">
        <Users className="h-4 w-4" />
        Recent Donors
      </h3>
      <div className="space-y-3">
        {donors.map((donor, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2" data-testid={`donor-row-${idx}`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                {donor.isAnonymous ? "?" : donor.donorName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="text-sm truncate block">
                  {formatDonorName(donor.donorName, donor.isAnonymous)}
                </span>
                {donor.message && (
                  <p className="text-xs text-muted-foreground truncate">{donor.message}</p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-medium">${(donor.amount / 100).toLocaleString()}</span>
              <p className="text-xs text-muted-foreground">{timeAgo(donor.createdAt as unknown as string)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
