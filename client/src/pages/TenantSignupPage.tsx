import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PawPrint, CheckCircle2, AlertCircle, ArrowRight, Loader2, Heart, Zap, Crown } from "lucide-react";
import { z } from "zod";

const TEAL = "#2B8CA3";
const TEAL_LIGHT = "#EDF6F8";

const TIERS = {
  lite: {
    name: "Lite",
    price: 0,
    tagline: "Free forever — no credit card required",
    fee: "5% platform fee on Stripe transactions",
    features: [
      "Unlimited animals & team members",
      "Public website with adoptable profiles",
      "Stripe donation & adoption payments",
      "Use your own JotForm / Google Forms",
      "Event calendar & volunteer signups",
      "Analytics & reporting",
    ],
  },
  professional: {
    name: "Professional",
    price: 39,
    tagline: "14-day free trial, then $39/mo",
    fee: "0% platform fees — keep every dollar",
    features: [
      "Everything in Lite, plus:",
      "Built-in adoption & foster pipelines",
      "Medical pipeline dashboard",
      "E-signature contracts & PDFs",
      "Custom forms builder",
      "Grant tracking & compliance",
    ],
  },
};

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

export default function TenantSignupPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tierParam = urlParams.get("tier");
  const initialTier: "lite" | "professional" = tierParam === "professional" ? "professional" : "lite";

  const [selectedTier, setSelectedTier] = useState<"lite" | "professional">(initialTier);
  const [formData, setFormData] = useState<OrganizationFormData>({
    rescueName: "",
    subdomain: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof OrganizationFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [subdomainCheckStatus, setSubdomainCheckStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({ checking: false, available: null, message: "" });
  const { toast } = useToast();
  const [, navigate] = useLocation();

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

  const validateForm = (): boolean => {
    try {
      organizationSchema.parse(formData);
      setErrors({});
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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast({
        title: "Validation error",
        description: "Please fix the errors before continuing",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/platform/signup", {
        rescueName: formData.rescueName,
        subdomain: formData.subdomain,
        adminEmail: formData.adminEmail,
        adminPassword: formData.password,
        startProTrial: selectedTier === "professional",
      });

      const data = await response.json();

      if (data.success && data.tenantId) {
        const successMessage = selectedTier === "professional"
          ? "Your 14-day Pro trial has started! Enjoy 0% platform fees."
          : "Your Lite account is ready to use.";

        toast({
          title: "Account created!",
          description: successMessage,
        });

        const successUrl = selectedTier === "professional"
          ? `/platform/signup/success?subdomain=${data.subdomain}&tier=professional`
          : `/platform/signup/success?subdomain=${data.subdomain}&tier=lite`;
        navigate(successUrl);
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

  const tier = TIERS[selectedTier];
  const isPro = selectedTier === "professional";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ backgroundColor: TEAL }}>
              <PawPrint className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl">iRescue.life</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="heading-signup">Create Your Account</h1>
          <p className="text-muted-foreground">Get your rescue up and running in minutes</p>
        </div>

        {/* Tier selector */}
        <div className="grid grid-cols-2 gap-3" data-testid="tier-selector">
          <button
            type="button"
            onClick={() => setSelectedTier("lite")}
            className={`relative rounded-lg border-2 p-4 text-left transition-colors ${
              !isPro ? "border-current" : "border-border hover-elevate"
            }`}
            style={!isPro ? { borderColor: TEAL } : undefined}
            data-testid="button-select-lite"
          >
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-4 w-4" style={{ color: TEAL }} />
              <span className="font-semibold">Lite</span>
            </div>
            <p className="text-2xl font-bold">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mt-1">5% fee on transactions</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTier("professional")}
            className={`relative rounded-lg border-2 p-4 text-left transition-colors ${
              isPro ? "border-current" : "border-border hover-elevate"
            }`}
            style={isPro ? { borderColor: TEAL } : undefined}
            data-testid="button-select-pro"
          >
            <Badge className="absolute -top-2.5 right-3 text-white text-[10px]" style={{ backgroundColor: TEAL }}>
              <Crown className="h-2.5 w-2.5 mr-0.5" />
              BEST VALUE
            </Badge>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4" style={{ color: TEAL }} />
              <span className="font-semibold">Professional</span>
            </div>
            <p className="text-2xl font-bold">$39<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mt-1">0% platform fees</p>
          </button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              {isPro ? <Zap className="h-5 w-5" style={{ color: TEAL }} /> : <Heart className="h-5 w-5" style={{ color: TEAL }} />}
              {isPro ? "Start Your 14-Day Pro Trial" : "Get Started with Lite"}
            </CardTitle>
            <CardDescription>
              {isPro
                ? "Try all Professional features free for 14 days. No payment required upfront."
                : "No payment required. Start managing your rescue today."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFormSubmit} className="space-y-5">
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
                    Your portal URL. {isPro ? "Custom domain support included." : "Upgrade to Pro for custom domain support."}
                  </p>
                  {subdomainCheckStatus.checking && (
                    <p className="text-sm text-muted-foreground" data-testid="text-subdomain-checking">
                      Checking identifier availability...
                    </p>
                  )}
                  {subdomainCheckStatus.available === true && (
                    <p className="text-sm flex items-center gap-1" style={{ color: TEAL }} data-testid="text-subdomain-available">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      placeholder="Re-enter password"
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
                </div>
              </div>

              {/* Plan summary */}
              <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: `${TEAL}40`, backgroundColor: TEAL_LIGHT }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{tier.name} Plan</p>
                    <p className="text-xs text-muted-foreground">{tier.tagline}</p>
                  </div>
                  <Badge style={{ backgroundColor: TEAL }} className="text-white" data-testid="text-selected-tier">
                    {isPro ? "Pro Trial" : "Lite"}
                  </Badge>
                </div>
                <p className="text-xs font-medium" style={{ color: TEAL }}>{tier.fee}</p>
                <ul className="space-y-1 pt-1">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: TEAL }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full text-white"
                style={{ backgroundColor: TEAL }}
                disabled={isLoading || !subdomainCheckStatus.available}
                data-testid="button-create-account"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    {isPro ? "Start Pro Trial" : "Create Lite Account"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                No credit card required for either tier.{" "}
                {!isPro && (
                  <button
                    type="button"
                    onClick={() => setSelectedTier("professional")}
                    className="font-medium hover:underline"
                    style={{ color: TEAL }}
                    data-testid="link-switch-to-pro"
                  >
                    Want to try Pro features?
                  </button>
                )}
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/platform/login" className="font-medium hover:underline" style={{ color: TEAL }} data-testid="link-login">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
