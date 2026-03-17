import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import { SiFacebook } from "react-icons/si";
import type { Tenant, PeerCampaign, PeerCampaignDonation, PeerCampaignUpdate } from "@shared/schema";

const PublicCampaignPage = lazy(() => import("@/pages/PublicCampaignPage"));

interface CampaignPublicData {
  campaign: PeerCampaign;
  donations: (Pick<PeerCampaignDonation, "donorName" | "amount" | "message" | "isAnonymous" | "pledgeType" | "pledgePerUnit" | "createdAt">)[];
  updates: PeerCampaignUpdate[];
  animal: { id: string; name: string; species: string; breed: string | null; photoUrls: string[] | null } | null;
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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({ title: "Link copied", description: "Campaign link copied to your clipboard." });
    });
  };

  const handleShareFacebook = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
  };

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const campaign = data?.campaign;
  const donations = data?.donations || [];
  const updates = data?.updates || [];
  const animal = data?.animal;

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

  const campaignEnded = campaign.endsAt && new Date(campaign.endsAt as unknown as string).getTime() < Date.now();
  const canDonate = campaign.isActive && !campaignEnded && campaign.status !== "completed";

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {campaign.coverImageUrl && (
        <div className="relative w-full h-[40vh] min-h-[280px] max-h-[450px]">
          <img
            src={campaign.coverImageUrl}
            alt={campaign.campaignTitle}
            className="w-full h-full object-cover"
            data-testid="img-campaign-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
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
            <Progress value={progressPercentage} className="h-4" data-testid="progress-bar" />
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
                        {update.imageUrl && (
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

              <Card>
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
                  </div>
                </CardContent>
              </Card>

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

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            This campaign is hosted by <strong>{campaign.creatorName}</strong> in support of{" "}
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
              {isUnitBased ? (
                <p className="font-bold text-lg truncate" data-testid="sticky-progress">
                  {currentProgress}/{goalTarget} {unitLabel}
                </p>
              ) : (
                <p className="font-bold text-lg truncate" data-testid="sticky-raised">
                  ${raisedDollars.toLocaleString()} raised
                </p>
              )}
              <Progress value={progressPercentage} className="h-2 mt-1" />
            </div>
            <Button
              size="lg"
              className="gap-2 shrink-0"
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
}) {
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
      <Button
        size="lg"
        className="w-full gap-2"
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
