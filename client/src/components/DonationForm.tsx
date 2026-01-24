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
import { DollarSign, ExternalLink, Loader2, Lock, Shield, Heart, Star, Users, Home, HandHeart, PawPrint, HeartHandshake } from "lucide-react";
import type { Tenant } from "@shared/schema";

interface DonationFormProps {
  sponsoredAnimalName?: string;
  tenant?: Tenant;
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
  const donationTitle = donationSection.monthlyGivingTitle || "Make a Donation";
  const donationDescription = donationSection.monthlyGivingDescription || "Your generous gift helps save lives. Every dollar makes a difference.";
  const donationIcon = donationSection.monthlyGivingIcon || "heart";
  
  // One-time donation preset amounts (6 amounts in 3x2 grid)
  const oneTimeAmounts: number[] = donationSection.oneTimeAmounts || [250, 100, 50, 30, 25, 10];
  const showCustomAmount = donationSection.showCustomAmount !== false;
  
  // Mailing address settings
  const mailingAddressLabel = donationSection.mailingAddressLabel || "Prefer to mail a check? Send to:";
  const donateMailingAddress = donationSection.donateMailingAddress || (tenant as any)?.footerAddress;
  
  // One-time donations only (no monthly option)
  const [amount, setAmount] = useState<number | null>(sponsoredAnimalName ? 25 : 30);
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
    queryKey: [`/api/stripe/fee-calculation?amount=${currentAmountCents}`, currentAmountCents],
    enabled: currentAmountCents >= 100 && tenant?.stripeEnabled === true,
  });
  
  const IconComponent = iconMap[donationIcon as keyof typeof iconMap] || Heart;
  
  // Check if Stripe is configured for donations
  const hasStripe = Boolean(tenant?.stripeEnabled);
  
  const hasPaymentMethods = Boolean(
    hasStripe ||
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
      isRecurring: false,
      donorCoversFees,
    });
  };

  // Calculate display values for the "cover fees" checkbox
  const feesCoveredDisplay = feeData?.feesCovered ? (feeData.feesCovered / 100).toFixed(2) : '0.00';
  const totalWithFeesDisplay = feeData?.totalAmount ? (feeData.totalAmount / 100).toFixed(2) : (amount || parseFloat(customAmount) || 0).toFixed(2);

  const handleStripeLinkClick = () => {
    if (tenant?.stripeLink) {
      window.open(tenant.stripeLink, '_blank');
    }
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
              <h2 className="text-xl font-bold text-foreground" data-testid="text-donation-title">
                {donationTitle}
              </h2>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-donation-description">
                {sponsoredAnimalName 
                  ? `Support ${sponsoredAnimalName}'s care with your generous gift.`
                  : donationDescription}
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
            {/* Heading */}
            <p className="text-center text-sm font-medium text-foreground">
              Be Their Hero
            </p>

            {/* Preset amount buttons - 3x2 grid */}
            <div className="grid grid-cols-3 gap-2">
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
                      ? 'border-primary bg-primary/5 text-primary' 
                      : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50'
                  }`}
                  data-testid={`button-amount-${presetAmount}`}
                >
                  ${presetAmount}
                </button>
              ))}
            </div>

            {showCustomAmount && (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={customAmount || (amount?.toString() || '')}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    setCustomAmount(value);
                    if (value) {
                      setAmount(null);
                    } else {
                      // Reset to default when cleared
                      setAmount(30);
                    }
                  }}
                  onFocus={() => {
                    // When user focuses the input, switch to custom mode
                    if (amount) {
                      setCustomAmount(amount.toString());
                      setAmount(null);
                    }
                  }}
                  className="h-14 text-2xl pl-10 font-medium"
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
                  Donate ${donorCoversFees && feeData ? totalWithFeesDisplay : (amount || customAmount || '50')} Now
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Secure one-time payment
            </p>
          </div>
        )}

        {tenant?.stripeLink && (
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStripeLinkClick}
                  className="flex items-center justify-center gap-2"
                  data-testid="button-stripe"
                >
                  <DollarSign className="h-4 w-4" />
                  Stripe
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {tenant?.stripeEnabled 
                  ? "External payment links open in new tab"
                  : "Click to donate via Stripe"}
              </p>
            </div>
          </>
        )}

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
