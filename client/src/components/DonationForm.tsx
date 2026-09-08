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
import { DollarSign, ExternalLink, Loader2, Lock, Shield, Heart, Star, Users, Home, HandHeart, PawPrint, HeartHandshake, Building2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link } from "wouter";
import type { Tenant } from "@shared/schema";
import { isAchEligible, achNudgeCopy } from "@shared/ach-eligibility";
import TributeSection, { emptyTribute, type TributeFormValue } from "@/components/donations/TributeSection";

interface DonationFormProps {
  sponsoredAnimalName?: string;
  tenant?: Tenant;
  /** Optional campaign tag stored on the Stripe checkout metadata (e.g. "five-dollar-friday"). */
  campaignTag?: string;
  /** Override the preset amount grid for a specific campaign. */
  campaignAmounts?: number[];
  /** Initial selected amount for a campaign (e.g. 5 for $5 Friday). */
  campaignDefaultAmount?: number;
  /** Initial donation frequency: true = Monthly, false = One-Time. */
  campaignDefaultRecurring?: boolean;
  /** Override the card heading. */
  campaignTitle?: string;
  /** Override the card description. */
  campaignDescription?: string;
  /** Short encouragement shown beneath the frequency toggle (e.g. nudge to give monthly). */
  monthlyNudge?: string;
  /** When true, the frequency selector offers One-Time / Weekly / Monthly instead of One-Time / Monthly. */
  showWeeklyOption?: boolean;
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

export default function DonationForm({ sponsoredAnimalName, tenant, campaignTag, campaignAmounts, campaignDefaultAmount, campaignDefaultRecurring, campaignTitle, campaignDescription, monthlyNudge, showWeeklyOption }: DonationFormProps) {
  const { toast } = useToast();
  
  const donationSection = (tenant as any)?.donationSection || {};
  const donationTitle = campaignTitle || donationSection.monthlyGivingTitle || "Make a Donation";
  const donationDescription = campaignDescription || donationSection.monthlyGivingDescription || "Your generous gift helps save lives. Every dollar makes a difference.";
  const donationIcon = donationSection.monthlyGivingIcon || "heart";
  
  // One-time donation preset amounts (6 amounts in 3x2 grid)
  const oneTimeAmounts: number[] = campaignAmounts || donationSection.oneTimeAmounts || [250, 100, 50, 30, 25, 10];
  const showCustomAmount = donationSection.showCustomAmount !== false;
  
  // Mailing address settings
  const mailingAddressLabel = donationSection.mailingAddressLabel || "Prefer to mail a check? Send to:";
  const donateMailingAddress = donationSection.donateMailingAddress || (tenant as any)?.footerAddress;
  
  // Donation frequency: monthly is default for general donations, one-time only for sponsorships
  const [isRecurring, setIsRecurring] = useState(
    sponsoredAnimalName ? false : (campaignDefaultRecurring ?? true)
  ); // Monthly by default, one-time for sponsors; campaign can override
  // Recurring cadence: weekly is only offered when the campaign enables it.
  const [recurringInterval, setRecurringInterval] = useState<"week" | "month">("month");
  const intervalWord = recurringInterval === "week" ? "week" : "month";
  const recurringAdverb = recurringInterval === "week" ? "weekly" : "monthly";
  const [amount, setAmount] = useState<number | null>(sponsoredAnimalName ? 25 : (campaignDefaultAmount ?? 30));
  const [customAmount, setCustomAmount] = useState("");
  const [donorCoversFees, setDonorCoversFees] = useState(true); // Default checked
  const [tribute, setTribute] = useState<TributeFormValue>(emptyTribute);
  const [tributeError, setTributeError] = useState<string | null>(null);

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
    mutationFn: async (params: { amount: number; email?: string; isRecurring?: boolean; interval?: "week" | "month"; donorCoversFees?: boolean; tribute?: TributeFormValue }) => {
      const tributeMeta: Record<string, string> = {};
      const t = params.tribute;
      if (t && t.enabled && t.kind && t.name.trim()) {
        tributeMeta['tribute.kind'] = t.kind;
        tributeMeta['tribute.name'] = t.name.trim().slice(0, 120);
        tributeMeta['tribute.wallOptIn'] = t.wallOptIn ? 'true' : 'false';
        tributeMeta['tribute.showDonorName'] = t.wallOptIn && t.showDonorName ? 'true' : 'false';
        if (t.recipientName.trim()) tributeMeta['tribute.recipientName'] = t.recipientName.trim().slice(0, 120);
        if (t.recipientEmail.trim()) tributeMeta['tribute.recipientEmail'] = t.recipientEmail.trim().slice(0, 200);
        if (t.message.trim()) tributeMeta['tribute.message'] = t.message.trim().slice(0, 500);
        if (t.photoUrl) tributeMeta['tribute.photoUrl'] = t.photoUrl.slice(0, 480);
      }
      const response = await apiRequest('POST', '/api/stripe/create-checkout-session', {
        amount: Math.round(params.amount * 100),
        currency: 'usd',
        customerEmail: params.email,
        isRecurring: params.isRecurring || false,
        ...(params.isRecurring && params.interval ? { interval: params.interval } : {}),
        donorCoversFees: params.donorCoversFees || false,
        metadata: {
          sponsoredAnimalName: sponsoredAnimalName || '',
          ...(campaignTag ? { campaign: campaignTag } : {}),
          ...tributeMeta,
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

    setTributeError(null);
    const oneTime = sponsoredAnimalName || !isRecurring;
    if (oneTime && tribute.enabled) {
      if (!tribute.kind) {
        setTributeError("Please choose 'In memory of' or 'In honor of'.");
        return;
      }
      if (!tribute.name.trim()) {
        setTributeError("Please enter the honoree's name.");
        return;
      }
      if (tribute.recipientName.trim() && !tribute.recipientEmail.trim()) {
        setTributeError("Please add the recipient's email address so we can send the acknowledgment, or clear the recipient name.");
        return;
      }
      if (tribute.recipientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tribute.recipientEmail.trim())) {
        setTributeError("Please enter a valid recipient email address.");
        return;
      }
    }

    stripeCheckoutMutation.mutate({
      amount: donationAmount,
      isRecurring: sponsoredAnimalName ? false : isRecurring,
      interval: recurringInterval,
      donorCoversFees,
      tribute: oneTime ? tribute : undefined,
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

            {/* Donation Frequency Toggle - Only show for general donations, not for sponsorships */}
            {!sponsoredAnimalName && (
              <div className="flex justify-center" data-testid="donation-frequency-toggle">
                <ToggleGroup 
                  type="single" 
                  value={!isRecurring ? "one-time" : (recurringInterval === "week" ? "weekly" : "monthly")}
                  onValueChange={(value) => {
                    if (!value) return;
                    if (value === "one-time") {
                      setIsRecurring(false);
                    } else if (value === "weekly") {
                      setIsRecurring(true);
                      setRecurringInterval("week");
                    } else {
                      setIsRecurring(true);
                      setRecurringInterval("month");
                    }
                  }}
                  size="sm"
                  className="border border-border rounded-lg p-1 bg-muted/30"
                >
                  <ToggleGroupItem 
                    value="one-time" 
                    className="data-[state=on]:bg-background data-[state=on]:shadow-sm"
                    data-testid="button-one-time"
                  >
                    One-Time
                  </ToggleGroupItem>
                  {showWeeklyOption && (
                    <ToggleGroupItem 
                      value="weekly" 
                      className="data-[state=on]:bg-background data-[state=on]:shadow-sm"
                      data-testid="button-weekly"
                    >
                      Weekly
                    </ToggleGroupItem>
                  )}
                  <ToggleGroupItem 
                    value="monthly" 
                    className="data-[state=on]:bg-background data-[state=on]:shadow-sm"
                    data-testid="button-monthly"
                  >
                    Monthly
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {/* Optional campaign nudge encouraging recurring gifts */}
            {!sponsoredAnimalName && monthlyNudge && !isRecurring && (
              <button
                type="button"
                onClick={() => setIsRecurring(true)}
                className="w-full flex items-start gap-2 p-3 rounded-md border bg-muted/40 text-left hover-elevate"
                data-testid="button-monthly-nudge"
              >
                <HeartHandshake className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-xs text-muted-foreground leading-relaxed">{monthlyNudge}</span>
              </button>
            )}

            {/* Preset amount buttons - 3x2 grid, or a single big button for one-amount campaigns */}
            <div className={`grid gap-2 ${oneTimeAmounts.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {oneTimeAmounts.map((presetAmount: number) => (
                <button
                  key={presetAmount}
                  type="button"
                  onClick={() => {
                    setAmount(presetAmount);
                    setCustomAmount("");
                  }}
                  className={`rounded-lg border-2 font-medium transition-all ${
                    oneTimeAmounts.length === 1 ? 'py-5 text-3xl' : 'py-3 px-2 text-sm'
                  } ${
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
                      setAmount(sponsoredAnimalName ? 25 : (campaignDefaultAmount ?? 30));
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

            {/* ACH bank-transfer nudge — shown when the donor's selected
                amount qualifies for the lower-fee ACH path. We do NOT change
                anything about the checkout flow here; Stripe will surface
                "Bank account" as a payment method on the hosted checkout page
                whenever the server has enabled ACH for this surface. This is
                purely a heads-up so big-ticket donors know they have the
                option before they click through. */}
            {isAchEligible({
              surface: 'donation',
              amountCents: currentAmountCents,
              isRecurring: !sponsoredAnimalName && isRecurring,
            }) && (
              <div
                className="flex items-start gap-3 p-3 rounded-md border bg-muted/40"
                data-testid="ach-nudge-donation"
              >
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {achNudgeCopy('donation', !sponsoredAnimalName && isRecurring)}
                </p>
              </div>
            )}

            {/* Tribute / In-Memory section — one-time gifts only */}
            {(sponsoredAnimalName || !isRecurring) && (
              <>
                <TributeSection value={tribute} onChange={setTribute} />
                {tributeError && (
                  <p className="text-xs text-destructive" data-testid="text-tribute-error">{tributeError}</p>
                )}
              </>
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
                      Add ${feesCoveredDisplay} to cover transaction costs
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Helps the rescue receive your full intended ${amount || customAmount || '0'} gift
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
                  {sponsoredAnimalName || !isRecurring 
                    ? `Donate $${donorCoversFees && feeData ? totalWithFeesDisplay : (amount || customAmount || '50')} Now`
                    : `Give $${donorCoversFees && feeData ? totalWithFeesDisplay : (amount || customAmount || '50')}/${intervalWord}`
                  }
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {sponsoredAnimalName || !isRecurring ? "Secure one-time payment" : `Secure ${recurringAdverb} recurring payment`}
            </p>
            <div className="flex justify-center pt-1">
              <Button
                asChild
                variant="ghost"
                size="sm"
                style={{ backgroundColor: "#fef3c7" }}
                className="w-full sm:w-auto text-foreground gap-1.5 border border-amber-200"
              >
                <Link href="/wall-of-heroes" data-testid="link-wall-of-heroes">
                  <Heart className="h-3.5 w-3.5 text-red-600" fill="currentColor" />
                  See our Wall of Heroes
                </Link>
              </Button>
            </div>
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
