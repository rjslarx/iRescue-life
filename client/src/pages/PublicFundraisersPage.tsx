import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Clock, ShoppingCart, TicketPercent } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";

interface FundraiserEventPublic {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  inventoryCap: number | null;
  pickupTimes: string[];
  soldCount: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PublicFundraisersPage() {
  const { tenantId } = useTenant();

  const { data: tenantData } = useQuery<{ tenant: { name: string; logoUrl?: string } }>({
    queryKey: ["/api/tenant", tenantId],
    staleTime: 1000 * 60 * 5,
  });

  const { data, isLoading, error } = useQuery<{ events: FundraiserEventPublic[] }>({
    queryKey: ["/api/fundraiser-events/public", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/fundraiser-events/public", {
        headers: { "x-tenant-id": tenantId || "" },
      });
      if (!res.ok) throw new Error("Failed to load fundraisers");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2,
  });

  const tenant = tenantData?.tenant;
  const events = data?.events || [];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader
        rescueName={tenant?.name || ""}
        logoUrl={tenant?.logoUrl}
      />

      {/* Page header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-2">
            <TicketPercent className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold">Fundraisers & Products</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Support {tenant?.name || "our rescue"} by purchasing items from our fundraiser events and products.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="overflow-hidden">
                <Skeleton className="h-48 w-full rounded-none" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Unable to load fundraisers and products</p>
            <p className="text-sm text-muted-foreground">Please try again shortly.</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <TicketPercent className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No active fundraisers or products right now</p>
            <p className="text-sm text-muted-foreground">Check back soon for upcoming events.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((evt) => {
              const isSoldOut = evt.inventoryCap != null && evt.soldCount >= evt.inventoryCap;
              const remaining = evt.inventoryCap != null ? Math.max(0, evt.inventoryCap - evt.soldCount) : null;

              return (
                <Card key={evt.id} className="overflow-hidden flex flex-col" data-testid={`card-fundraiser-${evt.id}`}>
                  {evt.imageUrl ? (
                    <div className="relative h-48 w-full overflow-hidden">
                      <img
                        src={evt.imageUrl}
                        alt={evt.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      {isSoldOut && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Badge variant="destructive" className="text-base px-4 py-1">Sold Out</Badge>
                        </div>
                      )}
                      {!isSoldOut && remaining !== null && remaining <= 10 && (
                        <div className="absolute bottom-3 left-3">
                          <Badge variant="secondary" className="bg-white/90 text-foreground">
                            Only {remaining} left!
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-32 w-full bg-muted flex items-center justify-center">
                      <TicketPercent className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                  )}

                  <CardContent className="p-4 flex flex-col flex-1 gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h2 className="font-semibold text-base leading-snug">{evt.title}</h2>
                        {isSoldOut && !evt.imageUrl && <Badge variant="destructive">Sold Out</Badge>}
                      </div>
                      {evt.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{evt.description}</p>
                      )}
                    </div>

                    {evt.pickupTimes.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        {evt.pickupTimes.slice(0, 2).map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                        {evt.pickupTimes.length > 2 && (
                          <span>+{evt.pickupTimes.length - 2} more</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="font-semibold text-lg">{formatCents(evt.priceCents)}<span className="text-sm font-normal text-muted-foreground"> / item</span></span>
                      <Button
                        size="sm"
                        asChild
                        disabled={isSoldOut}
                        data-testid={`button-shop-${evt.id}`}
                      >
                        <Link href={`/donate/event/${evt.id}`}>
                          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                          {isSoldOut ? "Sold Out" : "Order Now"}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
