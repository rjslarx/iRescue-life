import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, ExternalLink, Shield } from "lucide-react";
import type { Tenant } from "@shared/schema";

const legalPagesSchema = z.object({
  privacyPolicyUrl: z.string().url("Please enter a valid URL").or(z.literal("")),
  termsOfServiceUrl: z.string().url("Please enter a valid URL").or(z.literal("")),
});

type LegalPagesFormData = z.infer<typeof legalPagesSchema>;

export default function LegalPagesSettings() {
  const { toast } = useToast();

  const { data: tenantData, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
  });

  const tenant = tenantData?.tenant;

  const form = useForm<LegalPagesFormData>({
    resolver: zodResolver(legalPagesSchema),
    defaultValues: {
      privacyPolicyUrl: "",
      termsOfServiceUrl: "",
    },
  });

  useEffect(() => {
    if (tenant) {
      form.reset({
        privacyPolicyUrl: tenant.privacyPolicyUrl || "",
        termsOfServiceUrl: tenant.termsOfServiceUrl || "",
      });
    }
  }, [tenant, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: LegalPagesFormData) => {
      return apiRequest("PATCH", "/api/tenant/settings/legal-pages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Legal pages updated",
        description: "Your privacy policy and terms of service links have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save legal page settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LegalPagesFormData) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Legal Page Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Add links to your organization's privacy policy and terms of service. These will appear in your website footer and on public forms. If left blank, the platform's default policies will be used.
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="privacyPolicyUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Privacy Policy URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://yourrescue.org/privacy-policy"
                        {...field}
                        data-testid="input-privacy-policy-url"
                      />
                    </FormControl>
                    <FormDescription>
                      Link to your organization's privacy policy page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="termsOfServiceUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms of Service URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://yourrescue.org/terms-of-service"
                        {...field}
                        data-testid="input-terms-of-service-url"
                      />
                    </FormControl>
                    <FormDescription>
                      Link to your organization's terms of service page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-4 flex-wrap">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-save-legal-pages"
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Legal Pages
                </Button>

                {tenant?.privacyPolicyUrl && (
                  <a href={tenant.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-preview-privacy">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Preview Privacy Policy
                  </a>
                )}
                {tenant?.termsOfServiceUrl && (
                  <a href={tenant.termsOfServiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-preview-terms">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Preview Terms of Service
                  </a>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
