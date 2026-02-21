import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Globe, AlertCircle, Loader2, ExternalLink, Trash2, CheckCircle2 } from "lucide-react";
import type { Tenant } from "@shared/schema";

interface CustomDomainSettingsProps {
  tenant: Tenant | undefined;
}

export function CustomDomainSettings({ tenant }: CustomDomainSettingsProps) {
  const { toast } = useToast();
  const [customDomain, setCustomDomain] = useState(tenant?.customDomain || "");

  // Sync local state with tenant prop changes
  useEffect(() => {
    setCustomDomain(tenant?.customDomain || "");
  }, [tenant?.customDomain]);

  const updateCustomDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const response = await apiRequest('PATCH', '/api/tenant/custom-domain', { customDomain: domain });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: "Custom domain saved",
        description: "Our team will email you the DNS records within 24 hours.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save custom domain",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const removeCustomDomainMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/tenant/custom-domain', {});
      return response.json();
    },
    onSuccess: () => {
      setCustomDomain("");
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: "Custom domain removed",
        description: "Your custom domain has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove custom domain",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSaveDomain = () => {
    if (!customDomain) {
      toast({
        title: "Domain required",
        description: "Please enter a domain name.",
        variant: "destructive",
      });
      return;
    }
    updateCustomDomainMutation.mutate(customDomain);
  };

  return (
    <Card data-testid="card-custom-domain">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          <CardTitle>Custom Domain</CardTitle>
        </div>
        <CardDescription>
          Use your own domain name (e.g., yourrescue.org) instead of irescue.life/{tenant?.subdomain}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant?.customDomainVerified ? (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              <strong>Custom domain active:</strong> {tenant.customDomain}
            </AlertDescription>
          </Alert>
        ) : tenant?.customDomain ? (
          <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              <strong>Pending setup:</strong> {tenant.customDomain} - Check your email for DNS setup instructions.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="customDomain">Your Domain</Label>
          <div className="flex gap-2">
            <Input
              id="customDomain"
              placeholder="yourrescue.org"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              data-testid="input-custom-domain"
              disabled={updateCustomDomainMutation.isPending || tenant?.customDomainVerified}
            />
            {!tenant?.customDomainVerified && (
              <Button
                onClick={handleSaveDomain}
                disabled={updateCustomDomainMutation.isPending}
                data-testid="button-save-domain"
              >
                {updateCustomDomainMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your domain without "http://" or "www" (e.g., yourrescue.org)
          </p>
        </div>

        {tenant?.customDomain && (
          <>
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h4 className="font-semibold text-sm">Custom Domain Setup Process</h4>
              <div className="space-y-3 text-sm">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Custom domains require coordination with our platform team to ensure SSL certificates are properly configured.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <p className="font-medium">How it works:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li><strong>Domain saved</strong> - Your domain request has been submitted and our team has been notified</li>
                    <li><strong>DNS records sent</strong> - Our team will email you the specific A record and TXT record values</li>
                    <li><strong>Configure DNS</strong> - Add the records at your domain registrar (GoDaddy, Namecheap, etc.)</li>
                    <li><strong>Verification</strong> - Once DNS propagates, our team will verify and activate your domain</li>
                  </ol>
                </div>
                
                {!tenant.customDomainVerified && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-sm text-yellow-800 dark:text-yellow-200">
                      Awaiting DNS configuration - check your email for setup instructions
                    </span>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  You'll receive an email with your DNS records within 24 hours. DNS changes typically take 5 minutes to 48 hours to propagate.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => removeCustomDomainMutation.mutate()}
                disabled={removeCustomDomainMutation.isPending}
                data-testid="button-remove-domain"
                variant="destructive"
              >
                {removeCustomDomainMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Domain
                  </>
                )}
              </Button>
            </div>

            <Alert>
              <ExternalLink className="h-4 w-4" />
              <AlertDescription>
                <strong>Need help?</strong> Contact our support team at support@irescue.life if you have questions about your custom domain setup.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
