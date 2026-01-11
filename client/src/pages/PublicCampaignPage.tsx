import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { Heart, ExternalLink, Share2 } from "lucide-react";
import type { Animal, Tenant } from "@shared/schema";

interface CampaignData {
  animal: Animal;
  raised: number;
  goal: number | null;
  campaignUrl: string;
  qrCodeUrl: string | null;
}

export default function PublicCampaignPage() {
  const { animalId } = useParams<{ animalId: string }>();

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: campaignData, isLoading } = useQuery<CampaignData>({
    queryKey: [`/api/animals/${animalId}/campaign`],
    enabled: !!animalId,
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const animal = campaignData?.animal;
  const raised = campaignData?.raised || 0;
  const goal = campaignData?.goal;
  const campaignUrl = campaignData?.campaignUrl;

  const progressPercentage = goal && goal > 0 
    ? Math.min((raised / goal) * 100, 100) 
    : 0;

  const pageTitle = animal 
    ? `Help ${animal.name} - Medical Fund Campaign`
    : "Medical Fund Campaign";
  
  const pageDescription = animal
    ? `${animal.name} needs your support for medical care. ${raised > 0 ? `$${raised.toLocaleString()} raised` : 'Every donation helps!'} Support ${rescueName} in helping animals in need.`
    : "Support our animal rescue's medical fund campaigns.";

  const ogImage = animal?.primaryPhotoUrl || undefined;

  useSEO({
    title: `${pageTitle} | ${rescueName}`,
    description: pageDescription,
    siteName: rescueName,
    image: ogImage,
    type: 'website',
  });

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

  if (!animal || !campaignUrl) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-6 text-center">
              <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Campaign Not Found</h2>
              <p className="text-muted-foreground">
                This medical fund campaign may no longer be active.
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
            {animal.primaryPhotoUrl && (
              <div className="relative aspect-video">
                <img
                  src={animal.primaryPhotoUrl}
                  alt={animal.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <Badge variant="secondary" className="mb-2">
                    Medical Fund Campaign
                  </Badge>
                  <h1 className="text-3xl font-bold" data-testid="text-campaign-title">
                    Help {animal.name}
                  </h1>
                </div>
              </div>
            )}

            <CardHeader className={animal.primaryPhotoUrl ? "" : ""}>
              {!animal.primaryPhotoUrl && (
                <>
                  <Badge variant="secondary" className="w-fit mb-2">
                    Medical Fund Campaign
                  </Badge>
                  <CardTitle className="text-2xl" data-testid="text-campaign-title-alt">
                    Help {animal.name}
                  </CardTitle>
                </>
              )}
              <CardDescription className="text-base">
                {animal.species} needs your support for medical care. 
                Every donation makes a difference in their journey to health and happiness.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-lg">
                  <span className="font-bold text-2xl" data-testid="text-raised-amount">
                    ${raised.toLocaleString()}
                  </span>
                  {goal && (
                    <span className="text-muted-foreground" data-testid="text-goal-amount">
                      of ${goal.toLocaleString()} goal
                    </span>
                  )}
                </div>
                <Progress value={progressPercentage} className="h-4" />
                <p className="text-sm text-center text-muted-foreground">
                  {progressPercentage.toFixed(0)}% of goal reached
                </p>
              </div>

              <Button 
                size="lg" 
                className="w-full gap-2"
                asChild
                data-testid="button-donate-now"
              >
                <a href={campaignUrl} target="_blank" rel="noopener noreferrer">
                  <Heart className="h-5 w-5" />
                  Donate Now
                  <ExternalLink className="h-4 w-4 ml-1" />
                </a>
              </Button>

              <div className="border-t pt-6">
                <SocialShareButtons
                  url={window.location.href}
                  title={`Help ${animal.name} with medical expenses! ${progressPercentage.toFixed(0)}% of goal reached.`}
                  description={`${animal.name} needs your support for medical care at ${rescueName}. Every donation helps!`}
                  animalName={animal.name}
                  raised={raised}
                  goal={goal || undefined}
                  variant="horizontal"
                  showLabel
                />
              </div>

              {campaignData?.qrCodeUrl && (
                <div className="border-t pt-6 flex flex-col items-center gap-2">
                  <p className="text-sm text-muted-foreground">Scan to donate</p>
                  <img 
                    src={campaignData.qrCodeUrl} 
                    alt="Donation QR Code" 
                    className="w-24 h-24 border rounded-lg"
                  />
                </div>
              )}
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
