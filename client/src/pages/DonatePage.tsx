import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PublicHeader from "@/components/PublicHeader";
import DonationForm from "@/components/DonationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Siren, Heart, Users, Clock, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Tenant, CampaignContribution } from "@shared/schema";

interface TenantResponse {
  tenant: Tenant;
}

interface EmergencyCampaign {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  goalAmount: number | null;
  stripePaymentLinkUrl: string | null;
  createdAt: string;
}

interface EmergencyCampaignsResponse {
  campaigns: EmergencyCampaign[];
  summaries: Record<string, { totalRaised: number; contributorCount: number }>;
}

function PublicContributorFeed({ donationLinkId }: { donationLinkId: string }) {
  const { data } = useQuery<{ contributions: CampaignContribution[]; totalRaised: number; contributorCount: number }>({
    queryKey: [`/api/campaign-contributions/${donationLinkId}`],
  });

  const contributions = data?.contributions || [];

  if (contributions.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-sm text-muted-foreground">No supporters yet. Be the first!</p>
      </div>
    );
  }

  const timeAgo = (date: string | Date) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto" data-testid={`public-contributors-list-${donationLinkId}`}>
      {contributions.map((c) => (
        <div key={c.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {(c.isAnonymous ? "A" : c.donorName.charAt(0)).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">
                {c.isAnonymous ? "Anonymous" : c.donorName}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(c.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary">${(c.amount / 100).toFixed(0)}</span>
              {c.message && (
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {c.message}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const PRESET_AMOUNTS = [1000, 2000, 5000, 10000];

function EmergencyCampaignCard({ campaign, summary }: { 
  campaign: EmergencyCampaign; 
  summary?: { totalRaised: number; contributorCount: number } 
}) {
  const totalRaised = summary?.totalRaised || 0;
  const contributorCount = summary?.contributorCount || 0;
  const goalAmount = campaign.goalAmount || 0;
  const progressPercent = goalAmount > 0 ? Math.min((totalRaised / goalAmount) * 100, 100) : 0;

  const [selectedAmount, setSelectedAmount] = useState<number | null>(2000);
  const [customAmount, setCustomAmount] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount = isCustom
    ? Math.round((parseFloat(customAmount) || 0) * 100)
    : (selectedAmount || 0);

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount);
    setIsCustom(false);
    setCustomAmount("");
    setError(null);
  };

  const handleCustomFocus = () => {
    setIsCustom(true);
    setSelectedAmount(null);
    setError(null);
  };

  const handleDonate = async () => {
    if (effectiveAmount < 100) {
      setError("Minimum donation is $1.00");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/emergency-fund-checkout", {
        campaignId: campaign.id,
        amount: effectiveAmount,
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Could not create checkout session. Please try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="overflow-visible mb-8" data-testid={`public-emergency-card-${campaign.id}`}>
      {campaign.imageUrl && (
        <div className="relative h-56 sm:h-72 w-full overflow-hidden rounded-t-md">
          <img
            src={campaign.imageUrl}
            alt={campaign.title}
            className="w-full h-full object-cover"
            data-testid={`public-emergency-image-${campaign.id}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="absolute top-3 right-3">
            <Badge variant="destructive" className="text-xs font-bold">
              <Siren className="h-3 w-3 mr-1" />
              URGENT
            </Badge>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg" data-testid={`public-emergency-title-${campaign.id}`}>
              {campaign.title}
            </h2>
          </div>
        </div>
      )}

      {!campaign.imageUrl && (
        <div className="relative h-32 w-full bg-destructive/10 flex items-center justify-center rounded-t-md">
          <Siren className="h-10 w-10 text-destructive/50" />
          <div className="absolute top-3 right-3">
            <Badge variant="destructive" className="text-xs font-bold">
              <Siren className="h-3 w-3 mr-1" />
              URGENT
            </Badge>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <h2 className="text-xl sm:text-2xl font-bold" data-testid={`public-emergency-title-${campaign.id}`}>
              {campaign.title}
            </h2>
          </div>
        </div>
      )}

      <CardContent className="p-4 sm:p-6 space-y-4">
        {campaign.description && (
          <p className="text-base text-muted-foreground leading-relaxed" data-testid={`public-emergency-description-${campaign.id}`}>
            {campaign.description}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
            <span className="font-semibold text-lg" data-testid={`public-emergency-raised-${campaign.id}`}>
              ${(totalRaised / 100).toLocaleString()} raised
            </span>
            <span className="text-muted-foreground">
              of ${(goalAmount / 100).toLocaleString()} goal
            </span>
          </div>
          <Progress value={progressPercent} className="h-3" />
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {contributorCount} {contributorCount === 1 ? 'supporter' : 'supporters'}
            </span>
            <span>{Math.round(progressPercent)}% funded</span>
          </div>
        </div>

        <div className="space-y-3" data-testid={`donation-amount-selector-${campaign.id}`}>
          <p className="text-sm font-medium">Choose an amount</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((amount) => (
              <Button
                key={amount}
                variant={selectedAmount === amount && !isCustom ? "default" : "outline"}
                className="text-base font-semibold"
                onClick={() => handlePresetClick(amount)}
                data-testid={`btn-preset-${amount / 100}-${campaign.id}`}
              >
                ${amount / 100}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-muted-foreground">$</span>
            <Input
              type="number"
              min="1"
              step="1"
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setError(null);
              }}
              onFocus={handleCustomFocus}
              className={`text-base ${isCustom ? "ring-2 ring-primary" : ""}`}
              data-testid={`input-custom-amount-${campaign.id}`}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid={`text-donation-error-${campaign.id}`}>{error}</p>
          )}
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handleDonate}
          disabled={isLoading || effectiveAmount < 100}
          data-testid={`public-emergency-donate-${campaign.id}`}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Heart className="h-4 w-4 mr-2" />
          )}
          {effectiveAmount >= 100
            ? `Donate $${(effectiveAmount / 100).toLocaleString()}`
            : "Donate Now"}
        </Button>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Recent Supporters</span>
          </div>
          <PublicContributorFeed donationLinkId={campaign.id} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DonatePage() {
  const { data, isLoading } = useQuery<TenantResponse>({
    queryKey: ['/api/tenant'],
  });

  const { data: emergencyData, isLoading: emergencyLoading } = useQuery<EmergencyCampaignsResponse>({
    queryKey: ['/api/public-emergency-campaigns'],
  });

  const tenant = data?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  
  const donationSection = (tenant as any)?.donationSection || {};
  const pageTitle = donationSection.pageTitle || "Become a Monthly Guardian";
  const pageSubtitle = donationSection.pageSubtitle || "Join our community of monthly supporters making a lasting impact for animals in need";

  const emergencyCampaigns = emergencyData?.campaigns || [];
  const summaries = emergencyData?.summaries || {};
  const hasEmergencyCampaigns = emergencyCampaigns.length > 0;

  useSEO({
    title: `Donate | ${rescueName}`,
    description: `Support ${rescueName} with your donation. Your generosity helps us save more animals and find them loving homes.`,
    siteName: rescueName,
  });

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {hasEmergencyCampaigns && (
        <div className="container max-w-2xl mx-auto pt-8 sm:pt-12 px-4 sm:px-6" data-testid="public-emergency-section">
          {emergencyCampaigns.map((campaign) => (
            <EmergencyCampaignCard
              key={campaign.id}
              campaign={campaign}
              summary={summaries[campaign.id]}
            />
          ))}
        </div>
      )}

      
      <div className="container max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2" data-testid="text-donate-title">
            {pageTitle}
          </h1>
          <p className="text-muted-foreground" data-testid="text-donate-subtitle">
            {pageSubtitle}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <DonationForm tenant={tenant} />
        )}
      </div>
    </div>
  );
}
