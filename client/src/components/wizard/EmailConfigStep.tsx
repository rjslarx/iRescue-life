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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mail, CheckCircle } from "lucide-react";

interface EmailConfigStepProps {
  onNext: () => void;
}

const emailConfigSchema = z.object({
  emailMode: z.enum(["platform", "byok"]),
  resendApiKey: z.string().optional(),
  fromEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  fromName: z.string().optional(),
}).refine((data) => {
  if (data.emailMode === "byok") {
    return !!data.resendApiKey && !!data.fromEmail && !!data.fromName;
  }
  return true;
}, {
  message: "All fields are required when using your own Resend API key",
  path: ["resendApiKey"],
});

type EmailConfigFormData = z.infer<typeof emailConfigSchema>;

export default function EmailConfigStep({ onNext }: EmailConfigStepProps) {
  const { toast } = useToast();

  // Fetch current tenant email config
  const { data: tenant, isLoading: isLoadingTenant } = useQuery<{
    id: string;
    resendEnabled: boolean;
    resendFromEmail?: string;
    resendFromName?: string;
    emailsSentThisMonth: number;
    emailQuotaLimit: number;
    subscriptionTier: string;
  }>({
    queryKey: ['/api/tenant'],
  });

  const form = useForm<EmailConfigFormData>({
    resolver: zodResolver(emailConfigSchema),
    defaultValues: {
      emailMode: tenant?.resendEnabled ? "byok" : "platform",
      resendApiKey: "",
      fromEmail: tenant?.resendFromEmail || "",
      fromName: tenant?.resendFromName || "",
    },
    values: tenant ? {
      emailMode: tenant.resendEnabled ? "byok" : "platform",
      resendApiKey: "",
      fromEmail: tenant.resendFromEmail || "",
      fromName: tenant.resendFromName || "",
    } : undefined,
  });

  const emailMode = form.watch("emailMode");

  const updateEmailMutation = useMutation({
    mutationFn: async (data: EmailConfigFormData) => {
      if (data.emailMode === "byok") {
        const response = await apiRequest("PATCH", "/api/tenant/settings/email", {
          resendApiKey: data.resendApiKey,
          resendFromEmail: data.fromEmail,
          resendFromName: data.fromName,
        });
        return response.json();
      } else {
        // Use platform credits - clear any BYOK settings
        const response = await apiRequest("PATCH", "/api/tenant/settings/email", {
          resendApiKey: null,
          resendFromEmail: null,
          resendFromName: null,
        });
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Email settings saved!",
        description: emailMode === "platform" 
          ? "You're using platform email credits." 
          : "Your Resend API key has been configured.",
      });
      onNext();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EmailConfigFormData) => {
    updateEmailMutation.mutate(data);
  };

  const onSkip = () => {
    toast({
      title: "Email config skipped",
      description: "You can configure email settings later in Settings.",
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

  const quotaUsagePercent = tenant 
    ? (tenant.emailsSentThisMonth / tenant.emailQuotaLimit) * 100 
    : 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Configure Email</h2>
        <p className="text-muted-foreground">
          Choose how you want to send emails to adopters and supporters.
        </p>
      </div>

      {tenant && !tenant.resendEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Current Email Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">This month</span>
                <span className="font-medium" data-testid="text-email-usage">
                  {tenant.emailsSentThisMonth} / {tenant.emailQuotaLimit} emails
                </span>
              </div>
              <Progress value={quotaUsagePercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Your {tenant.subscriptionTier} plan includes {tenant.emailQuotaLimit} emails per month
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Email Service</CardTitle>
          <CardDescription>
            Choose your email delivery method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="emailMode"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Email Delivery Method</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-3"
                      >
                        <div className="flex items-start space-x-3 space-y-0">
                          <RadioGroupItem value="platform" id="platform" data-testid="radio-platform-credits" />
                          <div className="space-y-1 leading-none">
                            <label
                              htmlFor="platform"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              Use platform email credits
                            </label>
                            <p className="text-sm text-muted-foreground">
                              Easiest option. Uses your subscription's included email quota.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 space-y-0">
                          <RadioGroupItem value="byok" id="byok" data-testid="radio-byok" />
                          <div className="space-y-1 leading-none">
                            <label
                              htmlFor="byok"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              Bring your own Resend API key
                            </label>
                            <p className="text-sm text-muted-foreground">
                              For advanced users. Unlimited emails with your own Resend account.
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {emailMode === "byok" && (
                <div className="space-y-4 pl-6 border-l-2">
                  <FormField
                    control={form.control}
                    name="resendApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resend API Key *</FormLabel>
                        <FormControl>
                          <Input 
                            type="password"
                            placeholder="re_..." 
                            {...field} 
                            data-testid="input-resend-api-key"
                          />
                        </FormControl>
                        <FormDescription>
                          Get your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">resend.com/api-keys</a>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fromEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Email *</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="noreply@yourdomain.com" 
                            {...field} 
                            data-testid="input-from-email"
                          />
                        </FormControl>
                        <FormDescription>
                          The email address that appears as the sender
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Happy Paws Rescue" 
                            {...field} 
                            data-testid="input-from-name"
                          />
                        </FormControl>
                        <FormDescription>
                          The name that appears as the sender
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={onSkip}
                  data-testid="button-skip-email"
                >
                  Skip for Now
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateEmailMutation.isPending}
                  data-testid="button-save-email"
                >
                  {updateEmailMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Continue"
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
