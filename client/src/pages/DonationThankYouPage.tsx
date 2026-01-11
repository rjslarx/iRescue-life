import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { useTenant } from "@/contexts/TenantContext";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareYourSupportPrompt } from "@/components/SocialShareButtons";
import { Heart, ArrowLeft, Home } from "lucide-react";
import { Link } from "wouter";
import type { Animal, Tenant } from "@shared/schema";

interface CampaignData {
  animal: Animal;
  raised: number;
  goal: number | null;
  campaignUrl: string;
  qrCodeUrl: string | null;
}

export default function DonationThankYouPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const { basePath } = useTenant();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const donorName = params.get('name') || undefined;
  const amountStr = params.get('amount');
  const amount = amountStr ? parseFloat(amountStr) : undefined;

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
  const campaignUrl = campaignData?.campaignUrl || '';

  useSEO({
    title: `Thank You for Your Donation | ${rescueName}`,
    description: `Thank you for supporting ${animal?.name || 'our animals'}! Your donation helps provide medical care and saves lives.`,
    siteName: rescueName,
    image: animal?.primaryPhotoUrl || undefined,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto">
            <Skeleton className="h-64 w-full rounded-xl mb-6" />
            <Skeleton className="h-8 w-48 mx-auto mb-4" />
            <Skeleton className="h-20 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto">
          {animal ? (
            <>
              {animal.primaryPhotoUrl && (
                <div className="relative aspect-square max-w-[200px] mx-auto mb-6 rounded-full overflow-hidden border-4 border-primary/20">
                  <img
                    src={animal.primaryPhotoUrl}
                    alt={animal.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <ShareYourSupportPrompt
                url={campaignUrl || `${window.location.origin}${basePath}/campaign/${animalId}`}
                title={`I just donated to help ${animal.name}! Can you help too?`}
                description={`${animal.name} needs support for medical care. Every donation helps!`}
                animalName={animal.name}
                donorName={donorName}
                amount={amount}
              />

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                <Button variant="outline" asChild>
                  <Link href={`/campaign/${animalId}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Campaign
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/">
                    <Home className="h-4 w-4 mr-2" />
                    Visit Our Site
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardHeader className="text-center">
                <Heart className="h-16 w-16 mx-auto mb-4 text-primary fill-primary" />
                <CardTitle className="text-2xl">Thank You!</CardTitle>
                <CardDescription className="text-lg">
                  Your donation makes a difference in the lives of animals in need.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <p className="text-muted-foreground">
                  Your generosity helps provide medical care, shelter, and love to animals 
                  waiting for their forever homes.
                </p>
                <Button asChild>
                  <Link href="/">
                    <Home className="h-4 w-4 mr-2" />
                    Visit Our Site
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>
              <strong>{rescueName}</strong> thanks you for your support!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
