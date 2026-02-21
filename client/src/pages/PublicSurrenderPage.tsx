import { useState, useRef, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Heart, AlertCircle, Info, Upload, X, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useSEO } from "@/hooks/useSEO";
import { useTenant } from "@/contexts/TenantContext";
import { insertSurrenderRequestSchema, type InsertSurrenderRequest, type Tenant, type SurrenderFormField } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PublicSurrenderPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { tenantId } = useTenant();

  // Include tenantId in queryKey to prevent stale data flash when switching between tenant sites
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
  });

  const { data: customFieldsData, isLoading: customFieldsLoading } = useQuery<{ fields: SurrenderFormField[] }>({
    queryKey: ['/api/surrender-form-fields', tenantId],
  });

  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'surrender', tenantId],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  const isLiteTier = (tenant as any)?.subscriptionTier === 'lite';
  const jotformSurrenderUrl = (tenant as any)?.jotformSurrenderUrl;

  useEffect(() => {
    if (isLiteTier && jotformSurrenderUrl) {
      window.location.href = jotformSurrenderUrl;
    }
  }, [isLiteTier, jotformSurrenderUrl]);

  useSEO({
    title: `Surrender an Animal - ${rescueName}`,
    description: `Need to rehome your pet? ${rescueName} is here to help. Submit an animal surrender request and we'll work with you to find the best solution for your pet.`,
    siteName: rescueName,
  });

  // Form schema for public surrender requests
  // Use passthrough() to ensure customResponses field is not stripped by Zod validation
  const surrenderFormSchema = useMemo(() => {
    return insertSurrenderRequestSchema.omit({ tenantId: true }).extend({
      ownerName: z.string().trim().min(1, "Full name is required"),
      ownerEmail: z.string().trim().email("A valid email is required"),
      ownerPhone: z.string().trim().min(7, "A valid phone number is required"),
      ownerAddress: z.string().trim().min(3, "Street address is required"),
      ownerCity: z.string().trim().min(1, "City is required"),
      ownerState: z.string().trim().min(2, "State is required"),
      ownerZip: z.string().trim().min(5, "ZIP code is required"),
      dogName: z.string().trim().min(1, "Dog's name is required"),
      dogBreed: z.string().trim().min(1, "Breed is required"),
      dogAge: z.string().trim().min(1, "Age is required"),
      dogWeight: z.string().trim().min(1, "Weight is required"),
      dogSize: z.enum(["Small", "Medium", "Large", "Extra Large"], { required_error: "Size is required" }),
      dogGender: z.enum(["male", "female", "unknown"], { required_error: "Gender is required" }),
      spayedNeutered: z.boolean({ required_error: "Spayed/Neutered status is required" }),
      microchipped: z.boolean({ required_error: "Microchip status is required" }),
      goodWithKids: z.enum(["yes", "no", "unknown"], { required_error: "Required" }),
      goodWithDogs: z.enum(["yes", "no", "unknown"], { required_error: "Required" }),
      goodWithCats: z.enum(["yes", "no", "unknown"], { required_error: "Required" }),
      reasonForSurrender: z.string().trim().min(1, "Reason for surrender is required"),
      medicalIssues: z.string().trim().min(1, "Medical issues information is required (enter 'None' if not applicable)"),
      behavioralIssues: z.string().trim().min(1, "Behavioral issues information is required (enter 'None' if not applicable)"),
      preferredSurrenderDate: z.string().min(1, "Preferred surrender date is required"),
      photoUrl: z.string().trim().min(1, "A photo of your animal is required"),
      customResponses: z.record(z.any()).optional(),
      smsConsent: z.literal(true, { errorMap: () => ({ message: "You must consent to receive SMS messages to submit this form" }) }),
    });
  }, []);

  const form = useForm<Omit<InsertSurrenderRequest, 'tenantId'> & { customResponses?: Record<string, any> }>({
    resolver: zodResolver(surrenderFormSchema),
    defaultValues: {
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      ownerAddress: "",
      ownerCity: "",
      ownerState: "",
      ownerZip: "",
      dogName: "",
      dogBreed: "",
      dogAge: "",
      dogDateOfBirth: undefined,
      dogGender: "unknown",
      dogWeight: "",
      dogSize: undefined as unknown as "Small" | "Medium" | "Large" | "Extra Large",
      spayedNeutered: undefined,
      microchipped: undefined,
      microchipNumber: "",
      goodWithKids: undefined,
      goodWithDogs: undefined,
      goodWithCats: undefined,
      reasonForSurrender: "",
      medicalIssues: "",
      behavioralIssues: "",
      photoUrl: "",
      preferredSurrenderDate: undefined,
      smsConsent: false,
      customResponses: {},
    },
  });


  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});
  const [photoUploads, setPhotoUploads] = useState<Record<string, { url: string; name: string; uploading: boolean }>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const mainPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [mainPhoto, setMainPhoto] = useState<{ url: string; name: string; uploading: boolean } | null>(null);

  const handleMainPhotoUpload = async (file: File) => {
    setMainPhoto({ url: '', name: file.name, uploading: true });
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldId', 'main-photo');
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
      setMainPhoto({ url: result.fileUrl, name: file.name, uploading: false });
      form.setValue('photoUrl', result.fileUrl);
      form.clearErrors('photoUrl');
    } catch (error: any) {
      setMainPhoto(null);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload photo. Please try again.",
      });
    }
  };

  const removeMainPhoto = () => {
    setMainPhoto(null);
    form.setValue('photoUrl', '');
    if (mainPhotoInputRef.current) mainPhotoInputRef.current.value = '';
  };

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
    mutationFn: async (data: Omit<InsertSurrenderRequest, 'tenantId'> & { customResponses?: Record<string, any> }) => {
      console.log('[Surrender Form] Submitting data:', data);
      return await apiRequest("POST", "/api/surrender", data);
    },
    onSuccess: (data) => {
      console.log('[Surrender Form] Submission successful:', data);
      toast({
        title: "Surrender Request Submitted!",
        description: "Thank you for reaching out. We'll review your request and contact you within 24-48 hours.",
        duration: 5000,
      });
      form.reset();
      setMainPhoto(null);
      if (mainPhotoInputRef.current) mainPhotoInputRef.current.value = '';
      setLocation('/');
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

  const onSubmit = (data: Omit<InsertSurrenderRequest, 'tenantId'> & { customResponses?: Record<string, any> }) => {
    if (customFieldsLoading) {
      toast({
        variant: "destructive",
        title: "Please Wait",
        description: "Form fields are still loading. Please try again in a moment.",
      });
      return;
    }
    const requiredFields = customFieldsData?.fields?.filter(f => f.required) || [];
    const errors: Record<string, string> = {};

    for (const field of requiredFields) {
      const value = data.customResponses?.[field.id];
      if (field.fieldType === 'checkbox') {
        if (!value || !Array.isArray(value) || value.length === 0) {
          errors[field.id] = `${field.label} is required`;
        }
      } else if (field.fieldType === 'photo') {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          errors[field.id] = `${field.label} is required`;
        }
      } else {
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
          errors[field.id] = `${field.label} is required`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setCustomFieldErrors(errors);
      toast({
        variant: "destructive",
        title: "Missing Required Fields",
        description: "Please fill out all required fields before submitting.",
      });
      const firstErrorId = Object.keys(errors)[0];
      const el = document.querySelector(`[data-testid="input-custom-${firstErrorId}"], [data-testid="radio-custom-${firstErrorId}"], [data-testid="select-custom-${firstErrorId}"], [data-testid="button-upload-${firstErrorId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setCustomFieldErrors({});
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
                      {/* Owner Information */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Owner Information</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name="ownerName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Full Name *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="John Doe" {...field} data-testid="input-owner-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="ownerEmail"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email *</FormLabel>
                                  <FormControl>
                                    <Input type="email" placeholder="john@example.com" {...field} data-testid="input-owner-email" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="ownerPhone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Mobile Phone *</FormLabel>
                                  <FormControl>
                                    <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-owner-phone" />
                                  </FormControl>
                                  <FormMessage />
                                  <p className="text-xs text-muted-foreground mt-1">By entering your number, you agree to receive mobile messages from {tenant?.name || "Animal Rescue"}. Message frequency varies. Carrier rates may apply. Reply STOP to opt out.</p>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="ownerAddress"
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Street Address *</FormLabel>
                                <FormControl>
                                  <Input placeholder="123 Main St, Apt 4B" {...field} value={field.value || ''} data-testid="input-owner-address" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="ownerCity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City *</FormLabel>
                                <FormControl>
                                  <Input placeholder="City" {...field} value={field.value || ''} data-testid="input-owner-city" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="ownerState"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>State *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="TX" {...field} value={field.value || ''} data-testid="input-owner-state" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="ownerZip"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>ZIP Code *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="78701" {...field} value={field.value || ''} data-testid="input-owner-zip" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                      <div className="border-t pt-6 space-y-4">
                        <h3 className="text-lg font-semibold">Dog Information</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="dogName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dog's Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Buddy" {...field} data-testid="input-dog-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dogBreed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Breed *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Labrador Mix, German Shepherd, etc." {...field} data-testid="input-dog-breed" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dogDateOfBirth"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>Date of Birth</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                                        data-testid="input-dog-dob"
                                      >
                                        {field.value ? format(new Date(field.value), "PPP") : "Select date"}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value ? new Date(field.value) : undefined}
                                      onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : undefined)}
                                      disabled={(date) => date > new Date()}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormDescription>If unknown, enter approximate age below</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dogAge"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Age (if DOB unknown) *</FormLabel>
                                <FormControl>
                                  <Input placeholder="2 years, 6 months, etc." {...field} data-testid="input-dog-age" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dogGender"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Gender *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-dog-gender">
                                      <SelectValue placeholder="Select gender" />
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
                            name="dogWeight"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Weight *</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., 45 lbs" {...field} value={field.value || ''} data-testid="input-dog-weight" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dogSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Size *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-dog-size">
                                      <SelectValue placeholder="Select size" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Small">Small (under 25 lbs)</SelectItem>
                                    <SelectItem value="Medium">Medium (25-60 lbs)</SelectItem>
                                    <SelectItem value="Large">Large (60-100 lbs)</SelectItem>
                                    <SelectItem value="Extra Large">Extra Large (100+ lbs)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid md:grid-cols-2 gap-6 mt-4">
                          <FormField
                            control={form.control}
                            name="spayedNeutered"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Spayed/Neutered? *</FormLabel>
                                <Select 
                                  onValueChange={(v) => field.onChange(v === "yes" ? true : v === "no" ? false : undefined)} 
                                  value={field.value === true ? "yes" : field.value === false ? "no" : ""}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="select-spayed-neutered">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="microchipped"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Microchipped? *</FormLabel>
                                <Select 
                                  onValueChange={(v) => field.onChange(v === "yes" ? true : v === "no" ? false : undefined)} 
                                  value={field.value === true ? "yes" : field.value === false ? "no" : ""}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="select-microchipped">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {form.watch("microchipped") === true && (
                            <FormField
                              control={form.control}
                              name="microchipNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Microchip Number</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Enter microchip number" {...field} value={field.value || ''} data-testid="input-microchip-number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>

                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-3">Compatibility</h4>
                          <div className="grid md:grid-cols-3 gap-6">
                            <FormField
                              control={form.control}
                              name="goodWithKids"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Good with Kids? *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-good-with-kids">
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="yes">Yes</SelectItem>
                                      <SelectItem value="no">No</SelectItem>
                                      <SelectItem value="unknown">Unknown</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="goodWithDogs"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Good with Dogs? *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-good-with-dogs">
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="yes">Yes</SelectItem>
                                      <SelectItem value="no">No</SelectItem>
                                      <SelectItem value="unknown">Unknown</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="goodWithCats"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Good with Cats? *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-good-with-cats">
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="yes">Yes</SelectItem>
                                      <SelectItem value="no">No</SelectItem>
                                      <SelectItem value="unknown">Unknown</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-6 space-y-4">
                        <h3 className="text-lg font-semibold">Additional Details</h3>
                        
                        <FormField
                          control={form.control}
                          name="preferredSurrenderDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Preferred Surrender Date *</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={`w-full md:w-[280px] pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                                      data-testid="input-preferred-surrender-date"
                                    >
                                      {field.value ? format(new Date(field.value), "PPP") : "Select date"}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value ? new Date(field.value) : undefined}
                                    onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : undefined)}
                                    disabled={(date) => {
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      return date < today;
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormDescription>When would you like to bring the dog to us?</FormDescription>
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
                                  placeholder="Please explain why you need to surrender this dog"
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
                          name="medicalIssues"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Medical Issues *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Any medical conditions, medications, vaccinations, etc."
                                  className="min-h-24"
                                  {...field}
                                  value={field.value || ''}
                                  data-testid="textarea-medical-issues"
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
                          name="behavioralIssues"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Behavioral Issues *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe any behavioral concerns, training, temperament, etc."
                                  className="min-h-24"
                                  {...field}
                                  value={field.value || ''}
                                  data-testid="textarea-behavioral-issues"
                                />
                              </FormControl>
                              <FormDescription>
                                Tell us about their personality, any behavioral issues, good with kids/pets, etc.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="space-y-2">
                          <FormField
                            control={form.control}
                            name="photoUrl"
                            render={() => (
                              <FormItem>
                                <FormLabel>Photo of Your Animal *</FormLabel>
                                <FormControl>
                                  <div>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      ref={mainPhotoInputRef}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleMainPhotoUpload(file);
                                      }}
                                      data-testid="input-main-photo"
                                    />
                                    {!mainPhoto ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => mainPhotoInputRef.current?.click()}
                                        data-testid="button-upload-main-photo"
                                      >
                                        <Upload className="w-4 h-4 mr-2" />
                                        Upload Photo
                                      </Button>
                                    ) : mainPhoto.uploading ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Uploading {mainPhoto.name}...
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md">
                                        <img
                                          src={mainPhoto.url}
                                          alt="Uploaded"
                                          className="w-16 h-16 object-cover rounded"
                                          data-testid="img-main-photo-preview"
                                        />
                                        <div className="flex-1 text-sm">
                                          {mainPhoto.name}
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={removeMainPhoto}
                                          data-testid="button-remove-main-photo"
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  Please upload a clear photo of your animal
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Render custom form fields */}
                      {customFieldsData?.fields && customFieldsData.fields.length > 0 && (() => {
                        const duplicatePattern = /microchip|medical\s*problem/i;
                        const filteredFields = customFieldsData.fields.filter((f) => {
                          if (f.fieldType === 'photo') return false;
                          if (duplicatePattern.test(f.label)) return false;
                          return true;
                        });
                        if (filteredFields.length === 0) return null;
                        return (
                        <div className="border-t pt-6 space-y-4">
                          <h3 className="text-lg font-semibold">Additional Information</h3>
                          {filteredFields.map((customField) => (
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
                                          className={customFieldErrors[customField.id] ? 'border-destructive' : ''}
                                          onChange={(e) => {
                                            formField.onChange(e);
                                            if (customFieldErrors[customField.id]) {
                                              setCustomFieldErrors(prev => { const n = {...prev}; delete n[customField.id]; return n; });
                                            }
                                          }}
                                          data-testid={`input-custom-${customField.id}`}
                                        />
                                      </FormControl>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      {customFieldErrors[customField.id] && <p className="text-sm font-medium text-destructive">{customFieldErrors[customField.id]}</p>}
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
                                          className={customFieldErrors[customField.id] ? 'border-destructive' : ''}
                                          onChange={(e) => {
                                            formField.onChange(e);
                                            if (customFieldErrors[customField.id]) {
                                              setCustomFieldErrors(prev => { const n = {...prev}; delete n[customField.id]; return n; });
                                            }
                                          }}
                                          data-testid={`input-custom-${customField.id}`}
                                        />
                                      </FormControl>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      {customFieldErrors[customField.id] && <p className="text-sm font-medium text-destructive">{customFieldErrors[customField.id]}</p>}
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
                                      <Select onValueChange={(val) => {
                                        formField.onChange(val);
                                        if (customFieldErrors[customField.id]) {
                                          setCustomFieldErrors(prev => { const n = {...prev}; delete n[customField.id]; return n; });
                                        }
                                      }} value={formField.value}>
                                        <FormControl>
                                          <SelectTrigger data-testid={`select-custom-${customField.id}`} className={customFieldErrors[customField.id] ? 'border-destructive' : ''}>
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
                                      {customFieldErrors[customField.id] && <p className="text-sm font-medium text-destructive">{customFieldErrors[customField.id]}</p>}
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
                                          onValueChange={(val) => {
                                            formField.onChange(val);
                                            if (customFieldErrors[customField.id]) {
                                              setCustomFieldErrors(prev => { const n = {...prev}; delete n[customField.id]; return n; });
                                            }
                                          }}
                                          value={formField.value}
                                          className={customFieldErrors[customField.id] ? 'border border-destructive rounded-md p-2' : ''}
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
                                      {customFieldErrors[customField.id] && <p className="text-sm font-medium text-destructive">{customFieldErrors[customField.id]}</p>}
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
                                      <div className={`space-y-2 mt-2 ${customFieldErrors[customField.id] ? 'border border-destructive rounded-md p-2' : ''}`}>
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
                                                if (customFieldErrors[customField.id]) {
                                                  setCustomFieldErrors(prev => { const n = {...prev}; delete n[customField.id]; return n; });
                                                }
                                              }}
                                              data-testid={`checkbox-custom-${customField.id}-${option}`}
                                            />
                                            <Label htmlFor={`${customField.id}-${option}`}>{option}</Label>
                                          </div>
                                        ))}
                                      </div>
                                      {customField.helpText && <FormDescription>{customField.helpText}</FormDescription>}
                                      {customFieldErrors[customField.id] && <p className="text-sm font-medium text-destructive">{customFieldErrors[customField.id]}</p>}
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
                                  {customFieldErrors[customField.id] && <p className="text-sm font-medium text-destructive">{customFieldErrors[customField.id]}</p>}
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
                        );
                      })()}

                      {/* SMS Consent Checkbox (mandatory for Twilio compliance) */}
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
                                I agree to receive text messages from {rescueName} regarding my surrender request. Message frequency varies. Message & data rates may apply. Reply STOP to unsubscribe, HELP for help.
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end gap-4 pt-6 border-t">
                        <Button
                          type="submit"
                          disabled={submitMutation.isPending || customFieldsLoading}
                          data-testid="button-submit-surrender"
                        >
                          {submitMutation.isPending ? "Submitting..." : customFieldsLoading ? "Loading..." : "Submit Surrender Request"}
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
              <p className="flex items-center justify-center gap-3 flex-wrap">
                <a href={tenant?.privacyPolicyUrl || "/platform/privacy"} target="_blank" rel="noopener noreferrer" className="hover:underline" data-testid="link-privacy-policy">Privacy Policy</a>
                <span aria-hidden="true">·</span>
                <a href={tenant?.termsOfServiceUrl || "/platform/terms"} target="_blank" rel="noopener noreferrer" className="hover:underline" data-testid="link-terms-of-service">Terms of Service</a>
              </p>
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
