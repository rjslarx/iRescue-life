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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Building2 } from "lucide-react";

interface BasicInfoStepProps {
  onNext: () => void;
}

const basicInfoSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  tagline: z.string().optional(),
  contactEmail: z.string().email("Valid email is required").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

type BasicInfoFormData = z.infer<typeof basicInfoSchema>;

export default function BasicInfoStep({ onNext }: BasicInfoStepProps) {
  const { toast } = useToast();

  // Fetch current tenant info to pre-fill form
  const { data: tenant, isLoading: isLoadingTenant } = useQuery<{
    id: string;
    name: string;
    tagline?: string;
    contactEmail?: string;
    contactPhone?: string;
  }>({
    queryKey: ['/api/tenant'],
  });

  const form = useForm<BasicInfoFormData>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      name: tenant?.name || "",
      tagline: tenant?.tagline || "",
      contactEmail: tenant?.contactEmail || "",
      contactPhone: tenant?.contactPhone || "",
    },
    values: tenant ? {
      name: tenant.name || "",
      tagline: tenant.tagline || "",
      contactEmail: tenant.contactEmail || "",
      contactPhone: tenant.contactPhone || "",
    } : undefined,
  });

  const updateBrandingMutation = useMutation({
    mutationFn: async (data: BasicInfoFormData) => {
      const response = await apiRequest("PATCH", "/api/tenant/settings/branding", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Basic info saved!",
        description: "Your organization details have been updated.",
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

  const onSubmit = (data: BasicInfoFormData) => {
    updateBrandingMutation.mutate(data);
  };

  if (isLoadingTenant) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Tell us about your rescue</h2>
        <p className="text-muted-foreground">
          This information will appear on your public website and helps people learn about your organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>
            Basic information about your rescue organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Happy Paws Rescue" 
                        {...field} 
                        data-testid="input-organization-name"
                      />
                    </FormControl>
                    <FormDescription>
                      The official name of your rescue organization
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tagline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tagline (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Saving lives, one paw at a time" 
                        {...field} 
                        data-testid="input-tagline"
                      />
                    </FormControl>
                    <FormDescription>
                      A short, memorable phrase that describes your mission
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="contact@happypaws.org" 
                        {...field} 
                        data-testid="input-contact-email"
                      />
                    </FormControl>
                    <FormDescription>
                      Public email address for inquiries and adoption applications
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="tel"
                        placeholder="(555) 123-4567" 
                        {...field} 
                        data-testid="input-contact-phone"
                      />
                    </FormControl>
                    <FormDescription>
                      Public phone number for inquiries
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button 
                  type="submit" 
                  disabled={updateBrandingMutation.isPending}
                  data-testid="button-save-continue"
                >
                  {updateBrandingMutation.isPending ? (
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
