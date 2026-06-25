import { useQuery } from "@tanstack/react-query";
import PublicHeader from "@/components/PublicHeader";
import DonationForm from "@/components/DonationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import { CalendarHeart, Coffee, Repeat } from "lucide-react";
import type { Tenant } from "@shared/schema";

interface TenantResponse {
  tenant: Tenant;
}

export default function FiveDollarFridayPage() {
  const { data, isLoading } = useQuery<TenantResponse>({
    queryKey: ["/api/tenant"],
  });

  const tenant = data?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `$5 Friday | ${rescueName}`,
    description: `It's $5 Friday at ${rescueName}! Skip one coffee and give $5 to help animals in need. Make it a monthly gift and your $5 saves lives every month.`,
    siteName: rescueName,
  });

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
        <div className="container max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 backdrop-blur px-3 py-1 text-xs font-medium text-primary mb-4">
            <CalendarHeart className="h-3.5 w-3.5" />
            $5 Friday
          </div>
          <h1
            className="font-display text-3xl sm:text-5xl font-bold mb-3 tracking-tight"
            data-testid="text-five-dollar-friday-title"
          >
            Give $5 this Friday
          </h1>
          <p
            className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto"
            data-testid="text-five-dollar-friday-subtitle"
          >
            Skip one coffee and help {rescueName} care for animals in need. Five
            dollars goes further than you'd think — and you can make it monthly so
            your kindness keeps giving all year long.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-primary" />
              About the price of a latte
            </span>
            <span className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              Make it monthly in one tap
            </span>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <DonationForm
            tenant={tenant}
            campaignTag="five-dollar-friday"
            campaignTitle="$5 Friday Gift"
            campaignDescription="Every $5 helps feed, shelter, and care for animals waiting for their forever homes."
            campaignAmounts={[5, 10, 15, 25, 50, 100]}
            campaignDefaultAmount={5}
            campaignDefaultRecurring={false}
            monthlyNudge="Love $5 Friday? Make it monthly and your $5 helps animals every single month — tap to switch to a recurring gift."
          />
        )}
      </div>
    </div>
  );
}
