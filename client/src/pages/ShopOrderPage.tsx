import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  CheckCircle2, 
  Package, 
  Ticket, 
  Truck,
  Clock,
  ArrowLeft,
  Mail,
  Share2,
  Check,
  Gift,
  Loader2,
  Trophy,
} from "lucide-react";
import { SiFacebook, SiX } from "react-icons/si";
import type { ShopOrder, ShopOrderItem, Tenant } from "@shared/schema";

type BonusTicket = { actionType: 'share' | 'referral'; ticketNumbers: string[] };

type IncentiveInfo = {
  enabled: boolean;
  maxReferrals: number;
  shareClaimed: boolean;
  referralsUsed: number;
  drawn: boolean;
  productSlug: string;
  productName: string;
};

type SplitPotInfo = {
  ticketSalesAmount: string;
  winnerPrizeAmount: string;
  rescueShareAmount: string;
  isDrawn?: boolean;
  drawnAt?: string | null;
};

type OrderItemWithExtras = ShopOrderItem & {
  bonusTickets?: BonusTicket[];
  raffleMode?: 'fixed' | 'split_pot';
  splitPot?: SplitPotInfo;
};

type OrderWithItems = ShopOrder & {
  items: OrderItemWithExtras[];
  incentives?: Record<string, IncentiveInfo>;
};

export default function ShopOrderPage() {
  const { basePath } = useTenant();
  const { toast } = useToast();
  const [, params] = useRoute("/shop/order/:orderNumber");
  const orderNumber = params?.orderNumber;
  const [friendEmails, setFriendEmails] = useState<Record<string, string>>({});
  const [linkCopied, setLinkCopied] = useState(false);
  // Per-order access token is required as proof of ownership for bonus claims
  // (order numbers alone are guessable). Comes from the checkout redirect
  // (?t=...) or the confirmation-email link; remembered for this session.
  const [accessToken] = useState(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("t");
      if (fromUrl && orderNumber) {
        sessionStorage.setItem(`shop-order-token:${orderNumber}`, fromUrl);
        return fromUrl;
      }
      return sessionStorage.getItem(`shop-order-token:${orderNumber}`) || "";
    } catch {
      return "";
    }
  });

  // Bearer-token hygiene: once stored, remove ?t= from the address bar so the
  // token doesn't linger in browser history or get leaked via referrers.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("t")) {
        url.searchParams.delete("t");
        window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
      }
    } catch {}
  }, []);

  const claimShareMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("POST", `/api/shop/orders/${orderNumber}/claim-share-bonus`, { accessToken, orderItemId: itemId });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Couldn't claim bonus ticket");
      }
      return response.json() as Promise<{ ticketNumbers?: string[]; alreadyClaimed?: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/orders', orderNumber] });
      if (data.ticketNumbers) {
        toast({ title: "Bonus ticket earned! 🎟️", description: `Ticket #${data.ticketNumbers.join(', #')} added to your entry.` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't add bonus ticket", description: error.message, variant: "destructive" });
    },
  });

  const referMutation = useMutation({
    mutationFn: async ({ email, itemId }: { email: string; itemId: string }) => {
      const response = await apiRequest("POST", `/api/shop/orders/${orderNumber}/refer`, { friendEmail: email, accessToken, orderItemId: itemId });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Couldn't send referral");
      }
      return response.json() as Promise<{ ticketNumbers: string[] }>;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/orders', orderNumber] });
      setFriendEmails(prev => ({ ...prev, [variables.itemId]: "" }));
      toast({ title: "Bonus ticket earned! 🎟️", description: `Your friend has been invited and ticket #${data.ticketNumbers.join(', #')} was added to your entry.` });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't send referral", description: error.message, variant: "destructive" });
    },
  });

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: orderData, isLoading } = useQuery<{ order: OrderWithItems }>({
    queryKey: ['/api/shop/orders', orderNumber],
    enabled: !!orderNumber,
  });

  const tenant = tenantData?.tenant;
  const order = orderData?.order;
  const rescueName = tenant?.name || "Shop";

  useSEO({
    title: order ? `Order ${order.orderNumber} - ${rescueName}` : `Order Details - ${rescueName}`,
    description: `View your order details from ${rescueName}`,
    siteName: rescueName,
  });

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500">Paid</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'refunded':
        return <Badge variant="outline">Refunded</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFulfillmentStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-500">Delivered</Badge>;
      case 'shipped':
        return <Badge className="bg-blue-500">Shipped</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'unfulfilled':
        return <Badge variant="outline">Preparing</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl ?? undefined} />
        <main className="container max-w-2xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Card>
            <CardContent className="py-8 space-y-4">
              <Skeleton className="h-16 w-16 mx-auto rounded-full" />
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl ?? undefined} />
        <main className="container max-w-2xl mx-auto px-4 py-16 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Order Not Found</h2>
          <p className="text-muted-foreground mb-4">
            We couldn't find this order. Please check your order number or contact support.
          </p>
          <Link href="/shop">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Shop
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const hasPhysicalItems = order.items.some(item => item.productType === 'physical');
  const hasRaffleItems = order.items.some(item => item.productType === 'raffle');
  const hasSplitPotItems = order.items.some(item => item.productType === 'raffle' && item.raffleMode === 'split_pot');

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl ?? undefined} />

      <main className="container max-w-2xl mx-auto px-4 py-8">
        <Link href="/shop" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Shop
        </Link>

        {order.paymentStatus === 'paid' ? (
          <Card className="mb-6 border-green-500/50 bg-green-500/5">
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
              <h1 className="text-2xl font-bold mb-2" data-testid="order-success-title">
                Thank You for Your Order!
              </h1>
              <p className="text-muted-foreground mb-2">
                Your order has been confirmed and we're getting it ready.
              </p>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Mail className="h-4 w-4" />
                A confirmation email has been sent to {order.customerEmail}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardContent className="py-8 text-center">
              <Clock className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h1 className="text-2xl font-bold mb-2">Order Status</h1>
              <p className="text-muted-foreground">
                Payment status: {getPaymentStatusBadge(order.paymentStatus)}
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Order {order.orderNumber}</CardTitle>
              <div className="flex gap-2">
                {getPaymentStatusBadge(order.paymentStatus)}
                {hasPhysicalItems && getFulfillmentStatusBadge(order.fulfillmentStatus)}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Placed on {new Date(order.createdAt).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.items.map((item, i) => {
              const isSplitPot = item.productType === 'raffle' && item.raffleMode === 'split_pot';
              const itemDrawn = isSplitPot && !!item.splitPot?.isDrawn;
              const winnerPot = isSplitPot && item.splitPot
                ? parseFloat(item.splitPot.winnerPrizeAmount)
                : null;
              return (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {item.productType === 'raffle' ? (
                      <Ticket className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.productName}</p>
                    {item.variantName && (
                      <p className="text-sm text-muted-foreground">{item.variantName}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Qty: {item.quantity} x ${parseFloat(item.unitPrice).toFixed(2)}
                    </p>
                    {isSplitPot && (
                      <p className="text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1 mt-0.5" data-testid={`text-split-pot-order-item-${item.id}`}>
                        <Trophy className="h-3 w-3" />
                        50/50 Split the Pot
                      </p>
                    )}
                    {item.raffleTicketNumbers && item.raffleTicketNumbers.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Your Ticket Numbers:</p>
                        <div className="flex flex-wrap gap-1">
                          {item.raffleTicketNumbers.map((num, j) => (
                            <Badge key={j} variant="outline" className="text-xs">
                              #{num}
                            </Badge>
                          ))}
                          {(item.bonusTickets || []).flatMap(b => b.ticketNumbers).map((num, j) => (
                            <Badge key={`bonus-${j}`} className="text-xs bg-amber-500 hover:bg-amber-500" data-testid={`badge-bonus-ticket-${num}`}>
                              #{num} · Bonus
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Split-pot winner pot / final prize for this item */}
                    {isSplitPot && winnerPot !== null && (
                      <div className="mt-2 rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-2 py-1.5 inline-block" data-testid={`split-pot-order-item-pot-${item.id}`}>
                        <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                          {itemDrawn ? 'Final winner prize' : 'Current winner pot'}
                        </p>
                        <p className="text-sm font-bold text-purple-900 dark:text-purple-100" data-testid={`text-winner-pot-order-${item.id}`}>
                          ${winnerPot.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="font-medium">
                    ${parseFloat(item.totalPrice).toFixed(2)}
                  </div>
                </div>
              );
            })}

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>${parseFloat(order.subtotal).toFixed(2)}</span>
              </div>
              {parseFloat(order.shippingAmount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span>${parseFloat(order.shippingAmount).toFixed(2)}</span>
                </div>
              )}
              {parseFloat(order.taxAmount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>${parseFloat(order.taxAmount).toFixed(2)}</span>
                </div>
              )}
              {parseFloat(order.processingFee || '0') > 0 ? (
                <div className="flex justify-between text-sm">
                  <span>Card processing fee</span>
                  <span>${parseFloat(order.processingFee).toFixed(2)}</span>
                </div>
              ) : hasSplitPotItems && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    Card processing fee
                  </span>
                  <span data-testid="text-order-no-processing-fee">Covered by rescue's share</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${parseFloat(order.totalAmount).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasPhysicalItems && order.shippingAddress && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Shipping Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>{order.customerName}</p>
              <p>{order.shippingAddress.line1}</p>
              {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
              </p>
              <p>{order.shippingAddress.country}</p>

              {order.trackingNumber && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium">Tracking Number</p>
                  {order.trackingUrl ? (
                    <a 
                      href={order.trackingUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {order.trackingNumber}
                    </a>
                  ) : (
                    <p>{order.trackingNumber}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {order.paymentStatus === 'paid' && order.incentives && Object.entries(order.incentives)
          .filter(([, v]) => v.enabled && !v.drawn)
          .map(([itemId, info]) => {
          const referralsLeft = Math.max(0, info.maxReferrals - info.referralsUsed);
          const raffleUrl = `${window.location.origin}${basePath}/shop/${info.productSlug}`;
          const shareText = `I just entered the ${info.productName} raffle — you can too!`;
          const friendEmail = friendEmails[itemId] || "";
          const openShare = (url: string) => {
            window.open(url, '_blank', 'width=600,height=400');
            if (!info.shareClaimed) claimShareMutation.mutate(itemId);
          };
          return (
            <Card key={itemId} className="mb-6 border-amber-400/50 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-amber-500" />
                  Earn Extra Tickets — Free!
                  {Object.keys(order.incentives!).length > 1 && (
                    <span className="text-sm font-normal text-muted-foreground">({info.productName})</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!accessToken && (
                  <p className="text-sm text-muted-foreground" data-testid="text-bonus-link-needed">
                    To claim bonus tickets, open this page using the link in your order confirmation email.
                  </p>
                )}
                <div>
                  <p className="text-sm font-medium mb-1">
                    Share this raffle {info.shareClaimed ? (
                      <Badge variant="secondary" className="ml-1"><Check className="h-3 w-3 mr-1" />Bonus claimed</Badge>
                    ) : (
                      <span className="text-muted-foreground font-normal">— get +1 free ticket</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(raffleUrl)}`)}
                      disabled={claimShareMutation.isPending}
                      data-testid="button-bonus-share-facebook"
                    >
                      <SiFacebook className="h-4 w-4 mr-2" />Facebook
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openShare(`https://twitter.com/intent/tweet?url=${encodeURIComponent(raffleUrl)}&text=${encodeURIComponent(shareText)}`)}
                      disabled={claimShareMutation.isPending}
                      data-testid="button-bonus-share-x"
                    >
                      <SiX className="h-4 w-4 mr-2" />X
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(raffleUrl);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                        if (!info.shareClaimed) claimShareMutation.mutate(itemId);
                      }}
                      disabled={claimShareMutation.isPending}
                      data-testid="button-bonus-copy-link"
                    >
                      {linkCopied ? <Check className="h-4 w-4 mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                      Copy Link
                    </Button>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-1">
                    Refer friends by email
                    <span className="text-muted-foreground font-normal"> — +1 free ticket each ({referralsLeft} left)</span>
                  </p>
                  {referralsLeft > 0 ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (friendEmail.trim()) referMutation.mutate({ email: friendEmail.trim(), itemId });
                      }}
                    >
                      <Input
                        type="email"
                        placeholder="friend@example.com"
                        value={friendEmail}
                        onChange={(e) => setFriendEmails(prev => ({ ...prev, [itemId]: e.target.value }))}
                        required
                        data-testid="input-referral-email"
                      />
                      <Button type="submit" size="sm" className="shrink-0" disabled={referMutation.isPending} data-testid="button-send-referral">
                        {referMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite & Earn"}
                      </Button>
                    </form>
                  ) : (
                    <Badge variant="secondary"><Check className="h-3 w-3 mr-1" />All referral bonuses earned</Badge>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    We'll send your friend a friendly invite to the raffle. Bonus tickets appear in your ticket list above.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {hasRaffleItems && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" />
                Raffle Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Your raffle ticket numbers are listed above. Winners will be notified via email 
                after the drawing date. Keep this page bookmarked to check your ticket numbers!
              </p>
              {hasSplitPotItems && (() => {
                const anyDrawn = order.items.some(
                  item => item.productType === 'raffle' && item.raffleMode === 'split_pot' && item.splitPot?.isDrawn
                );
                return (
                  <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-3 py-2" data-testid="text-split-pot-order-explanation">
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium text-sm mb-1">
                      <Trophy className="h-4 w-4" />
                      50/50 Split the Pot
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {anyDrawn
                        ? <>This was a 50/50 split-pot raffle. The winner received <strong>half of all ticket sales</strong>. The final winner prize is shown above. Card fees were covered by the rescue's half.</>
                        : <>This is a 50/50 split-pot raffle. The winner receives <strong>half of all ticket sales</strong>. The winner pot shown above grows with every ticket sold until the drawing. Card fees are covered by the rescue's half — you pay nothing extra.</>}
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t mt-12 py-8 text-center text-sm text-muted-foreground">
        <p>Thank you for supporting {rescueName}!</p>
      </footer>
    </div>
  );
}
