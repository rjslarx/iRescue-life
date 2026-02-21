import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useSEO } from "@/hooks/useSEO";
import { Loader2, Minus, Plus, Ticket, CreditCard, Heart } from "lucide-react";
import type { Tenant } from "@shared/schema";

interface TenantResponse {
  tenant: Tenant;
}

interface EventTicketData {
  eventName: string;
  pricePerTicket: number;
  isRecurring: boolean;
  description?: string;
}

export default function EventTicketCheckoutPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/event/:eventId");
  const eventId = params?.eventId;
  
  const [quantity, setQuantity] = useState(1);
  const [donorCoversFees, setDonorCoversFees] = useState(true);

  const { data: tenantData, isLoading: tenantLoading } = useQuery<TenantResponse>({
    queryKey: ['/api/tenant'],
  });

  const { data: eventData, isLoading: eventLoading, error: eventError } = useQuery<{ event: EventTicketData }>({
    queryKey: [`/api/event-tickets/${eventId}`],
    enabled: !!eventId,
  });

  const tenant = tenantData?.tenant;
  const event = eventData?.event;
  const rescueName = tenant?.name || "Animal Rescue";
  const pricePerTicket = event?.pricePerTicket || 1500;
  const baseTotal = pricePerTicket * quantity;

  const { data: feeData } = useQuery<{
    baseAmount: number;
    totalAmount: number;
    feesCovered: number;
    stripeFee: number;
    platformFee: number;
    platformFeePercent: number;
    hasPlatformFee: boolean;
    isPaidTier: boolean;
  }>({
    queryKey: [`/api/stripe/fee-calculation?amount=${baseTotal}`, baseTotal],
    enabled: baseTotal >= 100 && tenant?.stripeEnabled === true,
  });

  useSEO({
    title: event?.eventName ? `${event.eventName} Tickets | ${rescueName}` : `Event Tickets | ${rescueName}`,
    description: event?.description || `Purchase tickets for ${event?.eventName || 'our event'} and support ${rescueName}!`,
    siteName: rescueName,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/event-tickets/checkout', {
        eventId,
        quantity,
        donorCoversFees,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleCheckout = () => {
    if (quantity < 1) {
      toast({
        title: "Invalid quantity",
        description: "Please select at least 1 ticket",
        variant: "destructive",
      });
      return;
    }
    checkoutMutation.mutate();
  };

  const incrementQuantity = () => setQuantity(prev => Math.min(prev + 1, 50));
  const decrementQuantity = () => setQuantity(prev => Math.max(prev - 1, 1));

  const feesCoveredDisplay = feeData?.feesCovered ? (feeData.feesCovered / 100).toFixed(2) : '0.00';
  const totalWithFeesDisplay = feeData?.totalAmount ? (feeData.totalAmount / 100).toFixed(2) : (baseTotal / 100).toFixed(2);
  const finalTotal = donorCoversFees && feeData?.totalAmount ? feeData.totalAmount : baseTotal;

  if (tenantLoading || eventLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-lg mx-auto py-12 px-4">
          <Skeleton className="h-12 w-48 mx-auto mb-8" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <div className="container max-w-lg mx-auto py-12 px-4">
          <Card>
            <CardContent className="py-12 text-center">
              <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Event Not Found</h2>
              <p className="text-muted-foreground">
                This event may have ended or the link is invalid.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      
      <div className="container max-w-lg mx-auto py-8 sm:py-12 px-4 sm:px-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Ticket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2" data-testid="text-event-title">
            {event.eventName}
          </h1>
          {event.description && (
            <p className="text-muted-foreground" data-testid="text-event-description">
              {event.description}
            </p>
          )}
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Purchase Tickets
            </CardTitle>
            <CardDescription>
              ${(pricePerTicket / 100).toFixed(2)} per {event.isRecurring ? 'month' : 'ticket'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="quantity">Number of Tickets</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={decrementQuantity}
                  disabled={quantity <= 1}
                  data-testid="button-decrement-quantity"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max="50"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="w-20 text-center"
                  data-testid="input-quantity"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={incrementQuantity}
                  disabled={quantity >= 50}
                  data-testid="button-increment-quantity"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground ml-2">
                  {quantity} {quantity === 1 ? 'person' : 'people'}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal ({quantity} × ${(pricePerTicket / 100).toFixed(2)})</span>
                <span>${(baseTotal / 100).toFixed(2)}</span>
              </div>
              
              {tenant?.stripeEnabled && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Checkbox
                    id="cover-fees"
                    checked={donorCoversFees}
                    onCheckedChange={(checked) => setDonorCoversFees(checked === true)}
                    className="mt-0.5"
                    data-testid="checkbox-cover-fees"
                  />
                  <div className="flex-1">
                    <Label htmlFor="cover-fees" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <Heart className="h-4 w-4 text-primary" />
                      Cover transaction fees (+${feesCoveredDisplay})
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      100% of your purchase goes directly to helping animals
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span data-testid="text-total-amount">
                  ${(finalTotal / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || !tenant?.stripeEnabled}
              data-testid="button-checkout"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Complete Purchase
                </>
              )}
            </Button>

            {!tenant?.stripeEnabled && (
              <p className="text-center text-sm text-muted-foreground">
                Online payments are not yet configured for this organization.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
