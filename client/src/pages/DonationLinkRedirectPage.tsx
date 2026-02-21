import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Heart, ExternalLink, Siren, Users } from "lucide-react";
import type { Tenant, DonationLink, CampaignContribution } from "@shared/schema";

interface DonationLinkResponse {
  donationLink: DonationLink;
  totalRaised: number;
  contributorCount: number;
}

export default function DonationLinkRedirectPage() {
  const { linkId } = useParams<{ linkId: string }>();

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data, isLoading } = useQuery<DonationLinkResponse>({
    queryKey: ['/api/public/donation-link', linkId],
    enabled: !!linkId,
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const link = data?.donationLink;
  const totalRaised = data?.totalRaised || 0;
  const contributorCount = data?.contributorCount || 0;

  const pageTitle = link ? link.title : "Donate";
  const pageDescription = link?.description || `Support ${rescueName} with a donation.`;

  useSEO({
    title: `${pageTitle} | ${rescueName}`,
    description: pageDescription,
    siteName: rescueName,
    image: link?.imageUrl || undefined,
    type: 'website',
  });

  const goalAmount = link?.goalAmount || 0;
  const progressPercent = goalAmount > 0 ? Math.min((totalRaised / goalAmount) * 100, 100) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <Skeleton className="h-64 w-full rounded-xl mb-6" />
            <Skeleton className="h-8 w-48 mb-4" />
            <Skeleton className="h-20 w-full mb-4" />
            <Skeleton className="h-12 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-6 text-center">
              <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Campaign Not Found</h2>
              <p className="text-muted-foreground">
                This donation campaign may no longer be active.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <Card className="overflow-hidden">
            {link.imageUrl && (
              <div className="relative aspect-video">
                <img
                  src={link.imageUrl}
                  alt={link.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute top-3 left-3">
                  {link.campaignType === 'emergency_fund' && (
                    <Badge variant="destructive">
                      <Siren className="h-3.5 w-3.5 mr-1" />
                      URGENT
                    </Badge>
                  )}
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h1 className="text-white text-2xl font-bold drop-shadow-md leading-tight" data-testid="text-campaign-title">
                    {link.title}
                  </h1>
                </div>
              </div>
            )}

            {!link.imageUrl && (
              <CardHeader>
                {link.campaignType === 'emergency_fund' && (
                  <Badge variant="destructive" className="w-fit mb-2">
                    <Siren className="h-3.5 w-3.5 mr-1" />
                    URGENT
                  </Badge>
                )}
                <CardTitle className="text-2xl" data-testid="text-campaign-title-alt">
                  {link.title}
                </CardTitle>
              </CardHeader>
            )}

            <CardContent className="p-5 space-y-4">
              {link.description && (
                <p className="text-sm leading-relaxed" data-testid="text-campaign-description">
                  {link.description}
                </p>
              )}

              {goalAmount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold text-destructive" data-testid="text-raised-amount">
                      ${(totalRaised / 100).toLocaleString()}
                    </span>
                    <span className="text-sm text-muted-foreground" data-testid="text-goal-amount">
                      raised of ${(goalAmount / 100).toLocaleString()} goal
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-3 bg-destructive/10" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {contributorCount} {contributorCount === 1 ? 'supporter' : 'supporters'}
                    </span>
                    <span>{Math.round(progressPercent)}% funded</span>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="w-full gap-2"
                asChild
                data-testid="button-donate-now"
              >
                <a href={link.stripePaymentLinkUrl} target="_blank" rel="noopener noreferrer">
                  <Heart className="h-5 w-5" />
                  Donate Now
                  <ExternalLink className="h-4 w-4 ml-1" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>
              This campaign is hosted by <strong>{rescueName}</strong>
            </p>
            <p className="mt-1">
              Donations are processed securely through Stripe.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}