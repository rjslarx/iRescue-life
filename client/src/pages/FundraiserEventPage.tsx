import { useFundraisingFeeQuote } from "@/hooks/use-fundraising-fee-quote";
import { fundraiserEventFeePolicy, type FundraisingFeePolicy } from "@shared/fundraising-fee-policy";
import { useState } from "react";
import { useRoute, useSearch, Link } from "wouter";
import { fundraiserOrderReference } from "@shared/fundraiser-order-reference";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ShoppingCart, ArrowLeft, Clock, Package } from "lucide-react";

interface FundraiserEventPublic {
  id: string;
  title: string;
  description: string | null;
  bodyContent: string | null;
  imageUrl: string | null;
  imageDisplayMode: "hero" | "poster";
  priceCents: number;
  passFeesToBuyer: boolean;
  feePolicy: FundraisingFeePolicy | null;
  inventoryCap: number | null;
  pickupTimes: string[];
  isActive: boolean;
  soldCount: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function FundraiserEventPage() {
  const [, params] = useRoute("/donate/event/:eventId");
  const search = useSearch();
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const eventId = params?.eventId;

  const urlParams = new URLSearchParams(search);
  const status = urlParams.get("status");
  const sessionId = urlParams.get("session_id");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pickupTime, setPickupTime] = useState("");
  const [coverFees, setCoverFees] = useState(false);
  const [soldOutError, setSoldOutError] = useState(false);
  const confirmation = useQuery<{ orderNumber: number; quantity: number; pickupTime: string | null }>({
    queryKey: ["/api/fundraiser-orders/confirmation", tenantId, eventId, sessionId],
    enabled: status === "success" && !!tenantId && !!eventId && !!sessionId,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/fundraiser-orders/confirmation", { eventId, sessionId });
      return res.json();
    },
  });

  const { data, isLoading, error } = useQuery<{ event: FundraiserEventPublic }>({
    queryKey: ["/api/fundraiser-events", eventId, "public"],
    queryFn: async () => {
      const res = await fetch(`/api/fundraiser-events/${eventId}/public`, {
        headers: { "x-tenant-id": tenantId || "" },
      });
      if (!res.ok) throw new Error("Event not found");
      return res.json();
    },
    enabled: !!eventId && !!tenantId,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await feeQuote.checkout(`/api/fundraiser-events/${eventId}/checkout`, {
        customerName,
        customerEmail,
        customerPhone: customerPhone || undefined,
        quantity,
        pickupTime: pickupTime || undefined,
        coverFees,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        sessionStorage.setItem(`fundraiser_email_${eventId}`, customerEmail);
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      if (err.code === "FUNDRAISING_QUOTE_CHANGED") {
        toast({ title: "Review updated total", description: err.message, variant: "destructive" });
      } else if (err.message?.includes("sold_out")) {
        setSoldOutError(true);
      } else {
        toast({ title: "Error", description: "Unable to process your order. Please try again.", variant: "destructive" });
      }
    },
  });

  const event = data?.event;
  const isSoldOut = event?.inventoryCap != null && event.soldCount >= event.inventoryCap;
  const remaining = event?.inventoryCap != null ? Math.max(0, event.inventoryCap - event.soldCount) : null;
  const maxQty = remaining !== null ? Math.min(10, remaining) : 10;
  const total = event ? event.priceCents * quantity : 0;
  const feeQuote = useFundraisingFeeQuote(event ? `/api/fundraiser-events/${event.id}/fee-quote` : undefined, total, coverFees, quantity);
  const displayedUnitPrice = feeQuote.data ? feeQuote.data.baseAmountCents / quantity : event?.priceCents ?? 0;

  const canSubmit =
    !isSoldOut &&
    !soldOutError &&
    customerName.trim() &&
    customerEmail.trim() &&
    quantity >= 1 &&
    (event?.pickupTimes.length === 0 || pickupTime) &&
    !checkoutMutation.isPending;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="w-full h-72 rounded-none" />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-lg font-medium">Event not found</p>
          <p className="text-sm text-muted-foreground">This event or product may no longer be active.</p>
          <Button variant="outline" asChild>
            <Link href="/fundraisers">Browse all fundraisers</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-background">
        {event.imageUrl && (
          event.imageDisplayMode === "poster" ? (
            <div className="w-full bg-muted flex justify-center py-6">
              <img src={event.imageUrl} alt={event.title} className="max-h-[28rem] w-auto object-contain rounded-md" />
            </div>
          ) : (
            <div className="relative w-full h-56 overflow-hidden">
              <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50" />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                <h1 className="text-3xl font-bold text-white">{event.title}</h1>
              </div>
            </div>
          )
        )}
        <div className="flex items-center justify-center px-4 py-16 min-h-[50vh]">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center pb-2">
              <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto mb-3" />
              <CardTitle className="text-2xl">{confirmation.data ? "Order Confirmed!" : "Check Your Order"}</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-3">
              <p className="text-muted-foreground">
                Thank you for supporting <strong>{event.title}</strong>.
              </p>
              {confirmation.data ? (
                <div className="space-y-2">
                  <p className="text-2xl font-bold">Order #{fundraiserOrderReference(confirmation.data.orderNumber)}</p>
                  <p>{confirmation.data.quantity} item(s) — show this number at pickup.</p>
                  <p className="text-sm text-muted-foreground">Keep this confirmation for your records.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>{!sessionId ? "Please check your confirmation email for your order details." : confirmation.isError ? "We couldn't verify your payment yet. Please try again before placing another order." : "Verifying your payment…"}</p>
                  {sessionId && confirmation.isError && <Button onClick={() => confirmation.refetch()}>Check again</Button>}
                </div>
              )}
              {confirmation.data?.pickupTime && (
                <div className="flex items-center justify-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Pickup: {confirmation.data.pickupTime}
                </div>
              )}
              <Button variant="outline" asChild className="mt-4">
                <Link href="/fundraisers">Browse all fundraisers</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero/poster image or plain header */}
      {event.imageUrl && event.imageDisplayMode === "poster" ? (
        <div className="w-full bg-muted">
          <div className="max-w-3xl mx-auto flex flex-col items-center px-4 py-8 gap-6">
            <img src={event.imageUrl} alt={event.title} className="max-h-[32rem] w-auto max-w-full object-contain rounded-lg shadow-sm" data-testid="img-event-poster" />
            <div className="text-center space-y-2 w-full">
              {isSoldOut && <Badge variant="destructive" className="w-fit mx-auto">Sold Out</Badge>}
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{event.title}</h1>
              {event.description && (
                <p className="text-muted-foreground text-base md:text-lg">{event.description}</p>
              )}
              <div className="flex items-center justify-center gap-3 pt-1">
                <span className="text-xl font-semibold">{formatCents(displayedUnitPrice)} per item</span>
                {event.inventoryCap != null && !isSoldOut && (
                  <Badge variant="secondary">{remaining} remaining</Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : event.imageUrl ? (
        <div className="relative w-full h-72 md:h-96 overflow-hidden">
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end px-6 pb-8 max-w-3xl mx-auto w-full">
            <div className="space-y-2">
              {isSoldOut && <Badge variant="destructive" className="w-fit">Sold Out</Badge>}
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">{event.title}</h1>
              {event.description && (
                <p className="text-white/85 text-base md:text-lg">{event.description}</p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xl font-semibold text-white">{formatCents(displayedUnitPrice)} per item</span>
                {event.inventoryCap != null && !isSoldOut && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-0">
                    {remaining} remaining
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-muted/30 border-b px-4 py-10">
          <div className="max-w-2xl mx-auto space-y-2">
            <Link href="/fundraisers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              All fundraisers
            </Link>
            {isSoldOut && <Badge variant="destructive" className="w-fit">Sold Out</Badge>}
            <h1 className="text-3xl font-bold">{event.title}</h1>
            {event.description && <p className="text-muted-foreground text-lg">{event.description}</p>}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xl font-semibold">{formatCents(displayedUnitPrice)} per item</span>
              {event.inventoryCap != null && !isSoldOut && (
                <Badge variant="secondary">{remaining} remaining</Badge>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {event.imageUrl && (
          <Link href="/fundraisers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            All fundraisers
          </Link>
        )}

        {/* Body content */}
        {event.bodyContent && (
          <div className="prose prose-sm max-w-none text-foreground">
            {event.bodyContent.split("\n").map((paragraph, i) =>
              paragraph.trim() ? (
                <p key={i} className="mb-3 leading-relaxed text-foreground">
                  {paragraph}
                </p>
              ) : (
                <br key={i} />
              )
            )}
          </div>
        )}

        {/* Pickup times info */}
        {event.pickupTimes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Pickup times:
            </div>
            {event.pickupTimes.map((t) => (
              <Badge key={t} variant="outline" className="text-sm">
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Sold out / race-condition alerts */}
        {isSoldOut && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>This event is sold out. Thank you for your interest!</AlertDescription>
          </Alert>
        )}
        {soldOutError && !isSoldOut && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Sorry, this item just sold out while you were checking out.</AlertDescription>
          </Alert>
        )}

        {/* Checkout card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Place Your Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Full Name</Label>
              <Input
                id="customer-name"
                data-testid="input-customer-name"
                placeholder="Jane Smith"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={isSoldOut}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-email">Email Address</Label>
              <Input
                id="customer-email"
                data-testid="input-customer-email"
                type="email"
                placeholder="jane@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                disabled={isSoldOut}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-phone">
                Phone Number{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="customer-phone"
                data-testid="input-customer-phone"
                type="tel"
                placeholder="(555) 000-0000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                disabled={isSoldOut}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Select
                value={String(quantity)}
                onValueChange={(v) => setQuantity(Number(v))}
                disabled={isSoldOut || maxQty === 0}
              >
                <SelectTrigger id="quantity" data-testid="select-quantity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.max(1, maxQty) }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {event.pickupTimes.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="pickup-time">Pickup Time</Label>
                <Select
                  value={pickupTime}
                  onValueChange={setPickupTime}
                  disabled={isSoldOut}
                >
                  <SelectTrigger id="pickup-time" data-testid="select-pickup-time">
                    <SelectValue placeholder="Select a pickup time" />
                  </SelectTrigger>
                  <SelectContent>
                    {event.pickupTimes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="pt-2 border-t space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold" data-testid="text-order-total">{feeQuote.data ? formatCents(feeQuote.data.totalCents) : "Calculating…"}</span>
              </div>
              {(feeQuote.data?.policy ?? fundraiserEventFeePolicy(event.feePolicy, event.passFeesToBuyer)) === "optional" && (
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={coverFees} onChange={e => setCoverFees(e.target.checked)} />Cover platform and estimated Stripe processing fees</label>
              )}
              {feeQuote.data && <p className="text-sm">Items: {formatCents(feeQuote.data.baseAmountCents)} + fee coverage: {formatCents(feeQuote.data.feeContributionCents)}</p>}
              <p className="text-xs text-muted-foreground">{(feeQuote.data?.policy ?? fundraiserEventFeePolicy(event.feePolicy, event.passFeesToBuyer)) === "required" ? "Fee coverage is required and included in the total above." : "Uncovered fees come from rescue proceeds."} Processing is an estimate; actual costs may vary.</p>
              {feeQuote.isError && <p role="alert">Could not calculate fees. <button onClick={() => feeQuote.refetch()}>Try again</button></p>}
            </div>

            <Button
              className="w-full"
              size="lg"
              data-testid="button-proceed-payment"
              disabled={!canSubmit || !feeQuote.data || feeQuote.isFetching || feeQuote.isError}
              onClick={() => checkoutMutation.mutate()}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {checkoutMutation.isPending ? "Redirecting to payment…" : "Proceed to Payment"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
