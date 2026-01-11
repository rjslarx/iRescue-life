import { useQuery } from "@tanstack/react-query";
import PublicHeader from "@/components/PublicHeader";
import DonationForm from "@/components/DonationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import type { Tenant } from "@shared/schema";

interface TenantResponse {
  tenant: Tenant;
}

export default function DonatePage() {
  const { data, isLoading } = useQuery<TenantResponse>({
    queryKey: ['/api/tenant'],
  });

  const tenant = data?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  
  // Get donation section settings for page title/subtitle
  const donationSection = (tenant as any)?.donationSection || {};
  const pageTitle = donationSection.pageTitle || "Become a Monthly Guardian";
  const pageSubtitle = donationSection.pageSubtitle || "Join our community of monthly supporters making a lasting impact for animals in need";

  useSEO({
    title: `Donate | ${rescueName}`,
    description: `Support ${rescueName} with your donation. Your generosity helps us save more animals and find them loving homes.`,
    siteName: rescueName,
  });

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      
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
