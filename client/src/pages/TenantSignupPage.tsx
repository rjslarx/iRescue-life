import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, CreditCard, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";

// Initialize Stripe
// In development, prefer TESTING keys but fall back to regular keys
// In production, use production keys
const isDevelopment = import.meta.env.DEV;
const stripePublicKey = isDevelopment 
  ? (import.meta.env.TESTING_VITE_STRIPE_PUBLIC_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

// Stripe Price IDs from environment variables
// In development, prefer test keys but fall back to regular keys
const stripeProfessionalPriceId = isDevelopment 
  ? (import.meta.env.TESTING_VITE_STRIPE_PROFESSIONAL_PRICE_ID || import.meta.env.VITE_STRIPE_PROFESSIONAL_PRICE_ID)
  : import.meta.env.VITE_STRIPE_PROFESSIONAL_PRICE_ID;

const arePriceIdsConfigured = !!stripeProfessionalPriceId;

// Two-tier pricing model:
// - Free: No payment required, 5% platform fee on donations
// - Professional: Monthly subscription, 0% platform fee, plus optional custom domain & Google Workspace
const PRICING = {
  free: {
    price: 0,
    priceId: "", // No subscription required for free tier
    name: "Free",
    features: [
      "Unlimited animals",
      "500 emails/month",
      "Basic reporting",
      "5% platform fee on donations",
    ],
  },
  professional: {
    price: 39,
    priceId: stripeProfessionalPriceId || "",
    name: "Professional",
    features: [
      "Unlimited animals",
      "10,000 emails/month",
      "Advanced reporting & analytics",
      "0% platform fees (save on every donation!)",
      "Optional custom domain integration",
      "Optional Google Workspace integration",
      "Priority support",
    ],
  },
};

type Tier = keyof typeof PRICING;

// Step 1: Organization Details Schema
const organizationSchema = z.object({
  rescueName: z.string().min(1, "Rescue name is required"),
  subdomain: z.string()
    .min(3, "Identifier must be at least 3 characters")
    .regex(/^[a-z0-9]+$/, "Identifier must contain only lowercase letters and numbers"),
  adminEmail: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

// Payment Form Component (uses Stripe Elements hooks)
function PaymentForm({
  tier,
  tenantId,
  email,
  rescueName,
  onSuccess,
  onBack,
}: {
  tier: Tier;
  tenantId: string;
  email: string;
  rescueName: string;
  onSuccess: (subdomain: string) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate price ID is configured
    if (!PRICING[tier].priceId) {
      setError("Stripe price configuration is missing. Please contact support.");
      return;
    }

    if (!stripe || !elements) {
      setError("Stripe has not loaded yet. Please try again.");
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not found. Please refresh the page.");
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Create subscription and get client secret
      const subscriptionResponse = await apiRequest("POST", "/api/platform/create-subscription", {
        tenantId,
        email,
        rescueName,
        priceId: PRICING[tier].priceId,
        tier,
      });

      // Check if the response is ok (status 200-299)
      if (!subscriptionResponse.ok) {
        const errorData = await subscriptionResponse.json();
        throw new Error(errorData.message || errorData.error || "Failed to create subscription. Please try again.");
      }

      const { clientSecret, subscriptionId, requiresPayment } = await subscriptionResponse.json();

      // If this is a trial, no payment is required upfront
      if (!requiresPayment) {
        // Directly finalize the subscription without payment
        const finalizeResponse = await apiRequest("POST", "/api/platform/finalize-subscription", {
          tenantId,
          subscriptionId,
          skipPaymentIntent: true,
        });

        if (!finalizeResponse.ok) {
          const errorData = await finalizeResponse.json();
          throw new Error(errorData.message || "Failed to activate your trial. Please contact support.");
        }

        const finalizeData = await finalizeResponse.json();

        toast({
          title: "Trial activated!",
          description: "Your 30-day free trial has started.",
        });

        onSuccess(finalizeData.subdomain);
        return;
      }

      if (!clientSecret) {
        throw new Error("Failed to create subscription. Please try again or contact support.");
      }

      // Step 2: Confirm payment with Stripe
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            email,
            name: rescueName,
          },
        },
      });

      if (confirmError) {
        // Handle specific Stripe error messages
        let userMessage = confirmError.message;
        if (confirmError.type === "card_error") {
          if (confirmError.code === "card_declined") {
            userMessage = "Your card was declined. Please try a different card.";
          } else if (confirmError.code === "insufficient_funds") {
            userMessage = "Your card has insufficient funds. Please try a different card.";
          } else if (confirmError.code === "expired_card") {
            userMessage = "Your card has expired. Please use a different card.";
          } else if (confirmError.code === "incorrect_cvc") {
            userMessage = "The security code (CVC) is incorrect. Please check and try again.";
          } else if (confirmError.code === "processing_error") {
            userMessage = "An error occurred while processing your card. Please try again.";
          }
        }
        throw new Error(userMessage || "Payment failed. Please try again.");
      }

      // Handle payment intent status
      if (paymentIntent?.status === "succeeded") {
        // Step 3: Finalize subscription on backend - verify and persist subscription data
        try {
          const finalizeResponse = await apiRequest("POST", "/api/platform/finalize-subscription", {
            tenantId,
            subscriptionId,
          });

          if (!finalizeResponse.ok) {
            const errorData = await finalizeResponse.json();
            throw new Error(errorData.message || errorData.error || "Failed to finalize subscription. Please contact support.");
          }

          const finalizeData = await finalizeResponse.json();
          
          if (!finalizeData.success) {
            throw new Error("Subscription verification failed. Please contact support with your payment confirmation.");
          }

          toast({
            title: "Payment successful!",
            description: "Your subscription has been activated.",
          });
          
          // Get subdomain from sessionStorage
          const subdomain = sessionStorage.getItem("signup_subdomain") || "";
          onSuccess(subdomain);
        } catch (finalizeError: any) {
          console.error("Finalize subscription error:", finalizeError);
          // Payment succeeded but finalization failed - show helpful error
          const errorMessage = finalizeError.message || "Payment was processed but we couldn't activate your subscription. Please contact support with your payment confirmation.";
          throw new Error(errorMessage);
        }
      } else if (paymentIntent?.status === "requires_action") {
        // Payment requires additional authentication (3D Secure)
        throw new Error("Your card requires additional authentication. Please contact your card issuer.");
      } else if (paymentIntent?.status === "requires_payment_method") {
        throw new Error("Payment failed. Please try a different payment method.");
      } else {
        throw new Error("Payment was not successful. Please try again or contact support.");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      const errorMessage = err.message || "Payment processing failed. Please try again.";
      setError(errorMessage);
      toast({
        title: "Payment failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: "16px",
        color: "hsl(var(--foreground))",
        fontFamily: "Inter, system-ui, sans-serif",
        "::placeholder": {
          color: "hsl(var(--muted-foreground))",
        },
      },
      invalid: {
        color: "hsl(var(--destructive))",
      },
    },
  };

  // Calculate trial end date (30 days from now)
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 30);
  const formattedTrialEndDate = trialEndDate.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" data-testid="alert-payment-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Trial Information Alert */}
      <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" data-testid="alert-trial-info">
        <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-900 dark:text-blue-100">
          <p className="font-semibold mb-1">30-Day Free Trial</p>
          <p className="text-sm">
            You won't be charged today. Your free trial starts immediately and ends on <strong>{formattedTrialEndDate}</strong>. 
            After the trial, you'll be charged ${PRICING[tier].price}/month. Cancel anytime before {formattedTrialEndDate} to avoid charges.
          </p>
        </AlertDescription>
      </Alert>

      <div className="rounded-md border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{PRICING[tier].name} Plan</h3>
            <p className="text-sm text-muted-foreground">
              ${PRICING[tier].price}/month
            </p>
          </div>
          <Badge variant="secondary">{tier}</Badge>
        </div>
        <ul className="space-y-2 text-sm">
          {PRICING[tier].features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-element">Card Information</Label>
        <div
          id="card-element"
          className="rounded-md border bg-background p-3"
          data-testid="input-card-element"
        >
          <CardElement options={cardElementOptions} />
        </div>
        <p className="text-xs text-muted-foreground">
          Your payment information is securely processed by Stripe
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!stripe || isProcessing || !PRICING[tier].priceId}
          data-testid="button-complete-payment"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting Your Trial...
            </>
          ) : (
            <>
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Main Component
export default function TenantSignupPage() {
  const [step, setStep] = useState(1);
  const [tier, setTier] = useState<Tier>("free");
  const [formData, setFormData] = useState<OrganizationFormData>({
    rescueName: "",
    subdomain: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
  });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState<string>("");
  const [errors, setErrors] = useState<Partial<Record<keyof OrganizationFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [subdomainCheckStatus, setSubdomainCheckStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({ checking: false, available: null, message: "" });
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  // Get tier from URL query params on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tierParam = urlParams.get("tier");
    if (tierParam && (tierParam === "free" || tierParam === "professional")) {
      setTier(tierParam);
    }
  }, []);

  // Check subdomain availability (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.subdomain.length >= 3) {
        checkSubdomainAvailability(formData.subdomain);
      } else {
        setSubdomainCheckStatus({ checking: false, available: null, message: "" });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.subdomain]);

  const checkSubdomainAvailability = async (subdomain: string) => {
    setSubdomainCheckStatus({ checking: true, available: null, message: "" });

    try {
      // Add cache-busting parameter and no-cache headers
      const response = await fetch(`/api/auth/platform/check-subdomain/${subdomain}?t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      const data = await response.json();
      setSubdomainCheckStatus({
        checking: false,
        available: data.available,
        message: data.message,
      });
    } catch (error) {
      setSubdomainCheckStatus({
        checking: false,
        available: null,
        message: "Failed to check identifier availability",
      });
    }
  };

  const validateStep1 = (): boolean => {
    try {
      organizationSchema.parse(formData);
      setErrors({});

      // Additional check for identifier availability
      if (!subdomainCheckStatus.available) {
        setErrors({ subdomain: "Please choose an available identifier" });
        return false;
      }

      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof OrganizationFormData, string>> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof OrganizationFormData] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep1()) {
      toast({
        title: "Validation error",
        description: "Please fix the errors before continuing",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create tenant
      const response = await apiRequest("POST", "/api/auth/platform/signup", {
        rescueName: formData.rescueName,
        subdomain: formData.subdomain,
        adminEmail: formData.adminEmail,
        adminPassword: formData.password,
        tier,
      });

      const data = await response.json();

      if (data.success && data.tenantId) {
        setTenantId(data.tenantId);
        setSubdomain(data.subdomain);
        // Store subdomain for later retrieval
        sessionStorage.setItem("signup_subdomain", data.subdomain);
        
        // Free tier: skip payment, go directly to success
        if (tier === "free") {
          toast({
            title: "Account created!",
            description: "Your free account is ready to use.",
          });
          navigate(`/platform/signup/success?subdomain=${data.subdomain}`);
        } else {
          // Professional tier: proceed to payment
          setStep(2);
          toast({
            title: "Organization created!",
            description: "Now let's set up your payment method.",
          });
        }
      } else {
        throw new Error(data.message || "Failed to create organization");
      }
    } catch (err: any) {
      console.error("Signup error:", err);
      toast({
        title: "Signup failed",
        description: err.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = (successSubdomain: string) => {
    sessionStorage.removeItem("signup_subdomain");
    // Redirect to success page with subdomain
    navigate(`/platform/signup/success?subdomain=${successSubdomain}`);
  };

  const handleBackFromPayment = () => {
    setStep(1);
  };

  const handleGoToLogin = () => {
    // Redirect to tenant-specific login page using path-based routing
    window.location.href = `https://irescue.life/${subdomain}/login`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            {step === 1 && <Building2 className="h-6 w-6 text-primary" />}
            {step === 2 && <CreditCard className="h-6 w-6 text-primary" />}
            {step === 3 && <CheckCircle2 className="h-6 w-6 text-primary" />}
            <CardTitle className="text-2xl">
              {step === 1 && "Create Your Account"}
              {step === 2 && "Complete Your Subscription"}
              {step === 3 && "Welcome to iRescue!"}
            </CardTitle>
          </div>
          {step < 3 && (
            <>
              <CardDescription>
                Step {step} of {totalSteps - 1}
              </CardDescription>
              <Progress value={progress} className="h-2" data-testid="progress-indicator" />
            </>
          )}
        </CardHeader>
        <CardContent>
          {tier === "professional" && !arePriceIdsConfigured && (
            <Alert variant="destructive" className="mb-6" data-testid="alert-missing-price-ids">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Payment system is not configured. VITE_STRIPE_PROFESSIONAL_PRICE_ID is missing.
                Please contact support to complete your signup for the Professional tier.
              </AlertDescription>
            </Alert>
          )}
          {/* Step 1: Organization Details */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-6">
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800" data-testid="alert-custom-domain-info">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-100">
                  <strong>Your Portal URL:</strong> Access your portal at irescue.life/youridentifier. 
                  {tier === "free" && " Want your own professional domain (e.g., happypaws.org)? Upgrade to Professional to enable custom domain integration."}
                  {tier === "professional" && " As a Professional subscriber, you can configure a custom domain (e.g., happypaws.org) in settings after signup."}
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rescue-name">
                    Rescue Organization Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="rescue-name"
                    value={formData.rescueName}
                    onChange={(e) => setFormData({ ...formData, rescueName: e.target.value })}
                    placeholder="Happy Paws Animal Rescue"
                    required
                    data-testid="input-rescue-name"
                  />
                  {errors.rescueName && (
                    <p className="text-sm text-destructive" data-testid="error-rescue-name">
                      {errors.rescueName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subdomain">
                    Choose Your Account Identifier <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      irescue.life/
                    </span>
                    <Input
                      id="subdomain"
                      value={formData.subdomain}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""),
                        })
                      }
                      placeholder="happypaws"
                      required
                      data-testid="input-subdomain"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your trial portal URL. Upgrade later to use your own custom domain.
                  </p>
                  {subdomainCheckStatus.checking && (
                    <p className="text-sm text-muted-foreground" data-testid="text-subdomain-checking">
                      Checking identifier availability...
                    </p>
                  )}
                  {subdomainCheckStatus.available === true && (
                    <p className="text-sm text-green-600 flex items-center gap-1" data-testid="text-subdomain-available">
                      <CheckCircle2 className="h-3 w-3" />
                      {subdomainCheckStatus.message}
                    </p>
                  )}
                  {subdomainCheckStatus.available === false && (
                    <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-subdomain-unavailable">
                      <AlertCircle className="h-3 w-3" />
                      {subdomainCheckStatus.message}
                    </p>
                  )}
                  {errors.subdomain && (
                    <p className="text-sm text-destructive" data-testid="error-subdomain">
                      {errors.subdomain}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">
                    Admin Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                    placeholder="admin@happypaws.org"
                    required
                    data-testid="input-admin-email"
                  />
                  {errors.adminEmail && (
                    <p className="text-sm text-destructive" data-testid="error-admin-email">
                      {errors.adminEmail}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    Password <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                    data-testid="input-password"
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive" data-testid="error-password">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">
                    Confirm Password <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Re-enter your password"
                    required
                    minLength={8}
                    data-testid="input-confirm-password"
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive" data-testid="error-confirm-password">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                <div className="rounded-md bg-muted p-4 space-y-2">
                  <p className="text-sm font-medium">Selected Plan</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{PRICING[tier].name}</p>
                      <p className="text-xs text-muted-foreground">${PRICING[tier].price}/month</p>
                    </div>
                    <Badge variant="secondary" data-testid="text-selected-tier">
                      {tier}
                    </Badge>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !subdomainCheckStatus.available || !arePriceIdsConfigured}
                data-testid="button-continue-to-payment"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Organization...
                  </>
                ) : (
                  <>
                    Continue to Payment
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Step 2: Payment */}
          {step === 2 && tenantId && stripePromise && arePriceIdsConfigured && (
            <Elements stripe={stripePromise}>
              <PaymentForm
                tier={tier}
                tenantId={tenantId}
                email={formData.adminEmail}
                rescueName={formData.rescueName}
                onSuccess={handlePaymentSuccess}
                onBack={handleBackFromPayment}
              />
            </Elements>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-500/10 p-4">
                  <CheckCircle2 className="h-12 w-12 text-green-600" data-testid="icon-success" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold" data-testid="text-success-title">
                  Your account is ready!
                </h3>
                <p className="text-muted-foreground" data-testid="text-success-message">
                  Your subscription has been activated and your rescue portal is all set up.
                </p>
              </div>
              <div className="rounded-md border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Your Trial Portal URL:</p>
                <p className="text-sm font-mono text-primary" data-testid="text-portal-url">
                  https://irescue.life/{subdomain}
                </p>
                <p className="text-xs text-muted-foreground">
                  Upgrade to use your own custom domain (e.g., happypaws.org)
                </p>
              </div>
              <Button onClick={handleGoToLogin} className="w-full" data-testid="button-go-to-login">
                Go to Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
