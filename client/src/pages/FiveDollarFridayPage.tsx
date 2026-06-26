import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import PublicHeader from "@/components/PublicHeader";
import DonationForm from "@/components/DonationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import { CalendarHeart, Coffee, Repeat } from "lucide-react";
import {
  fiveDollarDayName,
  FIVE_DOLLAR_DEFAULT_TIMEZONE,
  type Tenant,
} from "@shared/schema";

interface TenantResponse {
  tenant: Tenant;
}

export default function FiveDollarFridayPage() {
  const { data, isLoading } = useQuery<TenantResponse>({
    queryKey: ["/api/tenant"],
  });

  const tenant = data?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const heroImageUrl = tenant?.fiveDollarFridayImageUrl || undefined;

  // The $5 campaign runs all day on a single weekday each week (default Friday).
  // Each rescue can pick which weekday so it can become "$5 Tuesday" etc.
  const dayName = fiveDollarDayName(tenant?.fiveDollarFridayDayOfWeek);

  useSEO({
    title: `$5 ${dayName} | ${rescueName}`,
    description: `It's $5 ${dayName} at ${rescueName}! Skip one coffee and give $5 to help animals in need. Make it a monthly gift and your $5 saves lives every month.`,
    siteName: rescueName,
  });

  // Recurring weekly campaign: the page is only live on the chosen weekday,
  // evaluated in the rescue's timezone (defaults to America/Chicago). On any
  // other day, send visitors to the general donation page.
  const tz = (tenant as { timezone?: string | null } | undefined)?.timezone || FIVE_DOLLAR_DEFAULT_TIMEZONE;
  const todayName = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date());
  const isCampaignDay = todayName === dayName;
  if (!isLoading && tenant && !isCampaignDay) {
    return <Redirect to="/donate" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      {/* Hero */}
      {heroImageUrl ? (
        <div className="relative overflow-hidden" data-testid="hero-five-dollar-friday-image">
          <img
            src={heroImageUrl}
            alt={`${rescueName} $5 Friday`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Dark wash so light text is readable over any image, in light or dark mode */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/70" />
          <div className="relative container max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1 text-xs font-medium text-white mb-4">
              <CalendarHeart className="h-3.5 w-3.5" />
              $5 {dayName}
            </div>
            <h1
              className="font-display text-3xl sm:text-5xl font-bold mb-3 tracking-tight text-white drop-shadow"
              data-testid="text-five-dollar-friday-title"
            >
              Give $5 this {dayName}
            </h1>
            <p
              className="text-white/90 text-base sm:text-lg max-w-xl mx-auto drop-shadow"
              data-testid="text-five-dollar-friday-subtitle"
            >
              Skip one coffee and help {rescueName} care for animals in need. Five
              dollars goes further than you'd think — make it weekly or monthly so
              your kindness keeps giving all year long.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/85">
              <span className="flex items-center gap-2">
                <Coffee className="h-4 w-4" />
                About the price of a latte
              </span>
              <span className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Make it weekly or monthly in one tap
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
          <div className="container max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 backdrop-blur px-3 py-1 text-xs font-medium text-primary mb-4">
              <CalendarHeart className="h-3.5 w-3.5" />
              $5 {dayName}
            </div>
            <h1
              className="font-display text-3xl sm:text-5xl font-bold mb-3 tracking-tight"
              data-testid="text-five-dollar-friday-title"
            >
              Give $5 this {dayName}
            </h1>
            <p
              className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto"
              data-testid="text-five-dollar-friday-subtitle"
            >
              Skip one coffee and help {rescueName} care for animals in need. Five
              dollars goes further than you'd think — make it weekly or monthly so
              your kindness keeps giving all year long.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Coffee className="h-4 w-4 text-primary" />
                About the price of a latte
              </span>
              <span className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                Make it weekly or monthly in one tap
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="container max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <DonationForm
            tenant={tenant}
            campaignTag="five-dollar-friday"
            campaignTitle={`$5 ${dayName} Gift`}
            campaignDescription="Every $5 helps feed, shelter, and care for animals waiting for their forever homes."
            campaignAmounts={[5]}
            campaignDefaultAmount={5}
            campaignDefaultRecurring={false}
            showWeeklyOption
            monthlyNudge={`Love $5 ${dayName}? Make it weekly or monthly and your $5 helps animals all year — tap to switch to a recurring gift.`}
          />
        )}
      </div>
    </div>
  );
}
