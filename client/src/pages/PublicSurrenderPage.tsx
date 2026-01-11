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
import { Heart, AlertCircle, Info, Upload, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useSEO } from "@/hooks/useSEO";
import { insertAnimalSurrenderSchema, type InsertAnimalSurrender, type Tenant, type SurrenderFormField } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PublicSurrenderPage() {
  const { toast } = useToast();

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: customFieldsData } = useQuery<{ fields: SurrenderFormField[] }>({
    queryKey: ['/api/surrender-form-fields'],
  });

  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'surrender'],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Surrender an Animal - ${rescueName}`,
    description: `Need to rehome your pet? ${rescueName} is here to help. Submit an animal surrender request and we'll work with you to find the best solution for your pet.`,
    siteName: rescueName,
  });

  const form = useForm<Omit<InsertAnimalSurrender, 'tenantId' | 'status' | 'notes'> & { customResponses?: Record<string, any> }>({
    resolver: zodResolver(insertAnimalSurrenderSchema.omit({ tenantId: true, status: true, notes: true })),
    defaultValues: {
      submitterName: "",
      submitterEmail: "",
      submitterPhone: "",
      address: "",
      animalName: "",
      species: "",
      breed: "",
      age: "",
      sex: "unknown",
      spayedNeutered: false,
      medicalHistory: "",
      behaviorNotes: "",
      reasonForSurrender: "",
      isEmergency: false,
      customResponses: {},
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
      formData.append('formType', 'surrender');

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
    mutationFn: async (data: Omit<InsertAnimalSurrender, 'tenantId' | 'status' | 'notes'> & { customResponses?: Record<string, any> }) => {
      console.log('[Surrender Form] Submitting data:', data);
      return await apiRequest("POST", "/api/animal-surrenders", data);
    },
    onSuccess: (data) => {
      console.log('[Surrender Form] Submission successful:', data);
      console.log('[Surrender Form] Calling toast with success message');
      toast({
        title: "Surrender Request Submitted!",
        description: "Thank you for reaching out. We'll review your request and contact you within 24-48 hours.",
        duration: 5000,
      });
      console.log('[Surrender Form] Toast called, resetting form');
      form.reset();
      console.log('[Surrender Form] Form reset complete');
    },
    onError: (error: any) => {
      console.error('[Surrender Form] Submission failed:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit surrender request. Please try again.",
        duration: 5000,
      });
    },
  });

  const onSubmit = (data: Omit<InsertAnimalSurrender, 'tenantId' | 'status' | 'notes'> & { customResponses?: Record<string, any> }) => {
    submitMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader rescueName={tenant?.name || "Animal Rescue"} logoUrl={tenant?.logoUrl || undefined} />

      <main className="flex-1">
        <section className="py-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container px-6">
            <div className="text-center max-w-3xl mx-auto">
              <Heart className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                Surrender an Animal
              </h1>
              <p className="text-lg text-muted-foreground">
                We understand that sometimes circumstances require you to find a new home for your pet.
                Please complete this form and we'll do our best to help.
              </p>
              {formSettingsData?.setting?.introText && (
                <div className="mt-4 p-4 bg-muted/30 rounded-lg text-left whitespace-pre-wrap" data-testid="text-intro">
                  {formSettingsData.setting.introText}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container px-6">
            <div className="max-w-4xl mx-auto space-y-8">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Please note:</strong> We are a small rescue with limited space. While we try to help every animal,
                  we may not be able to accept all surrender requests immediately. We prioritize emergency situations and
                  animals with urgent medical needs.
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Surrender Request Form</CardTitle>
                  <CardDescription>
                    Please provide as much information as possible about the animal you need to surrender.
                    This helps us prepare for their care and find the best placement.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Your Information</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="submitterName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="John Doe" {...field} data-testid="input-submitter-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="submitterEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email *</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="john@example.com" {...field} data-testid="input-submitter-email" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="submitterPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone Number *</FormLabel>
                                <FormControl>
                                  <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-submitter-phone" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Address *</FormLabel>
                                <FormControl>
                                  <Input placeholder="123 Main St, City, State" {...field} data-testid="input-address" />
                                </FormControl>
                                <FormDescription>Helpful if we need to arrange pickup</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="border-t pt-6 space-y-4">
                        <h3 className="text-lg font-semibold">Animal Information</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="animalName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Animal's Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Buddy" {...field} data-testid="input-animal-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="species"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Species *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Dog, Cat, etc." {...field} data-testid="input-species" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="breed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Breed *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Labrador Mix, Domestic Shorthair, etc." {...field} data-testid="input-breed" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="age"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Age *</FormLabel>
                                <FormControl>
                                  <Input placeholder="2 years, 6 months, etc." {...field} data-testid="input-age" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="sex"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Sex *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-sex">
                                      <SelectValue placeholder="Select sex" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="unknown">Unknown</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="spayedNeutered"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-spayed-neutered"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>
                                    Spayed/Neutered
                                  </FormLabel>
                                  <FormDescription>
                                    Check if the animal is spayed or neutered
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="border-t pt-6 space-y-4">
                        <h3 className="text-lg font-semibold">Additional Details</h3>
                        
                        <FormField
                          control={form.control}
                          name="medicalHistory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Medical History *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Any medical conditions, medications, vaccinations, etc."
                                  className="min-h-24"
                                  {...field}
                                  data-testid="textarea-medical-history"
                                />
                              </FormControl>
                              <FormDescription>
                                Include any known medical issues, current medications, and vaccination history
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="behaviorNotes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Behavior & Temperament *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe their personality, behavior with people/pets, any training, etc."
                                  className="min-h-24"
                                  {...field}
                                  data-testid="textarea-behavior-notes"
                                />
                              </FormControl>
                              <FormDescription>
                                Tell us about their personality, any behavioral issues, good with kids/pets, etc.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="reasonForSurrender"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reason for Surrender *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Please explain why you need to surrender this animal"
                                  className="min-h-24"
                                  {...field}
                                  data-testid="textarea-reason-for-surrender"
                                />
                              </FormControl>
                              <FormDescription>
                                Understanding your situation helps us provide the best care and placement
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="isEmergency"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-destructive/5">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-is-emergency"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                  This is an emergency situation
                                </FormLabel>
                                <FormDescription>
                                  Check this if the animal needs immediate placement due to safety concerns or urgent circumstances
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Render custom form fields */}
                      {customFieldsData?.fields && customFieldsData.fields.length > 0 && (
                        <div className="border-t pt-6 space-y-4">
                          <h3 className="text-lg font-semibold">Additional Information</h3>
                          {customFieldsData.fields.map((customField) => (
                            <div key={customField.id} className="space-y-2">
                              {customField.textAbove && (
                                <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-above-${customField.id}`}>
                                  {customField.textAbove}
                                </div>
                              )}
                              {customField.fieldType === 'text' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${customField.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{customField.label} {customField.required && '*'}</FormLabel>
                                      <FormControl>
                                        <Input
                                          {...formField}
                                          placeholder={customField.placeholder || ''}
                                          data-testid={`input-custom-${customField.id}`}
                                        />
                                      </FormControl>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {customField.fieldType === 'textarea' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${customField.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{customField.label} {customField.required && '*'}</FormLabel>
                                      <FormControl>
                                        <Textarea
                                          {...formField}
                                          placeholder={customField.placeholder || ''}
                                          rows={3}
                                          data-testid={`input-custom-${customField.id}`}
                                        />
                                      </FormControl>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {customField.fieldType === 'select' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${customField.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{customField.label} {customField.required && '*'}</FormLabel>
                                      <Select onValueChange={formField.onChange} value={formField.value}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-custom-${customField.id}`}>
                                            <SelectValue placeholder={customField.placeholder || 'Select an option'} />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {customField.options?.filter(option => option.trim()).map((option) => (
                                            <SelectItem key={option} value={option}>
                                              {option}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {customField.fieldType === 'radio' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${customField.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{customField.label} {customField.required && '*'}</FormLabel>
                                      <FormControl>
                                        <RadioGroup
                                          onValueChange={formField.onChange}
                                          value={formField.value}
                                          data-testid={`radio-custom-${customField.id}`}
                                        >
                                          {customField.options?.filter(option => option.trim()).map((option) => (
                                            <div key={option} className="flex items-center space-x-2">
                                              <RadioGroupItem value={option} id={`${customField.id}-${option}`} />
                                              <Label htmlFor={`${customField.id}-${option}`}>{option}</Label>
                                            </div>
                                          ))}
                                        </RadioGroup>
                                      </FormControl>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {customField.fieldType === 'checkbox' && (
                                <FormField
                                  control={form.control}
                                  name={`customResponses.${customField.id}` as any}
                                  render={({ field: formField }) => (
                                    <FormItem>
                                      <FormLabel>{customField.label} {customField.required && '*'}</FormLabel>
                                      <div className="space-y-2 mt-2">
                                        {customField.options?.filter(option => option.trim()).map((option) => (
                                          <div key={option} className="flex items-center space-x-2">
                                            <Checkbox 
                                              id={`${customField.id}-${option}`}
                                              checked={formField.value?.includes(option)}
                                              onCheckedChange={(checked) => {
                                                const current = formField.value || [];
                                                if (checked) {
                                                  formField.onChange([...current, option]);
                                                } else {
                                                  formField.onChange(current.filter((v: string) => v !== option));
                                                }
                                              }}
                                              data-testid={`checkbox-custom-${customField.id}-${option}`}
                                            />
                                            <Label htmlFor={`${customField.id}-${option}`}>{option}</Label>
                                          </div>
                                        ))}
                                      </div>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                              {customField.fieldType === 'photo' && (
                                <FormItem>
                                  <FormLabel>{customField.label} {customField.required && '*'}</FormLabel>
                                  <div className="space-y-3">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      ref={(el) => { fileInputRefs.current[customField.id] = el; }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePhotoUpload(customField.id, file);
                                      }}
                                      data-testid={`input-photo-${customField.id}`}
                                    />
                                    {!photoUploads[customField.id] ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => fileInputRefs.current[customField.id]?.click()}
                                        data-testid={`button-upload-${customField.id}`}
                                      >
                                        <Upload className="w-4 h-4 mr-2" />
                                        Upload Photo
                                      </Button>
                                    ) : photoUploads[customField.id].uploading ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Uploading {photoUploads[customField.id].name}...
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md">
                                        <img
                                          src={photoUploads[customField.id].url}
                                          alt="Uploaded"
                                          className="w-16 h-16 object-cover rounded"
                                        />
                                        <div className="flex-1 text-sm">
                                          {photoUploads[customField.id].name}
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removePhoto(customField.id)}
                                          data-testid={`button-remove-photo-${customField.id}`}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                </FormItem>
                              )}
                              {customField.textBelow && (
                                <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-below-${customField.id}`}>
                                  {customField.textBelow}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-end gap-4 pt-6 border-t">
                        <Button
                          type="submit"
                          disabled={submitMutation.isPending}
                          data-testid="button-submit-surrender"
                        >
                          {submitMutation.isPending ? "Submitting..." : "Submit Surrender Request"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>What happens next?</strong> After you submit this form, our team will review your request
                  and contact you within 24-48 hours. Please be patient as we work to help every animal in need.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </section>

        <footer className="border-t py-12 bg-card">
          <div className="container px-6">
            <div className="text-center text-sm text-muted-foreground space-y-2">
              <p>{tenant?.footerText || `© ${new Date().getFullYear()} ${tenant?.name || "Animal Rescue"}. All rights reserved.`}</p>
              <p>
                Powered by <a href="https://irescue.life" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-powered-by">iRescue.life</a>
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
