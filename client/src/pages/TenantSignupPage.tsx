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
import { Building2, CheckCircle2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { z } from "zod";


// Two-tier pricing model:
// - Free: No payment required, 5% platform fee on donations
// - Professional: $39/mo subscription, 0% platform fee
const PRICING = {
  free: {
    price: 0,
    name: "Free",
    features: [
      "Unlimited animals",
      "500 emails/month",
      "Basic reporting",
      "5% platform fee on donations & adoptions",
    ],
  },
  professional: {
    price: 39,
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

// Organization Details Schema
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

// Main Component
export default function TenantSignupPage() {
  const [startProTrial, setStartProTrial] = useState(false);
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

  const validateForm = (): boolean => {
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
      // Create tenant
      const response = await apiRequest("POST", "/api/auth/platform/signup", {
        rescueName: formData.rescueName,
        subdomain: formData.subdomain,
        adminEmail: formData.adminEmail,
        adminPassword: formData.password,
        startProTrial: startProTrial,
      });

      const data = await response.json();

      if (data.success && data.tenantId) {
        // Account is now active immediately (Free or Pro trial)
        const successMessage = startProTrial 
          ? "Your 14-day Pro trial has started! Enjoy 0% platform fees."
          : "Your free account is ready to use.";
        
        toast({
          title: "Account created!",
          description: successMessage,
        });
        
        // Navigate to success page with trial info
        const successUrl = startProTrial 
          ? `/platform/signup/success?subdomain=${data.subdomain}&trial=true`
          : `/platform/signup/success?subdomain=${data.subdomain}`;
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Create Your Free Account</CardTitle>
          </div>
          <CardDescription>
            Get started with iRescue.life - no payment required
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFormSubmit} className="space-y-6">
              <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" data-testid="alert-free-account-info">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-100">
                  <strong>Free Forever:</strong> Create your account instantly with no payment required. 
                  Start a 14-day Pro trial anytime to try premium features, then continue free or upgrade.
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
                    Your portal URL. Upgrade to Professional for custom domain support.
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

                {/* Pro Trial Option */}
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="start-pro-trial"
                      checked={startProTrial}
                      onChange={(e) => setStartProTrial(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                      data-testid="checkbox-start-pro-trial"
                    />
                    <div className="flex-1">
                      <Label htmlFor="start-pro-trial" className="text-sm font-medium cursor-pointer">
                        Start 14-day Pro trial (optional)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Try Professional features free for 14 days: 0% platform fees, 10,000 emails/month.
                        No payment required. After trial ends, you'll continue on the Free tier.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Plan Summary */}
                <div className="rounded-md bg-muted p-4 space-y-2">
                  <p className="text-sm font-medium">{startProTrial ? 'Starting with Pro Trial' : 'Free Plan'}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {startProTrial ? PRICING.professional.name : PRICING.free.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {startProTrial ? '14-day free trial, then Free tier' : 'Free forever, upgrade anytime'}
                      </p>
                    </div>
                    <Badge variant={startProTrial ? "default" : "secondary"} data-testid="text-selected-tier">
                      {startProTrial ? 'Pro Trial' : 'Free'}
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {(startProTrial ? PRICING.professional.features : PRICING.free.features).slice(0, 4).map((feature, index) => (
                      <li key={index} className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

            <Button
              type="submit"
              className="w-full"
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
                  {startProTrial ? 'Start Pro Trial' : 'Create Free Account'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
