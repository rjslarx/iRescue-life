import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, ExternalLink, Loader2, Gift, ArrowRight, Lock, Shield, Heart, Star, Users, Home, HandHeart, PawPrint, HeartHandshake } from "lucide-react";
import { SiPaypal, SiCashapp } from "react-icons/si";
import { Link } from "wouter";
import type { Tenant } from "@shared/schema";

interface DonationFormProps {
  sponsoredAnimalName?: string;
  tenant?: Tenant;
}

interface SupplyItemWithRelations {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  quantityNeeded: number;
  quantityFulfilled: number;
  unitPrice: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "active" | "fulfilled" | "paused";
  category: {
    id: string;
    name: string;
  } | null;
}

function WishlistFeed() {
  const { data: itemsData } = useQuery<{ items: SupplyItemWithRelations[] }>({
    queryKey: ['/api/supply-items'],
  });

  const items = (itemsData?.items || []).slice(0, 3);

  if (items.length === 0) {
    return null;
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "destructive";
      case "high": return "default";
      default: return "secondary";
    }
  };

  const getProgressPercentage = (item: SupplyItemWithRelations) => {
    return Math.min((item.quantityFulfilled / item.quantityNeeded) * 100, 100);
  };

  return (
    <div className="my-6">
      <div className="relative mb-4">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          or help with supplies
        </span>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Needed Supplies</h3>
          </div>
          <Link href="/wishlist">
            <Button variant="ghost" size="sm" className="h-8 text-xs" data-testid="link-view-all-supplies">
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-md border bg-card hover-elevate transition-all"
              data-testid={`wishlist-item-${item.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium leading-tight line-clamp-1">{item.title}</h4>
                  {item.priority !== "normal" && item.priority !== "low" && (
                    <Badge variant={getPriorityColor(item.priority)} className="text-xs shrink-0">
                      {item.priority}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                  {item.quantityNeeded - item.quantityFulfilled} needed
                  {item.unitPrice && ` • $${item.unitPrice} each`}
                </p>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${getProgressPercentage(item)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Purchase items from our wishlist or donate funds to help us buy supplies
        </p>
      </div>
    </div>
  );
}

const iconMap = {
  shield: Shield,
  heart: Heart,
  paw: PawPrint,
  star: Star,
  "hand-heart": HandHeart,
  users: Users,
  home: Home,
} as const;

export default function DonationForm({ sponsoredAnimalName, tenant }: DonationFormProps) {
  const { toast } = useToast();
  
  const donationSection = (tenant as any)?.donationSection || {};
  const monthlyGivingTitle = donationSection.monthlyGivingTitle || "Become a Monthly Guardian";
  const monthlyGivingDescription = donationSection.monthlyGivingDescription || "Join The Pack to provide predictable support. $10/month saves lives all year long.";
  const monthlyGivingIcon = donationSection.monthlyGivingIcon || "shield";
  const oneTimeButtonText = donationSection.oneTimeButtonText || "One-Time";
  const monthlyButtonText = donationSection.monthlyButtonText || "Monthly";
  
  // One-time donation preset amounts
  const oneTimeAmounts: number[] = donationSection.oneTimeAmounts || [10, 20, 50, 100];
  const showCustomAmount = donationSection.showCustomAmount !== false;
  
  // Mailing address settings
  const mailingAddressLabel = donationSection.mailingAddressLabel || "Prefer to mail a check? Send to:";
  const donateMailingAddress = donationSection.donateMailingAddress || (tenant as any)?.footerAddress;
  
  // Initialize amount with first one-time preset or 10 for monthly
  const [isMonthly, setIsMonthly] = useState(true);
  const [amount, setAmount] = useState<number | null>(sponsoredAnimalName ? 25 : 10);
  const [customAmount, setCustomAmount] = useState("");
  const [donorCoversFees, setDonorCoversFees] = useState(true); // Default checked

  // Calculate current donation amount in cents
  const currentAmountCents = Math.round((amount || parseFloat(customAmount) || 0) * 100);

  // Query for fee calculation when amount changes
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
    queryKey: ['/api/stripe/fee-calculation', { amount: currentAmountCents }],
    enabled: currentAmountCents >= 100 && tenant?.stripeEnabled === true,
  });
  
  const IconComponent = iconMap[monthlyGivingIcon as keyof typeof iconMap] || Shield;
  
  // Check if Stripe is configured for donations
  const hasStripe = Boolean(tenant?.stripeEnabled);
  
  // Check if alternative payment methods are enabled (only when platform admin allows)
  const hasAlternativePayments = Boolean(
    tenant?.allowAlternativePayments && (
      tenant?.paypalUsername || 
      tenant?.venmoUsername || 
      tenant?.cashappUsername
    )
  );

  const hasPaymentMethods = Boolean(
    hasStripe ||
    hasAlternativePayments ||
    tenant?.stripeLink
  );

  const stripeCheckoutMutation = useMutation({
    mutationFn: async (params: { amount: number; email?: string; isRecurring?: boolean; donorCoversFees?: boolean }) => {
      const response = await apiRequest('POST', '/api/stripe/create-checkout-session', {
        amount: Math.round(params.amount * 100),
        currency: 'usd',
        customerEmail: params.email,
        isRecurring: params.isRecurring || false,
        donorCoversFees: params.donorCoversFees || false,
        metadata: {
          sponsoredAnimalName: sponsoredAnimalName || '',
        },
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

  const handleStripeCheckout = () => {
    const donationAmount = amount || parseFloat(customAmount);
    if (!donationAmount || donationAmount < 1) {
      toast({
        title: "Invalid amount",
        description: "Please select or enter a donation amount",
        variant: "destructive",
      });
      return;
    }

    stripeCheckoutMutation.mutate({
      amount: donationAmount,
      isRecurring: isMonthly,
      donorCoversFees,
    });
  };

  // Calculate display values for the "cover fees" checkbox
  const feesCoveredDisplay = feeData?.feesCovered ? (feeData.feesCovered / 100).toFixed(2) : '0.00';
  const totalWithFeesDisplay = feeData?.totalAmount ? (feeData.totalAmount / 100).toFixed(2) : (amount || parseFloat(customAmount) || 0).toFixed(2);

  const handlePaymentMethodClick = (method: 'paypal' | 'venmo' | 'cashapp' | 'stripe') => {
    let url = '';
    switch (method) {
      case 'paypal':
        url = `https://paypal.me/${tenant?.paypalUsername}`;
        break;
      case 'venmo':
        url = `https://venmo.com/${tenant?.venmoUsername}`;
        break;
      case 'cashapp':
        url = `https://cash.app/${tenant?.cashappUsername}`;
        break;
      case 'stripe':
        url = tenant?.stripeLink || '';
        break;
    }
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleSelectType = (monthly: boolean) => {
    setIsMonthly(monthly);
    // Use first preset amount for one-time, or 10 for monthly
    setAmount(monthly ? 10 : (oneTimeAmounts[0] || 10));
    setCustomAmount("");
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="bg-muted/30 p-6 pb-8">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconComponent className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground" data-testid="text-monthly-giving-title">
                {monthlyGivingTitle}
              </h2>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-monthly-giving-description">
                {sponsoredAnimalName 
                  ? `Support ${sponsoredAnimalName}'s care with predictable monthly giving.`
                  : monthlyGivingDescription}
              </p>
            </div>
          </div>
        </div>

        {!hasPaymentMethods && (
          <div className="p-6 pt-4">
            <div className="text-center py-4 px-6 bg-muted/50 rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                Payment methods coming soon! Check back later to support our mission.
              </p>
            </div>
          </div>
        )}

        {/* Stripe Checkout - Primary donation method */}
        {hasStripe && (
          <div className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectType(false)}
                className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  !isMonthly 
                    ? 'border-primary bg-primary/5 text-foreground' 
                    : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50'
                }`}
                data-testid="option-one-time"
              >
                {oneTimeButtonText}
              </button>
              <button
                type="button"
                onClick={() => handleSelectType(true)}
                className={`py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isMonthly 
                    ? 'border-primary bg-primary text-primary-foreground' 
                    : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50'
                }`}
                data-testid="option-monthly"
              >
                {monthlyButtonText}
                {isMonthly && (
                  <span className="text-xs bg-primary-foreground/20 px-1.5 py-0.5 rounded">
                    Most Popular
                  </span>
                )}
              </button>
            </div>

            {/* One-time preset amount buttons */}
            {!isMonthly && (
              <div className="grid grid-cols-4 gap-2">
                {oneTimeAmounts.map((presetAmount: number) => (
                  <button
                    key={presetAmount}
                    type="button"
                    onClick={() => {
                      setAmount(presetAmount);
                      setCustomAmount("");
                    }}
                    className={`py-3 px-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      amount === presetAmount && !customAmount
                        ? 'border-primary bg-primary/10 text-foreground' 
                        : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50'
                    }`}
                    data-testid={`button-amount-${presetAmount}`}
                  >
                    ${presetAmount}
                  </button>
                ))}
              </div>
            )}

            {showCustomAmount && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={isMonthly ? "Custom monthly amount" : "Custom amount"}
                  value={customAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    setCustomAmount(value);
                    if (value) {
                      setAmount(null);
                    }
                  }}
                  className="h-12 text-base pl-7"
                  data-testid="input-custom-amount"
                />
              </div>
            )}

            {/* Cover the Fees Checkbox */}
            {currentAmountCents >= 100 && (
              <div 
                className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover-elevate"
                onClick={() => setDonorCoversFees(!donorCoversFees)}
                data-testid="checkbox-cover-fees-container"
              >
                <Checkbox
                  id="cover-fees"
                  checked={donorCoversFees}
                  onCheckedChange={(checked) => setDonorCoversFees(checked === true)}
                  className="mt-0.5"
                  data-testid="checkbox-cover-fees"
                />
                <label 
                  htmlFor="cover-fees" 
                  className="flex-1 cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <HeartHandshake className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      Add ${feesCoveredDisplay} to cover processing fees
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    100% of your ${amount || customAmount || '0'} donation goes directly to helping animals
                  </p>
                </label>
              </div>
            )}
            
            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={handleStripeCheckout}
              disabled={stripeCheckoutMutation.isPending}
              className="w-full h-12"
              data-testid="button-stripe-checkout"
            >
              {stripeCheckoutMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading Checkout...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  {isMonthly 
                    ? `Donate $${donorCoversFees && feeData ? totalWithFeesDisplay : (amount || customAmount || '10')}/month` 
                    : `Donate $${donorCoversFees && feeData ? totalWithFeesDisplay : (amount || customAmount || '50')} Now`}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {isMonthly 
                ? "Cancel anytime • Secure monthly billing"
                : "Secure one-time payment"}
            </p>
          </div>
        )}

        {(tenant?.paypalUsername || tenant?.venmoUsername || tenant?.cashappUsername || tenant?.stripeLink) && (
          <>
            {tenant?.stripeEnabled && (
              <div className="relative my-6">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  Other payment methods
                </span>
              </div>
            )}
            <div className="space-y-3 p-6 pt-0">
              {!tenant?.stripeEnabled && <p className="text-sm font-medium">Quick Donate</p>}
              <div className="grid grid-cols-2 gap-3">
                {tenant?.paypalUsername && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handlePaymentMethodClick('paypal')}
                    className="flex items-center justify-center gap-2"
                    data-testid="button-paypal"
                  >
                    <SiPaypal className="h-4 w-4" />
                    PayPal
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                )}
                {tenant?.venmoUsername && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handlePaymentMethodClick('venmo')}
                    className="flex items-center justify-center gap-2"
                    data-testid="button-venmo"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.6 5.4c.9 1.4 1.4 3.2 1.4 5.3 0 5.9-4.9 12.7-8.9 12.7h-4L5.4 5.4h4.3l2.4 13.1c1.6-2.7 3.8-7.1 3.8-10.4 0-1.5-.3-2.6-.8-3.5l4.5-.2z"/>
                    </svg>
                    Venmo
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                )}
                {tenant?.cashappUsername && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handlePaymentMethodClick('cashapp')}
                    className="flex items-center justify-center gap-2"
                    data-testid="button-cashapp"
                  >
                    <SiCashapp className="h-4 w-4" />
                    Cash App
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                )}
                {tenant?.stripeLink && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handlePaymentMethodClick('stripe')}
                    className="flex items-center justify-center gap-2"
                    data-testid="button-stripe"
                  >
                    <DollarSign className="h-4 w-4" />
                    Stripe
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {tenant?.stripeEnabled 
                  ? "External payment links open in new tab"
                  : "Click a payment method to donate via your preferred service"}
              </p>
            </div>
          </>
        )}

        <div className="px-6 pb-6">
          <WishlistFeed />
        </div>

        {/* Mail-in donation address section */}
        {donateMailingAddress && (
          <div className="px-6 pb-6">
            <div className="relative mb-4">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or mail a check
              </span>
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground" data-testid="text-mailing-label">
                {mailingAddressLabel}
              </p>
              <p className="text-sm font-medium whitespace-pre-line" data-testid="text-mailing-address">
                {donateMailingAddress}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
