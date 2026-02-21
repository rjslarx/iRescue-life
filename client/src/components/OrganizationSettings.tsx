import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Building2, Stethoscope, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
  { value: "DC", label: "District of Columbia" },
];

const organizationSettingsSchema = z.object({
  orgLegalName: z.string().optional().nullable(),
  orgAddressStreet: z.string().optional().nullable(),
  orgAddressCity: z.string().optional().nullable(),
  orgAddressState: z.string().optional().nullable(),
  orgAddressZip: z.string().optional().nullable(),
  orgPhonePublic: z.string().optional().nullable(),
  orgEmailRecords: z.string().email("Invalid email address").optional().or(z.literal("")),
  orgWebsiteUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  orgStateLicenseNumber: z.string().optional().nullable(),
  orgUsdaLicenseNumber: z.string().optional().nullable(),
  supervisingVetName: z.string().optional().nullable(),
  supervisingVetLicense: z.string().optional().nullable(),
  orgTaxEin: z.string().optional().nullable(),
});

type OrganizationSettingsData = z.infer<typeof organizationSettingsSchema>;

export default function OrganizationSettings() {
  const { toast } = useToast();

  const { data: tenantData, isLoading } = useQuery<{ tenant: any }>({
    queryKey: ['/api/tenant'],
  });

  const form = useForm<OrganizationSettingsData>({
    resolver: zodResolver(organizationSettingsSchema),
    defaultValues: {
      orgLegalName: "",
      orgAddressStreet: "",
      orgAddressCity: "",
      orgAddressState: "",
      orgAddressZip: "",
      orgPhonePublic: "",
      orgEmailRecords: "",
      orgWebsiteUrl: "",
      orgStateLicenseNumber: "",
      orgUsdaLicenseNumber: "",
      supervisingVetName: "",
      supervisingVetLicense: "",
      orgTaxEin: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (settings: OrganizationSettingsData) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/organization', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Organization settings saved",
        description: "Your organization's legal and veterinary information has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OrganizationSettingsData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const tenant = tenantData?.tenant;

  if (tenant && !form.formState.isDirty) {
    const currentValues = form.getValues();
    const needsReset = 
      currentValues.orgLegalName !== (tenant.orgLegalName || "") ||
      currentValues.orgAddressStreet !== (tenant.orgAddressStreet || "") ||
      currentValues.orgAddressCity !== (tenant.orgAddressCity || "") ||
      currentValues.orgAddressState !== (tenant.orgAddressState || "") ||
      currentValues.orgAddressZip !== (tenant.orgAddressZip || "") ||
      currentValues.orgPhonePublic !== (tenant.orgPhonePublic || "") ||
      currentValues.orgEmailRecords !== (tenant.orgEmailRecords || "") ||
      currentValues.orgWebsiteUrl !== (tenant.orgWebsiteUrl || "") ||
      currentValues.orgStateLicenseNumber !== (tenant.orgStateLicenseNumber || "") ||
      currentValues.orgUsdaLicenseNumber !== (tenant.orgUsdaLicenseNumber || "") ||
      currentValues.supervisingVetName !== (tenant.supervisingVetName || "") ||
      currentValues.supervisingVetLicense !== (tenant.supervisingVetLicense || "") ||
      currentValues.orgTaxEin !== (tenant.orgTaxEin || "");
    
    if (needsReset) {
      form.reset({
        orgLegalName: tenant.orgLegalName || "",
        orgAddressStreet: tenant.orgAddressStreet || "",
        orgAddressCity: tenant.orgAddressCity || "",
        orgAddressState: tenant.orgAddressState || "",
        orgAddressZip: tenant.orgAddressZip || "",
        orgPhonePublic: tenant.orgPhonePublic || "",
        orgEmailRecords: tenant.orgEmailRecords || "",
        orgWebsiteUrl: tenant.orgWebsiteUrl || "",
        orgStateLicenseNumber: tenant.orgStateLicenseNumber || "",
        orgUsdaLicenseNumber: tenant.orgUsdaLicenseNumber || "",
        supervisingVetName: tenant.supervisingVetName || "",
        supervisingVetLicense: tenant.supervisingVetLicense || "",
        orgTaxEin: tenant.orgTaxEin || "",
      });
    }
  }

  return (
    <Card data-testid="card-organization-settings">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <CardTitle>Organization Legal Settings</CardTitle>
        </div>
        <CardDescription>
          Configure your organization's legal identity for official documents like Medical Transfer Packets
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Contact Information
              </div>
              
              <FormField
                control={form.control}
                name="orgLegalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Legal Organization Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Happy Paws Rescue, Inc." 
                        data-testid="input-org-legal-name"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Official legal name as registered with the state
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="orgAddressStreet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="123 Rescue Lane" 
                        data-testid="input-org-address-street"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="orgAddressCity"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Austin" 
                          data-testid="input-org-address-city"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orgAddressState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-org-address-state">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.value} value={state.value}>
                              {state.value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orgAddressZip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="78701" 
                          data-testid="input-org-address-zip"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="orgPhonePublic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Public Phone Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(555) 123-4567" 
                          data-testid="input-org-phone"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orgEmailRecords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Records Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email"
                          placeholder="records@happypaws.org" 
                          data-testid="input-org-email-records"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Email for records requests from receiving organizations
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="orgWebsiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://www.happypawsrescue.org" 
                        data-testid="input-org-website"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                License Numbers
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="orgStateLicenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State License Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="LA-SHELTER-12345" 
                          data-testid="input-org-state-license"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        State shelter/rescue license number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orgUsdaLicenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>USDA License Number (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="72-A-0123" 
                          data-testid="input-org-usda-license"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Required for commercial breeders/dealers
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="orgTaxEin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax EIN</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="XX-XXXXXXX" 
                        data-testid="input-org-tax-ein"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Employer Identification Number for receiving organizations to verify 501(c)(3) status
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Stethoscope className="h-4 w-4" />
                Veterinary Authority
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="supervisingVetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supervising Veterinarian Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Dr. Jane Smith, DVM" 
                          data-testid="input-supervising-vet-name"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Veterinarian supervising medical protocols
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supervisingVetLicense"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Veterinarian License Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="VET-12345" 
                          data-testid="input-supervising-vet-license"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        State veterinary license number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={updateMutation.isPending}
              data-testid="button-save-org-settings"
            >
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Organization Settings
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
