import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Heart, Home, Users, Upload, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useSEO } from "@/hooks/useSEO";
import { useTenant } from "@/contexts/TenantContext";
import { insertFosterApplicationSchema, type InsertFosterApplication, type Tenant, type FosterFormField } from "@shared/schema";

export default function PublicFosterPage() {
  const { toast } = useToast();
  const { tenantId } = useTenant();

  // Include tenantId in queryKey to prevent stale data flash when switching between tenant sites
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
  });

  // Load custom form fields
  const { data: customFieldsData } = useQuery<{ fields: FosterFormField[] }>({
    queryKey: ['/api/foster-form-fields', tenantId],
  });

  // Load form intro text
  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'foster', tenantId],
  });

  const form = useForm<InsertFosterApplication & { customResponses?: Record<string, any> }>({
    resolver: zodResolver(insertFosterApplicationSchema.omit({ tenantId: true, status: true, notes: true })),
    defaultValues: {
      applicantName: "",
      applicantEmail: "",
      applicantPhone: "",
      address: "",
      housingType: "house",
      hasYard: false,
      hasOtherPets: false,
      otherPetsDetails: "",
      experience: "",
      availability: "",
      preferences: "",
      vetReference: "",
      personalReference: "",
      smsConsent: false,
    },
  });

  const [photoUploads, setPhotoUploads] = useState<Record<string, { url: string; name: string; uploading: boolean }>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePhotoUpload = async (fieldId: string, file: File) => {
    setPhotoUploads(prev => ({ ...prev, [fieldId]: { url: '', name: file.name, uploading: true } }));
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldId', fieldId);
      formData.append('formType', 'foster');

      const tenantUrl = buildTenantUrl('/api/public/form-photos/upload');
      const tenantHeaders = getTenantHeaders();
      const response = await fetch(tenantUrl, {
        method: 'POST',
        body: formData,
        headers: tenantHeaders,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      setPhotoUploads(prev => ({ ...prev, [fieldId]: { url: result.fileUrl, name: file.name, uploading: false } }));
      form.setValue(`customResponses.${fieldId}` as any, result.fileUrl);
    } catch (error: any) {
      setPhotoUploads(prev => {
        const newState = { ...prev };
        delete newState[fieldId];
        return newState;
      });
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload photo. Please try again.",
      });
    }
  };

  const removePhoto = (fieldId: string) => {
    setPhotoUploads(prev => {
      const newState = { ...prev };
      delete newState[fieldId];
      return newState;
    });
    form.setValue(`customResponses.${fieldId}` as any, '');
    if (fileInputRefs.current[fieldId]) {
      fileInputRefs.current[fieldId]!.value = '';
    }
  };

  const submitMutation = useMutation({
    mutationFn: async (data: InsertFosterApplication) => {
      return await apiRequest("POST", "/api/foster-applications", data);
    },
    onSuccess: () => {
      toast({
        title: "Application Submitted!",
        description: "Thank you for your interest in fostering. We'll review your application and get back to you soon.",
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit application. Please try again.",
      });
    },
  });

  const onSubmit = (data: InsertFosterApplication) => {
    submitMutation.mutate(data);
  };

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Become a Foster - ${rescueName}`,
    description: `Open your home and heart to animals in need. Apply to become a foster volunteer with ${rescueName} and help save lives while animals await their forever homes.`,
    siteName: rescueName,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader rescueName={tenant?.name || "Animal Rescue"} logoUrl={tenant?.logoUrl || undefined} />

      <main className="flex-1">
        <section className="py-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container px-6">
            <div className="text-center max-w-3xl mx-auto">
              <Heart className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                Become a Foster
              </h1>
              <p className="text-lg text-muted-foreground">
                Open your home and heart to an animal in need. Fostering saves lives by providing
                temporary care and love while we find their forever homes.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container px-6">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="grid md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <Home className="w-8 h-8 mb-2 text-primary" />
                    <CardTitle>Safe Haven</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Provide a comfortable, loving environment where animals can heal and thrive.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Users className="w-8 h-8 mb-2 text-primary" />
                    <CardTitle>Full Support</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      We provide food, supplies, medical care, and ongoing guidance throughout the fostering process.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Heart className="w-8 h-8 mb-2 text-primary" />
                    <CardTitle>Save Lives</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Each foster home opens a space for another animal to be rescued and loved.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Foster Application</CardTitle>
                  <CardDescription>
                    Please fill out the form below to apply to become a foster. We'll review your application
                    and contact you within a few days.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {formSettingsData?.setting?.introText && (
                    <div className="mb-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-form-intro">
                      {formSettingsData.setting.introText}
                    </div>
                  )}

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="applicantName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <Input placeholder="John Doe" {...field} data-testid="input-applicant-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="applicantEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="john@example.com" {...field} data-testid="input-applicant-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="applicantPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-applicant-phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="housingType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Housing Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-housing-type">
                                    <SelectValue placeholder="Select housing type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="house">House</SelectItem>
                                  <SelectItem value="apartment">Apartment</SelectItem>
                                  <SelectItem value="condo">Condo</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address</FormLabel>
                            <FormControl>
                              <Input placeholder="123 Main St, City, State ZIP" {...field} data-testid="input-address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="hasYard"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-has-yard"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>I have a yard</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="hasOtherPets"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-has-pets"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>I have other pets</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      {form.watch("hasOtherPets") && (
                        <FormField
                          control={form.control}
                          name="otherPetsDetails"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Please describe your other pets</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Type, breed, age, temperament..." 
                                  {...field} 
                                  value={field.value || ""}
                                  data-testid="textarea-other-pets"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="experience"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fostering / Pet Care Experience</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Tell us about your experience with animals, fostering, or pet ownership..."
                                {...field}
                                data-testid="textarea-experience"
                              />
                            </FormControl>
                            <FormDescription>
                              Don't worry if you're new to fostering - we provide training and support!
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="availability"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Time Commitment & Availability</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="How much time can you dedicate to fostering? Any upcoming travel or commitments?"
                                {...field}
                                data-testid="textarea-availability"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="preferences"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Animal Preferences (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Any preferences for species, size, age, or special needs?"
                                {...field}
                                value={field.value || ""}
                                data-testid="textarea-preferences"
                              />
                            </FormControl>
                            <FormDescription>
                              Help us match you with the right foster animal
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="vetReference"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Veterinary Reference (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Vet clinic name and phone"
                                  {...field}
                                  value={field.value || ""}
                                  data-testid="input-vet-reference"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="personalReference"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Personal Reference (Optional)</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Name and phone number"
                                  {...field}
                                  value={field.value || ""}
                                  data-testid="input-personal-reference"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Render custom form fields */}
                      {customFieldsData?.fields && customFieldsData.fields.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">Additional Information</h3>
                          {customFieldsData.fields.map((field) => (
                            <div key={field.id} className="space-y-2">
                              {field.textAbove && (
                                <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-above-${field.id}`}>
                                  {field.textAbove}
                                </div>
                              )}
                              {field.fieldType === 'text' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${field.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                                      <FormControl>
                                        <Input
                                          {...formField}
                                          placeholder={field.placeholder || ''}
                                          data-testid={`input-custom-${field.id}`}
                                        />
                                      </FormControl>
                                      {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {field.fieldType === 'textarea' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${field.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                                      <FormControl>
                                        <Textarea
                                          {...formField}
                                          placeholder={field.placeholder || ''}
                                          rows={3}
                                          data-testid={`input-custom-${field.id}`}
                                        />
                                      </FormControl>
                                      {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {field.fieldType === 'select' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${field.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                                      <Select onValueChange={formField.onChange} value={formField.value}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-custom-${field.id}`}>
                                            <SelectValue placeholder={field.placeholder || 'Select an option'} />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {field.options?.filter(option => option.trim()).map((option) => (
                                            <SelectItem key={option} value={option}>
                                              {option}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {field.fieldType === 'radio' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${field.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                                      <FormControl>
                                        <RadioGroup
                                          onValueChange={formField.onChange}
                                          value={formField.value}
                                          data-testid={`radio-custom-${field.id}`}
                                        >
                                          {field.options?.filter(option => option.trim()).map((option) => (
                                            <div key={option} className="flex items-center space-x-2">
                                              <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                                              <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                                            </div>
                                          ))}
                                        </RadioGroup>
                                      </FormControl>
                                      {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {field.fieldType === 'checkbox' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${field.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                                      <div className="space-y-2">
                                        {field.options?.filter(option => option.trim()).map((option) => (
                                          <div key={option} className="flex items-center space-x-2">
                                            <Checkbox
                                              checked={formField.value?.includes(option)}
                                              onCheckedChange={(checked) => {
                                                const currentValue = formField.value || [];
                                                const newValue = checked
                                                  ? [...currentValue, option]
                                                  : currentValue.filter((v: string) => v !== option);
                                                formField.onChange(newValue);
                                              }}
                                              id={`${field.id}-${option}`}
                                              data-testid={`checkbox-custom-${field.id}-${option}`}
                                            />
                                            <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                                          </div>
                                        ))}
                                      </div>
                                      {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {field.fieldType === 'photo' && (
                                <FormItem>
                                  <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                                  <div className="space-y-3">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      ref={(el) => { fileInputRefs.current[field.id] = el; }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePhotoUpload(field.id, file);
                                      }}
                                      data-testid={`input-photo-${field.id}`}
                                    />
                                    {!photoUploads[field.id] ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => fileInputRefs.current[field.id]?.click()}
                                        data-testid={`button-upload-${field.id}`}
                                      >
                                        <Upload className="w-4 h-4 mr-2" />
                                        Upload Photo
                                      </Button>
                                    ) : photoUploads[field.id].uploading ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Uploading {photoUploads[field.id].name}...
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md">
                                        <img
                                          src={photoUploads[field.id].url}
                                          alt="Uploaded"
                                          className="w-16 h-16 object-cover rounded"
                                        />
                                        <div className="flex-1 text-sm">
                                          {photoUploads[field.id].name}
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removePhoto(field.id)}
                                          data-testid={`button-remove-photo-${field.id}`}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                                </FormItem>
                              )}
                              {field.textBelow && (
                                <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-below-${field.id}`}>
                                  {field.textBelow}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* SMS Consent Checkbox */}
                      <FormField
                        control={form.control}
                        name="smsConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-sms-consent"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal">
                                I consent to receive text message updates regarding the status of my application and rescue operations. Reply STOP to unsubscribe.
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        disabled={submitMutation.isPending}
                        className="w-full"
                        data-testid="button-submit-application"
                      >
                        {submitMutation.isPending ? "Submitting..." : "Submit Application"}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 bg-card mt-12">
        <div className="container px-6 text-center text-sm text-muted-foreground space-y-2">
          <p>{tenant?.footerText || `© ${new Date().getFullYear()} ${tenant?.name || "Animal Rescue"}. All rights reserved.`}</p>
          <p>
            Powered by <a href="https://irescue.life" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-powered-by">iRescue.life</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
