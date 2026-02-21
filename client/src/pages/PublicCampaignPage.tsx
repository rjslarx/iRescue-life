import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { apiRequest } from "@/lib/queryClient";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { Heart, Clock, Users, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import type { Animal, Tenant, DonationLink, CampaignContribution, CampaignUpdate } from "@shared/schema";

interface PublicCampaignData {
  campaign: DonationLink;
  animal: Animal | null;
  totalRaised: number;
  contributorCount: number;
  recentDonors: Pick<CampaignContribution, 'donorName' | 'amount' | 'isAnonymous' | 'createdAt'>[];
  updates: CampaignUpdate[];
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

export default function PublicCampaignPage() {
  const params = useParams<{ campaignId?: string; animalId?: string }>();
  const campaignId = params.campaignId;
  const animalId = params.animalId;
  const [selectedAmount, setSelectedAmount] = useState<number | null>(2500);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState<{ urls: string[]; index: number } | null>(null);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: campaignData, isLoading } = useQuery<PublicCampaignData>({
    queryKey: [`/api/public-campaign/${campaignId}`],
    enabled: !!campaignId,
  });

  const { data: legacyCampaignData, isLoading: legacyLoading } = useQuery<any>({
    queryKey: ['/api/public-emergency-campaigns'],
    enabled: !campaignId && !!animalId,
  });

  const legacyCampaign = legacyCampaignData?.campaigns?.find(
    (c: any) => c.animalId === animalId
  );

  const effectiveCampaignId = campaignId || legacyCampaign?.id;

  const { data: legacyFullData } = useQuery<PublicCampaignData>({
    queryKey: [`/api/public-campaign/${effectiveCampaignId}`],
    enabled: !campaignId && !!effectiveCampaignId,
  });

  const data = campaignData || legacyFullData;
  const loading = campaignId ? isLoading : (legacyLoading || (!legacyFullData && !!effectiveCampaignId));

  const checkoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest('POST', '/api/emergency-fund-checkout', {
        campaignId: data!.campaign.id,
        amount,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.url) {
        window.location.href = result.url;
      }
    },
  });

  const handleDonate = () => {
    const amountCents = showCustom
      ? Math.round(parseFloat(customAmount) * 100)
      : selectedAmount;
    if (!amountCents || amountCents < 100) return;
    checkoutMutation.mutate(amountCents);
  };

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const campaign = data?.campaign;
  const animal = data?.animal;
  const totalRaised = data?.totalRaised || 0;
  const goal = campaign?.goalAmount;
  const contributorCount = data?.contributorCount || 0;
  const recentDonors = data?.recentDonors || [];
  const updates = data?.updates || [];

  const raisedDollars = totalRaised / 100;
  const goalDollars = goal ? goal / 100 : null;
  const progressPercentage = goalDollars && goalDollars > 0
    ? Math.min((raisedDollars / goalDollars) * 100, 100)
    : 0;

  const heroPhoto = campaign?.imageUrl || animal?.photoUrls?.[0] || null;

  const pageTitle = campaign
    ? campaign.title
    : "Emergency Fund Campaign";
  const pageDescription = campaign?.description
    ? campaign.description.slice(0, 200)
    : `Support ${rescueName} in helping animals in need.`;

  useSEO({
    title: `${pageTitle} | ${rescueName}`,
    description: pageDescription,
    siteName: rescueName,
    image: heroPhoto || undefined,
    type: 'website',
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-[50vh] w-full rounded-xl mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
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
          <h2 className="text-2xl font-semibold mb-2">Campaign Not Found</h2>
          <p className="text-muted-foreground mb-6">
            This emergency fund campaign may no longer be active.
          </p>
          <Button variant="outline" asChild>
            <a href="/donate">View Other Ways to Help</a>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {heroPhoto && (
        <div className="relative w-full h-[50vh] min-h-[320px] max-h-[500px]">
          <img
            src={heroPhoto}
            alt={campaign.title}
            className="w-full h-full object-cover"
            data-testid="img-campaign-hero"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="max-w-4xl mx-auto">
              <Badge variant="secondary" className="mb-3">
                Emergency Fund
              </Badge>
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
                data-testid="text-campaign-title"
              >
                {campaign.title}
              </h1>
              {animal && (
                <p className="text-white/80 mt-2 text-lg">
                  {animal.species} {animal.breed ? `- ${animal.breed}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!heroPhoto && (
          <div className="mb-8">
            <Badge variant="secondary" className="mb-3">
              Emergency Fund
            </Badge>
            <h1
              className="text-3xl md:text-4xl font-bold"
              data-testid="text-campaign-title"
            >
              {campaign.title}
            </h1>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {campaign.description && (
              <section>
                <h2 className="text-xl font-semibold mb-4" data-testid="text-story-heading">
                  {animal ? `${animal.name}'s Story` : 'About This Campaign'}
                </h2>
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/80 leading-relaxed" data-testid="text-campaign-story">
                  {campaign.description}
                </div>
              </section>
            )}

            {updates.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" data-testid="text-updates-heading">
                  <Clock className="h-5 w-5" />
                  Updates ({updates.length})
                </h2>
                <div className="space-y-6">
                  {updates.map((update) => (
                    <div key={update.id} className="relative pl-6 border-l-2 border-primary/30" data-testid={`update-${update.id}`}>
                      <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-primary" />
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{update.title}</span>
                          <span className="text-sm text-muted-foreground">
                            {new Date(update.createdAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: 'numeric', minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-foreground/80 whitespace-pre-wrap">{update.content}</p>
                        {update.photoUrls && update.photoUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {update.photoUrls.map((url, idx) => (
                              <button
                                key={idx}
                                onClick={() => setPhotoViewerOpen({ urls: update.photoUrls || [], index: idx })}
                                className="relative w-24 h-24 rounded-md overflow-hidden group cursor-pointer"
                                data-testid={`update-photo-${update.id}-${idx}`}
                              >
                                <img
                                  src={url}
                                  alt={`Update photo ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {recentDonors.length > 0 && (
              <section className="md:hidden">
                <RecentDonorsSection donors={recentDonors} />
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
                      {goalDollars && (
                        <span className="text-muted-foreground" data-testid="text-goal-amount">
                          raised of ${goalDollars.toLocaleString()} goal
                        </span>
                      )}
                    </div>
                    {goalDollars && (
                      <Progress value={progressPercentage} className="h-3" />
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {goalDollars && (
                        <span>{progressPercentage.toFixed(0)}% funded</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {contributorCount} {contributorCount === 1 ? 'donor' : 'donors'}
                      </span>
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
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          placeholder="Enter amount"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid="input-custom-amount"
                        />
                      </div>
                    )}
                  </div>

                  <Button
                    size="lg"
                    className="w-full gap-2"
                    onClick={handleDonate}
                    disabled={checkoutMutation.isPending || (!showCustom && !selectedAmount) || (showCustom && (!customAmount || parseFloat(customAmount) < 1))}
                    data-testid="button-donate-now"
                  >
                    <Heart className="h-5 w-5" />
                    {checkoutMutation.isPending ? 'Processing...' : 'Donate Now'}
                  </Button>

                  {checkoutMutation.isError && (
                    <p className="text-sm text-destructive text-center">
                      Something went wrong. Please try again.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="hidden md:block">
                {recentDonors.length > 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <RecentDonorsSection donors={recentDonors} />
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardContent className="pt-6">
                  <SocialShareButtons
                    url={typeof window !== 'undefined' ? window.location.href : ''}
                    title={`Help ${campaign.title}! ${progressPercentage > 0 ? `${progressPercentage.toFixed(0)}% funded.` : 'Every donation counts!'}`}
                    description={pageDescription}
                    animalName={animal?.name}
                    raised={raisedDollars}
                    goal={goalDollars || undefined}
                    variant="horizontal"
                    showLabel
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>This campaign is hosted by <strong>{rescueName}</strong></p>
          <p className="mt-1">Donations are processed securely through Stripe.</p>
        </div>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 z-50" data-testid="sticky-donate-bar">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg truncate" data-testid="sticky-raised">
              ${raisedDollars.toLocaleString()} raised
            </p>
            {goalDollars && (
              <Progress value={progressPercentage} className="h-2 mt-1" />
            )}
          </div>
          <Button
            size="lg"
            className="gap-2 shrink-0"
            onClick={() => {
              const el = document.querySelector('[data-testid="card-donate-action"]');
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            data-testid="sticky-donate-button"
          >
            <Heart className="h-5 w-5" />
            Donate
          </Button>
        </div>
      </div>

      {photoViewerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setPhotoViewerOpen(null)}
          data-testid="photo-viewer-overlay"
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={photoViewerOpen.urls[photoViewerOpen.index]}
              alt="Campaign update photo"
              className="w-full h-full object-contain max-h-[85vh]"
            />
            {photoViewerOpen.urls.length > 1 && (
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="bg-black/50 text-white"
                  onClick={() => setPhotoViewerOpen({
                    ...photoViewerOpen,
                    index: (photoViewerOpen.index - 1 + photoViewerOpen.urls.length) % photoViewerOpen.urls.length,
                  })}
                  data-testid="photo-viewer-prev"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="bg-black/50 text-white"
                  onClick={() => setPhotoViewerOpen({
                    ...photoViewerOpen,
                    index: (photoViewerOpen.index + 1) % photoViewerOpen.urls.length,
                  })}
                  data-testid="photo-viewer-next"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>
            )}
            <div className="absolute top-2 right-2">
              <Button
                size="icon"
                variant="ghost"
                className="bg-black/50 text-white"
                onClick={() => setPhotoViewerOpen(null)}
                data-testid="photo-viewer-close"
              >
                &times;
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="md:hidden h-20" />
    </div>
  );
}

function RecentDonorsSection({ donors }: { donors: Pick<CampaignContribution, 'donorName' | 'amount' | 'isAnonymous' | 'createdAt'>[] }) {
  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2" data-testid="text-donors-heading">
        <Users className="h-4 w-4" />
        Recent Donors
      </h3>
      <div className="space-y-3">
        {donors.map((donor, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2" data-testid={`donor-row-${idx}`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                {donor.isAnonymous ? '?' : donor.donorName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm truncate">
                {formatDonorName(donor.donorName, donor.isAnonymous)}
              </span>
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
