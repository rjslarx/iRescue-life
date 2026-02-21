import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Globe, CheckCircle, AlertCircle } from "lucide-react";

interface DomainStepProps {
  onNext: () => void;
}

const domainSchema = z.object({
  customDomain: z.string().regex(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i, "Invalid domain format").optional().or(z.literal("")),
});

type DomainFormData = z.infer<typeof domainSchema>;

export default function DomainStep({ onNext }: DomainStepProps) {
  const { toast } = useToast();

  // Fetch current tenant domain config
  const { data: tenant, isLoading: isLoadingTenant } = useQuery<{
    id: string;
    subdomain: string;
    customDomain?: string;
    customDomainVerified: boolean;
  }>({
    queryKey: ['/api/tenant'],
  });

  const form = useForm<DomainFormData>({
    resolver: zodResolver(domainSchema),
    defaultValues: {
      customDomain: tenant?.customDomain || "",
    },
    values: tenant ? {
      customDomain: tenant.customDomain || "",
    } : undefined,
  });

  const updateDomainMutation = useMutation({
    mutationFn: async (data: DomainFormData) => {
      if (!data.customDomain) {
        // Skip if no domain provided
        return null;
      }
      const response = await apiRequest("PATCH", "/api/tenant/custom-domain", {
        customDomain: data.customDomain,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Domain saved!",
        description: "Our team will email you DNS setup instructions within 24 hours.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: DomainFormData) => {
    if (data.customDomain) {
      await updateDomainMutation.mutateAsync(data);
    } else {
      onNext();
    }
  };

  const onSkip = () => {
    toast({
      title: "Custom domain skipped",
      description: "You can add a custom domain later in Settings.",
    });
    onNext();
  };

  if (isLoadingTenant) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const domainValue = form.watch("customDomain");
  const showDnsInstructions = domainValue && domainValue.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Globe className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Custom Domain (Optional)</h2>
        <p className="text-muted-foreground">
          Use your own domain instead of irescue.life/{tenant?.subdomain}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domain Settings</CardTitle>
          <CardDescription>
            Point your own domain to your rescue website
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="customDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Domain (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="www.happypaws.org" 
                        {...field} 
                        data-testid="input-custom-domain"
                      />
                    </FormControl>
                    <FormDescription>
                      Enter your domain (e.g., www.yourrescue.org or yourrescue.org)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {tenant?.customDomain && tenant.customDomainVerified && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium">Domain verified!</span> Your site is accessible at {tenant.customDomain}
                  </AlertDescription>
                </Alert>
              )}

              {showDnsInstructions && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">Custom Domain Setup Process</h4>
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
                        <li><strong>Save your domain</strong> - Click "Save & Continue" to submit your domain request</li>
                        <li><strong>We'll send you DNS records</strong> - Our team will email you the specific A record and TXT record values</li>
                        <li><strong>Configure DNS</strong> - Add the records at your domain registrar (GoDaddy, Namecheap, etc.)</li>
                        <li><strong>SSL activation</strong> - We'll provision your SSL certificate once DNS propagates</li>
                      </ol>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      You'll receive an email with your DNS records within 24 hours of submitting this form. DNS changes typically take 5 minutes to 48 hours to propagate.
                    </p>
                  </div>

                  {tenant?.customDomain && !tenant.customDomainVerified && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-sm text-yellow-800 dark:text-yellow-200">
                        Awaiting DNS configuration - check your email for setup instructions
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={onSkip}
                  data-testid="button-skip-domain"
                >
                  Skip for Now
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateDomainMutation.isPending}
                  data-testid="button-save-domain"
                >
                  {updateDomainMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    domainValue ? "Save & Continue" : "Continue"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
