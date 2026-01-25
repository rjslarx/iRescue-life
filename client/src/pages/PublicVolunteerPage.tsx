import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, Clock, MapPin, Users, Heart, Upload, X, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useSEO } from "@/hooks/useSEO";
import { useTenant } from "@/contexts/TenantContext";
import type { VolunteerOpportunity, Tenant, InsertVolunteerApplication, VolunteerFormField } from "@shared/schema";
import { insertVolunteerApplicationSchema } from "@shared/schema";
import { VolunteerSignupDialog } from "@/components/VolunteerSignupDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { FormDescription } from "@/components/ui/form";

export default function PublicVolunteerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { tenantId } = useTenant();
  const [signupDialog, setSignupDialog] = useState<{opportunityId: string, title: string} | null>(null);
  
  const { data: userData } = useQuery<{ user: any }>({
    queryKey: ['/api/me'],
  });

  // Include tenantId in queryKey to prevent stale data flash when switching between tenant sites
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
  });

  // Load form intro text
  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'volunteer', tenantId],
  });

  // Load custom form fields
  const { data: customFieldsData } = useQuery<{ fields: VolunteerFormField[] }>({
    queryKey: ['/api/volunteer-form-fields', tenantId],
  });
  const customFields = customFieldsData?.fields || [];

  const { data: opportunitiesData, isLoading: isLoadingOpportunities } = useQuery<{ 
    opportunities: (VolunteerOpportunity & { isSignedUp?: boolean })[] 
  }>({
    queryKey: ['/api/volunteer-opportunities', tenantId],
  });

  const opportunities = opportunitiesData?.opportunities || [];
  const user = userData?.user;
  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Volunteer - ${rescueName}`,
    description: `Make a difference in the lives of animals in need. Browse volunteer opportunities and apply to join ${rescueName}'s dedicated team.`,
    siteName: rescueName,
  });

  // Application form - extend with customResponses for custom form fields
  const form = useForm<InsertVolunteerApplication & { customResponses: Record<string, string> }>({
    resolver: zodResolver(insertVolunteerApplicationSchema.omit({ tenantId: true, status: true, notes: true })),
    defaultValues: {
      applicantName: "",
      applicantEmail: "",
      applicantPhone: "",
      address: "",
      experience: "",
      availability: "",
      interests: "",
      skills: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      customResponses: {},
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
      formData.append('formType', 'volunteer');

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
    mutationFn: async (data: InsertVolunteerApplication) => {
      return await apiRequest("POST", "/api/volunteer-applications", data);
    },
    onSuccess: () => {
      toast({
        title: "Application Submitted!",
        description: "Thank you for applying to volunteer. We'll review your application and contact you soon.",
      });
      form.reset();
      // Redirect to success page after submission
      setTimeout(() => setLocation('/form-success/volunteer'), 2000);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit application. Please try again.",
      });
    },
  });

  const handleSignupSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/volunteer-opportunities'] });
  };

  const onSubmit = (data: InsertVolunteerApplication) => {
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
                Volunteer With Us
              </h1>
              <p className="text-lg text-muted-foreground">
                Make a difference in the lives of animals in need. Join our dedicated team of volunteers
                and help us provide care, love, and support to rescued animals.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container px-6">
            <div className="max-w-4xl mx-auto">
              <Tabs defaultValue="opportunities" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8" data-testid="tabs-volunteer">
                  <TabsTrigger value="opportunities" data-testid="tab-opportunities">
                    Current Opportunities
                  </TabsTrigger>
                  <TabsTrigger value="apply" data-testid="tab-apply">
                    Apply to Volunteer
                  </TabsTrigger>
                </TabsList>

                {/* Opportunities Tab */}
                <TabsContent value="opportunities" className="space-y-6">
                  {isLoadingOpportunities ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Card key={i}>
                          <CardHeader>
                            <Skeleton className="h-6 w-3/4" />
                            <Skeleton className="h-4 w-1/2 mt-2" />
                          </CardHeader>
                          <CardContent>
                            <Skeleton className="h-20 w-full" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : opportunities.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="font-semibold text-lg mb-2">No Opportunities Available</h3>
                        <p className="text-muted-foreground mb-4">
                          There are currently no scheduled volunteer opportunities. Check back soon!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          In the meantime, you can submit a general volunteer application using the "Apply to Volunteer" tab.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {opportunities.map((opportunity) => {
                        const isFull = opportunity.slotsFilled >= opportunity.slotsTotal;
                        const spotsLeft = opportunity.slotsTotal - opportunity.slotsFilled;
                        
                        return (
                          <Card key={opportunity.id} data-testid={`card-opportunity-${opportunity.id}`}>
                            <CardHeader>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <CardTitle className="text-xl" data-testid={`text-opportunity-title-${opportunity.id}`}>
                                    {opportunity.title}
                                  </CardTitle>
                                  <CardDescription className="mt-2">
                                    {opportunity.description}
                                  </CardDescription>
                                </div>
                                {isFull ? (
                                  <Badge variant="secondary" data-testid={`badge-full-${opportunity.id}`}>
                                    Full
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" data-testid={`badge-spots-${opportunity.id}`}>
                                    {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>
                            
                            <CardContent className="space-y-3">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-4 h-4" />
                                <span data-testid={`text-opportunity-date-${opportunity.id}`}>{opportunity.date}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span data-testid={`text-opportunity-time-${opportunity.id}`}>{opportunity.time}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                <span data-testid={`text-opportunity-location-${opportunity.id}`}>{opportunity.location}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Users className="w-4 h-4" />
                                <span data-testid={`text-opportunity-slots-${opportunity.id}`}>
                                  {opportunity.slotsFilled} / {opportunity.slotsTotal} volunteers
                                </span>
                              </div>
                            </CardContent>
                            
                            <CardFooter>
                              {opportunity.isSignedUp ? (
                                <Button 
                                  variant="secondary" 
                                  disabled
                                  className="w-full"
                                  data-testid={`button-signed-up-${opportunity.id}`}
                                >
                                  Already Signed Up
                                </Button>
                              ) : isFull ? (
                                <Button 
                                  variant="secondary" 
                                  disabled
                                  className="w-full"
                                  data-testid={`button-full-${opportunity.id}`}
                                >
                                  Fully Booked
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => setSignupDialog({opportunityId: opportunity.id, title: opportunity.title})}
                                  className="w-full"
                                  data-testid={`button-signup-${opportunity.id}`}
                                >
                                  Sign Up to Volunteer
                                </Button>
                              )}
                            </CardFooter>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {!user && opportunities.length > 0 && (
                    <Card className="mt-8 bg-primary/5 border-primary/20">
                      <CardContent className="py-8 text-center">
                        <h3 className="font-semibold text-lg mb-2">Ready to Get Started?</h3>
                        <p className="text-muted-foreground mb-4">
                          Sign up for an account to volunteer with us and make a difference!
                        </p>
                        <div className="flex gap-4 justify-center">
                          <Link href="/login">
                            <Button variant="default" data-testid="button-login-prompt">
                              Log In
                            </Button>
                          </Link>
                          <Link href="/register">
                            <Button variant="outline" data-testid="button-register-prompt">
                              Create Account
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Application Tab */}
                <TabsContent value="apply" className="space-y-6">
                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <Card>
                      <CardHeader>
                        <Users className="w-8 h-8 mb-2 text-primary" />
                        <CardTitle>Community</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Join a passionate community of animal lovers working together to save lives.
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <Calendar className="w-8 h-8 mb-2 text-primary" />
                        <CardTitle>Flexible Schedule</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Volunteer on your own schedule with opportunities that fit your availability.
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <Heart className="w-8 h-8 mb-2 text-primary" />
                        <CardTitle>Make an Impact</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Every hour you volunteer makes a real difference in an animal's life.
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-2xl">Volunteer Application</CardTitle>
                      <CardDescription>
                        Please fill out the form below to apply to become a volunteer. We'll review your application
                        and contact you within a few days.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {formSettingsData?.setting?.introText && (
                        <div className="mb-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-form-intro">
                          {formSettingsData.setting.introText}
                        </div>
                      )}

                      <Alert className="mb-6">
                        <AlertDescription>
                          <strong>What to Expect:</strong> After submitting your application, our volunteer coordinator
                          will review it and reach out to schedule an orientation session. We'll match you with
                          opportunities that align with your interests and availability.
                        </AlertDescription>
                      </Alert>

                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                          <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Contact Information</h3>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                              <FormField
                                control={form.control}
                                name="applicantName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Full Name *</FormLabel>
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
                                    <FormLabel>Email *</FormLabel>
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
                                    <FormLabel>Phone Number *</FormLabel>
                                    <FormControl>
                                      <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-applicant-phone" />
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
                                    <FormLabel>Address</FormLabel>
                                    <FormControl>
                                      <Input placeholder="123 Main St, City, State ZIP" {...field} value={field.value || ''} data-testid="input-address" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Volunteer Details</h3>

                            <FormField
                              control={form.control}
                              name="experience"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Experience with Animals *</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Tell us about your experience with animals (pets, volunteering, work experience, etc.)"
                                      {...field}
                                      rows={4}
                                      data-testid="input-experience"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="availability"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Availability *</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="When are you available to volunteer? (e.g., weekdays, weekends, mornings, evenings)"
                                      {...field}
                                      rows={3}
                                      data-testid="input-availability"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="interests"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Areas of Interest</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="What volunteer activities interest you? (e.g., dog walking, cat socialization, administrative work, events, fundraising)"
                                      {...field}
                                      value={field.value || ''}
                                      rows={3}
                                      data-testid="input-interests"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="skills"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Special Skills or Qualifications</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Do you have any special skills that could help? (e.g., photography, social media, carpentry, veterinary experience)"
                                      {...field}
                                      value={field.value || ''}
                                      rows={3}
                                      data-testid="input-skills"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Emergency Contact</h3>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                              <FormField
                                control={form.control}
                                name="emergencyContactName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Emergency Contact Name</FormLabel>
                                    <FormControl>
                                      <Input placeholder="Jane Doe" {...field} value={field.value || ''} data-testid="input-emergency-contact-name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="emergencyContactPhone"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Emergency Contact Phone</FormLabel>
                                    <FormControl>
                                      <Input type="tel" placeholder="(555) 987-6543" {...field} value={field.value || ''} data-testid="input-emergency-contact-phone" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>

                          {/* Custom Form Fields */}
                          {customFields.length > 0 && (
                            <div className="space-y-4">
                              <h3 className="text-lg font-semibold">Additional Questions</h3>
                              {customFields
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((field) => (
                                  <FormField
                                    key={field.id}
                                    control={form.control}
                                    name={`customResponses.${field.id}`}
                                    render={({ field: formField }) => (
                                      <FormItem>
                                        {field.textAbove && (
                                          <div className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">
                                            {field.textAbove}
                                          </div>
                                        )}
                                        <FormLabel>
                                          {field.label}
                                          {field.required && " *"}
                                        </FormLabel>
                                        {field.fieldType === "text" && (
                                          <FormControl>
                                            <Input
                                              placeholder={field.placeholder || ""}
                                              {...formField}
                                              value={formField.value || ""}
                                              data-testid={`input-custom-${field.id}`}
                                            />
                                          </FormControl>
                                        )}
                                        {field.fieldType === "textarea" && (
                                          <FormControl>
                                            <Textarea
                                              placeholder={field.placeholder || ""}
                                              {...formField}
                                              value={formField.value || ""}
                                              rows={4}
                                              data-testid={`textarea-custom-${field.id}`}
                                            />
                                          </FormControl>
                                        )}
                                        {field.fieldType === "select" && (
                                          <Select
                                            onValueChange={formField.onChange}
                                            value={formField.value || ""}
                                          >
                                            <FormControl>
                                              <SelectTrigger data-testid={`select-custom-${field.id}`}>
                                                <SelectValue placeholder={field.placeholder || "Select an option"} />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              {(field.options || []).map((option, idx) => (
                                                <SelectItem key={idx} value={option}>
                                                  {option}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        )}
                                        {field.fieldType === "radio" && (
                                          <FormControl>
                                            <RadioGroup
                                              onValueChange={formField.onChange}
                                              value={formField.value || ""}
                                              className="space-y-2"
                                            >
                                              {(field.options || []).map((option, idx) => (
                                                <div key={idx} className="flex items-center space-x-2">
                                                  <RadioGroupItem
                                                    value={option}
                                                    id={`${field.id}-${idx}`}
                                                    data-testid={`radio-custom-${field.id}-${idx}`}
                                                  />
                                                  <Label htmlFor={`${field.id}-${idx}`}>{option}</Label>
                                                </div>
                                              ))}
                                            </RadioGroup>
                                          </FormControl>
                                        )}
                                        {field.fieldType === "checkbox" && (
                                          <div className="space-y-2">
                                            {(field.options || []).map((option, idx) => {
                                              const currentValues = formField.value ? formField.value.split(",").filter(Boolean) : [];
                                              const isChecked = currentValues.includes(option);
                                              return (
                                                <div key={idx} className="flex items-center space-x-2">
                                                  <Checkbox
                                                    id={`${field.id}-${idx}`}
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => {
                                                      let newValues: string[];
                                                      if (checked) {
                                                        newValues = [...currentValues, option];
                                                      } else {
                                                        newValues = currentValues.filter((v) => v !== option);
                                                      }
                                                      formField.onChange(newValues.join(","));
                                                    }}
                                                    data-testid={`checkbox-custom-${field.id}-${idx}`}
                                                  />
                                                  <Label htmlFor={`${field.id}-${idx}`}>{option}</Label>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {field.fieldType === "photo" && (
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
                                        )}
                                        {field.textBelow && (
                                          <FormDescription className="whitespace-pre-wrap">
                                            {field.textBelow}
                                          </FormDescription>
                                        )}
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
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

                          <div className="flex justify-end pt-4">
                            <Button
                              type="submit"
                              size="lg"
                              disabled={submitMutation.isPending}
                              data-testid="button-submit"
                            >
                              {submitMutation.isPending ? "Submitting..." : "Submit Application"}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
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

      <VolunteerSignupDialog
        opportunityId={signupDialog?.opportunityId || null}
        opportunityTitle={signupDialog?.title || null}
        open={!!signupDialog}
        onOpenChange={(open) => !open && setSignupDialog(null)}
        onSuccess={handleSignupSuccess}
      />
    </div>
  );
}
