import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface SignupData {
  rescueName: string;
  subdomain: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export default function SignupForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<SignupData>({
    rescueName: "",
    subdomain: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const { setTenantId } = useTenant();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      setIsLoading(true);
      try {
        const response = await apiRequest('POST', '/api/signup', formData);
        const data = await response.json();

        if (data.success) {
          setSuccess(true);
          setSuccessMessage(data.message || `Successfully created ${data.tenant.name}!`);
          setTenantId(data.tenant.subdomain);
          
          toast({
            title: "Portal created!",
            description: `You can now access your portal at ${data.tenant.subdomain}.rescueportal.com`,
          });
        } else {
          setError(data.error || "Signup failed");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Create Your Rescue Portal</CardTitle>
          </div>
          <CardDescription>
            Step {step} of {totalSteps}
          </CardDescription>
          <Progress value={progress} className="h-2" />
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert className="border-green-500/50 bg-green-500/10" data-testid="alert-signup-success">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600">
                  {successMessage}
                </AlertDescription>
              </Alert>
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Your portal has been created successfully! You can now log in to start managing your rescue.
                </p>
                <Button onClick={() => navigate("/login")} data-testid="button-goto-login">
                  Go to Login
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" data-testid="alert-signup-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rescue-name">Rescue Organization Name *</Label>
                  <Input
                    id="rescue-name"
                    value={formData.rescueName}
                    onChange={(e) => setFormData({ ...formData, rescueName: e.target.value })}
                    placeholder="Sunny Paws Animal Rescue"
                    required
                    data-testid="input-rescue-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subdomain">Choose Your Subdomain *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="subdomain"
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                      placeholder="sunnypaws"
                      required
                      data-testid="input-subdomain"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      .rescueportal.com
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This will be your unique portal URL
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Your Full Name *</Label>
                  <Input
                    id="admin-name"
                    value={formData.adminName}
                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                    placeholder="Jane Smith"
                    required
                    data-testid="input-admin-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Your Email *</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                    placeholder="jane@sunnypaws.org"
                    required
                    data-testid="input-admin-email"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Create Password *</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={formData.adminPassword}
                    onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                    data-testid="input-admin-password"
                  />
                </div>
                <div className="rounded-md bg-muted p-4 space-y-2">
                  <p className="text-sm font-medium">Review Your Information</p>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Rescue: {formData.rescueName}</p>
                    <p>Portal: {formData.subdomain}.rescueportal.com</p>
                    <p>Admin: {formData.adminName} ({formData.adminEmail})</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(step - 1)}
                    disabled={isLoading}
                    data-testid="button-back"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                  data-testid="button-next"
                >
                  {isLoading ? (
                    "Creating..."
                  ) : step < totalSteps ? (
                    <>
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    "Create Portal"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
