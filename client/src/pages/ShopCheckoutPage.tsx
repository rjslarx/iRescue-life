import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import PayPalButton from "@/components/PayPalButton";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { 
  ShoppingBag, 
  ArrowLeft, 
  CreditCard,
  Loader2,
  AlertCircle,
  Package,
  Ticket,
} from "lucide-react";
import { SiPaypal, SiStripe } from "react-icons/si";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { apiRequest } from "@/lib/queryClient";
import type { ShopProduct, ShopProductVariant, Tenant } from "@shared/schema";

type ProductWithVariants = ShopProduct & {
  variants: ShopProductVariant[];
};

interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

type PaymentMethod = 'stripe' | 'paypal';

function StripeCheckoutForm({ 
  orderId, 
  clientSecret, 
  totalAmount,
  orderNumber,
  basePath,
}: { 
  orderId: string;
  clientSecret: string;
  totalAmount: string;
  orderNumber: string;
  basePath: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || 'Payment failed');
        setIsProcessing(false);
        return;
      }

      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${basePath}/shop/order/${orderNumber}`,
        },
        redirect: 'if_required',
      });

      if (paymentError) {
        setError(paymentError.message || 'Payment failed');
        setIsProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        const response = await apiRequest('POST', '/api/shop/checkout/confirm', {
          orderId,
          paymentIntentId: paymentIntent.id,
        });

        if (response.ok) {
          toast({
            title: "Payment successful!",
            description: "Thank you for your purchase. You will receive a confirmation email shortly.",
          });
          setLocation(`${basePath}/shop/order/${orderNumber}`);
        } else {
          setError('Payment was processed but order confirmation failed. Please contact support.');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <Button 
        type="submit" 
        size="lg" 
        className="w-full" 
        disabled={!stripe || isProcessing}
        data-testid="button-stripe-pay"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Pay ${totalAmount}
          </>
        )}
      </Button>
    </form>
  );
}

export default function ShopCheckoutPage() {
  const { basePath } = useTenant();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');

  const [customerInfo, setCustomerInfo] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerNotes: '',
  });

  const [shippingAddress, setShippingAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: paypalData } = useQuery<{ available: boolean }>({
    queryKey: ['/api/shop/paypal/available'],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Shop";
  const paypalAvailable = paypalData?.available ?? false;

  useSEO({
    title: `Checkout - ${rescueName} Shop`,
    description: `Complete your purchase at ${rescueName}`,
    siteName: rescueName,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('product');
    const variantId = params.get('variant');
    const quantity = parseInt(params.get('quantity') || '1');

    if (productId) {
      setCartItems([{
        productId,
        variantId: variantId || undefined,
        quantity,
      }]);
    }
  }, []);

  useEffect(() => {
    if (tenant?.stripePublishableKey) {
      setStripePromise(loadStripe(tenant.stripePublishableKey));
    }
  }, [tenant?.stripePublishableKey]);

  const { data: productsData } = useQuery<{ products: ProductWithVariants[] }>({
    queryKey: ['/api/shop/products'],
  });

  const products = productsData?.products || [];

  const cartDetails = cartItems.map(item => {
    const product = products.find(p => p.id === item.productId);
    const variant = product?.variants.find(v => v.id === item.variantId);
    const unitPrice = product ? 
      parseFloat(product.basePrice) + (variant ? parseFloat(variant.priceAdjustment) : 0) : 0;
    
    return {
      ...item,
      product,
      variant,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
    };
  }).filter(item => item.product);

  const hasPhysicalProduct = cartDetails.some(item => item.product?.productType === 'physical');
  const subtotal = cartDetails.reduce((sum, item) => sum + item.totalPrice, 0);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/shop/checkout', {
        items: cartItems,
        customerEmail: customerInfo.customerEmail,
        customerName: customerInfo.customerName,
        customerPhone: customerInfo.customerPhone || undefined,
        shippingAddress: hasPhysicalProduct ? shippingAddress : undefined,
        customerNotes: customerInfo.customerNotes || undefined,
        paymentMethod,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Checkout failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setOrderId(data.orderId);
      setOrderNumber(data.orderNumber);
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerInfo.customerName || !customerInfo.customerEmail) {
      toast({
        title: "Missing information",
        description: "Please fill in your name and email address.",
        variant: "destructive",
      });
      return;
    }

    if (hasPhysicalProduct && (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postalCode)) {
      toast({
        title: "Missing shipping address",
        description: "Please fill in your complete shipping address.",
        variant: "destructive",
      });
      return;
    }

    checkoutMutation.mutate();
  };

  const handlePayPalSuccess = (data: any) => {
    toast({
      title: "Payment successful!",
      description: "Thank you for your purchase. You will receive a confirmation email shortly.",
    });
    setLocation(`${basePath}/shop/order/${orderNumber}`);
  };

  const handlePayPalError = (error: any) => {
    toast({
      title: "Payment failed",
      description: error?.error || "An error occurred processing your PayPal payment.",
      variant: "destructive",
    });
  };

  const handlePayPalCancel = () => {
    toast({
      title: "Payment cancelled",
      description: "Your PayPal payment was cancelled.",
    });
  };

  const stripeEnabled = tenant?.stripeEnabled;
  const hasPaymentMethods = stripeEnabled || paypalAvailable;

  if (!hasPaymentMethods) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />
        <main className="container max-w-2xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Payments Not Available</h2>
          <p className="text-muted-foreground mb-4">
            Online payments are not currently configured for this organization.
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

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />
        <main className="container max-w-2xl mx-auto px-4 py-16 text-center">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Your Cart is Empty</h2>
          <p className="text-muted-foreground mb-4">
            Add some items to your cart to proceed to checkout.
          </p>
          <Link href={`${basePath}/shop`}>
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Continue Shopping
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />

      <main className="container max-w-4xl mx-auto px-4 py-8">
        <Link href={`${basePath}/shop`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Shop
        </Link>

        <h1 className="text-2xl font-bold mb-6" data-testid="checkout-title">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {!orderId ? (
              <form onSubmit={handleProceedToPayment} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Your Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="customerName">Full Name *</Label>
                        <Input
                          id="customerName"
                          value={customerInfo.customerName}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, customerName: e.target.value }))}
                          required
                          data-testid="input-customer-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customerEmail">Email *</Label>
                        <Input
                          id="customerEmail"
                          type="email"
                          value={customerInfo.customerEmail}
                          onChange={(e) => setCustomerInfo(prev => ({ ...prev, customerEmail: e.target.value }))}
                          required
                          data-testid="input-customer-email"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerPhone">Phone (optional)</Label>
                      <Input
                        id="customerPhone"
                        type="tel"
                        value={customerInfo.customerPhone}
                        onChange={(e) => setCustomerInfo(prev => ({ ...prev, customerPhone: e.target.value }))}
                        data-testid="input-customer-phone"
                      />
                    </div>
                  </CardContent>
                </Card>

                {hasPhysicalProduct && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Shipping Address</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="line1">Address Line 1 *</Label>
                        <Input
                          id="line1"
                          value={shippingAddress.line1}
                          onChange={(e) => setShippingAddress(prev => ({ ...prev, line1: e.target.value }))}
                          required
                          data-testid="input-address-line1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="line2">Address Line 2</Label>
                        <Input
                          id="line2"
                          value={shippingAddress.line2}
                          onChange={(e) => setShippingAddress(prev => ({ ...prev, line2: e.target.value }))}
                          data-testid="input-address-line2"
                        />
                      </div>
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="city">City *</Label>
                          <Input
                            id="city"
                            value={shippingAddress.city}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, city: e.target.value }))}
                            required
                            data-testid="input-city"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="state">State *</Label>
                          <Input
                            id="state"
                            value={shippingAddress.state}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, state: e.target.value }))}
                            required
                            data-testid="input-state"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="postalCode">ZIP Code *</Label>
                          <Input
                            id="postalCode"
                            value={shippingAddress.postalCode}
                            onChange={(e) => setShippingAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                            required
                            data-testid="input-postal-code"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Order Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Any special instructions or notes for your order..."
                      value={customerInfo.customerNotes}
                      onChange={(e) => setCustomerInfo(prev => ({ ...prev, customerNotes: e.target.value }))}
                      rows={3}
                      data-testid="input-notes"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment Method</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={paymentMethod}
                      onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                      className="space-y-3"
                    >
                      {stripeEnabled && (
                        <div className="flex items-center space-x-3 p-3 border rounded-md hover-elevate cursor-pointer">
                          <RadioGroupItem value="stripe" id="stripe" data-testid="radio-stripe" />
                          <Label htmlFor="stripe" className="flex items-center gap-2 cursor-pointer flex-1">
                            <SiStripe className="h-5 w-5 text-[#635BFF]" />
                            <div>
                              <span className="font-medium">Credit or Debit Card</span>
                              <p className="text-xs text-muted-foreground">Pay securely with Stripe</p>
                            </div>
                          </Label>
                        </div>
                      )}
                      {paypalAvailable && (
                        <div className="flex items-center space-x-3 p-3 border rounded-md hover-elevate cursor-pointer">
                          <RadioGroupItem value="paypal" id="paypal" data-testid="radio-paypal" />
                          <Label htmlFor="paypal" className="flex items-center gap-2 cursor-pointer flex-1">
                            <SiPaypal className="h-5 w-5 text-[#003087]" />
                            <div>
                              <span className="font-medium">PayPal</span>
                              <p className="text-xs text-muted-foreground">Pay with your PayPal account</p>
                            </div>
                          </Label>
                        </div>
                      )}
                    </RadioGroup>
                  </CardContent>
                </Card>

                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full"
                  disabled={checkoutMutation.isPending}
                  data-testid="button-proceed-to-payment"
                >
                  {checkoutMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
              </form>
            ) : paymentMethod === 'stripe' && clientSecret && stripePromise ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SiStripe className="h-5 w-5 text-[#635BFF]" />
                    Card Payment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Elements 
                    stripe={stripePromise} 
                    options={{ 
                      clientSecret,
                      appearance: { theme: 'stripe' },
                    }}
                  >
                    <StripeCheckoutForm 
                      orderId={orderId}
                      clientSecret={clientSecret}
                      totalAmount={subtotal.toFixed(2)}
                      orderNumber={orderNumber!}
                      basePath={basePath}
                    />
                  </Elements>
                </CardContent>
              </Card>
            ) : paymentMethod === 'paypal' && orderId ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SiPaypal className="h-5 w-5 text-[#003087]" />
                    PayPal Payment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Click the button below to complete your payment securely with PayPal.
                  </p>
                  <PayPalButton
                    amount={subtotal.toFixed(2)}
                    currency="USD"
                    intent="CAPTURE"
                    orderId={orderId}
                    orderNumber={orderNumber!}
                    onSuccess={handlePayPalSuccess}
                    onError={handlePayPalError}
                    onCancel={handlePayPalCancel}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading payment form...</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cartDetails.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      {item.product?.imageUrls?.[0] ? (
                        <img 
                          src={item.product.imageUrls[0]} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.product?.productType === 'raffle' ? (
                            <Ticket className="h-6 w-6 text-muted-foreground" />
                          ) : (
                            <Package className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.product?.name}</p>
                      {item.variant && (
                        <p className="text-sm text-muted-foreground">{item.variant.name}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity} x ${item.unitPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="font-medium">
                      ${item.totalPrice.toFixed(2)}
                    </div>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Shipping</span>
                    <span>Calculated at checkout</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span data-testid="checkout-total">${subtotal.toFixed(2)}</span>
                </div>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                <p>All proceeds support {rescueName}'s mission to help animals in need.</p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
