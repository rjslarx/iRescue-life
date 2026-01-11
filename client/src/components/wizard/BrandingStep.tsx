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
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, Palette } from "lucide-react";

interface BrandingStepProps {
  onNext: () => void;
}

const brandingSchema = z.object({
  logoUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g., #3B82F6)").optional().or(z.literal("")),
});

type BrandingFormData = z.infer<typeof brandingSchema>;

export default function BrandingStep({ onNext }: BrandingStepProps) {
  const { toast } = useToast();

  // Fetch current tenant branding
  const { data: tenant, isLoading: isLoadingTenant } = useQuery<{
    id: string;
    logoUrl?: string;
    heroImageUrl?: string;
    branding?: {
      primaryColor?: string;
    };
  }>({
    queryKey: ['/api/tenant'],
  });

  const form = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      logoUrl: tenant?.logoUrl || "",
      heroImageUrl: tenant?.heroImageUrl || "",
      primaryColor: tenant?.branding?.primaryColor || "",
    },
    values: tenant ? {
      logoUrl: tenant.logoUrl || "",
      heroImageUrl: tenant.heroImageUrl || "",
      primaryColor: tenant.branding?.primaryColor || "",
    } : undefined,
  });

  const updateBrandingMutation = useMutation({
    mutationFn: async (data: BrandingFormData) => {
      const payload = {
        logoUrl: data.logoUrl,
        heroImageUrl: data.heroImageUrl,
        primaryColor: data.primaryColor, // Send as top-level field, backend will nest it in branding JSONB
      };
      const response = await apiRequest("PATCH", "/api/tenant/settings/branding", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Branding saved!",
        description: "Your visual identity has been updated.",
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


  const onSubmit = (data: BrandingFormData) => {
    updateBrandingMutation.mutate(data);
  };

  const onSkip = () => {
    toast({
      title: "Branding skipped",
      description: "You can add your branding later in Settings.",
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

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Palette className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Brand your rescue</h2>
        <p className="text-muted-foreground">
          Upload your logo and choose colors to make your site uniquely yours.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visual Identity</CardTitle>
          <CardDescription>
            Customize the look and feel of your public website
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo</FormLabel>
                    <FormControl>
                      <div className="space-y-3">
                        {field.value && (
                          <div className="flex items-center gap-4">
                            <img
                              src={field.value}
                              alt="Logo preview"
                              className="h-20 w-20 object-contain border rounded-md bg-muted"
                              data-testid="img-logo-preview"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => form.setValue("logoUrl", "")}
                              data-testid="button-remove-logo"
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                        <ObjectUploader
                          value={field.value ? [field.value] : []}
                          onChange={(urls) => {
                            const url = urls[0] || "";
                            form.setValue("logoUrl", url);
                          }}
                          maxFiles={1}
                          uploadEndpoint="/api/animals/photos/upload"
                          showPreview={false}
                          buttonText={field.value ? "Change Logo" : "Upload Logo"}
                          data-testid="uploader-logo"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Your organization's logo (PNG or JPG, max 10MB)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="heroImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hero Image</FormLabel>
                    <FormControl>
                      <div className="space-y-3">
                        {field.value && (
                          <div className="space-y-2">
                            <img
                              src={field.value}
                              alt="Hero preview"
                              className="w-full h-40 object-cover border rounded-md"
                              data-testid="img-hero-preview"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => form.setValue("heroImageUrl", "")}
                              data-testid="button-remove-hero"
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                        <ObjectUploader
                          value={field.value ? [field.value] : []}
                          onChange={(urls) => {
                            const url = urls[0] || "";
                            form.setValue("heroImageUrl", url);
                          }}
                          maxFiles={1}
                          uploadEndpoint="/api/animals/photos/upload"
                          showPreview={false}
                          buttonText={field.value ? "Change Hero Image" : "Upload Hero Image"}
                          data-testid="uploader-hero"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Large banner image for your homepage (PNG or JPG, max 10MB)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="primaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Color (Optional)</FormLabel>
                    <FormControl>
                      <div className="flex gap-3 items-center">
                        <Input 
                          placeholder="#3B82F6" 
                          {...field} 
                          data-testid="input-primary-color"
                          className="max-w-xs"
                        />
                        {field.value && (
                          <div
                            className="h-10 w-20 rounded-md border"
                            style={{ backgroundColor: field.value }}
                            data-testid="preview-primary-color"
                          />
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Your brand color in hex format (e.g., #3B82F6)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-between pt-4">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={onSkip}
                  data-testid="button-skip-branding"
                >
                  Skip for Now
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateBrandingMutation.isPending}
                  data-testid="button-save-branding"
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
