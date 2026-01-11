import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  Package, 
  Ticket, 
  Truck,
  Clock,
  ArrowLeft,
  Mail,
} from "lucide-react";
import type { ShopOrder, ShopOrderItem, Tenant } from "@shared/schema";

type OrderWithItems = ShopOrder & {
  items: ShopOrderItem[];
};

export default function ShopOrderPage() {
  const { basePath } = useTenant();
  const [, params] = useRoute(`${basePath}/shop/order/:orderNumber`);
  const orderNumber = params?.orderNumber;

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
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />
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
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />
        <main className="container max-w-2xl mx-auto px-4 py-16 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Order Not Found</h2>
          <p className="text-muted-foreground mb-4">
            We couldn't find this order. Please check your order number or contact support.
          </p>
          <Link href={`${basePath}/shop`}>
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

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />

      <main className="container max-w-2xl mx-auto px-4 py-8">
        <Link href={`${basePath}/shop`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
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
            {order.items.map((item, i) => (
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
                  {item.raffleTicketNumbers && item.raffleTicketNumbers.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Your Ticket Numbers:</p>
                      <div className="flex flex-wrap gap-1">
                        {item.raffleTicketNumbers.map((num, j) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            #{num}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="font-medium">
                  ${parseFloat(item.totalPrice).toFixed(2)}
                </div>
              </div>
            ))}

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

        {hasRaffleItems && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" />
                Raffle Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your raffle ticket numbers are listed above. Winners will be notified via email 
                after the drawing date. Keep this page bookmarked to check your ticket numbers!
              </p>
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
