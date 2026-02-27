import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ShoppingCart } from "lucide-react";

interface FundraiserEventPublic {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
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
  const [location] = useLocation();
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const eventId = params?.eventId;

  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const status = urlParams.get("status");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pickupTime, setPickupTime] = useState("");
  const [soldOutError, setSoldOutError] = useState(false);

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
      return apiRequest("POST", `/api/fundraiser-events/${eventId}/checkout`, {
        customerName,
        customerEmail,
        customerPhone: customerPhone || undefined,
        quantity,
        pickupTime: pickupTime || undefined,
      });
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      if (err.status === 409 || err.message?.includes("sold_out")) {
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
        <div className="max-w-xl mx-auto px-4 py-12 space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-full" />
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
          <p className="text-sm text-muted-foreground">This fundraiser event may no longer be active.</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
            <CardTitle>Order Confirmed!</CardTitle>
            <CardDescription>
              Thank you for supporting <strong>{event.title}</strong>. A confirmation has been sent to your email.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              {event.pickupTimes.length > 0 && "Please arrive at your selected pickup time."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">{event.title}</h1>
          {event.description && <p className="text-muted-foreground">{event.description}</p>}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xl font-semibold">{formatCents(event.priceCents)} per item</span>
            {event.inventoryCap != null && (
              <Badge variant={isSoldOut ? "destructive" : "secondary"}>
                {isSoldOut ? "Sold Out" : `${remaining} remaining`}
              </Badge>
            )}
          </div>
        </div>

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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Details</CardTitle>
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
              <Label htmlFor="customer-phone">Phone Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
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

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="font-medium">Total</span>
              <span className="text-xl font-bold">{formatCents(total)}</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              data-testid="button-proceed-payment"
              disabled={!canSubmit}
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
